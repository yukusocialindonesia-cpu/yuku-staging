# YUKU 2.0 — Paket Gabungan untuk Audit Claude

## Isi paket
1. `../` (folder proyek `YUKU-2.0`) adalah basis utama terbaru: Checkpoint 07 Revisi 03 beserta perubahan QRIS pada handoff sebelumnya.
2. `docs/claude-checkpoint-05-reference/ORIGINAL-CLAUDE-REMEDIATION-CHECKPOINT-05.zip` adalah ZIP asli hasil Claude, tidak diubah.
3. `docs/claude-checkpoint-05-reference/extracted-source/` adalah ekstraksi ZIP Claude untuk pembandingan. File ini sengaja dipisah agar versi Claude yang lebih lama tidak menimpa implementasi yang lebih baru secara diam-diam.

## Aturan penggabungan
- Basis utama tetap Checkpoint 07 Revisi 03; jangan menggantinya dengan Checkpoint 05.
- Perubahan Claude harus ditinjau dan di-port secara selektif ke basis utama. Jangan menyalin seluruh snapshot Claude menimpa file utama.
- Konflik paling penting ada di file-file berikut (versi Claude berbeda dari basis utama):
- `package.json`
- `vite.config.ts`
- `.env.example`
- `tsconfig.json`
- `README.md`
- `src/vite-env.d.ts`
- `supabase/migrations/README.md`
- `src/pages/TalentDetailPage.tsx`
- `src/pages/VerifyKtpPage.tsx`
- `src/pages/TalentDashboardPage.tsx`
- `src/pages/AdminPage.tsx`
- `src/pages/BookingHistoryPage.tsx`
- `src/types/database.ts`
- `src/components/home/SafetySection.tsx`

## File Claude yang tidak ada di basis utama
- `supabase/migrations/23_prelaunch_hardening.sql`

## Pemeriksaan
- ZIP sumber utama/handoff dan ZIP Claude lolos pemeriksaan integritas arsip (`testzip`).
- Ini adalah paket sumber lengkap untuk rekonsiliasi, bukan pernyataan bahwa semua perubahan Claude sudah terintegrasi secara semantik atau bahwa aplikasi siap produksi.
- Build, migrasi database, RLS, storage policies, dan transaksi QRIS tetap wajib diuji.
