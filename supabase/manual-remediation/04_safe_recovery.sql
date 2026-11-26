-- SFX Composer: Safe Recovery SQL (Manual SQL Editor Execution)
-- Never restores user_metadata.is_admin, PUBLIC, or anon access on sensitive RPCs.

BEGIN;

-- 1. Keep admin/RLS helper functions restricted to authenticated + service_role
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.sfx_check_admin_auth() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sfx_check_admin_auth() TO authenticated, service_role;

-- 2. Keep service_role execution intact on all 7 backend/plugin RPCs
GRANT EXECUTE ON FUNCTION public.sfx_admin_get_stats_v2() TO service_role;
GRANT EXECUTE ON FUNCTION public.sfx_record_payment_order(text,text,text,numeric,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sfx_reset_device_v2(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sfx_revoke_license_v2(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sfx_activate_license_v2(text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sfx_verify_token_v2(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sfx_deactivate_token_v2(text,text) TO service_role;

-- 3. EMERGENCY ONLY: uncomment ONLY the specific function needed if a legacy
-- desktop plugin build fails against Edge Functions and requires temporary
-- authenticated RPC access:
-- GRANT EXECUTE ON FUNCTION public.sfx_verify_token_v2(text,text) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.sfx_activate_license_v2(text,text,text,text,text) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.sfx_deactivate_token_v2(text,text) TO authenticated;

COMMIT;
