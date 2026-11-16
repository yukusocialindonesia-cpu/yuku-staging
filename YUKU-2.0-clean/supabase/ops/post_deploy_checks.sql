-- ============================================================================
-- YUKU — POST-DEPLOY CHECKS (read-only)
-- Jalankan di Supabase SQL Editor SETELAH migrasi 01-23 diterapkan (staging dulu,
-- lalu produksi). Semua baris harus berstatus PASS. WARN = tinjau manual.
-- Skrip ini tidak mengubah data.
-- ============================================================================
WITH expected_tables(name) AS (VALUES ('activity_categories'),('admin_audit_logs'),('booking_messages'),('booking_status_history'),('bookings'),('commission_records'),('customer_profiles'),('financial_adjustments_reversals'),('notifications'),('payments'),('payout_earnings_allocations'),('payout_requests'),('promotions'),('referral_relationships'),('referral_rewards'),('refunds'),('reports_complaints'),('reviews'),('system_feature_flags'),('talent_availability'),('talent_earnings'),('talent_media'),('talent_profiles'),('talent_services'),('user_identities'),('users')),
expected_fns(name) AS (VALUES ('admin_process_payout'),('admin_process_refund'),('admin_resolve_report'),('admin_review_ktp'),('admin_review_talent'),('allocate_payout_earnings_after_insert'),('apply_talent_referral_code'),('auto_generate_booking_financial_ledgers'),('calculate_booking_financials'),('confirm_booking_completion'),('create_booking'),('create_in_app_notification'),('expire_stale_booking_reservations'),('force_manual_payout_provider'),('generate_talent_referral_code'),('get_admin_dashboard_overview'),('get_current_user_role'),('get_my_referral_network'),('guard_booking_insert_status'),('guard_booking_message_update'),('guard_booking_status_actor'),('guard_payout_completion_during_dispute'),('handle_booking_refund_financials'),('handle_new_user'),('handle_payout_status_update'),('hold_booking_when_reported'),('is_admin'),('is_talent_publicly_visible'),('notify_on_booking_status_change'),('notify_on_ktp_status_change'),('notify_on_payout_status_change'),('notify_on_referral_reward_change'),('notify_on_report_status_change'),('prevent_user_security_column_tampering'),('process_escrow_release'),('protect_and_verify_user_identities'),('provision_admin_user'),('request_talent_cancellation'),('restrict_notification_update'),('set_booking_completion_timestamps'),('set_promotions_updated_at'),('settle_booking_payment'),('sync_talent_rating_stats'),('validate_booking_report_and_hold'),('validate_booking_update'),('validate_payout_request_before_insert'),('validate_referral_relationship'),('validate_review_insert'),('validate_user_age_18_plus')),
checks AS (
  -- 1. Semua tabel ada
  SELECT '01 tabel hilang' AS check_name,
         CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
         COALESCE(string_agg(e.name, ', '), '-') AS detail
  FROM expected_tables e
  LEFT JOIN pg_tables t ON t.schemaname = 'public' AND t.tablename = e.name
  WHERE t.tablename IS NULL

  UNION ALL
  -- 2. RLS aktif di semua tabel public
  SELECT '02 tabel tanpa RLS',
         CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
         COALESCE(string_agg(c.relname, ', '), '-')
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity

  UNION ALL
  -- 3. Tabel dengan RLS tetapi tanpa policy (hanya system_feature_flags yang boleh)
  SELECT '03 tabel tanpa policy',
         CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'WARN' END,
         COALESCE(string_agg(c.relname, ', '), '-')
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'system_feature_flags'
    AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname)

  UNION ALL
  -- 4. Semua fungsi ada
  SELECT '04 fungsi hilang',
         CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
         COALESCE(string_agg(e.name, ', '), '-')
  FROM expected_fns e
  WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = e.name)

  UNION ALL
  -- 5. Fungsi SECURITY DEFINER yang bisa dipanggil anon (hanya 3 helper RLS yang boleh)
  SELECT '05 fungsi publik untuk anon',
         CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
         COALESCE(string_agg(p.proname, ', '), '-')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND p.proname NOT IN ('is_admin', 'get_current_user_role', 'is_talent_publicly_visible')

  UNION ALL
  -- 6. Fungsi keuangan backend-only tidak boleh bisa dipanggil authenticated
  SELECT '06 fungsi backend-only terbuka',
         CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
         COALESCE(string_agg(p.proname, ', '), '-')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('settle_booking_payment', 'process_escrow_release', 'provision_admin_user',
                      'expire_stale_booking_reservations', 'handle_new_user')
    AND (has_function_privilege('authenticated', p.oid, 'EXECUTE') OR has_function_privilege('anon', p.oid, 'EXECUTE'))

  UNION ALL
  -- 7. Klien tidak boleh INSERT langsung ke bookings / booking_status_history
  SELECT '07 insert langsung booking terbuka',
         CASE WHEN NOT has_table_privilege('authenticated', 'public.bookings', 'INSERT')
               AND NOT has_any_column_privilege('authenticated', 'public.bookings', 'INSERT')
               AND NOT has_any_column_privilege('authenticated', 'public.booking_status_history', 'INSERT')
              THEN 'PASS' ELSE 'FAIL' END,
         'migrasi 23'

  UNION ALL
  -- 8. Bucket KTP harus privat
  SELECT '08 bucket ktp-documents privat',
         CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'ktp-documents' AND public = FALSE)
              THEN 'PASS' ELSE 'FAIL' END,
         'bucket ktp-documents'

  UNION ALL
  -- 9. Bucket publik punya batas ukuran
  SELECT '09 bucket publik tanpa batas ukuran',
         CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
         COALESCE(string_agg(id, ', '), '-')
  FROM storage.buckets WHERE public = TRUE AND file_size_limit IS NULL

  UNION ALL
  -- 10. Daftar admin (tinjau: hanya akun resmi YUKU)
  SELECT '10 akun admin',
         CASE WHEN COUNT(*) BETWEEN 1 AND 3 THEN 'WARN' ELSE 'FAIL' END,
         COUNT(*) || ' admin: ' || COALESCE(string_agg(email, ', '), '-')
  FROM public.users WHERE role = 'admin'

  UNION ALL
  -- 11. Status flag pembayaran
  SELECT '11 flag payment_checkout',
         'INFO',
         COALESCE((SELECT CASE WHEN enabled THEN 'ON' ELSE 'OFF' END FROM public.system_feature_flags WHERE flag_key = 'payment_checkout'), 'flag tidak ada')

  UNION ALL
  -- 12. Job pg_cron terpasang
  SELECT '12 pg_cron escrow & expire',
         CASE WHEN to_regclass('cron.job') IS NULL THEN 'FAIL' ELSE 'INFO' END,
         CASE WHEN to_regclass('cron.job') IS NULL THEN 'pg_cron belum aktif'
              ELSE 'Periksa manual: SELECT jobname, schedule FROM cron.job;' END
)
SELECT * FROM checks ORDER BY check_name;
