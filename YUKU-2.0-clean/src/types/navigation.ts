/**
 * YUKU Navigation & Route Types
 */

export type AppRoute =
  | '/'
  | '/talent'
  | '/talent/:id'
  | '/cara-kerja'
  | '/daftar-talent'
  | '/dashboard-talent'
  | '/riwayat-booking'
  | '/admin'
  | '/tentang'
  | '/faq'
  | '/bantuan'
  | '/login'
  | '/register'
  | '/ganti-sandi'
  | '/lupa-sandi'
  | '/reset-sandi'
  | '/verifikasi-ktp'
  | '/syarat-ketentuan'
  | '/kebijakan-privasi';

export interface NavItem {
  label: string;
  href: AppRoute;
  isAction?: boolean;
}

export interface BreadcrumbItem {
  label: string;
  href?: AppRoute | string;
}
