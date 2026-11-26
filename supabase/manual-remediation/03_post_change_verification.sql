-- SFX Composer: Post-Change ACL & Default Privileges Verification (READ-ONLY)
-- Run this in Supabase SQL Editor after applying 02_forward_remediation.sql.

WITH tf AS (
  SELECT
    p.oid,
    p.proname,
    pg_get_function_identity_arguments(p.oid) AS args,
    p.prosecdef,
    p.proconfig,
    p.proacl,
    COALESCE(p.proacl, acldefault('f', p.proowner)) AS effective_acl
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
)
SELECT
  tf.proname AS function_name,
  tf.args,
  tf.prosecdef AS is_security_definer,
  tf.proconfig,
  (tf.proacl IS NULL) AS uses_default_acl,
  COALESCE(bool_or(a.grantee = 0 AND a.privilege_type = 'EXECUTE'), false) AS public_exec,
  COALESCE(bool_or(r.rolname = 'anon' AND a.privilege_type = 'EXECUTE'), false) AS explicit_anon_exec,
  COALESCE(bool_or(r.rolname = 'authenticated' AND a.privilege_type = 'EXECUTE'), false) AS explicit_auth_exec,
  COALESCE(bool_or(r.rolname = 'service_role' AND a.privilege_type = 'EXECUTE'), false) AS explicit_service_exec,
  has_function_privilege('anon', tf.oid, 'EXECUTE') AS effective_anon_exec,
  has_function_privilege('authenticated', tf.oid, 'EXECUTE') AS effective_auth_exec,
  has_function_privilege('service_role', tf.oid, 'EXECUTE') AS effective_service_exec
FROM tf
LEFT JOIN LATERAL aclexplode(tf.effective_acl) a ON true
LEFT JOIN pg_roles r ON r.oid = a.grantee
GROUP BY tf.oid, tf.proname, tf.args, tf.prosecdef, tf.proconfig, tf.proacl
ORDER BY tf.proname;

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
