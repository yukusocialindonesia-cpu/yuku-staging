-- ============================================================================
-- YUKU — SOCIAL EXPERIENCE & PAID COMPANIONSHIP MARKETPLACE
-- MIGRATION 03: BOOKINGS, EXCLUSION CONSTRAINTS, PAYMENTS & REFUNDS (REVISED VERSION 9)
-- ============================================================================
-- Dokumen Acuan: docs/TAHAP-2-2-FINAL-REMEDIATION-REPORT.md
-- Deskripsi: Menyiapkan enums & tabel bookings, booking_status_history, payments,
--            dan refunds. Exclusion Constraint disederhanakan ke status aktif
--            agar valid di PostgreSQL dan seluruh nilai mata uang menggunakan BIGINT.
--            (Tabel 8 s/d 11)
-- ============================================================================

-- 1. TIPE ENUM BOOKING & PAYMENT
DO $$ BEGIN
  CREATE TYPE public.booking_mode_type AS ENUM ('offline', 'online');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.booking_status_type AS ENUM (
    'pending_payment',
    'paid_held_in_escrow',
    'confirmed_by_talent',
    'in_progress',
    'completed',
    'disputed_hold',
    'cancelled_by_customer',
    'cancelled_by_talent',
    'refunded',
    'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_provider_type AS ENUM ('xendit', 'midtrans');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status_type AS ENUM (
    'pending',
    'settled_held',
    'released_to_talent',
    'disputed_hold',
    'refunded',
    'failed',
    'expired'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.refund_status_type AS ENUM ('requested', 'approved', 'processed', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. TABEL 8: public.bookings
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code VARCHAR(20) UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customer_profiles(id),
  talent_id UUID NOT NULL REFERENCES public.talent_profiles(id),
  activity_category_id VARCHAR(50) NOT NULL REFERENCES public.activity_categories(id),
  booking_mode public.booking_mode_type NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_hours NUMERIC(4, 2) NOT NULL CHECK (duration_hours > 0),
  meeting_location_name VARCHAR(200) NOT NULL,
  meeting_location_address TEXT,
  hourly_rate_snapshot BIGINT NOT NULL CHECK (hourly_rate_snapshot > 0), -- Integer Rupiah
  gross_amount BIGINT NOT NULL CHECK (gross_amount > 0),                  -- Integer Rupiah
  platform_fee_amount BIGINT NOT NULL CHECK (platform_fee_amount >= 0),  -- 20% YUKU
  talent_gross_share BIGINT NOT NULL CHECK (talent_gross_share >= 0),    -- 80% Talent
  status public.booking_status_type NOT NULL DEFAULT 'pending_payment',
  payment_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 MINUTES'), -- Slot reservation 15 min
  completion_confirmed_at TIMESTAMPTZ,
  escrow_release_scheduled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_booking_times CHECK (end_time > start_time),

  -- EXCLUSION CONSTRAINT VALID POSTGRESQL:
  -- Mengunci slot waktu talent untuk booking yang sedang aktif/pending.
  -- Slot pending yang kadaluarsa dibersihkan via trigger sebelum insert booking baru.
  EXCLUDE USING gist (
    talent_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  ) WHERE (status IN ('pending_payment', 'paid_held_in_escrow', 'confirmed_by_talent', 'in_progress'))
);

-- 3. TABEL 9: public.booking_status_history
CREATE TABLE IF NOT EXISTS public.booking_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  previous_status VARCHAR(50),
  new_status VARCHAR(50) NOT NULL,
  changed_by_user_id UUID NOT NULL REFERENCES public.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TABEL 10: public.payments (Dengan Idempotency & Webhook History)
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID UNIQUE NOT NULL REFERENCES public.bookings(id),
  provider public.payment_provider_type NOT NULL DEFAULT 'xendit',
  provider_charge_id VARCHAR(100) UNIQUE,
  payment_method VARCHAR(50) NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0), -- Integer Rupiah
  payment_status public.payment_status_type NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  escrow_released_at TIMESTAMPTZ,
  idempotency_key UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  webhook_payload_history JSONB[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. TABEL 11: public.refunds
CREATE TABLE IF NOT EXISTS public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id),
  booking_id UUID NOT NULL REFERENCES public.bookings(id),
  customer_id UUID NOT NULL REFERENCES public.customer_profiles(id),
  refund_amount BIGINT NOT NULL CHECK (refund_amount > 0), -- Integer Rupiah
  reason TEXT NOT NULL,
  provider_refund_id VARCHAR(100),
  status public.refund_status_type NOT NULL DEFAULT 'requested',
  processed_by_admin_id UUID REFERENCES public.users(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. INDEKS KINERJA
CREATE INDEX IF NOT EXISTS idx_bookings_customer_id ON public.bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_talent_id ON public.bookings(talent_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_expires ON public.bookings(payment_expires_at) WHERE status = 'pending_payment';
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON public.payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_charge_id ON public.payments(provider_charge_id);
CREATE INDEX IF NOT EXISTS idx_payments_idempotency ON public.payments(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_refunds_booking_id ON public.refunds(booking_id);

-- ============================================================================
-- PROSEDUR ROLLBACK MIGRASI 03
-- ============================================================================
/*
  DROP TABLE IF EXISTS public.refunds CASCADE;
  DROP TABLE IF EXISTS public.payments CASCADE;
  DROP TABLE IF EXISTS public.booking_status_history CASCADE;
  DROP TABLE IF EXISTS public.bookings CASCADE;
  DROP TYPE IF EXISTS public.refund_status_type CASCADE;
  DROP TYPE IF EXISTS public.payment_status_type CASCADE;
  DROP TYPE IF EXISTS public.payment_provider_type CASCADE;
  DROP TYPE IF EXISTS public.booking_status_type CASCADE;
  DROP TYPE IF EXISTS public.booking_mode_type CASCADE;
*/
