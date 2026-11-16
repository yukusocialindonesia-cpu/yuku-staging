# PETUNJUK MIGRASI SQL SUPABASE YUKU (TAHAP A & B SECURITY REMEDIATION VERSION 20)

**Produk**: YUKU — Social Experience & Paid Companionship Marketplace  
**Tagline**: *Real Friends. Real Moments.*  
**Dokumen Acuan**: `docs/TAHAP-2-2-FINAL-REMEDIATION-REPORT.md`, `supabase/tests/stage_a_security_tests.sql`, & `supabase/tests/stage_b_security_tests.sql`  
**Status**: DRAFT BERKAS MIGRASI TERPISAH (Siap Staging / Belum Dieksekusi ke Database Staging Maupun Production)

---

## 1. STATUS PENGUJIAN & VERIFIKASI RESMI

- **Audit statis**: selesai
- **SQL test**: ditulis, belum dijalankan
- **Runtime/staging**: belum diuji
- **Status Kompilasi Frontend**: dilaporkan AI Studio, belum diverifikasi independen
- **Status Linting Frontend**: dilaporkan AI Studio, belum diverifikasi independen

---

## 2. URUTAN EKSEKUSI MIGRASI SQL & STRUCTURAL TABLE COUNT

Migration dibagi menjadi **6 berkas terurut** mencakup tepat **22 TABEL (21 Tabel Core + 1 Tabel Alokasi Pencairan Parsial `payout_earnings_allocations`)**, **3 Storage Buckets (`ktp-documents`, `avatars`, `portfolios`)**, **8 Storage RLS Policies**, **22 Tabel RLS Aktif**, **41 RLS Policies Database**, **20 Fungsi `SECURITY DEFINER`** (`SET search_path = ''`), dan **14 Triggers**:

| No | Berkas Migration | Cakupan Tabel & Fitur | Ketergantungan |
|---|---|---|---|
| 1 | `01_initial_schema_and_enums.sql` | Enums (`ktp_status_type`: `unsubmitted`, `pending_review`, `verified`, `rejected`), Extensions, `users` (`full_name`), `user_identities` (`verified_at`, `verified_by_admin_id`), `customer_profiles`, `talent_profiles`, `activity_categories` (5 Tabel) | Base Auth (`auth.users`) |
| 2 | `02_services_and_availability.sql` | `talent_services` (BIGINT custom rate), `talent_availability` (2 Tabel) | Migrasi 01 |
| 3 | `03_bookings_and_escrow_schema.sql` | Enums, `bookings` (Exclusion Constraint Slot Valid PostgreSQL & BIGINT), `booking_status_history`, `payments`, `refunds` (4 Tabel) | Migrasi 01, 02 |
| 4 | `04_financial_ledgers_and_referrals.sql` | Enums, `commission_records`, `talent_earnings` (Parsial Payout Tracking), `referral_relationships`, `referral_rewards`, `payout_requests` (Min Rp100k BIGINT), `payout_earnings_allocations` (Tabel Alokasi), `financial_adjustments_reversals` (7 Tabel) | Migrasi 01, 03 |
| 5 | `05_reviews_reports_and_system.sql` | Enums, `reviews`, `reports_complaints`, `notifications`, `admin_audit_logs` (4 Tabel) | Migrasi 01, 03 |
| 6 | `06_triggers_functions_and_rls.sql` | REVOKE ALL, Minimal Grants, GRANT EXECUTE RLS helpers, Storage Buckets & 8 Storage RLS Policies, Safe Admin Review `FOR UPDATE`, 20 `SECURITY DEFINER` (`SET search_path = ''`), 14 Triggers, & **41 RLS Policies** pada **22 Tabel RLS Aktif** | Migrasi 01 s/d 05 |
| 7 | `07_fix_grants_and_actor_type.sql` | Penambahan kolom `actor_type`, pelonggaran `changed_by_user_id DROP NOT NULL`, constraint integritas konsistensi actor, GRANT INSERT/UPDATE tabel `bookings`, `booking_status_history`, `talent_services`, dan ENUM `simulation` | Migrasi 01 s/d 06 |
| 8 | `08_grant_additional_features.sql` | Penambahan hak akses tabel (GRANT) pasca-REVOKE ALL untuk tabel `reviews`, `reports_complaints`, `notifications`, `talent_availability`, `payout_requests`, `talent_earnings`, `payments`, `refunds`, `referral_relationships`, `referral_rewards`, kolom `ktp_verification_status`, dan trigger otomatis `customer_profiles` pada `handle_new_user()` | Migrasi 01 s/d 07 |
| 9 | `09_admin_management_rpcs.sql` | Fungsi RPC Admin; catatan: versi ini memiliki jalur signup Admin yang ditutup oleh migration 18 | Migrasi 01 s/d 08 |
| Legacy | `FULL_MIGRATION_V20.sql` | File pensiun berisi peringatan saja; arsip parsial lama dipindahkan ke `supabase/legacy/` | JANGAN dieksekusi sebagai migrasi |

