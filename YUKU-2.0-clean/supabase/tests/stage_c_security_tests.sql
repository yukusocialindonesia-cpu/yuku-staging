-- ============================================================================
-- YUKU — STAGE C: PRE-LAUNCH SECURITY & BUSINESS-FLOW TESTS (migrasi 18-23)
-- FILE: supabase/tests/stage_c_security_tests.sql
-- ============================================================================
-- JALANKAN HANYA DI DATABASE STAGING KOSONG setelah migrasi 01-23 diterapkan.
-- Skrip ini MENGHAPUS data pada tabel bisnis. JANGAN jalankan di produksi.
-- STATUS: ditulis, BELUM dijalankan (belum ada instance staging). Jika ada test yang
-- gagal karena fixture/skema, perbaiki fixture dulu, jangan melemahkan assertion.
--
-- Cakupan:
--  C1  INSERT langsung ke bookings oleh Customer ditolak (migrasi 23)
--  C2  create_booking ditolak saat flag payment_checkout OFF (migrasi 19)
--  C3  create_booking sukses saat flag ON: harga 20%/80%, status pending_payment
--  C4  Customer tidak boleh punya 2 booking pending_payment aktif
--  C5  settle_booking_payment ditolak untuk Customer/authenticated
--  C6  settle_booking_payment via service_role melunasi + membuat ledger
--  C7  settle_booking_payment idempotent
--  C8  Customer tidak bisa menaikkan status booking sendiri (migrasi 21)
--  C9  Alur dua pihak: Talent in_progress -> konfirmasi Customer -> konfirmasi Talent -> completed
--  C10 request_talent_cancellation ditolak untuk non-Talent pemilik
--  C11 admin_process_refund ditolak untuk non-admin
--  C12 provision_admin_user ditolak untuk authenticated
--  C13 Signup email/metadata 'admin' TIDAK menghasilkan role admin (migrasi 18)
--  C14 Booking pending kedaluwarsa tidak memblokir create_booking berikutnya (fix guard 23)
--  C15 Bucket promotions punya batas ukuran & tipe file (migrasi 23)
-- ============================================================================

CREATE TEMP TABLE IF NOT EXISTS _c_results (n INT, name TEXT, passed BOOLEAN, detail TEXT);
TRUNCATE _c_results;

DO $$
DECLARE
  v_admin UUID := 'c0000000-0000-4000-8000-000000000000';
  v_cust  UUID := 'c1111111-1111-4111-8111-111111111111';
  v_tal   UUID := 'c2222222-2222-4222-8222-222222222222';
  v_hijack UUID := 'c3333333-3333-4333-8333-333333333333';
  v_b UUID;
  v_row public.bookings%ROWTYPE;
  v_ok BOOLEAN;
  v_msg TEXT;
  v_start TIMESTAMPTZ := date_trunc('hour', NOW() + INTERVAL '10 days');
  v_res JSONB;
