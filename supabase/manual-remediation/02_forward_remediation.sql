-- SFX Composer: Forward Security Remediation (Manual SQL Editor Execution)
-- Hardens is_admin(), pins search_path = pg_catalog on admin helpers,
-- restricts 7 backend/plugin RPCs to service_role, and locks down
-- default function privileges for postgres (schema-specific and global).

BEGIN;

-- 1. Preflight signature check (rolls back atomically if any signature is missing)
DO $$
DECLARE
  v_sigs text[] := ARRAY[
    'public.is_admin()',
    'public.sfx_check_admin_auth()',
    'public.sfx_admin_get_stats_v2()',
    'public.sfx_record_payment_order(text,text,text,numeric,text)',
    'public.sfx_reset_device_v2(uuid,text)',
    'public.sfx_revoke_license_v2(uuid,text)',
    'public.sfx_activate_license_v2(text,text,text,text,text)',
    'public.sfx_verify_token_v2(text,text)',
    'public.sfx_deactivate_token_v2(text,text)'
  ];
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY v_sigs LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'Preflight failed: % not found (rolling back)', v_sig;
    END IF;
  END LOOP;
END;
$$;

-- 2. Harden public.is_admin() (removes user_metadata, pins search_path = pg_catalog)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_email text;
  v_app_meta jsonb;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  v_email := pg_catalog.lower(COALESCE(auth.jwt() ->> 'email', ''));

  IF v_email <> '' AND EXISTS (
    SELECT 1 FROM public.sfx_admins WHERE pg_catalog.lower(email) = v_email
  ) THEN
    RETURN true;
  END IF;

  v_app_meta := COALESCE(auth.jwt() -> 'app_metadata', '{}'::jsonb);

  IF (v_app_meta ->> 'role') IN ('admin', 'service_role')
     OR (v_app_meta -> 'is_admin') = 'true'::jsonb
     OR pg_catalog.lower(COALESCE(v_app_meta ->> 'is_admin', '')) = 'true' THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- 3. Pin search_path on public.sfx_check_admin_auth()
ALTER FUNCTION public.sfx_check_admin_auth() SET search_path = pg_catalog;

-- 4. Restrict admin/RLS helper functions to authenticated + service_role
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.sfx_check_admin_auth() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sfx_check_admin_auth() TO authenticated, service_role;

-- 5. Restrict all 7 backend/plugin RPCs to service_role only
REVOKE ALL ON FUNCTION public.sfx_admin_get_stats_v2() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfx_admin_get_stats_v2() TO service_role;

REVOKE ALL ON FUNCTION public.sfx_record_payment_order(text,text,text,numeric,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfx_record_payment_order(text,text,text,numeric,text) TO service_role;

REVOKE ALL ON FUNCTION public.sfx_reset_device_v2(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfx_reset_device_v2(uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.sfx_revoke_license_v2(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfx_revoke_license_v2(uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.sfx_activate_license_v2(text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfx_activate_license_v2(text,text,text,text,text) TO service_role;

REVOKE ALL ON FUNCTION public.sfx_verify_token_v2(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfx_verify_token_v2(text,text) TO service_role;

REVOKE ALL ON FUNCTION public.sfx_deactivate_token_v2(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sfx_deactivate_token_v2(text,text) TO service_role;

-- 6. Least-privilege default function privileges for postgres (both public and global)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

COMMIT;
