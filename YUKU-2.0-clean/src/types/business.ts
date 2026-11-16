/**
 * YUKU Business Rules & Specifications
 * Spesifikasi formal untuk Tahap 1 sebagai acuan pengembangan backend & database selanjutnya.
 */

export interface BusinessRulesSpec {
  /** Komisi platform YUKU: 20% dari nilai booking yang memenuhi syarat */
  platformCommissionRate: number;
  /** Bagian Talent: 80% dari nilai booking (perhitungan dilakukan sebelum potongan pajak dan biaya transfer pihak ketiga sesuai ketentuan) */
  talentShareRate: number;
  /** Komisi referral: 10% dari komisi YUKU, bukan 10% dari total transaksi */
  referralCommissionRate: number;
  /** Masa referral: selamanya selama Talent yang diundang memenuhi ketentuan */
  referralDuration: 'LIFETIME';
  /** Referral hanya 1 tingkat */
  referralLevels: number;
  /** Minimum pencairan saldo: Rp 100.000 */
  minPayoutAmount: number;
  /** Metode pembayaran utama: Melalui platform YUKU */
  primaryPaymentMethod: 'PLATFORM_ESCROW';
  /** Batas usia minimum: 18 tahun untuk semua pengguna */
  minUserAge: number;
  /** Kebijakan etika: YUKU bukan aplikasi kencan dan bukan penyedia layanan seksual */
  strictlySocialOnly: boolean;
  /** Model peluncuran bertahap */
  phasedRollout: boolean;
}
