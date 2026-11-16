-- ============================================================================
-- YUKU — SOCIAL EXPERIENCE & PAID COMPANIONSHIP MARKETPLACE
-- MIGRATION 01: INITIAL SCHEMA, ENUMS, USER IDENTITIES & PROFILES (REVISED VERSION 14)
-- ============================================================================
-- Dokumen Acuan: docs/TAHAP-2-2-FINAL-REMEDIATION-REPORT.md
-- Deskripsi: Menyiapkan ekstensi PostgreSQL, tipe ENUM inklusif, tabel users,
--            tabel privat user_identities (KTP, Legal DOB, Legal Name, verified_at,
--            verified_by_admin_id), profil publik customer_profiles & talent_profiles
--            (BIGINT Rupiah), serta activity_categories. (Tabel 1 s/d 5)
-- ============================================================================

-- 1. EKSTENSI POSTGRESQL WAJIB
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. TIPE ENUM SYSTEM INKLUSIF
DO $$ BEGIN
  CREATE TYPE public.user_role_type AS ENUM ('customer', 'talent', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.account_status_type AS ENUM ('pending_verification', 'active', 'suspended', 'banned');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  -- Gender Inklusif
  CREATE TYPE public.gender_type AS ENUM ('Pria', 'Wanita', 'Lainnya', 'Pilih tidak menyebutkan');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.service_mode_type AS ENUM ('Offline & Online', 'Offline Only', 'Online Only');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.ktp_status_type AS ENUM ('unsubmitted', 'pending_review', 'verified', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. TABEL 1: public.users (Identity Core)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(150),
  phone_number VARCHAR(30) UNIQUE,
  role public.user_role_type NOT NULL DEFAULT 'customer',
  is_verified_18 BOOLEAN NOT NULL DEFAULT FALSE,
  account_status public.account_status_type NOT NULL DEFAULT 'pending_verification',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TABEL 2: public.user_identities (TABEL PRIVAT TERISOLASI KTP & IDENTITAS LEGAL)
CREATE TABLE IF NOT EXISTS public.user_identities (
  id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  full_legal_name VARCHAR(150) NOT NULL,
  date_of_birth DATE NOT NULL,
  ktp_number VARCHAR(30) UNIQUE,
  ktp_storage_path TEXT,
  ktp_verification_status public.ktp_status_type NOT NULL DEFAULT 'unsubmitted',
  ktp_rejection_reason TEXT,
  verified_at TIMESTAMPTZ,
  verified_by_admin_id UUID REFERENCES public.users(id),
  emergency_contact_phone VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. TABEL 3: public.customer_profiles (PROFIL PUBLIK CUSTOMER)
CREATE TABLE IF NOT EXISTS public.customer_profiles (
  id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  display_name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  city VARCHAR(100) NOT NULL,
  gender public.gender_type NOT NULL,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. TABEL 4: public.talent_profiles (KATALOG & PROFIL PUBLIK TALENT - Integer Rupiah BIGINT)
CREATE TABLE IF NOT EXISTS public.talent_profiles (
  id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  display_name VARCHAR(100) NOT NULL,
  avatar_url TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  gender public.gender_type NOT NULL,
  headline VARCHAR(200) NOT NULL,
  bio TEXT NOT NULL,
  hourly_rate BIGINT NOT NULL CHECK (hourly_rate > 0), -- Integer Rupiah
  online_chat_rate BIGINT CHECK (online_chat_rate > 0), -- Integer Rupiah
  service_mode public.service_mode_type NOT NULL DEFAULT 'Offline & Online',
  rating_average NUMERIC(3, 2) NOT NULL DEFAULT 5.00,
  review_count INT NOT NULL DEFAULT 0,
  completed_hours INT NOT NULL DEFAULT 0,
  languages TEXT[] NOT NULL DEFAULT '{}',
  interests TEXT[] NOT NULL DEFAULT '{}',
  referral_code VARCHAR(20) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. TABEL 5: public.activity_categories
CREATE TABLE IF NOT EXISTS public.activity_categories (
  id VARCHAR(50) PRIMARY KEY,
  title VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  icon_name VARCHAR(50) NOT NULL,
  examples TEXT[] NOT NULL DEFAULT '{}',
  is_online_available BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. INDEKS KINERJA
CREATE INDEX IF NOT EXISTS idx_user_identities_ktp_status ON public.user_identities(ktp_verification_status);
CREATE INDEX IF NOT EXISTS idx_talent_profiles_city ON public.talent_profiles(city);
CREATE INDEX IF NOT EXISTS idx_talent_profiles_gender ON public.talent_profiles(gender);
CREATE INDEX IF NOT EXISTS idx_talent_profiles_rating ON public.talent_profiles(rating_average DESC);
CREATE INDEX IF NOT EXISTS idx_talent_profiles_referral_code ON public.talent_profiles(referral_code);

-- ============================================================================
-- PROSEDUR ROLLBACK MIGRASI 01
-- ============================================================================
/*
  DROP TABLE IF EXISTS public.activity_categories CASCADE;
  DROP TABLE IF EXISTS public.talent_profiles CASCADE;
  DROP TABLE IF EXISTS public.customer_profiles CASCADE;
  DROP TABLE IF EXISTS public.user_identities CASCADE;
  DROP TABLE IF EXISTS public.users CASCADE;
  DROP TYPE IF EXISTS public.ktp_status_type CASCADE;
  DROP TYPE IF EXISTS public.service_mode_type CASCADE;
  DROP TYPE IF EXISTS public.gender_type CASCADE;
  DROP TYPE IF EXISTS public.account_status_type CASCADE;
  DROP TYPE IF EXISTS public.user_role_type CASCADE;
*/
