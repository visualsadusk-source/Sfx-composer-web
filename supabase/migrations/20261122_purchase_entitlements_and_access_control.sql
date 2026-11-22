-- Migration: 20261122_purchase_entitlements_and_access_control.sql
-- SFX COMPOSER: PURCHASE AUTHORIZATION, PRODUCT ENTITLEMENTS & DOWNLOAD ACCESS CONTROL
-- 1. Create purchases table with unique constraints on payment identifiers
-- 2. Create product_entitlements table for granular product access control
-- 3. Create download_audit_logs table to track and monitor all download access
-- 4. Enable Row Level Security (RLS) on purchases and product_entitlements
-- 5. Upgrade sfx_get_customer_portal_v2 to strictly separate authenticated vs paid states
-- 6. Upgrade sfx_complete_payment_order to grant product entitlements on verified payment
-- 7. Add sfx_revoke_entitlement RPC for refunds and access revocation

-- ── 1. Create purchases Table ──
CREATE TABLE IF NOT EXISTS public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  customer_email TEXT NOT NULL,
  razorpay_order_id TEXT NOT NULL UNIQUE,
  razorpay_payment_id TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL DEFAULT 'sfx-composer-bundle',
  product_name TEXT NOT NULL DEFAULT 'SFX Composer Complete Bundle',
  amount NUMERIC NOT NULL DEFAULT 199,
  currency TEXT NOT NULL DEFAULT 'INR',
  payment_status TEXT NOT NULL DEFAULT 'completed', -- 'pending', 'completed', 'refunded', 'failed'
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_purchases_user_id ON public.purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_customer_id ON public.purchases(customer_id);
CREATE INDEX IF NOT EXISTS idx_purchases_customer_email ON public.purchases(customer_email);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON public.purchases(payment_status);
CREATE INDEX IF NOT EXISTS idx_purchases_order_id ON public.purchases(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_purchases_payment_id ON public.purchases(razorpay_payment_id);

-- ── 2. Create product_entitlements Table ──
CREATE TABLE IF NOT EXISTS public.product_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  customer_email TEXT NOT NULL,
  purchase_id UUID REFERENCES public.purchases(id) ON DELETE CASCADE,
  license_id UUID REFERENCES public.licenses(id) ON DELETE SET NULL,
  product_id TEXT NOT NULL DEFAULT 'sfx-composer-bundle',
  product_name TEXT NOT NULL DEFAULT 'SFX Composer Complete Bundle',
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'revoked', 'refunded', 'expired'
  granted_by TEXT NOT NULL DEFAULT 'payment', -- 'payment', 'admin_manual'
  granted_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  revoked_at TIMESTAMPTZ DEFAULT NULL,
  revoked_reason TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_customer_product_entitlement UNIQUE (customer_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_entitlements_user_id ON public.product_entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_customer_id ON public.product_entitlements(customer_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_customer_email ON public.product_entitlements(customer_email);
CREATE INDEX IF NOT EXISTS idx_entitlements_status ON public.product_entitlements(status);
CREATE INDEX IF NOT EXISTS idx_entitlements_product ON public.product_entitlements(product_id);

-- ── 3. Create download_audit_logs Table ──
CREATE TABLE IF NOT EXISTS public.download_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  customer_email TEXT,
  product_id TEXT NOT NULL DEFAULT 'sfx-composer-bundle',
  download_type TEXT NOT NULL, -- 'zxp', 'zip', 'sfx-library'
  status TEXT NOT NULL, -- 'granted', 'denied'
  reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_download_audit_logs_email ON public.download_audit_logs(customer_email);
CREATE INDEX IF NOT EXISTS idx_download_audit_logs_created_at ON public.download_audit_logs(created_at DESC);

-- ── 4. Backfill Existing Valid Purchases & Active Licenses ──
DO $$
BEGIN
  -- Backfill completed payment_orders into purchases table
  INSERT INTO public.purchases (
    user_id,
    customer_id,
    customer_email,
    razorpay_order_id,
    razorpay_payment_id,
    product_id,
    product_name,
    amount,
    currency,
    payment_status,
    created_at
  )
  SELECT 
    c.auth_user_id,
    c.id,
    lower(po.customer_email),
    po.provider_order_id,
    po.provider_payment_id,
    'sfx-composer-bundle',
    'SFX Composer Complete Bundle',
    COALESCE(po.amount, 199),
    COALESCE(po.currency, 'INR'),
    po.payment_status,
    po.created_at
  FROM public.payment_orders po
  JOIN public.customers c ON lower(po.customer_email) = lower(c.email)
  WHERE po.payment_status = 'completed'
    AND po.provider_order_id IS NOT NULL 
    AND po.provider_payment_id IS NOT NULL
  ON CONFLICT (razorpay_order_id) DO NOTHING;

  -- Backfill active licenses into product_entitlements
  INSERT INTO public.product_entitlements (
    user_id,
    customer_id,
    customer_email,
    purchase_id,
    license_id,
    product_id,
    product_name,
    status,
    granted_by,
    created_at
  )
  SELECT 
    c.auth_user_id,
    c.id,
    lower(c.email),
    p.id,
    l.id,
    'sfx-composer-bundle',
    'SFX Composer Complete Bundle',
    CASE WHEN l.status = 'active' THEN 'active' ELSE 'revoked' END,
    'payment',
    l.created_at
  FROM public.licenses l
  JOIN public.customers c ON l.customer_id = c.id
  LEFT JOIN public.purchases p ON p.customer_id = c.id
  ON CONFLICT (customer_id, product_id) DO UPDATE 
  SET 
    license_id = EXCLUDED.license_id,
    status = EXCLUDED.status,
    user_id = COALESCE(public.product_entitlements.user_id, EXCLUDED.user_id),
    updated_at = timezone('utc'::text, now());
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Backfill warning: %', SQLERRM;
END $$;

-- ── 5. Enable Row Level Security (RLS) on purchases & product_entitlements ──
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.download_audit_logs ENABLE ROW LEVEL SECURITY;

-- Purchases RLS: Customers can view only their own verified purchase records
DROP POLICY IF EXISTS "Customers can view own purchases" ON public.purchases;
CREATE POLICY "Customers can view own purchases"
ON public.purchases
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

-- Entitlements RLS: Customers can view only their own active entitlements
DROP POLICY IF EXISTS "Customers can view own entitlements" ON public.product_entitlements;
CREATE POLICY "Customers can view own entitlements"
ON public.product_entitlements
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

-- Audit logs RLS: Only admins & service role can view download logs
DROP POLICY IF EXISTS "Admins can view download audit logs" ON public.download_audit_logs;
CREATE POLICY "Admins can view download audit logs"
ON public.download_audit_logs
FOR SELECT
USING (
  auth.role() = 'service_role'
  OR lower(auth.jwt() ->> 'email') IN (SELECT email FROM public.sfx_admins)
);

-- ── 6. Upgrade sfx_get_customer_portal_v2: STRICT AUTHORIZATION SEPARATION ──
DROP FUNCTION IF EXISTS public.sfx_get_customer_portal_v2(text);

CREATE OR REPLACE FUNCTION public.sfx_get_customer_portal_v2(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_clean_email TEXT;
  v_customer RECORD;
  v_caller_uid UUID;
  v_is_paid BOOLEAN := false;
  v_entitlement RECORD;
  v_licenses JSONB := '[]'::jsonb;
  v_orders JSONB := '[]'::jsonb;
  v_downloads JSONB := NULL;
BEGIN
  v_clean_email := lower(trim(p_email));

  IF v_clean_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Email is required');
  END IF;

  SELECT * INTO v_customer
  FROM public.customers
  WHERE lower(email) = v_clean_email;

  -- If customer not found in database, return unpaid ready account state
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'found', false,
      'is_paid', false,
      'email', v_clean_email,
      'product_name', 'SFX Composer Complete Bundle',
      'price_inr', 199,
      'message', 'Your account is ready. Purchase SFX Composer to unlock your downloads and license.',
      'licenses', '[]'::jsonb,
      'orders', '[]'::jsonb,
      'downloads', NULL
    );
  END IF;

  -- Associate auth_user_id if caller is authenticated
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NOT NULL AND v_customer.auth_user_id IS NULL THEN
    UPDATE public.customers
    SET auth_user_id = v_caller_uid
    WHERE id = v_customer.id;

    UPDATE public.purchases
    SET user_id = v_caller_uid
    WHERE customer_id = v_customer.id AND user_id IS NULL;

    UPDATE public.product_entitlements
    SET user_id = v_caller_uid
    WHERE customer_id = v_customer.id AND user_id IS NULL;

    UPDATE public.licenses
    SET user_id = v_caller_uid
    WHERE customer_id = v_customer.id AND user_id IS NULL;

    v_customer.auth_user_id := v_caller_uid;
  END IF;

  -- ── Check Active Verified Entitlement ──
  -- Must have an active entitlement or at least one active, unrevoked license
  SELECT * INTO v_entitlement
  FROM public.product_entitlements
  WHERE (customer_id = v_customer.id OR lower(customer_email) = v_clean_email)
    AND product_id = 'sfx-composer-bundle'
    AND status = 'active'
  LIMIT 1;

  IF FOUND THEN
    v_is_paid := true;
  ELSE
    -- Fallback check: verified completed payment order or active license
    SELECT EXISTS (
      SELECT 1 FROM public.licenses
      WHERE customer_id = v_customer.id AND status = 'active'
    ) OR EXISTS (
      SELECT 1 FROM public.payment_orders
      WHERE lower(customer_email) = v_clean_email AND payment_status = 'completed'
    ) INTO v_is_paid;
  END IF;

  -- ── 1. Orders for this customer ──
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

  -- ── 2. If UNPAID: Do NOT return licenses or downloads ──
  IF NOT v_is_paid THEN
    RETURN jsonb_build_object(
      'ok', true,
      'found', true,
      'is_paid', false,
      'email', v_clean_email,
      'customer_id', v_customer.id,
      'product_name', 'SFX Composer Complete Bundle',
      'price_inr', 199,
      'message', 'Your account is ready. Purchase SFX Composer to unlock your downloads and license.',
      'licenses', '[]'::jsonb,
      'orders', v_orders,
      'downloads', NULL
    );
  END IF;

  -- ── 3. If PAID: Return Active Decrypted Licenses & Authorized Downloads ──
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
      ord.provider_order_id,
      ord.provider_payment_id,
      ord.amount AS payment_amount,
      ord.currency AS payment_currency,
      ord.payment_status,
      ord.created_at AS purchase_date,
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
    WHERE l.customer_id = v_customer.id AND l.status = 'active'
    ORDER BY l.created_at DESC
  ) sub;

  -- Authorized Downloads Gateway Configuration
  v_downloads := jsonb_build_object(
    'has_access', true,
    'product_id', 'sfx-composer-bundle',
    'product_name', 'SFX Composer Complete Bundle',
    'zxp_url', '/api/download?type=zxp',
    'zip_url', '/api/download?type=zip',
    'sfx_library_url', '/api/download?type=sfx-library'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'found', true,
    'is_paid', true,
    'email', v_clean_email,
    'customer_id', v_customer.id,
    'user_id', v_customer.auth_user_id,
    'licenses', v_licenses,
    'orders', v_orders,
    'downloads', v_downloads
  );
END;
$$;

-- ── 7. Upgrade sfx_complete_payment_order to register Purchases & Entitlements ──
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
  v_purchase_id UUID;
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
        user_id = COALESCE(user_id, v_auth_user_id),
        status = 'active',
        revoked_at = NULL,
        revoked_reason = NULL
      WHERE id = v_license_id;
    END IF;
  END IF;

  -- 5. Record verified purchase in purchases table
  INSERT INTO public.purchases (
    user_id,
    customer_id,
    customer_email,
    razorpay_order_id,
    razorpay_payment_id,
    product_id,
    product_name,
    amount,
    currency,
    payment_status,
    updated_at
  )
  VALUES (
    v_auth_user_id,
    v_customer_id,
    lower(v_order.customer_email),
    p_provider_order_id,
    p_provider_payment_id,
    'sfx-composer-bundle',
    'SFX Composer Complete Bundle',
    COALESCE(v_order.amount, 199),
    COALESCE(v_order.currency, 'INR'),
    'completed',
    v_now
  )
  ON CONFLICT (razorpay_order_id) DO UPDATE 
  SET 
    razorpay_payment_id = EXCLUDED.razorpay_payment_id,
    payment_status = 'completed',
    user_id = COALESCE(public.purchases.user_id, EXCLUDED.user_id),
    updated_at = v_now
  RETURNING id INTO v_purchase_id;

  -- 6. Grant or update product entitlement
  INSERT INTO public.product_entitlements (
    user_id,
    customer_id,
    customer_email,
    purchase_id,
    license_id,
    product_id,
    product_name,
    status,
    granted_by,
    granted_at,
    updated_at
  )
  VALUES (
    v_auth_user_id,
    v_customer_id,
    lower(v_order.customer_email),
    v_purchase_id,
    v_license_id,
    'sfx-composer-bundle',
    'SFX Composer Complete Bundle',
    'active',
    'payment',
    v_now,
    v_now
  )
  ON CONFLICT (customer_id, product_id) DO UPDATE 
  SET 
    purchase_id = EXCLUDED.purchase_id,
    license_id = EXCLUDED.license_id,
    status = 'active',
    revoked_at = NULL,
    revoked_reason = NULL,
    user_id = COALESCE(public.product_entitlements.user_id, EXCLUDED.user_id),
    updated_at = v_now;

  -- 7. Mark payment_orders completed
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
    'purchase_id', v_purchase_id,
    'user_id', v_auth_user_id,
    'email', v_order.customer_email,
    'message', 'Payment successfully verified and product entitlements unlocked.'
  );
END;
$$;

-- ── 8. sfx_revoke_entitlement RPC for Refunds and Access Revocation ──
CREATE OR REPLACE FUNCTION public.sfx_revoke_entitlement(
  p_identifier TEXT, -- Can be razorpay_order_id, razorpay_payment_id, or email
  p_reason TEXT DEFAULT 'Payment refunded or chargeback'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cust_email TEXT;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  -- Service role or admin check
  IF auth.role() != 'service_role' AND NOT EXISTS (SELECT 1 FROM public.sfx_admins WHERE lower(email) = lower(auth.jwt() ->> 'email')) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Unauthorized: Admin privileges required to revoke entitlements.');
  END IF;

  -- 1. Update purchase payment_status to refunded
  UPDATE public.purchases
  SET 
    payment_status = 'refunded',
    updated_at = v_now
  WHERE razorpay_order_id = p_identifier 
     OR razorpay_payment_id = p_identifier 
     OR lower(customer_email) = lower(p_identifier)
  RETURNING customer_email INTO v_cust_email;

  IF v_cust_email IS NULL THEN
    v_cust_email := lower(p_identifier);
  END IF;

  -- 2. Revoke product entitlement
  UPDATE public.product_entitlements
  SET 
    status = 'revoked',
    revoked_at = v_now,
    revoked_reason = p_reason,
    updated_at = v_now
  WHERE lower(customer_email) = v_cust_email;

  -- 3. Revoke active licenses
  UPDATE public.licenses
  SET 
    status = 'revoked',
    revoked_at = v_now,
    revoked_reason = p_reason
  WHERE customer_id IN (SELECT id FROM public.customers WHERE lower(email) = v_cust_email);

  -- 4. Deactivate bound devices
  UPDATE public.license_activations
  SET deactivated_at = v_now
  WHERE license_id IN (
    SELECT l.id FROM public.licenses l
    JOIN public.customers c ON l.customer_id = c.id
    WHERE lower(c.email) = v_cust_email
  ) AND deactivated_at IS NULL;

  -- 5. Update payment_orders
  UPDATE public.payment_orders
  SET payment_status = 'refunded', updated_at = v_now
  WHERE provider_order_id = p_identifier 
     OR provider_payment_id = p_identifier 
     OR lower(customer_email) = v_cust_email;

  RETURN jsonb_build_object(
    'ok', true,
    'email', v_cust_email,
    'reason', p_reason,
    'message', 'Entitlements and licenses successfully revoked.'
  );
END;
$$;
