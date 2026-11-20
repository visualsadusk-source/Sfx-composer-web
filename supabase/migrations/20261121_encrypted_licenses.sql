-- Migration: 20261121_encrypted_licenses.sql
-- Add encrypted_license_key and license_type columns to licenses table
-- Update stored procedures to support encrypted license storage, key reveal, reactivate, extend expiry

-- 1. Alter licenses table
ALTER TABLE public.licenses 
ADD COLUMN IF NOT EXISTS encrypted_license_key TEXT DEFAULT NULL;

ALTER TABLE public.licenses 
ADD COLUMN IF NOT EXISTS license_type TEXT DEFAULT 'lifetime';

CREATE INDEX IF NOT EXISTS idx_licenses_status ON public.licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_customer_id ON public.licenses(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_customer_email ON public.payment_orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_payment_orders_provider_order_id ON public.payment_orders(provider_order_id);

-- 2. Drop old functions to avoid signature conflicts
DROP FUNCTION IF EXISTS public.sfx_complete_payment_order(text, text, text, text, timestamp with time zone, integer);
DROP FUNCTION IF EXISTS public.sfx_create_license_v2(text, text, timestamp with time zone, integer);

-- 3. sfx_create_license_v2 with encrypted_license_key support
CREATE OR REPLACE FUNCTION public.sfx_create_license_v2(
  p_email text,
  p_license_key_hash text,
  p_expires_at timestamp with time zone DEFAULT NULL,
  p_max_devices integer DEFAULT 1,
  p_encrypted_license_key text DEFAULT NULL,
  p_license_type text DEFAULT 'lifetime'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_id UUID;
  v_license_id UUID;
BEGIN
  p_email := lower(trim(p_email));
  p_license_key_hash := trim(p_license_key_hash);

  -- 1. Insert or get customer
  INSERT INTO public.customers (email)
  VALUES (p_email)
  ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
  RETURNING id INTO v_customer_id;

  -- 2. Insert license
  INSERT INTO public.licenses (
    customer_id,
    license_key_hash,
    encrypted_license_key,
    license_type,
    status,
    expires_at,
    max_devices
  )
  VALUES (
    v_customer_id,
    p_license_key_hash,
    p_encrypted_license_key,
    COALESCE(p_license_type, 'lifetime'),
    'active',
    p_expires_at,
    COALESCE(p_max_devices, 1)
  )
  RETURNING id INTO v_license_id;

  RETURN jsonb_build_object(
    'ok', true,
    'license_id', v_license_id,
    'customer_id', v_customer_id,
    'email', p_email
  );
END;
$$;

-- 4. sfx_complete_payment_order with encrypted_license_key support
CREATE OR REPLACE FUNCTION public.sfx_complete_payment_order(
  p_provider_order_id text,
  p_provider_payment_id text,
  p_signature text,
  p_license_key_hash text,
  p_expires_at timestamp with time zone DEFAULT NULL,
  p_max_devices integer DEFAULT 1,
  p_encrypted_license_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_customer_id UUID;
  v_license_id UUID;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  p_provider_order_id := trim(p_provider_order_id);
  p_provider_payment_id := trim(p_provider_payment_id);
  p_signature := trim(p_signature);
  p_license_key_hash := trim(p_license_key_hash);

  -- 1. Lock the order row FOR UPDATE
  SELECT * INTO v_order
  FROM public.payment_orders
  WHERE provider_order_id = p_provider_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ORDER_NOT_FOUND',
      'message', 'Order not found for ID: ' || p_provider_order_id
    );
  END IF;

  -- 2. Idempotency check: if already completed and license attached, return existing
  IF v_order.payment_status = 'completed' AND v_order.license_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_processed', true,
      'order_id', v_order.id,
      'license_id', v_order.license_id,
      'email', v_order.customer_email,
      'message', 'Payment already processed and license issued.'
    );
  END IF;

  -- 3. Upsert customer
  INSERT INTO public.customers (email)
  VALUES (lower(v_order.customer_email))
  ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
  RETURNING id INTO v_customer_id;

  -- 4. Insert license (if key hash not already present)
  SELECT id INTO v_license_id
  FROM public.licenses
  WHERE license_key_hash = p_license_key_hash;

  IF v_license_id IS NULL THEN
    INSERT INTO public.licenses (
      customer_id,
      license_key_hash,
      encrypted_license_key,
      license_type,
      status,
      expires_at,
      max_devices
    )
    VALUES (
      v_customer_id,
      p_license_key_hash,
      p_encrypted_license_key,
      'lifetime',
      'active',
      p_expires_at,
      COALESCE(p_max_devices, 1)
    )
    RETURNING id INTO v_license_id;
  ELSE
    IF p_encrypted_license_key IS NOT NULL THEN
      UPDATE public.licenses
      SET encrypted_license_key = p_encrypted_license_key
      WHERE id = v_license_id AND (encrypted_license_key IS NULL OR encrypted_license_key = '');
    END IF;
  END IF;

  -- 5. Mark order completed & link license
  UPDATE public.payment_orders
  SET payment_status = 'completed',
      provider_payment_id = p_provider_payment_id,
      signature = p_signature,
      license_id = v_license_id,
      webhook_processed_at = v_now
  WHERE id = v_order.id;

  RETURN jsonb_build_object(
    'ok', true,
    'already_processed', false,
    'order_id', v_order.id,
    'license_id', v_license_id,
    'customer_id', v_customer_id,
    'email', v_order.customer_email,
    'amount', v_order.amount,
    'currency', v_order.currency
  );
END;
$$;

-- 5. Reactivate License
CREATE OR REPLACE FUNCTION public.sfx_reactivate_license_v2(p_license_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.licenses
  SET status = 'active',
      revoked_at = NULL,
      revoked_reason = NULL
  WHERE id = p_license_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'License not found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'message', 'License reactivated successfully');
END;
$$;

-- 6. Extend Expiry
CREATE OR REPLACE FUNCTION public.sfx_extend_license_expiry_v2(
  p_license_id UUID,
  p_new_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.licenses
  SET expires_at = p_new_expires_at
  WHERE id = p_license_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'License not found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'message', 'License expiry updated successfully');
END;
$$;

-- 7. Upgrade sfx_admin_search_v2 to return encrypted_license_key, license_type, payment details, and verification date
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
      -- Payment details
      ord.provider_order_id,
      ord.provider_payment_id,
      ord.amount AS payment_amount,
      ord.currency AS payment_currency,
      ord.payment_status,
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
      SELECT provider_order_id, provider_payment_id, amount, currency, payment_status
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
    ORDER BY l.created_at DESC
    LIMIT 200
  ) sub;

  RETURN v_results;
END;
$$;

-- 8. Upgrade sfx_get_customer_portal_v2 to include encrypted_license_key and license_type
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
