-- Migration: 20261121_brevo_email_tracking.sql
-- Add email delivery tracking columns to payment_orders table
-- Update stored procedures to return email tracking metrics for Admin & Customer Dashboards

-- 1. Alter payment_orders table
ALTER TABLE public.payment_orders 
ADD COLUMN IF NOT EXISTS customer_name TEXT DEFAULT NULL;

ALTER TABLE public.payment_orders 
ADD COLUMN IF NOT EXISTS email_delivery_status TEXT DEFAULT 'pending';

ALTER TABLE public.payment_orders 
ADD COLUMN IF NOT EXISTS email_message_id TEXT DEFAULT NULL;

ALTER TABLE public.payment_orders 
ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.payment_orders 
ADD COLUMN IF NOT EXISTS email_error TEXT DEFAULT NULL;

ALTER TABLE public.payment_orders 
ADD COLUMN IF NOT EXISTS email_attempts INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_payment_orders_email_status ON public.payment_orders(email_delivery_status);

-- 2. Helper procedure to update email delivery status
CREATE OR REPLACE FUNCTION public.sfx_update_order_email_delivery(
  p_provider_order_id TEXT,
  p_status TEXT,
  p_message_id TEXT DEFAULT NULL,
  p_error TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.payment_orders
  SET email_delivery_status = p_status,
      email_message_id = COALESCE(p_message_id, email_message_id),
      email_sent_at = CASE WHEN p_status = 'sent' THEN timezone('utc'::text, now()) ELSE email_sent_at END,
      email_error = p_error,
      email_attempts = email_attempts + 1
  WHERE provider_order_id = p_provider_order_id OR id::text = p_provider_order_id;
  
  RETURN jsonb_build_object('ok', true, 'status', p_status);
END;
$$;

-- 3. Upgrade sfx_admin_get_orders_v2 to include email delivery tracking
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
      l.status as license_status
    FROM public.payment_orders o
    LEFT JOIN public.licenses l ON o.license_id = l.id
    ORDER BY o.created_at DESC
    LIMIT p_limit
  ) sub;

  RETURN v_results;
END;
$$;

-- 4. Upgrade sfx_admin_search_v2 to include email delivery tracking in lateral join
CREATE OR REPLACE FUNCTION public.sfx_admin_search_v2(p_query text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_results JSONB;
BEGIN
  p_query := lower(trim(p_query));

  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb), '[]'::jsonb)
  INTO v_results
  FROM (
    SELECT 
      l.id,
      c.email,
      l.status,
      l.encrypted_license_key,
      COALESCE(l.license_type, 'lifetime') AS license_type,
      l.max_devices,
      l.created_at,
      l.expires_at,
      l.revoked_at,
      l.revoked_reason,
      -- Payment & Email Delivery details
      ord.provider_order_id,
      ord.provider_payment_id,
      ord.amount AS payment_amount,
      ord.currency AS payment_currency,
      ord.payment_status,
      ord.email_delivery_status,
      ord.email_message_id,
      ord.email_sent_at,
      ord.email_error,
      ord.email_attempts,
      ord.customer_name,
      -- Latest verification
      (
        SELECT MAX(a.last_verified_at)
        FROM public.license_activations a
        WHERE a.license_id = l.id
      ) AS last_verified_at,
      -- Device activations
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
    JOIN public.customers c ON l.customer_id = c.id
    LEFT JOIN LATERAL (
      SELECT 
        po.provider_order_id, 
        po.provider_payment_id, 
        po.amount, 
        po.currency, 
        po.payment_status,
        po.email_delivery_status,
        po.email_message_id,
        po.email_sent_at,
        po.email_error,
        po.email_attempts,
        po.customer_name
      FROM public.payment_orders po
      WHERE po.license_id = l.id
      ORDER BY po.created_at DESC
      LIMIT 1
    ) ord ON true
    WHERE p_query = '' 
       OR lower(c.email) LIKE ('%' || p_query || '%')
       OR l.id::text LIKE ('%' || p_query || '%')
       OR lower(COALESCE(ord.provider_payment_id, '')) LIKE ('%' || p_query || '%')
       OR lower(COALESCE(ord.provider_order_id, '')) LIKE ('%' || p_query || '%')
       OR lower(COALESCE(ord.email_delivery_status, '')) LIKE ('%' || p_query || '%')
    ORDER BY l.created_at DESC
    LIMIT 200
  ) sub;

  RETURN v_results;
END;
$$;

-- 5. Upgrade sfx_get_customer_portal_v2 to include email delivery status
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

  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb), '[]'::jsonb)
  INTO v_licenses
  FROM (
    SELECT 
      l.id,
      l.status,
      l.license_type,
      l.encrypted_license_key,
      l.max_devices,
      l.created_at,
      l.expires_at,
      l.revoked_at,
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
    WHERE l.customer_id = v_customer.id
    ORDER BY l.created_at DESC
  ) sub;

  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb), '[]'::jsonb)
  INTO v_orders
  FROM (
    SELECT 
      o.id,
      o.provider_order_id,
      o.provider_payment_id,
      o.amount,
      o.currency,
      o.payment_status,
      o.email_delivery_status,
      o.email_message_id,
      o.email_sent_at,
      o.created_at,
      o.license_id
    FROM public.payment_orders o
    WHERE lower(o.customer_email) = v_clean_email
    ORDER BY o.created_at DESC
  ) sub;

  RETURN jsonb_build_object(
    'ok', true,
    'found', true,
    'customer_id', v_customer.id,
    'email', v_clean_email,
    'licenses', v_licenses,
    'orders', v_orders,
    'downloads', jsonb_build_object(
      'version', 'v2.4.0',
      'release_name', 'SFX Composer Pro 2.4 (Universal)',
      'zxp_url', '/downloads/sfx-composer-pro-v2.4.0.zxp',
      'zip_url', '/downloads/sfx-composer-pro-v2.4.0.zip',
      'docs_url', '#tutorials'
    )
  );
END;
$$;
