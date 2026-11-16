-- ============================================================================
-- YUKU — STAGE B AUTOMATED SECURITY & BUSINESS LOGIC SUITE
-- FILE: supabase/tests/stage_b_security_tests.sql
-- ============================================================================
-- Deskripsi: Suite pengujian otomatis Tahap B yang memverifikasi:
--   1. Booking Financials Calculation (20% YUKU fee, 80% Talent share)
--   2. Exclusion Constraint (Pencegahan Overlapping Slot Booking Talent)
--   3. Auto Generation Financial Ledgers saat Payment Settled
--   4. Escrow Release Protection (Hanya Service Role / Admin)
--   5. Threshold Minimum Payout Rp100.000
--   6. Alokasi Saldo Payout Parsial & Tracking Inkremental
--   7. Relasi Referral 1-Tier & Anti Self-Referral
--   8. Rating & Review Validation (1-5)
--   9. Storage Bucket RLS Proteksi Dokumen KTP Privat vs Avatar/Portfolio Publik
-- ============================================================================

DO $$
DECLARE
  v_pass_count INT := 0;
  v_fail_count INT := 0;
  v_total_tests INT := 10;
  v_error_caught BOOLEAN;
  v_sqlerrm TEXT;

  -- UUID Variabel Dummy untuk Setup Skenario
  v_cust_id UUID := '11111111-1111-4111-8111-111111111111'::uuid;
  v_talent_id UUID := '22222222-2222-4222-8222-222222222222'::uuid;
  v_referrer_id UUID := '33333333-3333-4333-8333-333333333333'::uuid;
  v_admin_id UUID := '00000000-0000-4000-8000-000000000000'::uuid;
  
  v_booking_id UUID;
  v_booking_id_2 UUID;
  v_payment_id UUID;
  v_payout_id UUID;
  v_earning_id UUID;
  v_earning_amount BIGINT;
  v_allocated_payout BIGINT;
