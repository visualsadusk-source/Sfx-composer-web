/**
 * supabase/functions/_shared/release-resolver.ts
 *
 * Single Latest-Release Resolver for SFX Composer.
 * Sources:
 *   1. Official GitHub release manifest (SFX_RELEASE_MANIFEST_URL)
 *   2. Optional admin-approved release pointer in public.sfx_releases (if table exists)
 *
 * Fail-closed guarantees:
 *   - Validates extension_id === 'com.sfxcomposer.panel'
 *   - Validates strict semver (X.Y.Z)
 *   - Blocks unapproved / draft manifests
 *   - Verifies target ZXP asset exists in private Storage bucket
 *   - Never falls back silently to an outdated hardcoded ZXP URL
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const EXPECTED_EXTENSION_ID = 'com.sfxcomposer.panel';
export const DEFAULT_MANIFEST_URL =
  'https://raw.githubusercontent.com/visualsadusk-source/Sfx-composer-updt/main/version.json';

export interface ResolvedRelease {
  ok: boolean;
  code?: string;
  message?: string;
  product: string;
  extension_id: string;
  latest_version: string;
  minimum_version: string;
  release_date: string;
  mandatory: boolean;
  changelog: string[];
  release_notes_url: string;
  platform_compatibility: string[];
  sha256: string | null;
  asset_name: string;
  approved: boolean;
  available: boolean;
  source: 'supabase_admin_release' | 'github_manifest';
}

interface CacheEntry {
  expiresAt: number;
  data: ResolvedRelease;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let releaseCache: CacheEntry | null = null;

export function isValidSemver(v: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(String(v || '').trim());
}

export function compareSemver(a: string, b: string): number {
  const pa = String(a || '0.0.0').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0.0.0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

export function isValidSha256(hex: string | null | undefined): boolean {
  return typeof hex === 'string' && /^[a-f0-9]{64}$/i.test(hex.trim());
}

export function clearReleaseCache(): void {
  releaseCache = null;
}

export function validateManifestPayload(raw: any): {
  valid: boolean;
  code?: string;
  message?: string;
  version?: string;
  sha256?: string | null;
} {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, code: 'INVALID_MANIFEST', message: 'Release manifest is empty or malformed.' };
  }
  if (raw.extension_id !== EXPECTED_EXTENSION_ID) {
    return {
      valid: false,
      code: 'EXTENSION_ID_MISMATCH',
      message: `Unexpected extension_id '${raw.extension_id || 'missing'}'.`
    };
  }
  const version = String(raw.latest_version || '').trim();
  if (!isValidSemver(version)) {
    return { valid: false, code: 'INVALID_VERSION', message: 'Invalid latest_version in release manifest.' };
  }
  if (raw.approved === false || raw.status === 'draft' || raw.status === 'unapproved') {
    return { valid: false, code: 'UNAPPROVED_RELEASE', message: `Release v${version} is not approved for delivery.` };
  }

  // Optional SHA-256 check (top-level or per-platform downloads)
  const winSha = raw.downloads?.windows?.sha256;
  const macSha = raw.downloads?.macos?.sha256;
  const topSha = raw.sha256;
  const candidateSha = (winSha || macSha || topSha || '').trim().toLowerCase();
  if (candidateSha && !isValidSha256(candidateSha)) {
    return { valid: false, code: 'INVALID_CHECKSUM', message: 'Invalid SHA-256 checksum format in manifest.' };
  }

  return { valid: true, version, sha256: candidateSha || null };
}

export async function resolveLatestRelease(
  supabase: SupabaseClient | null,
  options: { bypassCache?: boolean; verifyStorageAsset?: boolean } = {}
): Promise<ResolvedRelease> {
  const now = Date.now();
  if (!options.bypassCache && releaseCache && releaseCache.expiresAt > now) {
    return releaseCache.data;
  }

  // 1. Check optional admin-managed sfx_releases table for an active approved pointer
  let dbRelease: any = null;
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('sfx_releases')
        .select('*')
        .eq('extension_id', EXPECTED_EXTENSION_ID)
        .eq('is_active', true)
        .eq('approved', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && data && isValidSemver(data.version)) {
        dbRelease = data;
      }
    } catch {
      // Table may not exist yet; continue to GitHub manifest
    }
  }

  // 2. Fetch official GitHub manifest
  const manifestUrl = (Deno.env.get('SFX_RELEASE_MANIFEST_URL') || DEFAULT_MANIFEST_URL).trim();
  let manifest: any = null;
  let manifestFetchError = '';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(manifestUrl, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      manifestFetchError = `Manifest HTTP ${res.status}`;
    } else {
      manifest = await res.json();
    }
  } catch (err: any) {
    manifestFetchError = err?.message || 'Manifest fetch failed';
  }

  let resolved: ResolvedRelease;

  if (dbRelease) {
    const assetName = String(dbRelease.asset_name || `sfx-composer-pro-v${dbRelease.version}.zxp`).trim();
    const sha = dbRelease.sha256 ? String(dbRelease.sha256).trim().toLowerCase() : null;
    if (sha && !isValidSha256(sha)) {
      return {
        ok: false,
        code: 'INVALID_CHECKSUM',
        message: 'Active release record has an invalid SHA-256 checksum.',
        product: 'SFX Composer',
        extension_id: EXPECTED_EXTENSION_ID,
        latest_version: dbRelease.version,
        minimum_version: dbRelease.minimum_version || '2.0.0',
        release_date: dbRelease.release_date || '',
        mandatory: Boolean(dbRelease.mandatory),
        changelog: Array.isArray(dbRelease.changelog) ? dbRelease.changelog : [],
        release_notes_url: dbRelease.release_notes_url || '',
        platform_compatibility: ['Windows 10/11', 'macOS 11+ (Intel & Apple Silicon)', 'Premiere Pro & After Effects CC 2019+'],
        sha256: null,
        asset_name: assetName,
        approved: false,
        available: false,
        source: 'supabase_admin_release'
      };
    }

    resolved = {
      ok: true,
      product: 'SFX Composer',
      extension_id: EXPECTED_EXTENSION_ID,
      latest_version: dbRelease.version,
      minimum_version: dbRelease.minimum_version || '2.0.0',
      release_date: dbRelease.release_date || '',
      mandatory: Boolean(dbRelease.mandatory),
      changelog: Array.isArray(dbRelease.changelog) ? dbRelease.changelog : [],
      release_notes_url: dbRelease.release_notes_url || 'https://github.com/visualsadusk-source/Sfx-composer-updt/releases',
      platform_compatibility: ['Windows 10/11', 'macOS 11+ (Intel & Apple Silicon)', 'Premiere Pro & After Effects CC 2019+'],
      sha256: sha,
      asset_name: assetName,
      approved: true,
      available: true,
      source: 'supabase_admin_release'
    };
  } else {
    if (!manifest) {
      return {
        ok: false,
        code: 'RELEASE_UNAVAILABLE',
        message: `Unable to verify latest approved release (${manifestFetchError || 'unavailable'}).`,
        product: 'SFX Composer',
        extension_id: EXPECTED_EXTENSION_ID,
        latest_version: '',
        minimum_version: '',
        release_date: '',
        mandatory: false,
        changelog: [],
        release_notes_url: '',
        platform_compatibility: [],
        sha256: null,
        asset_name: '',
        approved: false,
        available: false,
        source: 'github_manifest'
      };
    }

    const check = validateManifestPayload(manifest);
    if (!check.valid || !check.version) {
      return {
        ok: false,
        code: check.code || 'INVALID_MANIFEST',
        message: check.message || 'Release manifest validation failed.',
        product: 'SFX Composer',
        extension_id: String(manifest.extension_id || ''),
        latest_version: String(manifest.latest_version || ''),
        minimum_version: String(manifest.minimum_version || ''),
        release_date: String(manifest.release_date || ''),
        mandatory: false,
        changelog: [],
        release_notes_url: '',
        platform_compatibility: [],
        sha256: null,
        asset_name: '',
        approved: false,
        available: false,
        source: 'github_manifest'
      };
    }

    const assetName = `sfx-composer-pro-v${check.version}.zxp`;
    resolved = {
      ok: true,
      product: String(manifest.product || 'SFX Composer'),
      extension_id: EXPECTED_EXTENSION_ID,
      latest_version: check.version,
      minimum_version: String(manifest.minimum_version || '2.0.0'),
      release_date: String(manifest.release_date || ''),
      mandatory: Boolean(manifest.mandatory),
      changelog: Array.isArray(manifest.changelog)
        ? manifest.changelog.map((x: unknown) => String(x).trim()).filter(Boolean)
        : [],
      release_notes_url: String(
        manifest.release_notes_url || 'https://github.com/visualsadusk-source/Sfx-composer-updt/releases'
      ),
      platform_compatibility: ['Windows 10/11', 'macOS 11+ (Intel & Apple Silicon)', 'Premiere Pro & After Effects CC 2019+'],
      sha256: check.sha256 || null,
      asset_name: assetName,
      approved: true,
      available: true,
      source: 'github_manifest'
    };
  }

  // 3. Optionally verify the ZXP asset actually exists in private Storage
  if (options.verifyStorageAsset && supabase) {
    const bucket = (Deno.env.get('SFX_DOWNLOAD_BUCKET') || 'private-downloads').trim();
    const { data: listData, error: listErr } = await supabase.storage
      .from(bucket)
      .list('', { search: resolved.asset_name, limit: 10 });

    const found = !listErr && Array.isArray(listData) && listData.some((o: any) => o.name === resolved.asset_name);
    if (!found) {
      return {
        ...resolved,
        ok: false,
        available: false,
        code: 'ASSET_MISSING',
        message: `Approved release package ${resolved.asset_name} is missing from private storage.`
      };
    }
  }

  releaseCache = {
    expiresAt: now + CACHE_TTL_MS,
    data: resolved
  };

  return resolved;
}
