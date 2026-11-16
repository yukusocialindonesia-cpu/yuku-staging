-- ==============================================================================
-- YUKU SUPABASE STAGING SECURITY TEST SUITE (TAHAP A-REVISI 3 VERSION 20)
-- Description: Comprehensive automated security verification script for Stage A.
-- Execution: Runs inside a single transaction with ROLLBACK to prevent side effects.
-- ==============================================================================

BEGIN;

DO $$
DECLARE
    -- Test User IDs
    v_admin_id               UUID := '88888888-8888-8888-8888-888888888888';
    v_user_id                UUID := '11111111-1111-1111-1111-111111111111';
    v_minor_id               UUID := '99999999-9999-9999-9999-999999999999';
    v_talent_active_id       UUID := '22222222-2222-2222-2222-222222222222';
    v_talent_pending_id      UUID := '33333333-3333-3333-3333-333333333333';
    v_banned_id              UUID := '44444444-4444-4444-4444-444444444444';
    v_noid_id                UUID := '55555555-5555-5555-5555-555555555555';
    v_admin_hack_id          UUID := '66666666-6666-6666-6666-666666666666';
    v_reject_user_id         UUID := '77777777-7777-7777-7777-777777777777';

    -- Counter & Helper Variables
    v_pass_count             INT := 0;
    v_fail_count             INT := 0;
    v_error_caught           BOOLEAN;
    v_sqlerrm                TEXT;
    v_fetched_count          INT;
    v_role_check             public.user_role_type;
    v_verified_check         BOOLEAN;
    v_status_check           public.account_status_type;
    v_ktp_status_check       public.ktp_status_type;
    v_verified_by_check      UUID;
    v_verified_at_check      TIMESTAMPTZ;
    v_rating_check           NUMERIC;
    v_referral_check         TEXT;
