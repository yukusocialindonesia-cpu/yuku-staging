# YUKU 2.0 — Checkpoint 07 Revisi 03 Audit

Tanggal: 13 November 2026

## Fokus koreksi

Migration 26 sebelumnya menyelesaikan refund dana tertahan, tetapi belum menyelesaikan seluruh jurnal pembalikan keuangan ketika keputusan Admin adalah `refund_customer`.

## Perbaikan pada Migration 26

1. ID refund yang baru dicatat disimpan untuk menghubungkan jurnal pembalikan ke refund yang benar.
2. Jika earning Talent ditemukan, fungsi mengunci baris earning, menolak proses bila sudah dialokasikan/dibayarkan, lalu membuat baris `financial_adjustments_reversals` dengan referensi refund dan earning asal.
3. Earning Talent ditandai `refund_adjusted` setelah jurnal pembalikan dibuat.
4. Catatan `commission_records` untuk booking yang di-refund dinolkan pada komisi YUKU, bagian Talent, referral reserve, dan pendapatan bersih platform.
5. Referral reward tetap dibatalkan.

## Batasan dan status pengujian

- ZIP dan struktur file dapat diperiksa secara lokal.
- Pemeriksaan statis memastikan fungsi menyimpan `refund_id`, menulis jurnal reversal, dan menolkan komisi pada jalur refund.
- Build/typecheck belum dijalankan karena dependensi tidak tersedia di lingkungan audit. Proyek memiliki `bun.lock`; `npm install --offline` gagal karena paket tidak tersedia dalam cache. Gunakan Bun sesuai lockfile atau siapkan instalasi npm online sebelum build.
- SQL belum dieksekusi pada PostgreSQL/Supabase. Pemeriksaan statis bukan pengganti eksekusi SQL.
- RLS, RPC, migrasi 01–26 berurutan, serta skenario refund/kompensasi/perpanjangan wajib diuji pada Supabase staging.
- Xendit checkout dan webhook tetap wajib diuji end-to-end di sandbox.

## Keputusan rilis

**Kandidat pengembangan — belum siap produksi.** Jangan jalankan migrasi pada database produksi dan jangan deploy sebelum seluruh pengujian staging, build, typecheck, dan pembayaran lulus.


## Implementasi QRIS manual (pekerjaan lanjutan)

- Migration 27 mendaftarkan provider `manual_qris` dalam migrasi terpisah dari migrasi yang menggunakannya.
- Migration 28 menambahkan pengaturan QRIS, pengajuan bukti pembayaran, audit log, bucket privat bukti, bucket publik gambar QRIS, RPC Customer, dan RPC review Admin.
- Revisi keamanan alur bukti: hanya satu submission `pending_review` per booking; setelah ditolak Customer dapat mengirim bukti baru.
- `QrisCustomerPaymentPanel` ditambahkan ke Riwayat Booking Customer untuk menampilkan QRIS aktif, nominal, unggah bukti, dan status pemeriksaan.
- `QrisAdminPanel` ditambahkan ke panel Admin untuk mengganti/mengaktifkan QRIS dan memeriksa bukti pembayaran.
- Trigger ledger diperluas ke `AFTER INSERT OR UPDATE`; fungsi trigger lama memeriksa transisi ke `settled_held`, sehingga INSERT pending tidak membuat ledger dan UPDATE setelah verifikasi membuat ledger.
- Gambar awal yang diberikan pengguna disertakan di `docs/assets/QRIS-AWAL-UNTUK-ADMIN.jpg`. Admin harus mengunggahnya melalui tab QRIS setelah migrasi diterapkan. Pastikan merchant/NMID tersebut memang berada di bawah kendali bisnis sebelum mengaktifkan QRIS.

### Status pengujian QRIS

- Pemeriksaan sintaks transpile TypeScript untuk dua komponen QRIS dan dua halaman integrasi: PASS.
- Pemeriksaan tipe penuh TypeScript: BLOCKED karena dependency belum terpasang (`vite/client` tidak ditemukan).
- Build Vite: NOT RUN (dependency belum tersedia).
- Migrasi SQL pada Supabase staging: NOT RUN.
- Uji RLS/Storage lintas Customer dan Admin: NOT RUN.
- Uji transaksi QRIS nyata dan rekonsiliasi rekening merchant: NOT RUN.
- Belum layak disebut production-ready atau diaktifkan untuk transaksi nyata.