BEGIN
  -- ----------------------------- FIXTURE (sebagai backend) --------------------
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  DELETE FROM public.payout_earnings_allocations;
  DELETE FROM public.payout_requests;
  DELETE FROM public.referral_rewards;
  DELETE FROM public.referral_relationships;
  DELETE FROM public.talent_earnings;
  DELETE FROM public.commission_records;
  DELETE FROM public.refunds;
  DELETE FROM public.payments;
  DELETE FROM public.reviews;
  DELETE FROM public.reports_complaints;
  DELETE FROM public.bookings;
  DELETE FROM public.talent_services;
  DELETE FROM public.talent_availability;
  DELETE FROM public.talent_profiles;
  DELETE FROM public.customer_profiles;
  DELETE FROM public.user_identities;
  DELETE FROM public.users WHERE id IN (v_admin, v_cust, v_tal, v_hijack);

  INSERT INTO public.users (id, email, full_name, role, is_verified_18, account_status) VALUES
    (v_admin, 'admin_tc@example.test', 'Admin C', 'admin', TRUE, 'active'),
    (v_cust,  'customer_tc@example.test', 'Customer C', 'customer', TRUE, 'active'),
    (v_tal,   'talent_tc@example.test', 'Talent C', 'talent', TRUE, 'active');

  INSERT INTO public.customer_profiles (id, display_name, city, gender) VALUES (v_cust, 'Customer C', 'Jakarta', 'Pria');
  INSERT INTO public.talent_profiles (id, display_name, avatar_url, city, gender, headline, bio, hourly_rate, referral_code, is_approved)
  VALUES (v_tal, 'Talent C', 'https://example.test/t.jpg', 'Jakarta', 'Wanita', 'Headline', 'Bio', 200000, 'TALENT-C', TRUE);

  INSERT INTO public.activity_categories (id, title, description, icon_name, is_active)
  VALUES ('dinner-date', 'Dinner Date', 'Makan malam', 'utensils', TRUE) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.talent_services (talent_id, activity_category_id) VALUES (v_tal, 'dinner-date');

  -- KTP verified: dibuat dengan klaim admin agar lolos trigger proteksi identitas.
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_admin), true);
  INSERT INTO public.user_identities (id, full_legal_name, date_of_birth, ktp_number, ktp_storage_path, ktp_verification_status)
  VALUES (v_cust, 'Customer C', DATE '1995-01-01', '3171010101950001', v_cust || '/ktp.jpg', 'verified');
  PERFORM set_config('request.jwt.claims', '', true);

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.system_feature_flags (flag_key, enabled) VALUES ('payment_checkout', FALSE)
  ON CONFLICT (flag_key) DO UPDATE SET enabled = FALSE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- ----------------------------- C1 ------------------------------------------
  v_ok := FALSE; v_msg := NULL;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_cust), true);
    SET LOCAL ROLE authenticated;
    INSERT INTO public.bookings (booking_code, customer_id, talent_id, activity_category_id, booking_mode,
      start_time, end_time, duration_hours, meeting_location_name, status)
    VALUES ('BK-C1', v_cust, v_tal, 'dinner-date', 'offline', v_start, v_start + INTERVAL '2 hours', 2, 'Cafe', 'completed');
    RESET ROLE;
    v_msg := 'INSERT langsung berhasil (seharusnya ditolak)';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    v_ok := TRUE; v_msg := SQLERRM;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO _c_results VALUES (1, 'INSERT langsung bookings ditolak', v_ok, v_msg);

  -- ----------------------------- C2 ------------------------------------------
  v_ok := FALSE; v_msg := NULL;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_cust), true);
    SET LOCAL ROLE authenticated;
    PERFORM * FROM public.create_booking(v_tal, 'dinner-date', 'offline', v_start, 2, 'Cafe', NULL);
    RESET ROLE;
    v_msg := 'create_booking berhasil saat flag OFF';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    v_ok := (SQLERRM ILIKE '%belum aktif%'); v_msg := SQLERRM;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO _c_results VALUES (2, 'create_booking ditolak saat flag OFF', v_ok, v_msg);

  -- nyalakan flag untuk test berikutnya
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  UPDATE public.system_feature_flags SET enabled = TRUE WHERE flag_key = 'payment_checkout';
  PERFORM set_config('request.jwt.claims', '', true);

  -- ----------------------------- C3 ------------------------------------------
  v_ok := FALSE; v_msg := NULL;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_cust), true);
    SET LOCAL ROLE authenticated;
    SELECT * INTO v_row FROM public.create_booking(v_tal, 'dinner-date', 'offline', v_start, 2, 'Cafe', NULL);
    RESET ROLE;
    v_b := v_row.id;
    v_ok := v_row.gross_amount = 400000 AND v_row.platform_fee_amount = 80000
        AND v_row.talent_gross_share = 320000 AND v_row.status = 'pending_payment';
    v_msg := format('gross=%s fee=%s talent=%s status=%s', v_row.gross_amount, v_row.platform_fee_amount, v_row.talent_gross_share, v_row.status);
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_msg := SQLERRM;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO _c_results VALUES (3, 'create_booking sukses + harga 20/80', v_ok, v_msg);

  -- ----------------------------- C4 ------------------------------------------
  v_ok := FALSE; v_msg := NULL;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_cust), true);
    SET LOCAL ROLE authenticated;
    PERFORM * FROM public.create_booking(v_tal, 'dinner-date', 'offline', v_start + INTERVAL '1 day', 2, 'Cafe 2', NULL);
    RESET ROLE;
    v_msg := 'booking kedua pending berhasil dibuat';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_ok := (SQLERRM ILIKE '%menunggu pembayaran%'); v_msg := SQLERRM;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO _c_results VALUES (4, 'Maks 1 booking pending_payment aktif', v_ok, v_msg);

  -- ----------------------------- C5 ------------------------------------------
  v_ok := FALSE; v_msg := NULL;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_cust), true);
    SET LOCAL ROLE authenticated;
    PERFORM public.settle_booking_payment(v_b, 'xendit', 'FAKE-1', 'qris', '{}'::jsonb);
    RESET ROLE;
    v_msg := 'Customer berhasil melunasi booking sendiri!';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_ok := TRUE; v_msg := SQLERRM;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO _c_results VALUES (5, 'settle_booking_payment ditolak untuk Customer', v_ok, v_msg);

  -- ----------------------------- C6 ------------------------------------------
  v_ok := FALSE; v_msg := NULL;
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    SET LOCAL ROLE service_role;
    PERFORM public.settle_booking_payment(v_b, 'xendit', 'INV-C6', 'qris', '{"test":true}'::jsonb);
    RESET ROLE;
    v_ok := EXISTS (SELECT 1 FROM public.bookings WHERE id = v_b AND status = 'paid_held_in_escrow')
        AND EXISTS (SELECT 1 FROM public.payments WHERE booking_id = v_b AND payment_status = 'settled_held' AND amount = 400000)
        AND EXISTS (SELECT 1 FROM public.commission_records WHERE booking_id = v_b)
        AND EXISTS (SELECT 1 FROM public.talent_earnings WHERE booking_id = v_b);
    v_msg := 'status booking/payments/ledger diperiksa';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_msg := SQLERRM;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO _c_results VALUES (6, 'settle via service_role melunasi + ledger', v_ok, v_msg);

  -- ----------------------------- C7 ------------------------------------------
  v_ok := FALSE; v_msg := NULL;
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    SET LOCAL ROLE service_role;
    v_ok := public.settle_booking_payment(v_b, 'xendit', 'INV-C6', 'qris', '{"retry":true}'::jsonb);
    RESET ROLE;
    v_ok := v_ok AND (SELECT COUNT(*) FROM public.payments WHERE booking_id = v_b) = 1
                 AND (SELECT COUNT(*) FROM public.commission_records WHERE booking_id = v_b) = 1;
    v_msg := 'panggilan kedua tidak menggandakan payments/komisi';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_msg := SQLERRM;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO _c_results VALUES (7, 'settle idempotent', v_ok, v_msg);

  -- ----------------------------- C8 ------------------------------------------
  v_ok := FALSE; v_msg := NULL;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_cust), true);
    SET LOCAL ROLE authenticated;
    UPDATE public.bookings SET status = 'completed' WHERE id = v_b;
    RESET ROLE;
    v_msg := 'Customer berhasil mengubah status ke completed!';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_ok := TRUE; v_msg := SQLERRM;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO _c_results VALUES (8, 'Customer tak bisa menaikkan status sendiri', v_ok, v_msg);

  -- ----------------------------- C9 ------------------------------------------
  v_ok := FALSE; v_msg := NULL;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_tal), true);
    SET LOCAL ROLE authenticated;
    UPDATE public.bookings SET status = 'confirmed_by_talent' WHERE id = v_b;
    UPDATE public.bookings SET status = 'in_progress' WHERE id = v_b;
    RESET ROLE;

    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_cust), true);
    SET LOCAL ROLE authenticated;
    v_res := public.confirm_booking_completion(v_b);
    RESET ROLE;
    IF (v_res ->> 'completed')::BOOLEAN IS NOT FALSE OR v_res ->> 'waiting_for' <> 'talent' THEN
      RAISE EXCEPTION 'Setelah konfirmasi Customer seharusnya menunggu Talent: %', v_res;
    END IF;

    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_tal), true);
    SET LOCAL ROLE authenticated;
    v_res := public.confirm_booking_completion(v_b);
    RESET ROLE;
    v_ok := (v_res ->> 'completed')::BOOLEAN IS TRUE
        AND EXISTS (SELECT 1 FROM public.bookings WHERE id = v_b AND status = 'completed');
    v_msg := v_res::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_msg := SQLERRM;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO _c_results VALUES (9, 'Alur selesai dua pihak', v_ok, v_msg);

  -- ----------------------------- C10 -----------------------------------------
  v_ok := FALSE; v_msg := NULL;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_cust), true);
    SET LOCAL ROLE authenticated;
    PERFORM public.request_talent_cancellation(v_b, 'coba batalkan');
    RESET ROLE;
    v_msg := 'Customer berhasil memakai RPC pembatalan Talent!';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_ok := TRUE; v_msg := SQLERRM;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO _c_results VALUES (10, 'request_talent_cancellation ditolak non-Talent', v_ok, v_msg);

  -- ----------------------------- C11 -----------------------------------------
  v_ok := FALSE; v_msg := NULL;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_cust), true);
    SET LOCAL ROLE authenticated;
    PERFORM public.admin_process_refund(gen_random_uuid(), 'processed', 'REF-X', 'x');
    RESET ROLE;
    v_msg := 'non-admin berhasil memproses refund!';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_ok := (SQLERRM ILIKE '%hanya Admin%'); v_msg := SQLERRM;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO _c_results VALUES (11, 'admin_process_refund ditolak non-admin', v_ok, v_msg);

  -- ----------------------------- C12 -----------------------------------------
  v_ok := FALSE; v_msg := NULL;
  BEGIN
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_cust), true);
    SET LOCAL ROLE authenticated;
    PERFORM public.provision_admin_user(v_cust);
    RESET ROLE;
    v_msg := 'authenticated berhasil memanggil provision_admin_user!';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_ok := TRUE; v_msg := SQLERRM;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO _c_results VALUES (12, 'provision_admin_user ditolak authenticated', v_ok, v_msg);

  -- ----------------------------- C13 -----------------------------------------
  v_ok := FALSE; v_msg := NULL;
  BEGIN
    DELETE FROM auth.users WHERE id = v_hijack;
    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES (v_hijack, 'yukusocial@gmail.com', '{"user_role":"admin","full_name":"Hijack"}'::jsonb);
    v_ok := EXISTS (SELECT 1 FROM public.users WHERE id = v_hijack AND role = 'customer');
    v_msg := (SELECT role::TEXT FROM public.users WHERE id = v_hijack);
    DELETE FROM auth.users WHERE id = v_hijack;
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
  END;
  INSERT INTO _c_results VALUES (13, 'Signup metadata admin tidak jadi admin', v_ok, v_msg);

  -- ----------------------------- C14 -----------------------------------------
  -- Booking pending yang sudah kedaluwarsa harus otomatis di-expire saat create_booking
  -- berikutnya (trigger harga -> expire_stale_booking_reservations -> guard status).
  v_ok := FALSE; v_msg := NULL;
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO public.bookings (booking_code, customer_id, talent_id, activity_category_id, booking_mode,
      start_time, end_time, duration_hours, meeting_location_name, status, payment_expires_at)
    VALUES ('BK-C14-STALE', v_cust, v_tal, 'dinner-date', 'offline',
      v_start + INTERVAL '3 days', v_start + INTERVAL '3 days 2 hours', 2, 'Cafe stale', 'pending_payment', NOW() - INTERVAL '1 minute');
    PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_cust), true);
    SET LOCAL ROLE authenticated;
    PERFORM * FROM public.create_booking(v_tal, 'dinner-date', 'offline', v_start + INTERVAL '4 days', 2, 'Cafe baru', NULL);
    RESET ROLE;
    v_ok := EXISTS (SELECT 1 FROM public.bookings WHERE booking_code = 'BK-C14-STALE' AND status = 'expired');
    v_msg := 'booking stale diperiksa berstatus expired';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_msg := SQLERRM;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO _c_results VALUES (14, 'Expire booking stale tidak memblokir create_booking', v_ok, v_msg);

  -- ----------------------------- C15 -----------------------------------------
  v_ok := EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'promotions' AND file_size_limit IS NOT NULL AND allowed_mime_types IS NOT NULL);
  INSERT INTO _c_results VALUES (15, 'Bucket promotions punya batas', v_ok, 'storage.buckets');
END $$;

-- Ringkasan
SELECT n, name, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS hasil, detail FROM _c_results ORDER BY n;

DO $$
DECLARE v_fail INT; BEGIN
  SELECT COUNT(*) INTO v_fail FROM _c_results WHERE NOT passed;
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'Stage C GAGAL: % dari % test gagal (lihat tabel hasil di atas).', v_fail, (SELECT COUNT(*) FROM _c_results);
  END IF;
  RAISE NOTICE 'Stage C: semua % test LULUS.', (SELECT COUNT(*) FROM _c_results);
END $$;
