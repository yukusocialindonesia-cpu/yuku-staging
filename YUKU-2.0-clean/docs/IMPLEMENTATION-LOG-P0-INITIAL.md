# YUKU 2.0 — Catatan Implementasi P0 (Putaran Awal)

Tanggal: 13 November 2026

## Perubahan kode

1. `src/lib/supabase.ts`: menghapus URL/key Supabase proyek bawaan. Build tanpa environment variables kini menggunakan placeholder domain `.invalid`, menandai konfigurasi belum tersedia, dan `checkSupabaseConnection()` mengembalikan `CONFIG_ERROR` tanpa mencoba koneksi ke proyek lain.
2. `supabase/migrations/18_security_and_payout_guardrails.sql`:
   - Signup hanya dapat membuat role `customer` atau `talent`; metadata `admin` dan email tertentu tidak dapat memberi hak Admin.
   - Profil Customer baru tidak lagi diberi gender/kota rekaan; kolom dibuat nullable.
   - Chat hanya mengizinkan UPDATE kolom `is_read`; trigger melarang perubahan isi/identitas pesan dan hanya mengizinkan transisi unread -> read oleh penerima.
   - Payout mendukung provider `manual`; status harus melalui `requested -> processing -> completed_provider_confirmed`, dan penyelesaian memerlukan referensi transfer.
3. `src/pages/TalentDashboardPage.tsx`: menghapus provider `simulation`, menggunakan provider `manual` sampai integrasi payout nyata tersedia, dan memakai UUID kriptografis untuk nomor permintaan.
4. `src/pages/AdminPage.tsx`: Admin memulai proses payout terlebih dahulu, lalu mengonfirmasi selesai dengan referensi transfer.
5. `supabase/migrations/19_create_booking_rpc.sql`: menambahkan RPC `create_booking` yang sebelumnya dipanggil frontend tetapi tidak ditemukan pada migrasi 01-17.
6. `supabase/migrations/README.md`: memperjelas bahwa FULL_MIGRATION_V20.sql bukan pengganti seluruh migrasi 01-19.

## Batas verifikasi

- Migrasi SQL belum dijalankan pada PostgreSQL/Supabase staging.
- Belum ada pengujian RLS/runtime dengan akun Customer, Talent, dan Admin.
- Belum ada payment gateway atau payout provider API yang terintegrasi. Payout `manual` hanya merekam proses operasional manual dan referensi transfer; bukan transfer otomatis.
- RPC booking membuat status `pending_payment` saja; belum membuat invoice/checkout atau menerima pembayaran.
- Belum ada klaim production-ready.

7. `provision_admin_user(UUID)` ditambahkan sebagai provisioning manual khusus pemilik database melalui SQL Editor tepercaya; tidak diekspos kepada role aplikasi. Role Admin yang sudah ada sebelum migrasi 18 tetap harus diaudit secara manual sebelum database dibuka ke publik.
8. `supabase/migrations/20_immediate_escrow_release_policy.sql`: menyelaraskan escrow ke keputusan bisnis YUKU (0 jam setelah selesai, kecuali sengketa). Fungsi release tetap membutuhkan pemanggilan terjadwal oleh backend/service_role; scheduler belum dikonfigurasi.
9. `supabase/ops/schedule_escrow_release.sql` disiapkan untuk menjadwalkan pemeriksaan escrow setiap menit melalui `pg_cron`. File ini belum dieksekusi; scheduler belum aktif.


## Pemeriksaan manual wajib sebelum staging dibuka

Jalankan query berikut di SQL Editor setelah migrasi 18 pada staging untuk meninjau akun yang sudah berstatus Admin akibat versi lama. Jangan otomatis menurunkan role akun tanpa verifikasi pemilik:

```sql
SELECT id, email, created_at
FROM public.users
WHERE role = 'admin'::public.user_role_type
ORDER BY created_at ASC;
```

Promosikan akun Admin yang sah hanya dengan perintah terkontrol berikut dari SQL Editor sebagai database owner:

```sql
SELECT public.provision_admin_user('UUID-AKUN-YANG-SUDAH-DIVERIFIKASI'::uuid);
```

Jangan pernah menjalankan contoh UUID placeholder. Verifikasi email dan pemilik akun terlebih dahulu.
10. `supabase/migrations/21_booking_completion_and_actor_guards.sql`: membatasi transisi status berdasarkan pihak yang berwenang, menambahkan konfirmasi selesai dua pihak, dan mengubah laporan booking yang valid menjadi dispute hold. Frontend Talent dan Customer diarahkan ke RPC konfirmasi.
11. `supabase/migrations/21_booking_completion_and_actor_guards.sql` juga menyimpan status ledger sebelum sengketa dan memulihkannya setelah seluruh laporan aktif diselesaikan; payout yang terhubung ke earning dalam dispute hold tidak dapat dikonfirmasi selesai.
12. `supabase/FULL_MIGRATION_V20.sql` dinonaktifkan sebagai file peringatan saja. Isi lama disimpan di `supabase/legacy/FULL_MIGRATION_V20_PARTIAL_ARCHIVE.sql` agar tidak keliru dijalankan sebagai instalasi database lengkap.

## Hasil verifikasi lokal

- Pemeriksaan sintaks TypeScript melalui `transpileModule`: PASS untuk file TS/TSX yang diubah.
- Pemeriksaan statis pola keamanan: PASS untuk fallback Supabase, signup Admin, grant UPDATE chat, payout simulation, RPC booking, escrow, dan konfirmasi dua pihak.
- `npm install`: TIMEOUT dua kali pada lingkungan kerja ini; dependency tidak tersedia.
- `tsc --noEmit`: NOT TESTED karena `vite/client` tidak tersedia tanpa dependency install.
- PostgreSQL/Supabase runtime: NOT TESTED; belum ada database staging yang terhubung.
- Browser/E2E: NOT TESTED.
13. `supabase/migrations/22_talent_cancellation_and_refund_workflow.sql`: pembatalan booking berbayar oleh Talent kini membuat refund request penuh melalui RPC. Dashboard Admin memperoleh antrean refund dan mewajibkan referensi bank/provider untuk menandai refund selesai. Refund tetap manual sampai integrasi gateway tersedia.
14. Dashboard Talent menggunakan RPC pembatalan, bukan update status langsung; penghasilan terkait dibalik oleh trigger ledger dan refund tercatat untuk proses Finance.
15. Home layout tidak lagi menampilkan komponen notifikasi demo; data konten statis dipindah dari nama file `demoData.ts` ke `contentData.ts`.

16. `supabase/migrations/19_create_booking_rpc.sql` juga membuat server-side feature flag `payment_checkout` dalam keadaan OFF secara default dan membatasi satu booking pending payment aktif per Customer. Frontend memiliki flag `VITE_PAYMENT_CHECKOUT_ENABLED=false`; checkout tidak dapat dibuka hanya dengan mengubah flag frontend karena database tetap menolak.
17. `TalentDetailPage.tsx` kini menampilkan tarif yang sesuai mode online/offline dan override tarif layanan; tombol booking dinonaktifkan sampai checkout gateway siap.
