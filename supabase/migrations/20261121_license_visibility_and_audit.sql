-- Migration: 20261121_license_visibility_and_audit.sql
-- 1. Create license_audit_logs table for tracking admin key reveals and license modifications
-- 2. Upgrade sfx_admin_get_orders_v2 to return associated license key information
-- 3. Upgrade sfx_get_customer_portal_v2 to return purchase details & enforce customer ownership
-- 4. Create sfx_reissue_license_key RPC for recovery of legacy hashed licenses
-- 5. Create sfx_log_license_audit RPC

-- ── 1. Create license_audit_logs table ──
CREATE TABLE IF NOT EXISTS public.license_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL, -- 'reveal_key', 'reissue_key', 'revoke_license', 'reactivate_license', 'reset_device', 'resend_email'
  license_id UUID REFERENCES public.licenses(id) ON DELETE CASCADE,
  customer_email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_license_audit_logs_license_id ON public.license_audit_logs(license_id);
CREATE INDEX IF NOT EXISTS idx_license_audit_logs_admin_email ON public.license_audit_logs(admin_email);
CREATE INDEX IF NOT EXISTS idx_license_audit_logs_created_at ON public.license_audit_logs(created_at DESC);

-- Enable RLS on audit logs
ALTER TABLE public.license_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and service role can read audit logs"
ON public.license_audit_logs
FOR SELECT
USING (auth.jwt() ->> 'role' = 'service_role' OR auth.jwt() ->> 'email' IN (SELECT email FROM public.sfx_admins));

-- ── 2. sfx_log_license_audit RPC ──
CREATE OR REPLACE FUNCTION public.sfx_log_license_audit(
  p_admin_email TEXT,
  p_action TEXT,
  p_license_id UUID,
  p_customer_email TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
  v_cust_email TEXT := p_customer_email;
BEGIN
  IF v_cust_email IS NULL AND p_license_id IS NOT NULL THEN
    SELECT c.email INTO v_cust_email
    FROM public.licenses l
    JOIN public.customers c ON l.customer_id = c.id
    WHERE l.id = p_license_id;
  END IF;

  INSERT INTO public.license_audit_logs (
    admin_email, action, license_id, customer_email, ip_address, user_agent, metadata
  )
  VALUES (
    COALESCE(p_admin_email, 'admin'),
    p_action,
    p_license_id,
    v_cust_email,
    p_ip_address,
    p_user_agent,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'log_id', v_id);
END;
$$;

-- ── 3. sfx_get_license_audit_logs RPC ──
CREATE OR REPLACE FUNCTION public.sfx_get_license_audit_logs(
  p_license_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_logs JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb), '[]'::jsonb)
  INTO v_logs
  FROM (
    SELECT 
      a.id,
      a.admin_email,
      a.action,
      a.license_id,
      a.customer_email,
      a.ip_address,
      a.user_agent,
      a.metadata,
      a.created_at
    FROM public.license_audit_logs a
    WHERE p_license_id IS NULL OR a.license_id = p_license_id
    ORDER BY a.created_at DESC
    LIMIT p_limit
  ) sub;

  RETURN v_logs;
END;
$$;

-- ── 4. Upgrade sfx_admin_get_orders_v2 to include license information ──
DROP FUNCTION IF EXISTS public.sfx_admin_get_orders_v2(integer);

CREATE OR REPLACE FUNCTION public.sfx_admin_get_orders_v2(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_results JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb), '[]'::jsonb)
  INTO v_results
  FROM (
    SELECT 
      o.id,
      o.customer_email,
      o.customer_name,
      o.payment_provider,
      o.provider_order_id,
      o.provider_payment_id,
      o.amount,
      o.currency,
      o.payment_status,
      o.email_delivery_status,
      o.email_message_id,
      o.email_sent_at,
      o.email_error,
      o.email_attempts,
      o.created_at,
      o.license_id,
      l.status AS license_status,
      l.license_type,
      l.expires_at AS license_expires_at,
      l.encrypted_license_key,
      (l.encrypted_license_key IS NOT NULL) AS has_encrypted_key
    FROM public.payment_orders o
    LEFT JOIN public.licenses l ON o.license_id = l.id
    ORDER BY o.created_at DESC
    LIMIT p_limit
  ) sub;

  RETURN v_results;
END;
$$;

