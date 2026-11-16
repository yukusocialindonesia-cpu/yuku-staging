-- ============================================================================
-- MIGRATION 15: TABEL PROMOSI & BUCKET POSTER BERANDA (public.promotions)
-- Aman dijalankan ulang (Idempoten).
-- ============================================================================

-- 1. Tabel public.promotions untuk menyimpan URL gambar dan link promosi
CREATE TABLE IF NOT EXISTS public.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(150) NOT NULL DEFAULT 'Promo YUKU',
  image_url TEXT NOT NULL,
  link_url TEXT,
  storage_path TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotions_active_order
  ON public.promotions (is_active, sort_order ASC, created_at DESC);

-- 2. Trigger updated_at otomatis
CREATE OR REPLACE FUNCTION public.set_promotions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promotions_updated_at ON public.promotions;
CREATE TRIGGER trg_promotions_updated_at
  BEFORE UPDATE ON public.promotions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_promotions_updated_at();

-- 3. Row Level Security & Grants
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "promotions_select_public" ON public.promotions;
CREATE POLICY "promotions_select_public" ON public.promotions
  FOR SELECT USING (is_active = TRUE OR public.is_admin());

DROP POLICY IF EXISTS "promotions_admin_insert" ON public.promotions;
CREATE POLICY "promotions_admin_insert" ON public.promotions
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "promotions_admin_update" ON public.promotions;
CREATE POLICY "promotions_admin_update" ON public.promotions
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "promotions_admin_delete" ON public.promotions;
CREATE POLICY "promotions_admin_delete" ON public.promotions
  FOR DELETE USING (public.is_admin());

GRANT SELECT ON public.promotions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.promotions TO authenticated;

-- 4. Storage Bucket Publik 'promotions' untuk unggahan gambar poster dari Admin
INSERT INTO storage.buckets (id, name, public)
VALUES ('promotions', 'promotions', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

DROP POLICY IF EXISTS "promotions_bucket_public_select" ON storage.objects;
CREATE POLICY "promotions_bucket_public_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'promotions');

DROP POLICY IF EXISTS "promotions_bucket_admin_insert" ON storage.objects;
CREATE POLICY "promotions_bucket_admin_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'promotions' AND public.is_admin());

DROP POLICY IF EXISTS "promotions_bucket_admin_update" ON storage.objects;
CREATE POLICY "promotions_bucket_admin_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'promotions' AND public.is_admin());

DROP POLICY IF EXISTS "promotions_bucket_admin_delete" ON storage.objects;
CREATE POLICY "promotions_bucket_admin_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'promotions' AND public.is_admin());