---

## 3. PENGAMANAN SECURITY REMEDIATION TAHAP A & B (VERSION 20)

1. **STORAGE BUCKETS & RLS POLICIES**: Proteksi dokumen KTP privat pada bucket `ktp-documents` hanya untuk pemilik dan Admin.
2. **20% YUKU FEE & 80% TALENT SHARE**: Kalkulasi server-side otomatis pada `calculate_booking_financials()`.
3. **AUTOMATIC FINANCIAL LEDGERS**: Pencatatan otomatis komisi, talent earning, dan referral reward saat pembayaran `settled_held`.
4. **MINIMUM PAYOUT RP100.000 & PARSIAL ALLOCATION**: Penolakan pencairan < Rp100.000 dan alokasi saldo parsial atomik.
5. **2 SUITE AUTOMATED SQL TESTS (28 TEST CASES TOTAL)**:
   - `supabase/tests/stage_a_security_tests.sql` (18 Test Cases Security & Identity)
   - `supabase/tests/stage_b_security_tests.sql` (10 Test Cases Finansial, Escrow, Payout, Referral, & Rating)

---

> **TEGAS & TRANSPARAN**: Pengujian runtime PostgreSQL/Supabase pada database fisik **BELUM DILAKUKAN** karena belum ada instance database Staging yang terhubung. Seluruh berkas SQL ini merupakan hasil audit statis & penyiapan arsitektur yang **BELUM DIEKSEKUSI** ke database manapun. Aplikasi frontend tetap berjalan dalam mode SPA murni tanpa ketergantungan backend aktif.

## 4. MIGRASI REMEDIASI LANJUTAN (WAJIB BERURUTAN 18-23)

| No | Berkas | Tujuan |
|---|---|---|
| 18 | `18_security_and_payout_guardrails.sql` | Menutup privilege escalation Admin saat signup, menghapus data gender/kota rekaan pada profil Customer baru, membatasi UPDATE chat hanya untuk `is_read`, dan mengamankan alur payout dengan referensi transfer wajib. |
| 19 | `19_create_booking_rpc.sql` | Menambahkan RPC `create_booking` yang dipanggil frontend, dengan validasi server-side akun, KTP, Talent, kategori, mode, jadwal, harga, dan komisi. RPC ini hanya membuat booking `pending_payment`; tidak memproses pembayaran. Server-side feature flag `payment_checkout` dibuat OFF secara default sehingga RPC menolak booking sampai payment gateway aktif. |
| 20 | `20_immediate_escrow_release_policy.sql` | Menghapus masa tunggu otomatis 24 jam; saldo tersedia setelah booking selesai jika tidak ada sengketa aktif. Fungsi tetap perlu dijalankan oleh scheduler/backend tepercaya. |
| 21 | `21_booking_completion_and_actor_guards.sql` | Membatasi siapa yang boleh mengubah status booking, mewajibkan konfirmasi selesai dari Customer dan Talent, serta otomatis menahan booking saat laporan sengketa valid dibuat. |
| 22 | `22_talent_cancellation_and_refund_workflow.sql` | Talent membatalkan booking berbayar melalui RPC yang membuat permintaan refund penuh; Admin/Finance mencatat refund selesai hanya dengan referensi provider/bank. Tidak menjalankan refund otomatis. |
| 23 | `23_customer_cancellation_refund_foundation.sql` | Mengganti pembatalan Customer langsung dari frontend dengan RPC transaksional; mencatat refund otomatis yang menjadi hak Customer dan sisa dana yang menunggu keputusan Admin; memperbaiki penanda status pembayaran agar refund parsial tidak dianggap refund penuh. Tetap manual di provider dan belum memiliki layar Admin untuk memutuskan alokasi sisa dana. |

