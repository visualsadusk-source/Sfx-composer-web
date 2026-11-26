-- Migration: Admin-managed approved release pointers for SFX Composer
-- Preserves release history for safe rollback without modifying customer licenses or orders.

CREATE TABLE IF NOT EXISTS public.sfx_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_id text NOT NULL DEFAULT 'com.sfxcomposer.panel',
  version text NOT NULL CHECK (version ~ '^\d+\.\d+\.\d+$'),
  minimum_version text NOT NULL DEFAULT '2.0.0' CHECK (minimum_version ~ '^\d+\.\d+\.\d+$'),
  release_date text NOT NULL DEFAULT '',
  mandatory boolean NOT NULL DEFAULT false,
  changelog jsonb NOT NULL DEFAULT '[]'::jsonb,
  release_notes_url text NOT NULL DEFAULT '',
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'),
  asset_name text NOT NULL,
  approved boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT false,
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sfx_releases_active
  ON public.sfx_releases (extension_id, is_active, approved, created_at DESC);

-- Guarantee at most one active release per extension_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_sfx_releases_one_active
  ON public.sfx_releases (extension_id)
  WHERE is_active = true;

ALTER TABLE public.sfx_releases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.sfx_releases FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sfx_releases TO service_role;

DROP POLICY IF EXISTS "Admins can read sfx_releases" ON public.sfx_releases;
CREATE POLICY "Admins can read sfx_releases"
  ON public.sfx_releases
  FOR SELECT
  TO authenticated
  USING (public.is_admin());
