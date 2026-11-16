-- ============================================================================
-- YUKU — SOCIAL EXPERIENCE & PAID COMPANIONSHIP MARKETPLACE
-- MIGRATION 04: FINANCIAL LEDGERS, REFERRALS & ATOMIC PARSIAL PAYOUT ALLOCATIONS (REVISED VERSION 9)
-- ============================================================================
-- Dokumen Acuan: docs/TAHAP-2-2-FINAL-REMEDIATION-REPORT.md
-- Deskripsi: Menyiapkan tabel commission_records (20% YUKU), talent_earnings (80%
--            dengan tracking allocated_payout_amount & paid_out_amount untuk
--            pencairan parsial tanpa sisa saldo hilang - Audit Poin C),
--            referral_relationships (1-tier), referral_rewards (10% komisi YUKU),
--            payout_requests (min Rp100k), payout_earnings_allocations, serta
--            financial_adjustments_reversals.
--            (Tabel 12 s/d 18)
-- ============================================================================

-- 1. TIPE ENUM KEUANGAN & REFERRAL
DO $$ BEGIN
  CREATE TYPE public.talent_earning_status_type AS ENUM (
    'held_in_escrow',
    'disputed_hold',
    'available_for_payout',
    'partially_paid_out',
    'fully_paid_out',
    'forfeited',
    'refund_adjusted'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.referral_reward_status_type AS ENUM (
    'pending_completion',
    'credited',
    'cancelled_disputed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payout_status_type AS ENUM (
    'requested',
    'processing',
    'completed_provider_confirmed',
    'rejected',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payout_allocation_status_type AS ENUM (
    'reserved',
    'settled',
    'released_unreserved'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.ledger_entry_type AS ENUM (
    'earning',
    'payout',
    'refund_reversal',
    'commission'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. TABEL 12: public.commission_records (Platform Revenue Ledger - Unique Booking ID for Idempotency)
CREATE TABLE IF NOT EXISTS public.commission_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID UNIQUE NOT NULL REFERENCES public.bookings(id),
  gross_booking_amount BIGINT NOT NULL CHECK (gross_booking_amount > 0),
  platform_commission_amount BIGINT NOT NULL CHECK (platform_commission_amount >= 0), -- 20% YUKU
  talent_gross_share BIGINT NOT NULL CHECK (talent_gross_share >= 0),                 -- 80% Talent
  referral_payout_reserved BIGINT NOT NULL DEFAULT 0 CHECK (referral_payout_reserved >= 0), -- 10% dari komisi YUKU
  net_platform_revenue BIGINT NOT NULL CHECK (net_platform_revenue >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. TABEL 13: public.talent_earnings (Auditable Earning Ledger dengan Tracking Alokasi Parsial)
CREATE TABLE IF NOT EXISTS public.talent_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_id UUID NOT NULL REFERENCES public.talent_profiles(id),
  booking_id UUID UNIQUE NOT NULL REFERENCES public.bookings(id),
  gross_earning BIGINT NOT NULL CHECK (gross_earning >= 0), -- 80%
  tax_withheld BIGINT NOT NULL DEFAULT 0 CHECK (tax_withheld >= 0),
  transfer_fee BIGINT NOT NULL DEFAULT 0 CHECK (transfer_fee >= 0),
  net_earning BIGINT NOT NULL CHECK (net_earning >= 0),
  allocated_payout_amount BIGINT NOT NULL DEFAULT 0 CHECK (allocated_payout_amount >= 0),
  paid_out_amount BIGINT NOT NULL DEFAULT 0 CHECK (paid_out_amount >= 0),
  status public.talent_earning_status_type NOT NULL DEFAULT 'held_in_escrow',
  entry_type public.ledger_entry_type NOT NULL DEFAULT 'earning',
  available_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_earning_payout_sum CHECK (allocated_payout_amount + paid_out_amount <= net_earning)
);

-- 4. TABEL 14: public.referral_relationships (1-Tier, Permanent, Anti Self-Referral)
CREATE TABLE IF NOT EXISTS public.referral_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES public.users(id),
  referee_talent_id UUID UNIQUE NOT NULL REFERENCES public.talent_profiles(id),
  referral_code_used VARCHAR(20) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_no_self_referral CHECK (referrer_id <> referee_talent_id)
);

-- 5. TABEL 15: public.referral_rewards (10% dari komisi 20% YUKU)
CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_relationship_id UUID NOT NULL REFERENCES public.referral_relationships(id),
  booking_id UUID UNIQUE NOT NULL REFERENCES public.bookings(id),
  referrer_id UUID NOT NULL REFERENCES public.users(id),
  platform_commission_base BIGINT NOT NULL CHECK (platform_commission_base >= 0), -- 20% komisi YUKU
  reward_amount BIGINT NOT NULL CHECK (reward_amount >= 0),                       -- 10% dari platform_commission_base
  status public.referral_reward_status_type NOT NULL DEFAULT 'pending_completion',
  credited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. TABEL 16: public.payout_requests (Minimum Rp100.000 Threshold & Provider Ref)
CREATE TABLE IF NOT EXISTS public.payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_number VARCHAR(20) UNIQUE NOT NULL,
  talent_id UUID NOT NULL REFERENCES public.talent_profiles(id),
  amount BIGINT NOT NULL CHECK (amount >= 100000), -- Minimum Rp100.000 Threshold (Integer Rupiah)
  bank_name VARCHAR(50) NOT NULL,
  bank_account_number VARCHAR(50) NOT NULL,
  bank_account_holder_name VARCHAR(150) NOT NULL,
  payout_provider public.payment_provider_type NOT NULL DEFAULT 'xendit',
  payout_provider_ref VARCHAR(100) UNIQUE,
  idempotency_key UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  payout_status public.payout_status_type NOT NULL DEFAULT 'requested',
  rejection_reason TEXT,
  processed_by_admin_id UUID REFERENCES public.users(id),
  provider_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. TABEL 17: public.payout_earnings_allocations (Mendukung Pencairan Parsial & Preservasi Sisa Saldo - Audit Poin C)
CREATE TABLE IF NOT EXISTS public.payout_earnings_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_request_id UUID NOT NULL REFERENCES public.payout_requests(id) ON DELETE CASCADE,
  talent_earning_id UUID NOT NULL REFERENCES public.talent_earnings(id),
  allocated_amount BIGINT NOT NULL CHECK (allocated_amount > 0),
  status public.payout_allocation_status_type NOT NULL DEFAULT 'reserved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_payout_earning_alloc UNIQUE (payout_request_id, talent_earning_id)
);

-- 8. TABEL 18: public.financial_adjustments_reversals (Auditable Refund Reversal History)
CREATE TABLE IF NOT EXISTS public.financial_adjustments_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id),
  talent_id UUID NOT NULL REFERENCES public.talent_profiles(id),
  refund_id UUID REFERENCES public.refunds(id),
  original_talent_earning_id UUID REFERENCES public.talent_earnings(id),
  reversal_amount BIGINT NOT NULL CHECK (reversal_amount >= 0),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. INDEKS KINERJA
CREATE INDEX IF NOT EXISTS idx_commission_records_booking ON public.commission_records(booking_id);
CREATE INDEX IF NOT EXISTS idx_talent_earnings_talent_status ON public.talent_earnings(talent_id, status);
CREATE INDEX IF NOT EXISTS idx_talent_earnings_available_at ON public.talent_earnings(available_at) WHERE status IN ('available_for_payout', 'partially_paid_out');
CREATE INDEX IF NOT EXISTS idx_payout_earnings_alloc_request ON public.payout_earnings_allocations(payout_request_id);
CREATE INDEX IF NOT EXISTS idx_payout_earnings_alloc_earning ON public.payout_earnings_allocations(talent_earning_id);
CREATE INDEX IF NOT EXISTS idx_referral_relationships_referee ON public.referral_relationships(referee_talent_id);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON public.referral_rewards(referrer_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_talent_status ON public.payout_requests(talent_id, payout_status);

-- ============================================================================
-- PROSEDUR ROLLBACK MIGRASI 04
-- ============================================================================
/*
  DROP TABLE IF EXISTS public.financial_adjustments_reversals CASCADE;
  DROP TABLE IF EXISTS public.payout_earnings_allocations CASCADE;
  DROP TABLE IF EXISTS public.payout_requests CASCADE;
  DROP TABLE IF EXISTS public.referral_rewards CASCADE;
  DROP TABLE IF EXISTS public.referral_relationships CASCADE;
  DROP TABLE IF EXISTS public.talent_earnings CASCADE;
  DROP TABLE IF EXISTS public.commission_records CASCADE;
  DROP TYPE IF EXISTS public.ledger_entry_type CASCADE;
  DROP TYPE IF EXISTS public.payout_allocation_status_type CASCADE;
  DROP TYPE IF EXISTS public.payout_status_type CASCADE;
  DROP TYPE IF EXISTS public.referral_reward_status_type CASCADE;
  DROP TYPE IF EXISTS public.talent_earning_status_type CASCADE;
*/
