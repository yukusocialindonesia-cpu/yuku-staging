# YUKU 2.0 — Real Friends. Real Moments.

Marketplace jasa pertemanan untuk pengalaman sosial online dan offline.

## Stack saat ini

- React 19 + TypeScript
- Vite 8
- Supabase (Auth, Postgres, Storage, Realtime)

> Proyek ini masih berupa aplikasi React + Vite. Migrasi ke Next.js belum dilakukan.
> Jangan menganggap proyek siap produksi sebelum seluruh migrasi database dan pengujian staging lulus.

## Menjalankan lokal

1. Gunakan Node.js 22 atau versi yang kompatibel dengan Vite 8.
2. Jalankan `npm install`.
3. Salin `.env.example` menjadi `.env.local`.
4. Isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` (atau `VITE_SUPABASE_PUBLISHABLE_KEY`) dari proyek Supabase milik YUKU.
5. Jalankan `npm run dev`.

Tanpa konfigurasi Supabase, aplikasi sengaja tidak akan tersambung ke proyek default apa pun.

## Database

Baca `supabase/migrations/README.md`. Migrasi harus diterapkan berurutan pada proyek staging terlebih dahulu. `supabase/FULL_MIGRATION_V20.sql` adalah file pensiun berisi peringatan saja; jangan dieksekusi.

## Status kesiapan

Belum production-ready. Payment gateway, webhook, dan payout provider otomatis belum terintegrasi atau diuji pada lingkungan staging.

## Batas integrasi keuangan saat ini

- Payout dan refund masih menggunakan proses manual dengan pencatatan referensi transfer; API provider belum dihubungkan.
- Payment gateway, pembuatan invoice/checkout, dan verifikasi webhook belum tersedia.
- Booking publik dinonaktifkan secara default (`VITE_PAYMENT_CHECKOUT_ENABLED=false`) sampai checkout dan webhook payment gateway dipasang serta diuji. Booking baru berstatus `pending_payment` sampai pembayaran terverifikasi.
- Refund pembatalan oleh Talent membuat permintaan refund penuh; proses pengembalian aktual tetap harus dilakukan Finance di provider/bank.
- Fondasi kebijakan pembatalan Customer tersedia pada migration 23: >24 jam refund 100%; 6–24 jam refund 50% dan sisa ditahan untuk Admin; <6 jam tanpa refund otomatis dan seluruh dana ditahan untuk peninjauan Admin. Migration ini belum memiliki layar Admin untuk keputusan/alokasi sisa dana dan belum diuji di staging. Refund provider tetap manual.


## Migration 24 safety note

Migration 24 prevents automatic full Talent earning reversal while Customer cancellation funds remain pending Admin review. It marks the related earning `disputed_hold`, which the existing payout validator excludes, and blocks cancellation if that earning has already been allocated or paid. Apply only in staging after review; this SQL has not been executed or integration-tested. The Admin decision ledger and actual provider refund/payout workflow remain unfinished.
