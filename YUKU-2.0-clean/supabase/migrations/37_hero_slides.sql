-- ============================================================================
-- MIGRATION 37: SLIDE HERO BERANDA (public.hero_slides) + BUCKET 'hero'
-- Admin mengunggah gambar slide untuk bagian paling atas Beranda.
-- Aman dijalankan ulang (idempoten). Bergantung pada (SELECT public.is_admin()).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.hero_slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(150) NOT NULL DEFAULT 'Slide YUKU',
  image_url TEXT NOT NULL,            -- gambar desktop (disarankan 1920x800)
  mobile_image_url TEXT,              -- gambar mobile opsional (disarankan 900x1100)
  link_url TEXT,                      -- tujuan klik: '/talent' atau 'https://...'
  storage_path TEXT,
  mobile_storage_path TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hero_slides_active_order
  ON public.hero_slides (is_active, sort_order ASC, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_hero_slides_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hero_slides_updated_at ON public.hero_slides;
CREATE TRIGGER trg_hero_slides_updated_at
  BEFORE UPDATE ON public.hero_slides
  FOR EACH ROW
  EXECUTE FUNCTION public.set_hero_slides_updated_at();

ALTER TABLE public.hero_slides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hero_slides_select_public" ON public.hero_slides;
CREATE POLICY "hero_slides_select_public" ON public.hero_slides
  FOR SELECT USING (is_active = TRUE OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS "hero_slides_admin_insert" ON public.hero_slides;
CREATE POLICY "hero_slides_admin_insert" ON public.hero_slides
  FOR INSERT WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "hero_slides_admin_update" ON public.hero_slides;
CREATE POLICY "hero_slides_admin_update" ON public.hero_slides
  FOR UPDATE USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "hero_slides_admin_delete" ON public.hero_slides;
CREATE POLICY "hero_slides_admin_delete" ON public.hero_slides
  FOR DELETE USING ((SELECT public.is_admin()));

GRANT SELECT ON public.hero_slides TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.hero_slides TO authenticated;

-- Bucket publik 'hero' (gambar hanya bisa ditulis Admin)
INSERT INTO storage.buckets (id, name, public)
VALUES ('hero', 'hero', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

DROP POLICY IF EXISTS "hero_bucket_admin_select" ON storage.objects;
CREATE POLICY "hero_bucket_admin_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'hero' AND (SELECT public.is_admin()));

DROP POLICY IF EXISTS "hero_bucket_admin_insert" ON storage.objects;
CREATE POLICY "hero_bucket_admin_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'hero' AND (SELECT public.is_admin()));

DROP POLICY IF EXISTS "hero_bucket_admin_update" ON storage.objects;
CREATE POLICY "hero_bucket_admin_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'hero' AND (SELECT public.is_admin()));

DROP POLICY IF EXISTS "hero_bucket_admin_delete" ON storage.objects;
CREATE POLICY "hero_bucket_admin_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'hero' AND (SELECT public.is_admin()));
