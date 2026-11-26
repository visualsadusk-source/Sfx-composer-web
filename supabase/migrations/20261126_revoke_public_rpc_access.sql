-- Migration: 20261126_revoke_public_rpc_access.sql
-- Security Remediation: Lock down privileged SECURITY DEFINER RPCs so they
-- cannot be invoked directly by anonymous (anon) or regular authenticated
-- users via Supabase PostgREST (/rest/v1/rpc/*). Only service_role (Edge
-- Functions & trusted backend) may execute them.

REVOKE ALL ON FUNCTION public.sfx_create_license_v2(text, text, timestamptz, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfx_create_license_v2(text, text, timestamptz, integer, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.sfx_complete_payment_order(text, text, text, text, timestamptz, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfx_complete_payment_order(text, text, text, text, timestamptz, integer, text) TO service_role;

REVOKE ALL ON FUNCTION public.sfx_reactivate_license_v2(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfx_reactivate_license_v2(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.sfx_extend_license_expiry_v2(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfx_extend_license_expiry_v2(uuid, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.sfx_reissue_license_key(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfx_reissue_license_key(uuid, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.sfx_admin_search_v2(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfx_admin_search_v2(text) TO service_role;

REVOKE ALL ON FUNCTION public.sfx_admin_get_orders_v2(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfx_admin_get_orders_v2(integer) TO service_role;

REVOKE ALL ON FUNCTION public.sfx_log_license_audit(text, text, uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfx_log_license_audit(text, text, uuid, text, text, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.sfx_get_license_audit_logs(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfx_get_license_audit_logs(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.sfx_get_customer_portal_v2(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfx_get_customer_portal_v2(text) TO service_role;

REVOKE ALL ON FUNCTION public.sfx_update_order_email_delivery(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfx_update_order_email_delivery(text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.sfx_revoke_entitlement(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfx_revoke_entitlement(text, text) TO service_role;

REVOKE ALL ON FUNCTION public.sfx_link_auth_user(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfx_link_auth_user(text, uuid) TO service_role;
