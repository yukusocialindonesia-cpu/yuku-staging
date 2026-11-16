# DOKUMEN RENCANA IMPLEMENTASI SUPABASE (TAHAP A & B SECURITY REMEDIATION VERSION 20)

**Produk**: YUKU — Social Experience & Paid Companionship Marketplace  
**Tagline**: *Real Friends. Real Moments.*  
**Dokumen**: Rencana Implementasi Migrasi SQL, Storage Buckets, & Integrasi Backend Supabase (Tahap A & B Security Remediation)  
**Tanggal**: November 2026  

---

## 1. STATUS PENGUJIAN & VERIFIKASI RESMI

- **Audit statis**: selesai
- **SQL test**: ditulis, belum dijalankan
- **Runtime/staging**: belum diuji
- **Status Kompilasi Frontend**: dilaporkan AI Studio, belum diverifikasi independen
- **Status Linting Frontend**: dilaporkan AI Studio, belum diverifikasi independen

---

## 2. AUDIT & PRASYARAT KREATIF / TEKNIS

### 2.1. Audit Parameter Bisnis YUKU (Unchanged)
Rencana implementasi ini secara ketat mempertahankan seluruh parameter bisnis YUKU:
- **Bagi Hasil Talent**: 80% dari nilai booking (sebelum potongan pajak & biaya transfer bank).
- **Komisi Platform YUKU**: 20% dari nilai booking.
- **Komisi Referral**: 10% dari komisi YUKU (2% total nilai transaksi).
- **Relasi Referral**: Hanya 1 tingkat (*single-tier*), ditetapkan saat pendaftaran Talent, berlaku selamanya (*lifetime*) hanya untuk transaksi valid, selesai, dan terverifikasi. Transaksi palsu, pembatalan, refund, dan *self-referral* dilarang.
- **Minimum Pencairan Saldo Talent**: Rp100.000 (*payout request threshold*).
- **Batas Usia Minimum**: Wajib 18 tahun untuk seluruh pengguna (Customer & Talent) divalidasi di server side.
- **Presisi Mata Uang**: Menggunakan `BIGINT` (Integer Rupiah) tanpa pecahan sen melayang.

### 2.2. Audit Kompatibilitas Dependency Frontend & Environment
- **React**: `^19.0.1` (Vite SPA)
- **TypeScript**: `^7.0.2`
- **Client SDK**: `@supabase/supabase-js` v2.49+ terpasang di `src/lib/supabase.ts` dengan variabel environment `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY`.
- **Penyimpanan Kunci**: `SUPABASE_SERVICE_ROLE_KEY` dan `PAYMENT_PROVIDER_SECRET` **hanya disimpan di Environment Variables server/Edge Functions** dan **TIDAK BOLEH** dipaparkan di frontend.

---

## 3. DAFTAR KEBUTUHAN KONFIGURASI SUPABASE

1. **Project Setup**: Supabase PostgreSQL v15+.
2. **Supabase Auth Configuration**: Provider Email & Password. Custom claims `user_role` (`customer`, `talent`, `admin`).
3. **Supabase Storage Buckets**:
   - `ktp-documents`: Private bucket untuk dokumen KTP (RLS Denied Public, hanya Pemilik & Admin).
   - `avatars`: Public bucket untuk foto profil.
   - `portfolios`: Public bucket untuk galeri portofolio talent.
4. **Ekstensi PostgreSQL Wajib**: `uuid-ossp`, `btree_gist`, `pg_trgm`.

---

## 4. DAFTAR DAN URUTAN EKSEKUSI MIGRASI SQL

Migrasi SQL dibagi menjadi **6 berkas terurut (01 hingga 06)** mencakup tepat **22 Tabel (21 Tabel Core + 1 Tabel Alokasi)**, **22 Tabel RLS Aktif**, **41 Policies RLS Database**, **3 Storage Buckets**, **8 Storage RLS Policies**, **20 Functions**, dan **14 Triggers**:

```text
[01_initial_schema_and_enums.sql]
  ├── Tipe Enum Inklusif (ktp_status_type: unsubmitted, pending_review, verified, rejected), Extensions, Core Users (full_name), Private Identities (verified_at, verified_by_admin_id), Public Profiles (BIGINT) (5 Tabel)
  └── (users, user_identities, customer_profiles, talent_profiles, activity_categories)

[02_services_and_availability.sql]
  ├── Tabel Layanan (Custom BIGINT Rate) & Ketersediaan Jadwal Talent (2 Tabel)
  └── (talent_services, talent_availability)

[03_bookings_and_escrow_schema.sql]
  ├── Tabel Booking (Valid PostgreSQL Exclusion Constraint & Slot 15m), History, Payment, Refunds (4 Tabel)
  └── (bookings, booking_status_history, payments, refunds)

[04_financial_ledgers_and_referrals.sql]
  ├── Tabel Keuangan Ledger (BIGINT), Parsial Payout Allocations, Referral 10%, Payout Requests, & Reversals (7 Tabel)
  └── (commission_records, talent_earnings, referral_relationships, referral_rewards, payout_requests, payout_earnings_allocations, financial_adjustments_reversals)

[05_reviews_reports_and_system.sql]
  ├── Tabel Ulasan, Laporan Pelanggaran, Notifikasi, Audit Logs (4 Tabel)
  └── (reviews, reports_complaints, notifications, admin_audit_logs)

[06_triggers_functions_and_rls.sql]
  ├── 20 Helper/Trigger SECURITY DEFINER (SET search_path = '', REVOKE ALL, Minimal Grants tanpa avatar_url di users, GRANT EXECUTE RLS helpers, Auth Signup Trigger handle_new_user, Single Source of Truth Role get_current_user_role, Public Talent Visiblity is_talent_publicly_visible, RPC admin_review_ktp FOR UPDATE, Anti Role Elevation & Column Tampering, Separasi Check 18+ vs KTP Admin, Immutability Data Identitas Legal), Storage Buckets (ktp-documents, avatars, portfolios) & 8 Storage RLS Policies, 14 Triggers, Atomic FK-Safe 2-Stage Partial Payout Lock AFTER INSERT, Minimum Payout Rp100k, Escrow FOR UPDATE SKIP LOCKED, & 41 RLS Policies (22 Tabel RLS Aktif)
```

---

## 5. SKENARIO PENGUJIAN AKTUIL & STRATEGI ROLLBACK

Setiap migrasi dilengkapi berkas rollback dan test plan komprehensif di `docs/TAHAP-2-2-TEST-PLAN.md` serta 2 suite pengujian di `supabase/tests/`:
- `stage_a_security_tests.sql` (18 Test Cases Security & Identity Suite A)
- `stage_b_security_tests.sql` (10 Test Cases Logic, Escrow, Payout, Referral, & Rating Suite B)
