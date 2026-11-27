# SFX Composer — Supabase Security Migration & Launch Readiness Report

**Date:** November 27, 2026  
**Production Supabase Project:** `wyjazmiihwjlrkggeeez` (`SFX backend`, `ap-south-1`)  
**Production Website (Pages):** `https://sfx-composer-web.pages.dev/` (commit `6891278df294dd520933565e87cdc38f53b9635b`)  

---

## 1. Legacy JWT Deactivation Confirmation
- Legacy JWT-based API keys (`anon` and `service_role`) were **disabled** in Supabase Dashboard (**Project Settings → API Keys → Legacy API Keys → Disable JWT-based API keys**).
- Verified via `get_publishable_keys` (`disabled: true` on legacy `anon`) and live HTTP test: requests using the disabled legacy `anon` JWT to `/rest/v1/sfx_videos` are rejected with **`HTTP 401`**.

## 2. New Key Architecture
- **Public / Client Key:** `sb_publishable_...` (`default` publishable key, active). Used in `apikey` headers on anonymous REST/Edge Function requests; never passed as a user `Authorization: Bearer` token.
- **Backend Secret Key:** `SUPABASE_SECRET_KEYS` (`default` `sb_secret_...` key, active) configured in Supabase Edge Function secrets and used exclusively on trusted server-side Edge Functions.
- **Zero Public Exposure:** Scanned all public HTML, CSS, JS, and `plugin-dist/` assets (`0` secret hits). Internal `license-admin.html` and `license-admin.js` are excluded from the `_site` build (`HTTP 404` on `pages.dev`).

## 3. Edge Function Migration
- Added shared resolver `supabase/functions/_shared/supabase-admin.ts` (`getSupabaseSecretKey()`), which reads `SUPABASE_SECRET_KEYS.default` first and retains a transition fallback to `SUPABASE_SERVICE_ROLE_KEY`.
- Updated `_shared/auth.ts`, `_shared/crypto.ts`, and all 15 Edge Functions (`activate-license`, `admin-content`, `admin-licenses`, `admin-releases`, `create-license`, `create-razorpay-order`, `customer-portal`, `deactivate-license`, `download`, `latest-release`, `payment-webhook`, `reset-device`, `revoke-license`, `verify-license`, `verify-payment`) in commit `6891278` and deployed them `ACTIVE` (`verify_jwt = false`, enforcing application-level auth/HMAC).
- `send-license-email` (v11 `ACTIVE`) does not use Supabase API keys.

## 4. Frontend Migration
- Migrated `js/content-service.js` and `js/payment-service.js` from the legacy `anon` JWT to `sb_publishable_...` (using `apikey` header for anonymous requests while preserving user JWT `Authorization: Bearer` headers in `customer-portal` when provided).
- Configured Cloudflare Pages `_headers` (`Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`) and branded `404.html`.

## 5. Plugin Compatibility Verification
- Inspected the actual production `v2.2.0` installer in `private-downloads/sfx-composer-pro-v2.2.0.zxp` (`333,808` bytes, SHA-256 `efa55c0a3141b23cf69af166fcf0e53465927dc893409a93a69d067908f72cc6`, `com.sfxcomposer.panel` `v2.2.0`).
- All 52 extracted files contained **zero** legacy JWTs; `dist/supabase-service.js` and `dist/license-admin.js` already use `sb_publishable_...`.
- Verified update manifest at `https://raw.githubusercontent.com/visualsadusk-source/Sfx-composer-updt/main/version.json` (`latest_version: "2.2.0"`, `minimum_version: "2.0.0"`, `downloads: {}`; ZXP downloads served via authenticated `download` Edge Function with SHA-256 verification).

## 6. Post-Deactivation HTTP Test Results
- **Legacy `anon` JWT REST check:** `HTTP 401` (rejected)
- **Website (`/`, `/library.html`, `/demo.html`, `/screenshots.html`):** `HTTP 200`, `0` console errors, `0` failed network requests
- **REST API (`sfx_videos`, `sfx_section_content` with `sb_publishable_`):** `HTTP 200`
- **`GET /latest-release`:** `HTTP 200` (`latest_version: "2.2.0"`, `approved: true`)
- **Unauthenticated `POST /admin-releases`, `POST /admin-licenses`, `GET /download?type=zxp`:** `HTTP 401`
- **Unverified `POST /customer-portal`:** `HTTP 403`
- **Forged `POST /verify-payment` & invalid-signature `POST /payment-webhook`:** `HTTP 400`
- **`POST /activate-license` (invalid key) & `POST /verify-license` (missing token):** `HTTP 400`

## 7. Local Development Script Cleanup
- Removed all hardcoded legacy JWT credentials from all 11 `test_*.js` scripts (`test_access_control_security.js`, `test_admin_auth_verification.js`, `test_e2e_purchasing.js`, `test_email_deliverability_audit.js`, `test_license_system_upgrade.js`, `test_license_visibility_security.js`, `test_secure_purchase_access.js`, `test_sfx_library_secure_download.js`, `test_simplified_customer_dashboard.js`, `test_simplified_license_retrieval.js`, `test_supabase_password_auth.js`).
- Replaced with `process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY` (failing safely when missing) and `sb_publishable_...` for public requests.

## 8. Outstanding Manual Tasks
1. **Custom Domain & DNS Cutover:** Attach `sfxcomposer.in` and `www.sfxcomposer.in` to the `sfx-composer-web` Cloudflare Pages project, update DNS CNAME records, and verify HTTPS on `https://sfxcomposer.in/`.
2. **Controlled End-to-End Customer Test (Optional):** Run a controlled test-account license activation/download check on `https://sfxcomposer.in/` after DNS cutover.
