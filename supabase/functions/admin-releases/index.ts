/**
 * supabase/functions/admin-releases/index.ts
 *
 * Authenticated Admin Release Management Endpoint.
 * Allows authorized admins to:
 *   - View current active production release + latest GitHub candidate
 *   - Approve a release version for customer delivery (with SHA-256 & changelog)
 *   - Roll back the active release pointer to a previously approved version
 *
 * Security: Strictly gated by verifyAdminRequest() (never public).
 */

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAdminRequest } from '../_shared/auth.ts';
import {
  clearReleaseCache,
  DEFAULT_MANIFEST_URL,
  EXPECTED_EXTENSION_ID,
  isValidSemver,
  isValidSha256,
  resolveLatestRelease
} from '../_shared/release-resolver.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return json({ ok: false, message: auth.error || 'Unauthorized' }, auth.statusCode || 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const adminEmail = auth.user?.email || 'admin';

  if (req.method === 'GET') {
    const active = await resolveLatestRelease(supabase, { bypassCache: true, verifyStorageAsset: true });

    let githubCandidate: unknown = null;
    try {
      const mUrl = (Deno.env.get('SFX_RELEASE_MANIFEST_URL') || DEFAULT_MANIFEST_URL).trim();
      const r = await fetch(mUrl, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
      if (r.ok) githubCandidate = await r.json();
    } catch {
      githubCandidate = null;
    }

    const { data: history } = await supabase
      .from('sfx_releases')
      .select('id, version, release_date, sha256, asset_name, approved, is_active, approved_by, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    return json({
      ok: true,
      active_release: active,
      github_candidate: githubCandidate,
      history: history || []
    });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, message: 'Method not allowed' }, 405);
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '').trim();

  if (action === 'approve') {
    const version = String(body.version || '').trim();
    const sha256 = body.sha256 ? String(body.sha256).trim().toLowerCase() : null;
    const releaseDate = String(body.release_date || new Date().toISOString().slice(0, 10)).trim();
    const changelog = Array.isArray(body.changelog) ? body.changelog.map((x: unknown) => String(x).trim()).filter(Boolean) : [];
    const assetName = String(body.asset_name || `sfx-composer-pro-v${version}.zxp`).trim();

    if (!isValidSemver(version)) {
      return json({ ok: false, message: 'Valid semver version (e.g. 2.2.0) is required.' }, 400);
    }
    if (!sha256 || !isValidSha256(sha256)) {
      return json({ ok: false, message: 'A valid 64-character hex sha256 digest is required to approve a release.' }, 400);
    }

    // Verify target ZXP exists in private Storage AND matches the supplied SHA-256 before approving
    const bucket = (Deno.env.get('SFX_DOWNLOAD_BUCKET') || 'private-downloads').trim();
    const { data: blobData, error: dlErr } = await supabase.storage.from(bucket).download(assetName);
    if (dlErr || !blobData) {
      return json({
        ok: false,
        code: 'ASSET_MISSING',
        message: `Cannot approve v${version}: ${assetName} was not found in private bucket '${bucket}'.`
      }, 400);
    }
    const buf = new Uint8Array(await blobData.arrayBuffer());
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const actualSha = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('').toLowerCase();
    if (actualSha !== sha256) {
      return json({
        ok: false,
        code: 'CHECKSUM_MISMATCH',
        message: `Cannot approve v${version}: Storage asset SHA-256 (${actualSha}) does not match expected (${sha256}).`
      }, 400);
    }

    // Deactivate previous active pointers (never deletes history)
    await supabase
      .from('sfx_releases')
      .update({ is_active: false })
      .eq('extension_id', EXPECTED_EXTENSION_ID)
      .eq('is_active', true);

    const { data: inserted, error: insErr } = await supabase
      .from('sfx_releases')
      .insert({
        extension_id: EXPECTED_EXTENSION_ID,
        version,
        minimum_version: String(body.minimum_version || '2.0.0').trim(),
        release_date: releaseDate,
        mandatory: Boolean(body.mandatory),
        changelog,
        release_notes_url: String(body.release_notes_url || 'https://github.com/visualsadusk-source/Sfx-composer-updt/releases').trim(),
        sha256,
        asset_name: assetName,
        approved: true,
        is_active: true,
        approved_by: adminEmail
      })
      .select()
      .single();

    if (insErr) {
      return json({ ok: false, message: insErr.message }, 500);
    }

    clearReleaseCache();
    return json({ ok: true, message: `Approved and activated v${version}`, release: inserted });
  }

  if (action === 'rollback') {
    const targetVersion = String(body.version || '').trim();
    if (!isValidSemver(targetVersion)) {
      return json({ ok: false, message: 'Valid target semver version is required for rollback.' }, 400);
    }

    const { data: targetRow } = await supabase
      .from('sfx_releases')
      .select('*')
      .eq('extension_id', EXPECTED_EXTENSION_ID)
      .eq('version', targetVersion)
      .eq('approved', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!targetRow) {
      return json({ ok: false, message: `No previously approved release found for v${targetVersion}.` }, 404);
    }

    await supabase
      .from('sfx_releases')
      .update({ is_active: false })
      .eq('extension_id', EXPECTED_EXTENSION_ID)
      .eq('is_active', true);

    const { data: restored, error: restErr } = await supabase
      .from('sfx_releases')
      .update({ is_active: true })
      .eq('id', targetRow.id)
      .select()
      .single();

    if (restErr) {
      return json({ ok: false, message: restErr.message }, 500);
    }

    clearReleaseCache();
    return json({ ok: true, message: `Rolled back active release to v${targetVersion}`, release: restored });
  }

  return json({ ok: false, message: `Unknown action '${action}'.` }, 400);
});
