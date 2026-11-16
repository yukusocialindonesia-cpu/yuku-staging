# YUKU 2.0 — CHECKPOINT 07 LENGKAP (SATU PAKET)

## Gunakan file ZIP ini sebagai satu-satunya paket kerja Checkpoint 07
Paket ini menggabungkan:
- basis aplikasi dan perubahan finansial dari Checkpoint 06;
- hardening keamanan terpilih dari remediation Claude;
- migrasi 23–25 untuk refund, penahanan dana, dan hardening;
- Migration 26 (draft) untuk keputusan Admin atas dana tertahan;
- pembaruan halaman Admin untuk tiga tindakan: refund Customer, kompensasi Talent, dan perpanjangan penahanan;
- laporan merge dan catatan status Admin.

Jangan menggabungkan ZIP ini secara manual dengan ZIP checkpoint sebelumnya. Jangan menimpa file satu per satu dari paket lama. ZIP ini sudah berisi pohon proyek lengkap hasil penggabungan saat ini.

## Aturan kompensasi yang digunakan
Jika Admin memutuskan sisa dana tertahan diberikan sebagai kompensasi, seluruh nominal dana tertahan menjadi kompensasi kotor Talent. YUKU tidak mengambil komisi 20% tambahan dan tidak ada referral reward atas nominal kompensasi tersebut.

## Status teknis
**KANDIDAT TERPADU — BELUM SIAP PRODUKSI.**
- Integritas arsip ZIP sudah diperiksa.
- Migration 26 dan koneksi UI Admin masih perlu diuji pada Supabase staging.
- Seluruh migration 01–26 belum dibuktikan berhasil berjalan berurutan pada database staging kosong.
- Build, typecheck, tes RLS/RPC, dan post-deploy checks belum dinyatakan lulus.
- Checkout dan webhook Xendit belum diuji end-to-end di sandbox.
- Jangan deploy atau jalankan migrasi pada database produksi.

## Cara kerja berikutnya
Gunakan folder `YUKU-2.0` sebagai satu proyek. Simpan ZIP ini sebagai checkpoint terpadu terbaru. Untuk perubahan berikutnya, buat satu ZIP lengkap versi baru, bukan paket-paket potongan.

## Catatan revisi 01
Perhitungan saldo kompensasi Talent telah diperbaiki agar seluruh nominal dana tertahan menjadi net earning Talent; tidak ada komisi platform, referral, atau biaya transfer yang dipotong dari kompensasi. Pajak dan kewajiban hukum tetap perlu ditinjau terpisah sebelum peluncuran.

## Revisi 02 — tampilan masa penahanan dan riwayat keputusan
Migration 26 kini menyimpan batas penahanan aktif pada `customer_cancellation_cases.admin_hold_until`, mengosongkannya saat kasus selesai, dan memberikan hak baca SELECT khusus Admin pada tabel riwayat keputusan. Tabel antrean Admin menampilkan batas penahanan. Ini tetap memerlukan pengujian RLS dan SQL di Supabase staging.

## Revisi 03 — jurnal refund
Jalur keputusan refund Admin kini membuat jurnal pembalikan earning Talent yang terhubung ke refund, serta menolkan catatan komisi dan referral pada booking tersebut. Baca `docs/CHECKPOINT-07-REVISION-03-AUDIT.md`. Status tetap belum siap produksi.