BEGIN
    RAISE NOTICE '==============================================================================';
    RAISE NOTICE 'STARTING YUKU TAHAP A-REVISI 3 SECURITY TEST SUITE (VERSION 20)';
    RAISE NOTICE '==============================================================================';

    -- --------------------------------------------------------------------------
    -- DATA SETUP (Executing with service_role claim so triggers allow setup)
    -- --------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    
    -- 1. Setup Admin User via auth.users insert -> handle_new_user trigger
    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
    VALUES (v_admin_id, 'admin@yuku.test', '{"full_name": "Super Admin"}'::jsonb, NOW(), NOW());
    UPDATE public.users SET role = 'admin', is_verified_18 = TRUE, account_status = 'active' WHERE id = v_admin_id;

    -- 2. Setup Regular Customer User
    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
    VALUES (v_user_id, 'user@yuku.test', '{"full_name": "Regular User"}'::jsonb, NOW(), NOW());
    INSERT INTO public.user_identities (id, full_legal_name, date_of_birth, ktp_number, ktp_storage_path, ktp_verification_status)
    VALUES (v_user_id, 'Regular Legal Name', '1995-05-15', '3171000000000001', 'ktp_regular.jpg', 'pending_review');

    -- 3. Setup Minor User (no initial user_identities record)
    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
    VALUES (v_minor_id, 'minor@yuku.test', '{"full_name": "Minor User"}'::jsonb, NOW(), NOW());

    -- 4. Setup Active & Verified Talent User
    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
    VALUES (v_talent_active_id, 'talent_active@yuku.test', '{"full_name": "Active Talent", "user_role": "talent"}'::jsonb, NOW(), NOW());
    UPDATE public.users SET is_verified_18 = TRUE, account_status = 'active' WHERE id = v_talent_active_id;
    INSERT INTO public.talent_profiles (id, display_name, avatar_url, city, gender, headline, bio, hourly_rate, rating_average, referral_code)
    VALUES (v_talent_active_id, 'Active Talent', 'https://avatar.test/1.jpg', 'Jakarta', 'Wanita', 'Headline Active', 'Bio Active', 150000, 5.00, 'YUKU-ACT01');

    -- 5. Setup Pending Talent User (Unverified 18+)
    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
    VALUES (v_talent_pending_id, 'talent_pending@yuku.test', '{"full_name": "Pending Talent", "user_role": "talent"}'::jsonb, NOW(), NOW());
    INSERT INTO public.talent_profiles (id, display_name, avatar_url, city, gender, headline, bio, hourly_rate, rating_average, referral_code)
    VALUES (v_talent_pending_id, 'Pending Talent', 'https://avatar.test/2.jpg', 'Jakarta', 'Wanita', 'Headline Pending', 'Bio Pending', 120000, 5.00, 'YUKU-PEND01');

    -- 6. Setup Banned User with Pending KTP Review
    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
    VALUES (v_banned_id, 'banned@yuku.test', '{"full_name": "Banned User"}'::jsonb, NOW(), NOW());
    UPDATE public.users SET account_status = 'banned' WHERE id = v_banned_id;
    INSERT INTO public.user_identities (id, full_legal_name, date_of_birth, ktp_number, ktp_storage_path, ktp_verification_status)
    VALUES (v_banned_id, 'Banned Legal Name', '1990-01-01', '3171000000000002', 'ktp_banned.jpg', 'pending_review');

    -- 7. Setup User Without Identity Record
    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
    VALUES (v_noid_id, 'noid@yuku.test', '{"full_name": "No Identity User"}'::jsonb, NOW(), NOW());

    -- 8. Setup Second Pending Review User for Rejection Test
    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
    VALUES (v_reject_user_id, 'reject_user@yuku.test', '{"full_name": "Reject User"}'::jsonb, NOW(), NOW());
    INSERT INTO public.user_identities (id, full_legal_name, date_of_birth, ktp_number, ktp_storage_path, ktp_verification_status)
    VALUES (v_reject_user_id, 'Reject Candidate Name', '1992-08-20', '3171000000000007', 'ktp_reject.jpg', 'pending_review');

    -- 9. Seed Activity Categories for Anon Select Test
    INSERT INTO public.activity_categories (id, title, description, icon_name, is_online_available, is_active)
    VALUES ('cat_coffee', 'Nongkrong Kafe', 'Teman ngopi dan ngobrol santai', 'coffee', TRUE, TRUE)
    ON CONFLICT (id) DO NOTHING;

    -- Reset JWT claims after setup completes
    PERFORM set_config('request.jwt.claims', '', true);
    RESET ROLE;

    -- ==========================================================================
    -- TEST 1: Direct Update on public.users.role by Authenticated User
    -- ==========================================================================
    v_error_caught := FALSE;
    v_sqlerrm := '';
    BEGIN
        PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_user_id), true);
        SET LOCAL ROLE authenticated;

        UPDATE public.users SET role = 'admin' WHERE id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
        v_sqlerrm := SQLERRM;
    END;
    RESET ROLE;

    SELECT role INTO v_role_check FROM public.users WHERE id = v_user_id;
    IF v_error_caught AND (v_sqlerrm LIKE '%Akses Ditolak%' OR v_sqlerrm LIKE '%permission denied%') AND v_role_check = 'customer' THEN
        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'PASS [TEST 1]: User self role escalation blocked specifically: %', v_sqlerrm;
    ELSE
        v_fail_count := v_fail_count + 1;
        RAISE NOTICE 'FAIL [TEST 1]: Expected role escalation error, got sqlerrm: %, role: %', v_sqlerrm, v_role_check;
    END IF;

    -- ==========================================================================
    -- TEST 2: Direct Update on public.users.is_verified_18 by Authenticated User
    -- ==========================================================================
    v_error_caught := FALSE;
    v_sqlerrm := '';
    BEGIN
        PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_user_id), true);
        SET LOCAL ROLE authenticated;

        UPDATE public.users SET is_verified_18 = TRUE WHERE id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
        v_sqlerrm := SQLERRM;
    END;
    RESET ROLE;

    SELECT is_verified_18 INTO v_verified_check FROM public.users WHERE id = v_user_id;
    IF v_error_caught AND (v_sqlerrm LIKE '%Akses Ditolak%' OR v_sqlerrm LIKE '%permission denied%') AND v_verified_check = FALSE THEN
        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'PASS [TEST 2]: Direct update on is_verified_18 blocked specifically: %', v_sqlerrm;
    ELSE
        v_fail_count := v_fail_count + 1;
        RAISE NOTICE 'FAIL [TEST 2]: Expected is_verified_18 error, got sqlerrm: %, value: %', v_sqlerrm, v_verified_check;
    END IF;

    -- ==========================================================================
    -- TEST 3: Direct Update on public.users.account_status by Authenticated User
    -- ==========================================================================
    v_error_caught := FALSE;
    v_sqlerrm := '';
    BEGIN
        PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_user_id), true);
        SET LOCAL ROLE authenticated;

        UPDATE public.users SET account_status = 'active' WHERE id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
        v_sqlerrm := SQLERRM;
    END;
    RESET ROLE;

    SELECT account_status INTO v_status_check FROM public.users WHERE id = v_user_id;
    IF v_error_caught AND (v_sqlerrm LIKE '%Akses Ditolak%' OR v_sqlerrm LIKE '%permission denied%') AND v_status_check = 'pending_verification' THEN
        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'PASS [TEST 3]: Direct update on account_status blocked specifically: %', v_sqlerrm;
    ELSE
        v_fail_count := v_fail_count + 1;
        RAISE NOTICE 'FAIL [TEST 3]: Expected account_status error, got sqlerrm: %, value: %', v_sqlerrm, v_status_check;
    END IF;

    -- ==========================================================================
    -- TEST 4: Underage (< 18yo) KTP Submission Rejection
    -- ==========================================================================
    v_error_caught := FALSE;
    v_sqlerrm := '';
    BEGIN
        PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_minor_id), true);
        SET LOCAL ROLE authenticated;

        INSERT INTO public.user_identities (
            id, full_legal_name, date_of_birth, ktp_number, ktp_storage_path
        ) VALUES (
            v_minor_id, 'Minor Person', CURRENT_DATE - INTERVAL '17 years', '3171000000000099', 'ktp_minor.jpg'
        );
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
        v_sqlerrm := SQLERRM;
    END;
    RESET ROLE;

    IF v_error_caught AND (v_sqlerrm LIKE '%Pendaftaran Ditolak%' OR v_sqlerrm LIKE '% minimal 18 tahun%') AND NOT EXISTS (SELECT 1 FROM public.user_identities WHERE id = v_minor_id) THEN
        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'PASS [TEST 4]: Underage KTP submission blocked specifically: %', v_sqlerrm;
    ELSE
        v_fail_count := v_fail_count + 1;
        RAISE NOTICE 'FAIL [TEST 4]: Expected underage error, got sqlerrm: %', v_sqlerrm;
    END IF;

    -- ==========================================================================
    -- TEST 5: User Self-Approval Attempt via UPDATE on user_identities
    -- ==========================================================================
    v_error_caught := FALSE;
    v_sqlerrm := '';
    BEGIN
        PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_user_id), true);
        SET LOCAL ROLE authenticated;

        UPDATE public.user_identities SET ktp_verification_status = 'verified' WHERE id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
        v_sqlerrm := SQLERRM;
    END;
    RESET ROLE;

    SELECT ktp_verification_status INTO v_ktp_status_check FROM public.user_identities WHERE id = v_user_id;
    IF v_error_caught AND (v_sqlerrm LIKE '%Akses Ditolak%' OR v_sqlerrm LIKE '%permission denied%') AND v_ktp_status_check = 'pending_review' THEN
        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'PASS [TEST 5]: User self-approval attempt on user_identities blocked specifically: %', v_sqlerrm;
    ELSE
        v_fail_count := v_fail_count + 1;
        RAISE NOTICE 'FAIL [TEST 5]: Expected KTP status update error, got sqlerrm: %, value: %', v_sqlerrm, v_ktp_status_check;
    END IF;

    -- ==========================================================================
    -- TEST 6: User Cannot DELETE user_identities
    -- ==========================================================================
    v_error_caught := FALSE;
    v_sqlerrm := '';
    BEGIN
        PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_user_id), true);
        SET LOCAL ROLE authenticated;

        DELETE FROM public.user_identities WHERE id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
        v_sqlerrm := SQLERRM;
    END;
    RESET ROLE;

    IF v_error_caught AND (v_sqlerrm LIKE '%permission denied%' OR v_sqlerrm LIKE '%Akses Ditolak%') AND EXISTS (SELECT 1 FROM public.user_identities WHERE id = v_user_id) THEN
        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'PASS [TEST 6]: User DELETE on user_identities blocked specifically: %', v_sqlerrm;
    ELSE
        v_fail_count := v_fail_count + 1;
        RAISE NOTICE 'FAIL [TEST 6]: Expected DELETE permission error, got sqlerrm: %', v_sqlerrm;
    END IF;

    -- ==========================================================================
    -- TEST 7: Non-Admin Calling admin_review_ktp RPC
    -- ==========================================================================
    v_error_caught := FALSE;
    v_sqlerrm := '';
    BEGIN
        PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_user_id), true);
        SET LOCAL ROLE authenticated;

        PERFORM public.admin_review_ktp(v_user_id, 'verified', 'Self approve');
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
        v_sqlerrm := SQLERRM;
    END;
    RESET ROLE;

    SELECT ktp_verification_status INTO v_ktp_status_check FROM public.user_identities WHERE id = v_user_id;
    IF v_error_caught AND (v_sqlerrm LIKE '%Akses Ditolak%' OR v_sqlerrm LIKE '%permission denied%') AND v_ktp_status_check = 'pending_review' THEN
        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'PASS [TEST 7]: Non-admin call to admin_review_ktp blocked specifically: %', v_sqlerrm;
    ELSE
        v_fail_count := v_fail_count + 1;
        RAISE NOTICE 'FAIL [TEST 7]: Expected admin_review_ktp RPC error, got sqlerrm: %, value: %', v_sqlerrm, v_ktp_status_check;
    END IF;

    -- ==========================================================================
    -- TEST 8: admin_review_ktp on User Without user_identities Record
    -- ==========================================================================
    v_error_caught := FALSE;
    v_sqlerrm := '';
    BEGIN
        PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_admin_id), true);
        SET LOCAL ROLE authenticated;

        PERFORM public.admin_review_ktp(v_noid_id, 'verified', 'Approve missing identity');
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
        v_sqlerrm := SQLERRM;
    END;
    RESET ROLE;

    SELECT account_status INTO v_status_check FROM public.users WHERE id = v_noid_id;
    IF v_error_caught AND (v_sqlerrm LIKE '%Permohonan Ditolak%' OR v_sqlerrm LIKE '%tidak ditemukan%') AND v_status_check = 'pending_verification' THEN
        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'PASS [TEST 8]: admin_review_ktp on missing identity rejected specifically: %', v_sqlerrm;
    ELSE
        v_fail_count := v_fail_count + 1;
        RAISE NOTICE 'FAIL [TEST 8]: Expected missing identity review error, got sqlerrm: %, status: %', v_sqlerrm, v_status_check;
    END IF;

    -- ==========================================================================
    -- TEST 9: Admin Review KTP Cannot Activate Banned User Account
    -- ==========================================================================
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_admin_id), true);
    SET LOCAL ROLE authenticated;

    PERFORM public.admin_review_ktp(v_banned_id, 'verified', 'Verifikasi dokumen sah');
    RESET ROLE;

    SELECT account_status INTO v_status_check FROM public.users WHERE id = v_banned_id;
    SELECT ktp_verification_status INTO v_ktp_status_check FROM public.user_identities WHERE id = v_banned_id;

    IF v_ktp_status_check = 'verified' AND v_status_check = 'banned' THEN
        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'PASS [TEST 9]: Admin KTP approval set verified=TRUE but DID NOT unban account (status remains banned).';
    ELSE
        v_fail_count := v_fail_count + 1;
        RAISE NOTICE 'FAIL [TEST 9]: Expected account_status=banned and ktp_status=verified, got account_status: %, ktp_status: %', v_status_check, v_ktp_status_check;
    END IF;

    -- ==========================================================================
    -- TEST 10: Auth Signup with Metadata user_role='admin' Results in 'customer'
    -- ==========================================================================
    INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
    VALUES (v_admin_hack_id, 'hackadmin@yuku.test', '{"full_name": "Attacker", "user_role": "admin"}'::jsonb, NOW(), NOW());

    SELECT role INTO v_role_check FROM public.users WHERE id = v_admin_hack_id;
    IF v_role_check = 'customer' THEN
        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'PASS [TEST 10]: Signup with metadata user_role=admin correctly defaulted to customer role.';
    ELSE
        v_fail_count := v_fail_count + 1;
        RAISE NOTICE 'FAIL [TEST 10]: Expected role customer on signup, got role: %', v_role_check;
    END IF;

    -- ==========================================================================
    -- TEST 11: User Cannot UPDATE rating_average or referral_code on talent_profiles
    -- ==========================================================================
    v_error_caught := FALSE;
    v_sqlerrm := '';
    BEGIN
        PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_talent_active_id), true);
        SET LOCAL ROLE authenticated;

        UPDATE public.talent_profiles SET rating_average = 5.00, referral_code = 'HACKED-CODE' WHERE id = v_talent_active_id;
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
        v_sqlerrm := SQLERRM;
    END;
    RESET ROLE;

    SELECT rating_average, referral_code INTO v_rating_check, v_referral_check FROM public.talent_profiles WHERE id = v_talent_active_id;
    IF v_error_caught AND (v_sqlerrm LIKE '%permission denied%' OR v_sqlerrm LIKE '%Akses Ditolak%') AND v_referral_check = 'YUKU-ACT01' THEN
        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'PASS [TEST 11]: Direct update on rating_average / referral_code blocked specifically: %', v_sqlerrm;
    ELSE
        v_fail_count := v_fail_count + 1;
        RAISE NOTICE 'FAIL [TEST 11]: Expected talent profile restricted column update error, got sqlerrm: %, ref: %', v_sqlerrm, v_referral_check;
    END IF;

    -- ==========================================================================
    -- TEST 12: Anonymous User Can SELECT Only Active+Verified Talent Profiles
    -- ==========================================================================
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    SET LOCAL ROLE anon;

    SELECT COUNT(*) INTO v_fetched_count FROM public.talent_profiles;
    
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);

    -- Active talent is visible (1), pending talent is NOT visible (filtered out by RLS / is_talent_publicly_visible)
    IF v_fetched_count = 1 AND EXISTS (SELECT 1 FROM public.talent_profiles WHERE id = v_talent_active_id) THEN
        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'PASS [TEST 12]: Anonymous user can SELECT talent_profiles, showing ONLY active+verified_18 talent (count: %).', v_fetched_count;
    ELSE
        v_fail_count := v_fail_count + 1;
        RAISE NOTICE 'FAIL [TEST 12]: Expected exactly 1 active talent visible to anon, got count: %', v_fetched_count;
    END IF;

    -- ==========================================================================
    -- TEST 13: Anonymous User Can SELECT activity_categories
    -- ==========================================================================
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    SET LOCAL ROLE anon;

    SELECT COUNT(*) INTO v_fetched_count FROM public.activity_categories WHERE is_active = TRUE;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);

    IF v_fetched_count >= 1 THEN
        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'PASS [TEST 13]: Anonymous user can SELECT active activity_categories (count: %).', v_fetched_count;
    ELSE
        v_fail_count := v_fail_count + 1;
        RAISE NOTICE 'FAIL [TEST 13]: Anonymous user failed to SELECT activity_categories, count: %', v_fetched_count;
    END IF;

    -- ==========================================================================
    -- TEST 14 (JALUR SUKSES): Adult User Insert Own user_identities -> pending_review
    -- ==========================================================================
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_noid_id), true);
    SET LOCAL ROLE authenticated;

    INSERT INTO public.user_identities (
        id, full_legal_name, date_of_birth, ktp_number, ktp_storage_path
    ) VALUES (
        v_noid_id, 'Adult Legal Name', CURRENT_DATE - INTERVAL '25 years', '3171000000000055', 'ktp_noid.jpg'
    );
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);

    SELECT ktp_verification_status INTO v_ktp_status_check FROM public.user_identities WHERE id = v_noid_id;
    IF v_ktp_status_check = 'pending_review' THEN
        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'PASS [TEST 14]: Adult user own identity submission successfully defaulted to pending_review.';
    ELSE
        v_fail_count := v_fail_count + 1;
        RAISE NOTICE 'FAIL [TEST 14]: Expected ktp_verification_status=pending_review, got: %', v_ktp_status_check;
    END IF;

    -- ==========================================================================
    -- TEST 15 (JALUR SUKSES): Admin Review KTP Approved -> Verified & Active Status
    -- ==========================================================================
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_admin_id), true);
    SET LOCAL ROLE authenticated;

    PERFORM public.admin_review_ktp(v_user_id, 'verified', 'Dokumen KTP valid');
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);

    SELECT ktp_verification_status, verified_by_admin_id, verified_at 
    INTO v_ktp_status_check, v_verified_by_check, v_verified_at_check
    FROM public.user_identities WHERE id = v_user_id;

    SELECT is_verified_18, account_status 
    INTO v_verified_check, v_status_check
    FROM public.users WHERE id = v_user_id;

    IF v_ktp_status_check = 'verified' AND v_verified_by_check = v_admin_id AND v_verified_at_check IS NOT NULL 
       AND v_verified_check = TRUE AND v_status_check = 'active' THEN
        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'PASS [TEST 15]: Admin review KTP approval updated status to verified, set admin audit fields, and activated user account.';
    ELSE
        v_fail_count := v_fail_count + 1;
        RAISE NOTICE 'FAIL [TEST 15]: Admin review approval verification failed. ktp_status: %, admin_id: %, verified_18: %, account_status: %', 
            v_ktp_status_check, v_verified_by_check, v_verified_check, v_status_check;
    END IF;

    -- ==========================================================================
    -- TEST 16 (JALUR SUKSES): Admin Review KTP Rejected -> Status Rejected
    -- ==========================================================================
    PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', v_admin_id), true);
    SET LOCAL ROLE authenticated;

    PERFORM public.admin_review_ktp(v_reject_user_id, 'rejected', 'Foto KTP buram dan tidak terbaca');
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);

    SELECT ktp_verification_status INTO v_ktp_status_check FROM public.user_identities WHERE id = v_reject_user_id;
    SELECT is_verified_18, account_status INTO v_verified_check, v_status_check FROM public.users WHERE id = v_reject_user_id;

    IF v_ktp_status_check = 'rejected' AND v_verified_check = FALSE AND v_status_check = 'pending_verification' THEN
        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'PASS [TEST 16]: Admin review KTP rejection set status to rejected, kept is_verified_18=FALSE, and left account_status unchanged.';
    ELSE
        v_fail_count := v_fail_count + 1;
        RAISE NOTICE 'FAIL [TEST 16]: Admin review rejection failed. ktp_status: %, verified_18: %, account_status: %',
            v_ktp_status_check, v_verified_check, v_status_check;
    END IF;

    -- ==========================================================================
    -- TEST 17: Anonymous User Cannot SELECT public.users (Blocked by Privilege)
    -- ==========================================================================
    v_error_caught := FALSE;
    v_sqlerrm := '';
    BEGIN
        PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
        SET LOCAL ROLE anon;

        SELECT COUNT(*) INTO v_fetched_count FROM public.users;
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
        v_sqlerrm := SQLERRM;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);

    IF v_error_caught AND v_sqlerrm LIKE '%permission denied%' THEN
        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'PASS [TEST 17]: Anonymous SELECT on public.users blocked specifically: %', v_sqlerrm;
    ELSIF NOT v_error_caught AND v_fetched_count > 0 THEN
        v_fail_count := v_fail_count + 1;
        RAISE NOTICE 'FAIL [TEST 17]: Anonymous user managed to SELECT % rows from public.users!', v_fetched_count;
    ELSE
        v_fail_count := v_fail_count + 1;
        RAISE NOTICE 'FAIL [TEST 17]: Unexpected result on anon SELECT public.users, error: %, count: %', v_sqlerrm, v_fetched_count;
    END IF;

    -- ==========================================================================
    -- TEST 18: Anonymous User Cannot SELECT public.user_identities (Blocked by Privilege)
    -- ==========================================================================
    v_error_caught := FALSE;
    v_sqlerrm := '';
    BEGIN
        PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
        SET LOCAL ROLE anon;

        SELECT COUNT(*) INTO v_fetched_count FROM public.user_identities;
    EXCEPTION WHEN OTHERS THEN
        v_error_caught := TRUE;
        v_sqlerrm := SQLERRM;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);

    IF v_error_caught AND v_sqlerrm LIKE '%permission denied%' THEN
        v_pass_count := v_pass_count + 1;
        RAISE NOTICE 'PASS [TEST 18]: Anonymous SELECT on public.user_identities blocked specifically: %', v_sqlerrm;
    ELSIF NOT v_error_caught AND v_fetched_count > 0 THEN
        v_fail_count := v_fail_count + 1;
        RAISE NOTICE 'FAIL [TEST 18]: Anonymous user managed to SELECT % rows from public.user_identities!', v_fetched_count;
    ELSE
        v_fail_count := v_fail_count + 1;
        RAISE NOTICE 'FAIL [TEST 18]: Unexpected result on anon SELECT public.user_identities, error: %, count: %', v_sqlerrm, v_fetched_count;
    END IF;

    -- ==========================================================================
    -- FINAL SUMMARY OUTPUT
    -- ==========================================================================
    RAISE NOTICE '==============================================================================';
    RAISE NOTICE 'SUMMARY RESULTS FOR TAHAP A-REVISI 3 SECURITY TEST SUITE (VERSION 20):';
    RAISE NOTICE 'TOTAL TESTS EXECUTED : %', (v_pass_count + v_fail_count);
    RAISE NOTICE 'TOTAL PASSED         : %', v_pass_count;
    RAISE NOTICE 'TOTAL FAILED         : %', v_fail_count;
    RAISE NOTICE '==============================================================================';

    IF v_fail_count > 0 THEN
        RAISE EXCEPTION 'SECURITY TEST SUITE FAILED WITH % FAILURE(S)!', v_fail_count;
    END IF;

END $$;

ROLLBACK;
