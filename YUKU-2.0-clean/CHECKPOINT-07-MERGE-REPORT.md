# YUKU 2.0 — Checkpoint 07 merged candidate

Status: **KANDIDAT HASIL PENGGABUNGAN STATIS — BELUM SIAP PRODUKSI**

Pembaruan terakhir: Revisi 04, migration 29 (perbaikan ledger QRIS untuk pembayaran lama berstatus failed).

## Sumber
- Checkpoint 06 financial-hold safety sebagai basis utama.
- Claude remediation checkpoint 05 untuk hardening keamanan terpilih.

## Keputusan merge
1. Dipertahankan `BookingHistoryPage.tsx` dari Checkpoint 06 karena memakai RPC `request_customer_cancellation()`. Versi Claude melakukan update langsung pada tabel bookings dan tidak dipakai.
2. Dipakai migration 09 dari Claude karena menutup pemberian role Admin lewat metadata/email saat signup.
3. Dipakai test Stage B Claude dan ditambahkan Stage C security test.
4. Ditambahkan Edge Functions `create-checkout` dan `xendit-webhook` dari Claude sebagai fondasi integrasi Xendit, belum teruji sandbox.
5. Hardening Claude dipindahkan menjadi migration 25 agar tidak bentrok dengan migration 23 dan 24 milik Checkpoint 06.
6. `AdminPage.tsx` dipertahankan dari Checkpoint 06 karena versi Claude menghilangkan tampilan antrean dana tertahan.

## Belum selesai / jangan dianggap lulus
- Admin belum memiliki aksi aman untuk memutuskan alokasi dana tertahan dan membuat jurnal keuangan.
- Edge Functions Xendit belum diuji di sandbox; verifikasi idempotensi, callback replay, nominal, dan rekonsiliasi masih wajib.
- Seluruh SQL migrations belum dieksekusi pada Supabase staging.
- Build/typecheck aplikasi belum dijalankan dalam lingkungan Node dengan dependency terpasang.
- Test Stage A/B/C dan post-deploy checks belum dijalankan.
- Konfigurasi secret Supabase/Xendit/Vercel belum diverifikasi.

## Langkah wajib sebelum produksi
1. Buat proyek Supabase staging kosong.
2. Terapkan migration 01–25 secara berurutan.
3. Jalankan Stage A, B, C dan post-deploy checks; semua harus PASS.
4. Jalankan `npm ci`, `npm run lint`, dan `npm run build`.
5. Uji checkout dan webhook Xendit di sandbox dengan callback duplikat dan nominal tidak cocok.
6. Selesaikan alur keputusan Admin + jurnal keuangan dan uji payout/refund end-to-end.


## Tambahan Migration 26 — rancangan keputusan Admin dana tertahan

Ditambahkan `26_admin_resolution_customer_cancellation_holds.sql` untuk menyediakan RPC Admin-only dengan tiga keputusan: `refund_customer`, `compensate_talent`, dan `extend_hold`. Kompensasi Talent menggunakan 100% nilai dana tertahan tanpa komisi YUKU 20% dan tanpa referral reward; biaya transfer dan potongan pajak yang sudah tercatat pada earning tetap diperhitungkan. Refund mengharuskan refund provider benar-benar dilakukan di luar aplikasi dan referensinya dicatat. Perpanjangan hold tetap berstatus pending.

**Status migration 26: draft hasil inspeksi statis, BELUM dieksekusi atau divalidasi di PostgreSQL/Supabase.** UI Admin belum dihubungkan ke RPC ini. Sebelum dipakai, wajib review SQL oleh developer, tes semua cabang termasuk duplikasi, payout race, refund parsial, dan verifikasi trigger/ledger di staging.


## Paket terpadu
File `YUKU-2.0-CHECKPOINT-07-LENGKAP-GABUNGAN.zip` adalah arsip tunggal yang menggabungkan seluruh isi kandidat finansial dan pembaruan Admin Actions terbaru. Tidak perlu mengekstrak atau menggabungkan checkpoint sebelumnya secara terpisah.

## Revisi 01 — kompensasi Talent
Pemeriksaan lanjutan menemukan perhitungan kompensasi sebelumnya masih mengurangi tax_withheld dan transfer_fee dari nominal dana tertahan. Ini tidak sesuai dengan keputusan bisnis bahwa seluruh dana tertahan menjadi kompensasi Talent tanpa potongan komisi YUKU. Migration 26 direvisi agar `net_earning = retained_amount`, dengan `tax_withheld = 0` dan `transfer_fee = 0` untuk entri kompensasi ini. Perlakuan pajak wajib ditinjau terpisah bersama penasihat pajak sebelum produksi; revisi ini tidak menyatakan bahwa kewajiban pajak hukum dihapus.

## Revisi 02 — masa penahanan
Menambahkan `admin_hold_until` agar perpanjangan penahanan terlihat pada antrean Admin; tanggal aktif dibersihkan saat kasus diselesaikan. Riwayat keputusan kini dapat dibaca oleh Admin melalui policy RLS SELECT khusus. Belum diverifikasi pada database Supabase staging.


## Revisi 04 — pemulihan ledger QRIS dari pembayaran gagal
Inspeksi kode menemukan trigger ledger sebelumnya hanya membuat ledger saat status lama `pending`. Admin QRIS juga mengizinkan verifikasi baris pembayaran lama berstatus `failed`, sehingga kasus tersebut dapat disahkan tanpa membuat ledger keuangan. Ditambahkan migration 29 untuk menangani transisi `pending` maupun `failed`, menghindari akses `OLD` pada INSERT, serta membuat setiap baris ledger secara idempoten tanpa menghentikan perbaikan baris ledger lain yang belum ada.

**Status migration 29: perubahan kode statis; belum dijalankan atau diuji di PostgreSQL/Supabase staging.**
