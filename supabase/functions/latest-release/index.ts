/**
 * supabase/functions/latest-release/index.ts
 *
 * Public read-only release metadata endpoint.
 * Returns only non-sensitive metadata (version, date, changelog, sha256, compatibility).
 * Never exposes private Storage URLs, GitHub tokens, or secrets.
 */

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { resolveLatestRelease } from '../_shared/release-resolver.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, message: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const supabase = supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    : null;

  const url = new URL(req.url);
  const bypassCache = url.searchParams.get('refresh') === '1';

  const release = await resolveLatestRelease(supabase, {
    bypassCache,
    verifyStorageAsset: Boolean(supabase)
  });

  if (!release.ok) {
    return new Response(JSON.stringify({
      ok: false,
      available: false,
      code: release.code || 'RELEASE_UNAVAILABLE',
      message: release.message || 'Latest release metadata is currently unavailable.'
    }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    available: release.available,
    product: release.product,
    extension_id: release.extension_id,
    latest_version: release.latest_version,
    minimum_version: release.minimum_version,
    release_date: release.release_date,
    mandatory: release.mandatory,
    changelog: release.changelog,
    release_notes_url: release.release_notes_url,
    platform_compatibility: release.platform_compatibility,
    sha256: release.sha256,
    approved: release.approved
  }), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300'
    }
  });
});
