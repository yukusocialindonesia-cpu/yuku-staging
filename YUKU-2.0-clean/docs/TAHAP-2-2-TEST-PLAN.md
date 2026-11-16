# DOKUMEN RENCANA PENGUJIAN DATABASE SUPABASE YUKU (TAHAP A & B SECURITY REMEDIATION VERSION 20)

**Produk**: YUKU — Social Experience & Paid Companionship Marketplace  
**Tagline**: *Real Friends. Real Moments.*  
**Dokumen**: Test Plan & SQL Test Scripts untuk Database Staging Supabase  
**Tanggal**: November 2026  

---

## 1. STATUS PENGUJIAN & VERIFIKASI RESMI

- **Audit statis**: selesai
- **SQL test**: ditulis, belum dijalankan
- **Runtime/staging**: belum diuji
- **Status Kompilasi Frontend**: dilaporkan AI Studio, belum diverifikasi independen
- **Status Linting Frontend**: dilaporkan AI Studio, belum diverifikasi independen

---

## 2. METODOLOGI & BATASAN PENGUJIAN

Dokumen ini memuat skrip SQL pengujian otomatis untuk menguji **18 skenario keamanan Tahap A (di `supabase/tests/stage_a_security_tests.sql`)** dan **10 skenario logika finansial/escrow Tahap B (di `supabase/tests/stage_b_security_tests.sql`)** mencakup proteksi kolom keamanan `users`, penyesuaian enum `ktp_status_type` dan `admin_review_ktp` (`FOR UPDATE`), hak akses tabel & kolom (REVOKE & COLUMN GRANTS), GRANT EXECUTE RLS helpers, Storage Buckets RLS Policies (`ktp-documents`), *state machine* booking, *integer currency precision*, alokasi pencairan parsial atomik FK-safe via `AFTER INSERT`, minimum payout Rp100.000, pengerasan **20 Fungsi `SECURITY DEFINER`** (`SET search_path = ''`), 14 Triggers, `GRANT EXECUTE` `process_escrow_release()` khusus `service_role`, dan 41 kebijakan RLS pada 22 tabel.

---

## 3. SKRIP TES KEAMANAN & LOGIKA TERPISAH

1. **`supabase/tests/stage_a_security_tests.sql`**: Menguji 18 skenario keamanan hak akses, role protection, identity verification, KTP admin review (`FOR UPDATE`), anon claim isolation, dan identity immutability.
2. **`supabase/tests/stage_b_security_tests.sql`**: Menguji 10 skenario kalkulasi booking pricing (20% YUKU fee, 80% Talent), exclusion constraint slot booking, pencatatan otomatis ledgers saat payment settled, minimum payout Rp100k, alokasi payout parsial atomik, settlement payout, anti self-referral, range rating review 1-5, dan dispute hold.
