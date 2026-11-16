-- ============================================================================
-- MIGRATION 16: GALERI FOTO, VIDEO & VOICE INTRO TALENT (public.talent_media)
-- Aman dijalankan ulang (Idempoten).
-- ============================================================================

-- 1. Tabel public.talent_media untuk menyimpan foto, video, dan voice intro Talent
CREATE TABLE IF NOT EXISTS public.talent_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  media_type VARCHAR(10) NOT NULL CHECK (media_type IN ('photo', 'video', 'voice')),
  media_url TEXT NOT NULL,
  storage_path TEXT,
  caption VARCHAR(160),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_talent_media_talent_type
  ON public.talent_media (talent_id, media_type, sort_order ASC, created_at DESC);

-- 2. Row Level Security & Grants
ALTER TABLE public.talent_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "talent_media_select_public_or_owner" ON public.talent_media;
CREATE POLICY "talent_media_select_public_or_owner" ON public.talent_media
  FOR SELECT USING (
    public.is_talent_publicly_visible(talent_id)
    OR auth.uid() = talent_id
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "talent_media_owner_insert" ON public.talent_media;
CREATE POLICY "talent_media_owner_insert" ON public.talent_media
  FOR INSERT WITH CHECK (auth.uid() = talent_id);

DROP POLICY IF EXISTS "talent_media_owner_update" ON public.talent_media;
CREATE POLICY "talent_media_owner_update" ON public.talent_media
  FOR UPDATE USING (auth.uid() = talent_id) WITH CHECK (auth.uid() = talent_id);

DROP POLICY IF EXISTS "talent_media_owner_or_admin_delete" ON public.talent_media;
CREATE POLICY "talent_media_owner_or_admin_delete" ON public.talent_media
  FOR DELETE USING (auth.uid() = talent_id OR public.is_admin());

GRANT SELECT ON public.talent_media TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.talent_media TO authenticated;

-- 3. Storage Bucket Publik 'talent-media' (Foto, Video, Voice Intro hingga 50 MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'talent-media',
  'talent-media',
  TRUE,
  52428800,
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/x-m4a'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = TRUE,
  file_size_limit = 52428800,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "talent_media_bucket_public_select" ON storage.objects;
CREATE POLICY "talent_media_bucket_public_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'talent-media');

DROP POLICY IF EXISTS "talent_media_bucket_owner_insert" ON storage.objects;
CREATE POLICY "talent_media_bucket_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'talent-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "talent_media_bucket_owner_update" ON storage.objects;
CREATE POLICY "talent_media_bucket_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'talent-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "talent_media_bucket_owner_delete" ON storage.objects;
CREATE POLICY "talent_media_bucket_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'talent-media'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.is_admin()
    )
  );
