-- SFX Composer: Pre-Change ACL & Default Privileges Snapshot (READ-ONLY)
-- Run this in Supabase SQL Editor before applying 02_forward_remediation.sql.

SELECT
  p.oid,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  pg_get_userbyid(p.proowner) AS owner_role,
  p.prosecdef AS is_security_definer,
  p.proconfig,
  p.proacl::text AS raw_proacl,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'is_admin',
    'sfx_check_admin_auth',
    'sfx_admin_get_stats_v2',
    'sfx_record_payment_order',
    'sfx_reset_device_v2',
    'sfx_revoke_license_v2',
    'sfx_activate_license_v2',
    'sfx_verify_token_v2',
    'sfx_deactivate_token_v2'
  )
ORDER BY p.proname;

SELECT
  pg_get_userbyid(d.defaclrole) AS owner_role,
  COALESCE(n.nspname, '<GLOBAL>') AS schema_name,
  d.defaclobjtype,
  d.defaclacl::text AS raw_default_acl
FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE d.defaclobjtype = 'f'
  AND pg_get_userbyid(d.defaclrole) IN ('postgres', 'supabase_admin')
ORDER BY owner_role, schema_name;
