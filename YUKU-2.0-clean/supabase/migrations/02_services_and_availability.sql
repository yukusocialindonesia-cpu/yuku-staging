-- ============================================================================
-- YUKU — SOCIAL EXPERIENCE & PAID COMPANIONSHIP MARKETPLACE
-- MIGRATION 02: TALENT SERVICES & AVAILABILITY SCHEDULES (REVISED VERSION 9)
-- ============================================================================
-- Dokumen Acuan: docs/TAHAP-2-2-FINAL-REMEDIATION-REPORT.md
-- Deskripsi: Menyiapkan tabel talent_services (pemetaan aktivitas & tarif khusus BIGINT)
--            dan talent_availability (jadwal ketersediaan mingguan/tanggal spesifik).
--            (Tabel 6 & 7)
-- ============================================================================

-- 1. TABEL 6: public.talent_services
CREATE TABLE IF NOT EXISTS public.talent_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  activity_category_id VARCHAR(50) NOT NULL REFERENCES public.activity_categories(id),
  custom_rate_override BIGINT CHECK (custom_rate_override > 0), -- Integer Rupiah
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_talent_activity UNIQUE (talent_id, activity_category_id)
);

-- 2. TABEL 7: public.talent_availability
CREATE TABLE IF NOT EXISTS public.talent_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Minggu, 6 = Sabtu
  specific_date DATE,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_time_range CHECK (end_time > start_time),
  CONSTRAINT check_day_or_date CHECK (day_of_week IS NOT NULL OR specific_date IS NOT NULL)
);

-- 3. INDEKS KINERJA
CREATE INDEX IF NOT EXISTS idx_talent_services_talent_id ON public.talent_services(talent_id);
CREATE INDEX IF NOT EXISTS idx_talent_services_category_id ON public.talent_services(activity_category_id);
CREATE INDEX IF NOT EXISTS idx_talent_availability_talent_day ON public.talent_availability(talent_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_talent_availability_talent_date ON public.talent_availability(talent_id, specific_date);

-- ============================================================================
-- PROSEDUR ROLLBACK MIGRASI 02
-- ============================================================================
/*
  DROP TABLE IF EXISTS public.talent_availability CASCADE;
  DROP TABLE IF EXISTS public.talent_services CASCADE;
*/