-- ── 5. sfx_reissue_license_key RPC ──
CREATE OR REPLACE FUNCTION public.sfx_reissue_license_key(
  p_license_id UUID,
  p_new_license_key_hash TEXT,
  p_new_encrypted_license_key TEXT,
  p_reason TEXT DEFAULT 'Reissued by user or admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lic RECORD;
  v_cust_email TEXT;
BEGIN
  SELECT l.*, c.email AS customer_email 
  INTO v_lic
  FROM public.licenses l
  JOIN public.customers c ON l.customer_id = c.id
  WHERE l.id = p_license_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'License not found');
  END IF;

  -- Update license key hash & encrypted key
  UPDATE public.licenses
  SET 
    license_key_hash = trim(p_new_license_key_hash),
    encrypted_license_key = trim(p_new_encrypted_license_key),
    status = 'active',
    revoked_at = NULL,
    revoked_reason = NULL
  WHERE id = p_license_id;

  -- Reset active devices so customer can activate anew
  UPDATE public.license_activations
  SET deactivated_at = timezone('utc'::text, now())
  WHERE license_id = p_license_id AND deactivated_at IS NULL;

  RETURN jsonb_build_object(
    'ok', true,
    'license_id', p_license_id,
    'customer_id', v_lic.customer_id,
    'email', v_lic.customer_email,
    'message', 'License successfully reissued'
  );
END;
$$;

-- ── 6. Upgrade sfx_get_customer_portal_v2 with comprehensive order & license mapping ──
DROP FUNCTION IF EXISTS public.sfx_get_customer_portal_v2(text);

CREATE OR REPLACE FUNCTION public.sfx_get_customer_portal_v2(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_clean_email TEXT;
  v_customer RECORD;
  v_licenses JSONB;
  v_orders JSONB;
BEGIN
  v_clean_email := lower(trim(p_email));

  IF v_clean_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Email is required');
  END IF;

  SELECT * INTO v_customer
  FROM public.customers
  WHERE lower(email) = v_clean_email;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'found', false,
      'email', v_clean_email,
      'licenses', '[]'::jsonb,
      'orders', '[]'::jsonb,
      'message', 'No registered customer found for this email.'
    );
  END IF;

  -- 1. Licenses for this customer
  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb), '[]'::jsonb)
  INTO v_licenses
  FROM (
    SELECT 
      l.id,
      l.status,
      COALESCE(l.license_type, 'lifetime') AS license_type,
      l.encrypted_license_key,
      (l.encrypted_license_key IS NOT NULL) AS has_encrypted_key,
      l.max_devices,
      l.created_at,
      l.expires_at,
      l.revoked_at,
      -- Associated payment order details
      ord.provider_order_id,
      ord.provider_payment_id,
      ord.amount AS payment_amount,
      ord.currency AS payment_currency,
      ord.payment_status,
      ord.created_at AS purchase_date,
      -- Active devices
      COALESCE(
        (SELECT jsonb_agg(
          jsonb_build_object(
            'device_id', a.device_id,
            'device_name', a.device_name,
            'activated_at', a.activated_at,
            'last_verified_at', a.last_verified_at
          )
        )
        FROM public.license_activations a
        WHERE a.license_id = l.id AND a.deactivated_at IS NULL),
        '[]'::jsonb
      ) AS active_devices
    FROM public.licenses l
    LEFT JOIN LATERAL (
      SELECT provider_order_id, provider_payment_id, amount, currency, payment_status, created_at
      FROM public.payment_orders po
      WHERE po.license_id = l.id OR po.customer_email = v_clean_email
      ORDER BY po.created_at DESC
      LIMIT 1
    ) ord ON true
    WHERE l.customer_id = v_customer.id
    ORDER BY l.created_at DESC
  ) sub;

  -- 2. Orders for this customer
  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb), '[]'::jsonb)
  INTO v_orders
  FROM (
    SELECT 
      po.id,
      po.provider_order_id,
      po.provider_payment_id,
      po.amount,
      po.currency,
      po.payment_status,
      po.email_delivery_status,
      po.email_message_id,
      po.email_sent_at,
      po.created_at,
      po.license_id
    FROM public.payment_orders po
    WHERE lower(po.customer_email) = v_clean_email
    ORDER BY po.created_at DESC
    LIMIT 20
  ) sub;

  RETURN jsonb_build_object(
    'ok', true,
    'found', true,
    'email', v_clean_email,
    'customer_id', v_customer.id,
    'licenses', v_licenses,
    'orders', v_orders
  );
END;
$$;
