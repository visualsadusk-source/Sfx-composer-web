-- Migration: 20261122_supabase_password_auth.sql
-- SFX COMPOSER: SUPABASE EMAIL + PASSWORD AUTHENTICATION & RLS SECURITY
-- 1. Add auth_user_id to public.customers (UUID REFERENCES auth.users(id))
-- 2. Add user_id to public.licenses (UUID REFERENCES auth.users(id))
-- 3. Create backward-compatible association triggers and helper functions
-- 4. Enable Row Level Security (RLS) on customers, licenses, and payment_orders
-- 5. Upgrade sfx_get_customer_portal_v2, sfx_create_license_v2, sfx_complete_payment_order
--    to associate and preserve customer ownership via Supabase Auth user IDs.

-- ── 1. Schema Alterations ──
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_auth_user_id ON public.customers(auth_user_id);

ALTER TABLE public.licenses
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON public.licenses(user_id);

-- ── 2. Backfill existing matching auth.users to customers and licenses ──
DO $$
BEGIN
  -- Associate customers with existing auth.users by email
  UPDATE public.customers c
  SET auth_user_id = u.id
  FROM auth.users u
  WHERE lower(c.email) = lower(u.email) AND c.auth_user_id IS NULL;

  -- Associate licenses with auth.users via linked customers
  UPDATE public.licenses l
  SET user_id = c.auth_user_id
  FROM public.customers c
  WHERE l.customer_id = c.id AND c.auth_user_id IS NOT NULL AND l.user_id IS NULL;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Backfill notice: %', SQLERRM;
END $$;

