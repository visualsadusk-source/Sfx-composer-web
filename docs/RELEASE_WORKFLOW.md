# SFX Composer Automated Release & Delivery Workflow

## Architecture Overview

1. **Updater & Manifest Repository:** `https://github.com/visualsadusk-source/Sfx-composer-updt`
   - Public manifest: `https://raw.githubusercontent.com/visualsadusk-source/Sfx-composer-updt/main/version.json`
   - Extension ID: `com.sfxcomposer.panel`
2. **Private Paid ZXP Storage:** Supabase private bucket `private-downloads` (`public: false`)
   - Object naming convention: `sfx-composer-pro-v<X.Y.Z>.zxp`
3. **Single Latest-Release Resolver:** `supabase/functions/_shared/release-resolver.ts`
   - Reads active approved release from `public.sfx_releases` (if configured by an admin) or validates `version.json` (`extension_id === 'com.sfxcomposer.panel'`, strict semver `X.Y.Z`, `approved !== false`).
   - Verifies that `sfx-composer-pro-v<X.Y.Z>.zxp` exists in `private-downloads` and validates SHA-256 checksums before issuing short-lived (60s) signed URLs.
   - Fails closed (`503 RELEASE_UNAVAILABLE` / `ASSET_MISSING` / `CHECKSUM_MISMATCH`) — never silently falls back to an outdated hardcoded `.zxp`.

## Phased Production Deployment & Rollback Plan

### Phased Deployment Commands (Run Only After Explicit Approval)
1. **Phase A (DB Migration + Safe `v2.2.0` Seed):**
   - `npx supabase db query --remote=wyjazmiihwjlrkggeeez --yes -f supabase/migrations/20261127_sfx_releases.sql`
   - Seed `v2.2.0` (`approved = true, is_active = true`, verified SHA-256 `efa55c0a3141b23cf69af166fcf0e53465927dc893409a93a69d067908f72cc6`) so customer delivery stays pinned to `v2.2.0` even if `version.json` changes.
2. **Phase B (Deploy Edge Functions):**
   - `npx supabase functions deploy latest-release admin-releases download verify-payment customer-portal --no-verify-jwt --remote=wyjazmiihwjlrkggeeez --yes`
   - Never overwrite `send-license-email`.
3. **Phase C (Live Smoke Tests):**
   - Verify `latest-release` (`200`), `admin-releases` unauthenticated (`401`), `download` unauthenticated (`401`), `verify-payment` forged HMAC (`400`), `customer-portal` unpaid (`403`).
4. **Phase D & E (Website & Demo Push + Verification):**
   - Commit & push `origin/main` → verify GitHub Actions `Deploy static content to Pages` → test `https://sfxcomposer.in/` and `/demo.html`.

### Rollback Procedures (Preserving Customer Data & History)
1. **Release Pointer Rollback (No Data Loss):**
   - Call `POST /functions/v1/admin-releases` with `{ "action": "rollback", "version": "2.2.0" }` (deactivates the faulty release row and reactivates the prior approved `v2.2.0` row).
2. **Database Rollback (if migration must be reverted):**
   - Deactivate or drop only the new `public.sfx_releases` table (`DROP TABLE IF EXISTS public.sfx_releases;`); existing `customers`, `licenses`, `payment_orders`, and `devices` tables are untouched.
3. **Edge Function Rollback (Preserving Prior Working Versions):**
   - Check out commit `69c80c7` in a temporary worktree (`git worktree add ../sfx-rollback 69c80c7`) and redeploy `download`, `verify-payment`, and `customer-portal` from `69c80c7` (`--no-verify-jwt --remote=wyjazmiihwjlrkggeeez --yes`), then remove the worktree.
4. **Website Rollback:**
   - Run `git revert <commit_sha> && git push origin main` to restore the prior GitHub Pages build cleanly.

