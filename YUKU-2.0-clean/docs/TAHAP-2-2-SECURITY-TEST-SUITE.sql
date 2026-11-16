-- ============================================================================
-- YUKU DATABASE STAGING SECURITY TEST SUITE (VERSION 14 - 9 MANDATORY TEST CASES)
-- ============================================================================
-- Dokumen: Skrip Pengujian Keamanan Hak Akses, Identity Verification, Role Protection, & Escrow
-- ============================================================================

-- TEST 1: Customer Tidak Dapat Mengubah Role Menjadi Admin (Anti Role Elevation)
-- Skenario: User Customer mencoba UPDATE role = 'admin' pada akun miliknya.
-- SQL Executed:
--   SET ROLE authenticated;
--   UPDATE public.users SET role = 'admin' WHERE id = auth.uid();
-- Ekspektasi: RAISE EXCEPTION 'Akses Ditolak: Anda tidak memiliki wewenang untuk mengubah peran pengguna.'

-- TEST 2: Customer Tidak Dapat Mengubah is_verified_18 Menjadi True Secara Mandiri
-- Skenario: User Customer mencoba UPDATE is_verified_18 = TRUE secara langsung di tabel users.
-- SQL Executed:
--   SET ROLE authenticated;
--   UPDATE public.users SET is_verified_18 = TRUE WHERE id = auth.uid();
-- Ekspektasi: RAISE EXCEPTION 'Akses Ditolak: Pengubahan status verifikasi 18+ hanya dapat dilakukan oleh Admin melalui verifikasi KTP resmi.'

-- TEST 3: Customer Tidak Dapat Mengubah account_status Menjadi Active Secara Mandiri
-- Skenario: User Customer mencoba UPDATE account_status = 'active' secara langsung di tabel users.
-- SQL Executed:
--   SET ROLE authenticated;
--   UPDATE public.users SET account_status = 'active' WHERE id = auth.uid();
-- Ekspektasi: RAISE EXCEPTION 'Akses Ditolak: Pengubahan status akun hanya dapat dilakukan oleh Admin YUKU.'

-- TEST 4: Customer Tidak Dapat Memverifikasi KTP Miliknya Sendiri (Anti KTP Self-Approve)
-- Skenario: User Customer mencoba UPDATE ktp_verification_status = 'verified' di user_identities.
-- SQL Executed:
--   SET ROLE authenticated;
--   UPDATE public.user_identities SET ktp_verification_status = 'verified' WHERE id = auth.uid();
-- Ekspektasi: RAISE EXCEPTION 'Akses Ditolak: Status verifikasi KTP dan keputusan admin hanya dapat diperbarui oleh Admin YUKU.'

-- TEST 5: Customer Tidak Dapat Mengubah Data Identitas Legal Yang Sedang Diproses / Terverifikasi (Identity Immutability)
-- Skenario: User Customer mencoba mengubah ktp_number atau date_of_birth saat status verifikasi pending.
-- SQL Executed:
--   SET ROLE authenticated;
--   UPDATE public.user_identities SET ktp_number = '3171000000009999' WHERE id = auth.uid();
-- Ekspektasi: RAISE EXCEPTION 'Akses Ditolak: Data identitas legal yang sedang diproses atau sudah terverifikasi tidak dapat diubah sepihak.'

-- TEST 6: Admin Yang Berwenang Dapat Menjalankan Verifikasi KTP & Otomatisasi Sinkronisasi Status Users
-- Skenario: Admin memperbarui status verifikasi KTP user ke 'verified'.
-- SQL Executed:
--   SET ROLE service_role; -- atau admin authenticated
--   UPDATE public.user_identities SET ktp_verification_status = 'verified' WHERE id = 'user-uuid-123';
-- Ekspektasi: BERHASIL. Trigger protect_and_verify_user_identities() otomatis memperbarui public.users SET is_verified_18 = TRUE, account_status = 'active' secara atomik.

-- TEST 7: User Tetap Dapat Mengubah Field Profil Yang Diizinkan
-- Skenario: User Customer mengubah full_name atau phone_number di tabel users.
-- SQL Executed:
--   SET ROLE authenticated;
--   UPDATE public.users SET full_name = 'Budi Santoso Baru', phone_number = '081299998888' WHERE id = auth.uid();
-- Ekspektasi: BERHASIL. Perubahan profil publik diizinkan tanpa menyentuh kolom keamanan terproteksi.

-- TEST 8: Service Role Dapat Menjalankan Fungsi Pelepasan Escrow 24 Jam
-- Skenario: Backend worker menjalankan process_escrow_release().
-- SQL Executed:
--   SET ROLE service_role;
--   SELECT public.process_escrow_release();
-- Ekspektasi: BERHASIL. Escrow di-release untuk booking completed > 24 jam tanpa complaint. Pengguna biasa (authenticated/anon) yang mencoba mengeksekusi ini ditolak dengan permission denied / exception.

-- TEST 9: Payout Parsial & Escrow Tetap Berfungsi Secara Logis
-- Skenario: Talent mengajukan payout Rp100.000 dari saldo available Rp200.000 via AFTER INSERT allocation.
-- SQL Executed:
--   SET ROLE authenticated;
--   INSERT INTO public.payout_requests (payout_number, talent_id, amount, bank_name, bank_account_number, bank_account_holder_name) VALUES (...);
-- Ekspektasi: BERHASIL. Trigger BEFORE INSERT mengunci saldo & profil, trigger AFTER INSERT menyisipkan alokasi ke payout_earnings_allocations, sisa saldo Rp100.000 tetap 100% available untuk payout berikutnya.