-- ── 3. Helper Function to Link Auth User to Customer and Licenses ──
CREATE OR REPLACE FUNCTION public.sfx_link_auth_user(
  p_email TEXT,
  p_user_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_clean_email TEXT := lower(trim(p_email));
  v_cust_id UUID;
BEGIN
  IF v_clean_email = '' OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Invalid email or user_id');
  END IF;

  UPDATE public.customers
  SET auth_user_id = p_user_id
  WHERE lower(email) = v_clean_email
  RETURNING id INTO v_cust_id;

  IF v_cust_id IS NOT NULL THEN
    UPDATE public.licenses
    SET user_id = p_user_id
    WHERE customer_id = v_cust_id AND (user_id IS NULL OR user_id != p_user_id);

    RETURN jsonb_build_object(
      'ok', true,
      'customer_id', v_cust_id,
      'user_id', p_user_id,
      'email', v_clean_email,
      'message', 'Customer and licenses successfully associated with auth user'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', false,
    'message', 'No customer record found matching email: ' || v_clean_email
  );
END;
$$;

-- ── 4. Upgrade sfx_create_license_v2 with auth user linkage ──
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
  v_auth_user_id UUID;
  v_license_id UUID;
BEGIN
  p_email := lower(trim(p_email));
  p_license_key_hash := trim(p_license_key_hash);

  -- 1. Insert or get customer
  INSERT INTO public.customers (email)
  VALUES (p_email)
  ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
  RETURNING id, auth_user_id INTO v_customer_id, v_auth_user_id;

  -- If auth_user_id is not yet set, attempt lookup in auth.users
  IF v_auth_user_id IS NULL THEN
    BEGIN
      SELECT id INTO v_auth_user_id
      FROM auth.users
      WHERE lower(email) = p_email
      LIMIT 1;

      IF v_auth_user_id IS NOT NULL THEN
        UPDATE public.customers
        SET auth_user_id = v_auth_user_id
        WHERE id = v_customer_id;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_auth_user_id := NULL;
    END;
  END IF;

  -- 2. Insert license
  INSERT INTO public.licenses (
    customer_id,
    user_id,
    license_key_hash,
    encrypted_license_key,
    license_type,
    status,
    expires_at,
    max_devices
  )
  VALUES (
    v_customer_id,
    v_auth_user_id,
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
    'user_id', v_auth_user_id,
    'email', p_email
  );
END;
$$;

-- ── 5. Upgrade sfx_complete_payment_order with auth user linkage ──
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
  v_auth_user_id UUID;
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
  RETURNING id, auth_user_id INTO v_customer_id, v_auth_user_id;

  -- If auth_user_id not yet linked, check auth.users
  IF v_auth_user_id IS NULL THEN
    BEGIN
      SELECT id INTO v_auth_user_id
      FROM auth.users
      WHERE lower(email) = lower(v_order.customer_email)
      LIMIT 1;

      IF v_auth_user_id IS NOT NULL THEN
        UPDATE public.customers
        SET auth_user_id = v_auth_user_id
        WHERE id = v_customer_id;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_auth_user_id := NULL;
    END;
  END IF;

  -- 4. Insert or update license
  SELECT id INTO v_license_id
  FROM public.licenses
  WHERE license_key_hash = p_license_key_hash;

  IF v_license_id IS NULL THEN
    INSERT INTO public.licenses (
      customer_id,
      user_id,
      license_key_hash,
      encrypted_license_key,
      license_type,
      status,
      expires_at,
      max_devices
    )
    VALUES (
      v_customer_id,
      v_auth_user_id,
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
      SET 
        encrypted_license_key = p_encrypted_license_key,
        user_id = COALESCE(user_id, v_auth_user_id)
      WHERE id = v_license_id;
    END IF;
  END IF;

  -- 5. Mark payment_orders completed
  UPDATE public.payment_orders
  SET 
    provider_payment_id = p_provider_payment_id,
    payment_status = 'completed',
    license_id = v_license_id,
    updated_at = v_now
  WHERE id = v_order.id;

  RETURN jsonb_build_object(
    'ok', true,
    'already_processed', false,
    'order_id', v_order.id,
    'license_id', v_license_id,
    'user_id', v_auth_user_id,
    'email', v_order.customer_email,
    'message', 'Payment successfully verified and license generated.'
  );
END;
$$;

-- ── 6. Upgrade sfx_get_customer_portal_v2 with auto-association & user_id ──
CREATE OR REPLACE FUNCTION public.sfx_get_customer_portal_v2(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_clean_email TEXT;
  v_customer RECORD;
  v_caller_uid UUID;
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

  -- If caller is authenticated and customer auth_user_id is not yet set, link them
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NOT NULL AND v_customer.auth_user_id IS NULL THEN
    UPDATE public.customers
    SET auth_user_id = v_caller_uid
    WHERE id = v_customer.id;

    UPDATE public.licenses
    SET user_id = v_caller_uid
    WHERE customer_id = v_customer.id AND user_id IS NULL;

    v_customer.auth_user_id := v_caller_uid;
  END IF;

  -- 1. Licenses for this customer
  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb), '[]'::jsonb)
  INTO v_licenses
  FROM (
    SELECT 
      l.id,
      l.user_id,
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
    'user_id', v_customer.auth_user_id,
    'licenses', v_licenses,
    'orders', v_orders
  );
END;
$$;

-- ── 7. Enable Row Level Security (RLS) & Customer Self-Service Policies ──
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

-- Customers RLS: Customer can read their own record by auth.uid() or email
DROP POLICY IF EXISTS "Customers can view own profile" ON public.customers;
CREATE POLICY "Customers can view own profile"
ON public.customers
FOR SELECT
USING (
  auth.role() = 'service_role'
  OR auth.uid() = auth_user_id
  OR lower(email) = lower(auth.jwt() ->> 'email')
  OR lower(auth.jwt() ->> 'email') IN (SELECT email FROM public.sfx_admins)
);

-- Licenses RLS: Customer can only view their own licenses
DROP POLICY IF EXISTS "Customers can view own licenses" ON public.licenses;
CREATE POLICY "Customers can view own licenses"
ON public.licenses
FOR SELECT
USING (
  auth.role() = 'service_role'
  OR auth.uid() = user_id
  OR customer_id IN (
    SELECT id FROM public.customers
    WHERE auth_user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email')
  )
  OR lower(auth.jwt() ->> 'email') IN (SELECT email FROM public.sfx_admins)
);

-- Payment Orders RLS: Customer can only view their own orders
DROP POLICY IF EXISTS "Customers can view own orders" ON public.payment_orders;
CREATE POLICY "Customers can view own orders"
ON public.payment_orders
FOR SELECT
USING (
  auth.role() = 'service_role'
  OR lower(customer_email) = lower(auth.jwt() ->> 'email')
  OR lower(auth.jwt() ->> 'email') IN (SELECT email FROM public.sfx_admins)
);
