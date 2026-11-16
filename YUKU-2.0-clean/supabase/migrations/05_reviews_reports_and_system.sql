-- ============================================================================
-- YUKU — SOCIAL EXPERIENCE & PAID COMPANIONSHIP MARKETPLACE
-- MIGRATION 05: REVIEWS, REPORTS/COMPLAINTS, NOTIFICATIONS & AUDIT LOGS (REVISED VERSION 9)
-- ============================================================================
-- Dokumen Acuan: docs/TAHAP-2-2-FINAL-REMEDIATION-REPORT.md
-- Deskripsi: Menyiapkan tabel ulasan customer, laporan pelanggaran/komplain,
--            notifikasi internal pengguna, dan log audit admin untuk privasi KTP.
--            (Tabel 19 s/d 22 - Total Akumulasi Keseluruhan: 22 Tabel)
-- ============================================================================

-- 1. TIPE ENUM REPORT & NOTIFICATION
DO $$ BEGIN
  CREATE TYPE public.report_category_type AS ENUM (
    'unethical_behavior',
    'dating_sexual_solicitation',
    'no_show',
    'safety_concern',
    'service_dispute',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.report_status_type AS ENUM (
    'open',
    'investigating',
    'resolved_action_taken',
    'dismissed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_type AS ENUM (
    'booking_update',
    'payment_status',
    'referral_bonus',
    'payout_status',
    'system_alert'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. TABEL 19: public.reviews (Rating 1-5 & Ulasan Pasca-Booking)
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID UNIQUE NOT NULL REFERENCES public.bookings(id),
  customer_id UUID NOT NULL REFERENCES public.customer_profiles(id),
  talent_id UUID NOT NULL REFERENCES public.talent_profiles(id),
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. TABEL 20: public.reports_complaints (Manajemen Insiden / Dispute Hold)
CREATE TABLE IF NOT EXISTS public.reports_complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.users(id),
  reported_user_id UUID NOT NULL REFERENCES public.users(id),
  booking_id UUID REFERENCES public.bookings(id),
  category public.report_category_type NOT NULL,
  description TEXT NOT NULL,
  evidence_urls TEXT[] NOT NULL DEFAULT '{}',
  status public.report_status_type NOT NULL DEFAULT 'open',
  admin_notes TEXT,
  resolved_by_admin_id UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TABEL 21: public.notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  type public.notification_type NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. TABEL 22: public.admin_audit_logs (Log Audit Akses KTP & Tindakan Admin)
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES public.users(id),
  action_type VARCHAR(100) NOT NULL,
  target_table VARCHAR(50) NOT NULL,
  target_id VARCHAR(100) NOT NULL,
  old_data JSONB,
  new_data JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. INDEKS KINERJA
CREATE INDEX IF NOT EXISTS idx_reviews_talent_id ON public.reviews(talent_id);
CREATE INDEX IF NOT EXISTS idx_reports_complaints_booking ON public.reports_complaints(booking_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin ON public.admin_audit_logs(admin_user_id);

-- ============================================================================
-- PROSEDUR ROLLBACK MIGRASI 05
-- ============================================================================
/*
  DROP TABLE IF EXISTS public.admin_audit_logs CASCADE;
  DROP TABLE IF EXISTS public.notifications CASCADE;
  DROP TABLE IF EXISTS public.reports_complaints CASCADE;
  DROP TABLE IF EXISTS public.reviews CASCADE;
  DROP TYPE IF EXISTS public.notification_type CASCADE;
  DROP TYPE IF EXISTS public.report_status_type CASCADE;
  DROP TYPE IF EXISTS public.report_category_type CASCADE;
*/
