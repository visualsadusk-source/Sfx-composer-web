-- ── SFX COMPOSER: ADMIN & CONTENT MANAGEMENT MIGRATION ──

-- 1. Admin Users Table
CREATE TABLE IF NOT EXISTS public.sfx_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed existing known administrators
INSERT INTO public.sfx_admins (email)
VALUES 
  ('visualsadusk@gmail.com'),
  ('sfxcomposertest@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- 2. Security Definer Helper Function: is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
DECLARE
  v_email text;
BEGIN
  -- Service role always has admin privileges
  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  -- Must be an authenticated user
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  v_email := lower(COALESCE(auth.jwt() ->> 'email', ''));

  -- Check sfx_admins table
  IF EXISTS (SELECT 1 FROM public.sfx_admins WHERE lower(email) = v_email) THEN
    RETURN true;
  END IF;

  -- Check app_metadata or user_metadata
  IF (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' 
     OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'service_role'
     OR (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
     OR (auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean = true THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 3. Website Videos Table
CREATE TABLE IF NOT EXISTS public.sfx_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  youtube_url text NOT NULL,
  youtube_id text NOT NULL,
  thumbnail_url text NOT NULL,
  custom_thumbnail_url text DEFAULT NULL,
  section text NOT NULL DEFAULT 'tutorials', -- 'tutorials', 'homepage_tutorials', 'live_demo', 'product_demo'
  display_order integer NOT NULL DEFAULT 0,
  is_featured boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'published', -- 'published', 'draft'
  category text DEFAULT 'General',
  duration text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create index on section and status for fast public queries
CREATE INDEX IF NOT EXISTS idx_sfx_videos_section_status ON public.sfx_videos (section, status, display_order);

-- Enable RLS on sfx_videos
ALTER TABLE public.sfx_videos ENABLE ROW LEVEL SECURITY;

-- Drop old policies if any exist
DROP POLICY IF EXISTS "Public can view published videos" ON public.sfx_videos;
DROP POLICY IF EXISTS "Admins have full access to sfx_videos" ON public.sfx_videos;

-- Public Policy: Anyone (anon or authenticated) can view published videos
CREATE POLICY "Public can view published videos"
  ON public.sfx_videos FOR SELECT
  USING (status = 'published');

-- Admin Policy: Admins have full access (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "Admins have full access to sfx_videos"
  ON public.sfx_videos FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4. Section Content / Headings Table
CREATE TABLE IF NOT EXISTS public.sfx_section_content (
  section_key text PRIMARY KEY, -- 'tutorials', 'homepage_tutorials', 'live_demo', 'product_demo'
  kicker text DEFAULT '',
  title text NOT NULL,
  description text DEFAULT '',
  featured_video_id uuid REFERENCES public.sfx_videos(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on sfx_section_content
ALTER TABLE public.sfx_section_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view section content" ON public.sfx_section_content;
DROP POLICY IF EXISTS "Admins have full access to sfx_section_content" ON public.sfx_section_content;

-- Public Policy: Anyone can read section contents
CREATE POLICY "Public can view section content"
  ON public.sfx_section_content FOR SELECT
  USING (true);

-- Admin Policy: Only admins can insert/update/delete section content
CREATE POLICY "Admins have full access to sfx_section_content"
  ON public.sfx_section_content FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5. Seed Default Section Headings
INSERT INTO public.sfx_section_content (section_key, kicker, title, description)
VALUES 
  ('tutorials', 'Video Tutorials', 'Master SFX Composer In Minutes', 'Step-by-step guides for installing, configuring, and mastering audio design inside Premiere Pro and After Effects.'),
  ('homepage_tutorials', 'Quick Start Guides', 'Accelerate Your Audio Workflow', 'Learn the essential features of SFX Composer with these fast, focused video walkthroughs.'),
  ('live_demo', 'Interactive Showcase', 'Experience SFX Composer Live', 'Watch the real-time timeline clip injection and waveform auditioning engine in action.'),
  ('product_demo', 'Product Tour', 'Engineered for Modern Editors', 'A comprehensive demonstration of sound-design features built specifically for Adobe video editors.')
ON CONFLICT (section_key) DO UPDATE SET
  kicker = EXCLUDED.kicker,
  title = EXCLUDED.title,
  description = EXCLUDED.description;

-- 6. Seed Default Initial Videos
INSERT INTO public.sfx_videos (title, description, youtube_url, youtube_id, thumbnail_url, section, display_order, is_featured, status, category, duration)
VALUES
  (
    'Product Overview & Workflow Tour',
    'Learn the end-to-end sound design pipeline inside Premiere Pro, from sound searching to timeline placement.',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'dQw4w9WgXcQ',
    'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    'tutorials',
    1,
    true,
    'published',
    'Overview',
    '4:20'
  ),
  (
    'Installation Guide (Windows Batch & CEP)',
    'One-click installation and unlocking player debug mode for CEP extensions in Premiere Pro & After Effects.',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'dQw4w9WgXcQ',
    'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    'tutorials',
    2,
    false,
    'published',
    'Setup',
    '3:15'
  ),
  (
    'Essential Sound Studio Masterclass',
    'Sculpting Dialogue, Music, Ambience & SFX using live BiquadFilters, bass shelves, and peak normalization.',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'dQw4w9WgXcQ',
    'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    'tutorials',
    3,
    false,
    'published',
    'Audio Studio',
    '6:45'
  ),
  (
    'Audio Tools: Trim, Fade & WAV Export',
    'How to preview transients, apply smoothstep fades, and export clean 24-bit WAV samples directly to your timeline.',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'dQw4w9WgXcQ',
    'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    'tutorials',
    4,
    false,
    'published',
    'Tools',
    '5:10'
  ),
  (
    'SFX Composer Live Plugin Walkthrough',
    'See how SFX Composer detects active sequence tracks and injects curated sounds with exact sync.',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'dQw4w9WgXcQ',
    'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    'live_demo',
    1,
    true,
    'published',
    'Demonstration',
    '2:50'
  ),
  (
    'Cinematic Sound Design in Premiere Pro',
    'Create punchy impact transitions, risers, and subtle ambiences for video trailers in seconds.',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'dQw4w9WgXcQ',
    'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    'product_demo',
    1,
    true,
    'published',
    'Creative',
    '4:05'
  )
ON CONFLICT DO NOTHING;