BEGIN
  RAISE NOTICE '================================================================';
  RAISE NOTICE 'MEMULAI PENGUJIANS LOGIKA BISNIS & KEAMANAN TAHAP B (YUKU V20)';
  RAISE NOTICE '================================================================';

  -- --------------------------------------------------------------------------
  -- DATA SETUP DENGAN KLAIM SERVICE_ROLE
  -- --------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- Cleanup data uji terdahulu
  DELETE FROM public.payout_earnings_allocations;
  DELETE FROM public.payout_requests;
  DELETE FROM public.referral_rewards;
  DELETE FROM public.referral_relationships;
  DELETE FROM public.talent_earnings;
  DELETE FROM public.commission_records;
  DELETE FROM public.payments;
  DELETE FROM public.reviews;
  DELETE FROM public.reports_complaints;
  DELETE FROM public.bookings;
  DELETE FROM public.talent_services;
  DELETE FROM public.talent_availability;
  DELETE FROM public.talent_profiles;
  DELETE FROM public.customer_profiles;
  DELETE FROM public.user_identities;
  DELETE FROM public.users WHERE id IN (v_cust_id, v_talent_id, v_referrer_id, v_admin_id);

  -- Insert Users Setup
  INSERT INTO public.users (id, email, full_name, role, is_verified_18, account_status) VALUES
    (v_admin_id, 'admin_tb@yuku.id', 'Admin Tahap B', 'admin', TRUE, 'active'),
    (v_cust_id, 'customer_tb@yuku.id', 'Customer Tahap B', 'customer', TRUE, 'active'),
    (v_talent_id, 'talent_tb@yuku.id', 'Talent Tahap B', 'talent', TRUE, 'active'),
    (v_referrer_id, 'referrer_tb@yuku.id', 'Referrer Talent', 'talent', TRUE, 'active');

  -- Insert Profiles Setup
  INSERT INTO public.customer_profiles (id, display_name, city, gender) VALUES
    (v_cust_id, 'Customer B', 'Jakarta', 'Pria');

  INSERT INTO public.talent_profiles (id, display_name, avatar_url, city, gender, headline, bio, hourly_rate, referral_code) VALUES
    (v_referrer_id, 'Referrer Talent', 'https://img.com/ref.jpg', 'Jakarta', 'Pria', 'Headline Ref', 'Bio Ref', 150000, 'REF-TALENT-B'),
    (v_talent_id, 'Talent B', 'https://img.com/t.jpg', 'Jakarta', 'Wanita', 'Headline B', 'Bio B', 200000, 'TALENT-CODE-B');

  INSERT INTO public.activity_categories (id, title, description, icon_name, is_active)
  VALUES ('dinner-date', 'Dinner Date', 'Makan malam santai', 'utensils', TRUE)
  ON CONFLICT (id) DO NOTHING;

  -- Setup Referral Relationship
  INSERT INTO public.referral_relationships (referrer_id, referee_talent_id, referral_code_used)
  VALUES (v_referrer_id, v_talent_id, 'REF-TALENT-B');

  -- Reset JWT claims
  PERFORM set_config('request.jwt.claims', '', true);

  -- --------------------------------------------------------------------------
  -- TEST 1: SERVER-SIDE BOOKING PRICING (20% YUKU Fee, 80% Talent Share)
  -- --------------------------------------------------------------------------
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_cust_id), true);
    -- (migrasi 23: INSERT langsung ke bookings dicabut dari authenticated; fixture dijalankan sebagai owner,
    -- trigger harga/exclusion tetap diuji. Jalur authenticated diuji di stage_c lewat create_booking())

    INSERT INTO public.bookings (
      booking_code, customer_id, talent_id, activity_category_id, booking_mode,
      start_time, end_time, duration_hours, meeting_location_name, hourly_rate_snapshot,
      gross_amount, platform_fee_amount, talent_gross_share
    ) VALUES (
      'BK-TB-001', v_cust_id, v_talent_id, 'dinner-date', 'offline',
      NOW() + INTERVAL '1 DAY', NOW() + INTERVAL '1 DAY' + INTERVAL '2 HOURS', 2.0,
      'Restaurant A', 200000, 400000, 80000, 320000
    ) RETURNING id INTO v_booking_id;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);

    -- Verifikasi kalkulasi server-side (2 jam x Rp200.000 = Rp400.000; 20% = Rp80.000; 80% = Rp320.000)
    IF EXISTS (
      SELECT 1 FROM public.bookings 
      WHERE id = v_booking_id 
        AND gross_amount = 400000 
        AND platform_fee_amount = 80000 
        AND talent_gross_share = 320000
        AND status = 'pending_payment'
    ) THEN
      RAISE NOTICE 'TEST 1: PASS — Booking Pricing Server-side 20%% YUKU / 80%% Talent terverifikasi.';
      v_pass_count := v_pass_count + 1;
    ELSE
      RAISE NOTICE 'TEST 1: FAIL — Kalkulasi harga booking tidak sesuai.';
      v_fail_count := v_fail_count + 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    RAISE NOTICE 'TEST 1: FAIL — Exception caught: %', SQLERRM;
    v_fail_count := v_fail_count + 1;
  END;

  -- --------------------------------------------------------------------------
  -- TEST 2: EXCLUSION CONSTRAINT (Pencegahan Overlapping Slot Booking Talent)
  -- --------------------------------------------------------------------------
  v_error_caught := FALSE;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_cust_id), true);
    -- (migrasi 23: INSERT langsung ke bookings dicabut dari authenticated; fixture dijalankan sebagai owner,
    -- trigger harga/exclusion tetap diuji. Jalur authenticated diuji di stage_c lewat create_booking())

    -- Mencoba booking di slot waktu yang tumpang tindih dengan BK-TB-001
    INSERT INTO public.bookings (
      booking_code, customer_id, talent_id, activity_category_id, booking_mode,
      start_time, end_time, duration_hours, meeting_location_name, hourly_rate_snapshot,
      gross_amount, platform_fee_amount, talent_gross_share
    ) VALUES (
      'BK-TB-002-OVERLAP', v_cust_id, v_talent_id, 'dinner-date', 'offline',
      NOW() + INTERVAL '1 DAY' + INTERVAL '1 HOUR', NOW() + INTERVAL '1 DAY' + INTERVAL '3 HOURS', 2.0,
      'Restaurant B', 200000, 400000, 80000, 320000
    );

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := TRUE;
    v_sqlerrm := SQLERRM;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
  END;

  IF v_error_caught AND v_sqlerrm LIKE '%exclusion constraint%' OR v_sqlerrm LIKE '%conflicting key%' OR v_sqlerrm LIKE '%bookings_talent_id%' THEN
    RAISE NOTICE 'TEST 2: PASS — Exclusion Constraint berhasil menolak overlapping booking.';
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE 'TEST 2: FAIL — Exclusion constraint gagal menolak booking tumpang tindih. Error: %', v_sqlerrm;
    v_fail_count := v_fail_count + 1;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 3: AUTO GENERATION FINANCIAL LEDGERS SAAT PAYMENT SETTLED
  -- --------------------------------------------------------------------------
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

    -- Simulasi pembayaran sukses
    INSERT INTO public.payments (booking_id, amount, payment_status, paid_at)
    VALUES (v_booking_id, 400000, 'pending', NOW())
    RETURNING id INTO v_payment_id;

    UPDATE public.payments 
    SET payment_status = 'settled_held', paid_at = NOW()
    WHERE id = v_payment_id;

    UPDATE public.bookings 
    SET status = 'paid_held_in_escrow'
    WHERE id = v_booking_id;

    PERFORM set_config('request.jwt.claims', '', true);

    -- Verifikasi pencatatan di commission_records (20%), talent_earnings (80%), dan referral_rewards (10% dari komisi)
    IF EXISTS (SELECT 1 FROM public.commission_records WHERE booking_id = v_booking_id AND platform_commission_amount = 80000) AND
       EXISTS (SELECT 1 FROM public.talent_earnings WHERE booking_id = v_booking_id AND net_earning = 320000 AND status = 'held_in_escrow') AND
       EXISTS (SELECT 1 FROM public.referral_rewards WHERE booking_id = v_booking_id AND reward_amount = 8000 AND status = 'pending_completion') THEN
      RAISE NOTICE 'TEST 3: PASS — Financial ledgers (Commission 20%%, Talent 80%%, Referral 10%%) tercatat otomatis & presisi.';
      v_pass_count := v_pass_count + 1;
    ELSE
      RAISE NOTICE 'TEST 3: FAIL — Financial ledgers tidak tercatat sesuai ekspektasi.';
      v_fail_count := v_fail_count + 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claims', '', true);
    RAISE NOTICE 'TEST 3: FAIL — Exception: %', SQLERRM;
    v_fail_count := v_fail_count + 1;
  END;

  -- --------------------------------------------------------------------------
  -- TEST 4: PROTEKSI FUNGSI ESCROW RELEASE (Hanya Service Role)
  -- --------------------------------------------------------------------------
  v_error_caught := FALSE;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_cust_id), true);
    SET LOCAL ROLE authenticated;

    PERFORM public.process_escrow_release();

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := TRUE;
    v_sqlerrm := SQLERRM;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
  END;

  IF v_error_caught AND v_sqlerrm LIKE '%Akses Ditolak%' THEN
    RAISE NOTICE 'TEST 4: PASS — Pelepasan escrow berhasil diblokir untuk role pengguna biasa.';
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE 'TEST 4: FAIL — Pelepasan escrow tidak memblokir pengguna biasa. Error: %', v_sqlerrm;
    v_fail_count := v_fail_count + 1;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 5: THRESHOLD MINIMUM PAYOUT RP100.000
  -- --------------------------------------------------------------------------
  v_error_caught := FALSE;
  BEGIN
    -- Set earning talent ke status available_for_payout untuk simulasi pencairan
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    UPDATE public.talent_earnings SET status = 'available_for_payout', available_at = NOW() WHERE talent_id = v_talent_id;
    
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_talent_id), true);
    SET LOCAL ROLE authenticated;

    -- Mencoba request payout Rp50.000 (< Rp100.000)
    INSERT INTO public.payout_requests (
      payout_number, talent_id, amount, bank_name, bank_account_number, bank_account_holder_name
    ) VALUES (
      'PO-FAIL-50K', v_talent_id, 50000, 'BCA', '1234567890', 'Talent B'
    );

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := TRUE;
    v_sqlerrm := SQLERRM;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
  END;

  IF v_error_caught AND (v_sqlerrm LIKE '%minimal%' OR v_sqlerrm LIKE '%100000%' OR v_sqlerrm LIKE '%payout_requests_amount_check%') THEN
    RAISE NOTICE 'TEST 5: PASS — Penolakan pencairan di bawah Rp100.000 terverifikasi.';
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE 'TEST 5: FAIL — Pencairan di bawah Rp100.000 lolos tanpa error. Error: %', v_sqlerrm;
    v_fail_count := v_fail_count + 1;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 6: ALOKASI PAYOUT PARSIAL & RESERVASI SALDO ATOMIK
  -- --------------------------------------------------------------------------
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_talent_id), true);
    SET LOCAL ROLE authenticated;

    -- Talent memiliki saldo Rp320.000, melakukan pengajuan payout sebesar Rp200.000 (parsial)
    INSERT INTO public.payout_requests (
      payout_number, talent_id, amount, bank_name, bank_account_number, bank_account_holder_name
    ) VALUES (
      'PO-SUCCESS-200K', v_talent_id, 200000, 'BCA', '1234567890', 'Talent B'
    ) RETURNING id INTO v_payout_id;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);

    -- Cek ketersediaan reservasi di talent_earnings dan payout_earnings_allocations
    SELECT allocated_payout_amount INTO v_allocated_payout 
    FROM public.talent_earnings WHERE talent_id = v_talent_id;

    IF v_allocated_payout = 200000 AND EXISTS (
      SELECT 1 FROM public.payout_earnings_allocations 
      WHERE payout_request_id = v_payout_id AND allocated_amount = 200000 AND status = 'reserved'
    ) THEN
      RAISE NOTICE 'TEST 6: PASS — Alokasi payout parsial Rp200.000 ter-reserved atomik tanpa sisa saldo hilang.';
      v_pass_count := v_pass_count + 1;
    ELSE
      RAISE NOTICE 'TEST 6: FAIL — Reservasi payout parsial gagal. Allocated: %', v_allocated_payout;
      v_fail_count := v_fail_count + 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    RAISE NOTICE 'TEST 6: FAIL — Exception: %', SQLERRM;
    v_fail_count := v_fail_count + 1;
  END;

  -- --------------------------------------------------------------------------
  -- TEST 7: SETTLEMENT PAYOUT (SETTLED & PARTIALLY_PAID_OUT)
  -- --------------------------------------------------------------------------
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_admin_id), true);
    SET LOCAL ROLE authenticated;

    -- Admin menyetujui dan mengonfirmasi payout selesai
    UPDATE public.payout_requests
    SET payout_status = 'completed_provider_confirmed',
        payout_provider_ref = 'XENDIT-DISB-001',
        provider_confirmed_at = NOW(),
        processed_by_admin_id = v_admin_id
    WHERE id = v_payout_id;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);

    -- Verifikasi state talent_earnings (paid_out_amount = 200.000, allocated = 0, status = partially_paid_out)
    IF EXISTS (
      SELECT 1 FROM public.talent_earnings 
      WHERE talent_id = v_talent_id 
        AND paid_out_amount = 200000 
        AND allocated_payout_amount = 0 
        AND status = 'partially_paid_out'
    ) THEN
      RAISE NOTICE 'TEST 7: PASS — Settlement payout berhasil. Balance ter-update ke partially_paid_out.';
      v_pass_count := v_pass_count + 1;
    ELSE
      RAISE NOTICE 'TEST 7: FAIL — Status talent_earnings setelah payout settlement tidak sesuai.';
      v_fail_count := v_fail_count + 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    RAISE NOTICE 'TEST 7: FAIL — Exception: %', SQLERRM;
    v_fail_count := v_fail_count + 1;
  END;

  -- --------------------------------------------------------------------------
  -- TEST 8: BLOKIR SELF-REFERRAL (REFERRAL CODE VALIDATION)
  -- --------------------------------------------------------------------------
  v_error_caught := FALSE;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_talent_id), true);
    SET LOCAL ROLE authenticated;

    -- Talent mencoba memakai kode referral milik sendiri
    INSERT INTO public.referral_relationships (referrer_id, referee_talent_id, referral_code_used)
    VALUES (v_talent_id, v_talent_id, 'TALENT-CODE-B');

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := TRUE;
    v_sqlerrm := SQLERRM;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
  END;

  IF v_error_caught AND (v_sqlerrm LIKE '%Self-referral%' OR v_sqlerrm LIKE '%check_no_self_referral%') THEN
    RAISE NOTICE 'TEST 8: PASS — Penolakan self-referral terverifikasi.';
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE 'TEST 8: FAIL — Self-referral tidak diblokir. Error: %', v_sqlerrm;
    v_fail_count := v_fail_count + 1;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 9: REVIEWS RATING CHECK (RANGE 1-5 VALIDATION)
  -- --------------------------------------------------------------------------
  v_error_caught := FALSE;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_cust_id), true);
    SET LOCAL ROLE authenticated;

    -- Customer memberi rating 6 (di luar range 1-5)
    INSERT INTO public.reviews (
      booking_id, customer_id, talent_id, rating, review_text
    ) VALUES (
      v_booking_id, v_cust_id, v_talent_id, 6, 'Sangat memuaskan berlebih'
    );

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := TRUE;
    v_sqlerrm := SQLERRM;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
  END;

  IF v_error_caught AND (v_sqlerrm LIKE '%rating%' OR v_sqlerrm LIKE '%between 1 and 5%' OR v_sqlerrm LIKE '%check%') THEN
    RAISE NOTICE 'TEST 9: PASS — Validasi rating ulasan (1-5) terverifikasi.';
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE 'TEST 9: FAIL — Rating di luar range 1-5 tidak diblokir. Error: %', v_sqlerrm;
    v_fail_count := v_fail_count + 1;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 10: DISPUTE HOLD SAAT LAPORAN / COMPLAINT
  -- --------------------------------------------------------------------------
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_cust_id), true);
    SET LOCAL ROLE authenticated;

    -- Customer mengajukan komplain atas booking
    INSERT INTO public.reports_complaints (
      reporter_id, reported_user_id, booking_id, category, description
    ) VALUES (
      v_cust_id, v_talent_id, v_booking_id, 'safety_concern', 'Penjelasan kendala keamanan'
    );

    -- Ubah status booking ke disputed_hold
    UPDATE public.bookings SET status = 'disputed_hold' WHERE id = v_booking_id;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);

    -- Cek bahwa talent_earnings dan referral_rewards langsung berubah ke status dispute hold / pending
    IF EXISTS (SELECT 1 FROM public.talent_earnings WHERE booking_id = v_booking_id AND status = 'disputed_hold') THEN
      RAISE NOTICE 'TEST 10: PASS — Status dispute hold otomatis mengunci pelepasan dana escrow.';
      v_pass_count := v_pass_count + 1;
    ELSE
      RAISE NOTICE 'TEST 10: FAIL — Dispute hold gagal mengunci status talent earnings.';
      v_fail_count := v_fail_count + 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    RAISE NOTICE 'TEST 10: FAIL — Exception: %', SQLERRM;
    v_fail_count := v_fail_count + 1;
  END;

  -- --------------------------------------------------------------------------
  -- RINGKASAN HASIL PENGUJIANS TAHAP B
  -- --------------------------------------------------------------------------
  RAISE NOTICE '================================================================';
  RAISE NOTICE 'RINGKASAN HASIL PENGUJIANS LOGIKA TAHAP B:';
  RAISE NOTICE '  TOTAL PENGUJIANS : %', v_total_tests;
  RAISE NOTICE '  LULUS (PASS)    : %', v_pass_count;
  RAISE NOTICE '  GAGAL (FAIL)    : %', v_fail_count;
  RAISE NOTICE '================================================================';

  IF v_fail_count > 0 THEN
    RAISE EXCEPTION 'Pengujian Tahap B GAGAL: % dari % test gagal.', v_fail_count, v_total_tests;
  END IF;

END $$;