**PENTING:** `FULL_MIGRATION_V20.sql` sekarang hanya berisi peringatan dan bukan file migrasi yang dapat dieksekusi. README lama yang menyebut file tersebut sebagai bundel lengkap sudah tidak berlaku. Gunakan migrasi terpisah secara berurutan pada database staging yang kosong, lalu jalankan test suite. Jangan jalankan pada produksi sebelum seluruh hasil staging lulus.
**Scheduler escrow:** Setelah migration 20 lulus di staging, aktifkan extension `pg_cron` pada proyek Supabase dan jalankan `supabase/ops/schedule_escrow_release.sql` satu kali. Job memeriksa setiap menit, sehingga pelepasan terjadi pada eksekusi berikutnya setelah sesi selesai, kecuali ada sengketa aktif. Jangan menganggap scheduler aktif hanya karena file SQL tersedia.


## 5. CATATAN MIGRASI 23 — BATASAN YANG BELUM SELESAI

- Migration 23 adalah fondasi pencatatan pembatalan Customer. Fungsi ini **tidak** menghubungi Xendit/Midtrans dan tidak memindahkan uang.
- Refund yang dibuat tetap harus benar-benar dikembalikan oleh Finance di provider/bank dan dikonfirmasi dengan referensi transaksi.
- Sisa dana 50% (atau seluruh dana untuk pembatalan kurang dari 6 jam) dicatat sebagai `retained_pending_admin_amount`; nilai ini bukan pendapatan YUKU dan bukan saldo Talent.
- Layar Admin untuk meninjau dan membukukan keputusan atas sisa dana, termasuk jurnal penyesuaian yang sesuai, **belum dibuat**. Jangan tandai kasus selesai atau melakukan payout atas dana tersebut sebelum proses itu tersedia dan diuji.
- Migration 23 dan seluruh migration 01-23 belum diuji pada instance PostgreSQL/Supabase staging. Jangan jalankan pada production.

| 24 | `24_hold_talent_earnings_during_customer_admin_review.sql` | Membekukan earning Talent saat dana pembatalan Customer masih menunggu keputusan Admin; menolak pembatalan bila earning sudah dialokasikan/dibayarkan | Migrasi 01-23 |


## 6. MERGED CHECKPOINT 07 CANDIDATE — MIGRASI 23–25

Urutan kandidat gabungan:
- 23 `23_customer_cancellation_refund_foundation.sql` (Checkpoint 06)
- 24 `24_hold_talent_earnings_during_customer_admin_review.sql` (Checkpoint 06)
- 25 `25_prelaunch_hardening_after_financial_hold.sql` (hardening Claude, dipindah urutannya agar tidak menimpa nomor migrasi 23)

**Jangan jalankan di produksi.** Migrasi 25 merupakan hasil pemindahan urutan dari hardening Claude dan baru lolos pemeriksaan statis awal. Seluruh migrasi 01–25 harus diuji berurutan pada proyek Supabase staging kosong. Pastikan trigger finansial dari migrasi 21 tetap terpasang setelah migrasi 24, lalu jalankan seluruh test SQL dan `supabase/ops/post_deploy_checks.sql`.

**Batasan yang masih terbuka:** layar Admin pada versi ini hanya menampilkan kasus dana tertahan. Belum tersedia alur transaksi lengkap untuk keputusan Admin (refund Customer / kompensasi Talent / perpanjangan penahanan), jurnal keuangan, dan rekonsiliasi provider. Karena itu dana tertahan tidak boleh dipindahkan atau dicairkan berdasarkan layar ini.


## 7. Migration 26 — keputusan Admin atas dana tertahan

`26_admin_resolution_customer_cancellation_holds.sql` menyediakan RPC Admin-only untuk refund Customer, kompensasi Talent 100% tanpa komisi YUKU, atau perpanjangan hold. Refund hanya boleh dicatat setelah transaksi provider/bank benar-benar berhasil dan referensinya tersedia. Migration ini belum diuji pada Supabase; jangan jalankan di produksi. UI Admin juga belum dihubungkan ke RPC ini.


## Migration 29
- `29_qris_ledger_failed_payment_recovery.sql`: memperbaiki trigger ledger agar persetujuan QRIS dari pembayaran lama berstatus `failed` tetap membuat komisi, saldo Talent, dan referral secara idempoten.
- Belum dieksekusi pada Supabase staging; wajib diuji sebelum rilis.

## Payment route lock

Migration 30 (`30_payment_route_lock_xendit_qris.sql`) must be applied after migrations 27–29. It enforces one active payment route per booking between Xendit and manual QRIS.
