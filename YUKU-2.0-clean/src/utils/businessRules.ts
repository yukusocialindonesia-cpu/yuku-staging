import { BusinessRulesSpec } from '../types/business';

/**
 * ATURAN BISNIS RESMI YUKU (TAHAP 1)
 * Acuan spesifikasi operasional untuk tahap implementasi backend dan database.
 */
export const YUKU_BUSINESS_RULES: BusinessRulesSpec = {
  platformCommissionRate: 0.20, // 20% komisi platform
  talentShareRate: 0.80,        // 80% bagian talent
  referralCommissionRate: 0.10, // 10% dari nilai komisi YUKU
  referralDuration: 'LIFETIME', // Selamanya selama syarat terpenuhi
  referralLevels: 1,            // Hanya satu tingkat (bukan multi-level)
  minPayoutAmount: 100000,      // Rp 100.000 batas minimum pencairan
  primaryPaymentMethod: 'PLATFORM_ESCROW', // Pembayaran aman melalui platform YUKU
  minUserAge: 18,               // Usia minimal 18 tahun
  strictlySocialOnly: true,     // Bukan aplikasi kencan & bukan layanan seksual
  phasedRollout: true,          // Peluncuran bertahap
};

export const CORE_VALUES = [
  {
    title: 'Komitmen Keamanan & Verifikasi KTP 18+',
    desc: 'YUKU mensyaratkan verifikasi identitas resmi (e-KTP) dan batas usia minimal 18 tahun bagi Customer maupun Talent demi keamanan interaksi.',
  },
  {
    title: 'Bukan Kencan, Murni Sosial',
    desc: 'YUKU berfokus pada pertemanan sehat, eksplorasi hobi, networking, dan teman berkegiatan positif.',
  },
  {
    title: 'Transparansi Finansial & Referral',
    desc: 'Talent menerima 80% dari nilai booking sebelum potongan pajak dan biaya transfer pihak ketiga. Komisi referral sebesar 10% dari komisi YUKU, berlaku satu tingkat selamanya untuk transaksi valid, selesai, dan terverifikasi. Referral tidak berlaku untuk transaksi palsu, pembatalan, refund, dan self-referral.',
  },
  {
    title: 'Sistem Perlindungan Escrow',
    desc: 'Pembayaran booking yang terkonfirmasi ditahan aman oleh sistem escrow platform dan baru diteruskan kepada Talent setelah sesi selesai.',
  },
];
