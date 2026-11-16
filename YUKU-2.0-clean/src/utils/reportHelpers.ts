import { ReportCategory, ReportStatus } from '../types/database';

export const REPORT_CATEGORY_OPTIONS: { value: ReportCategory; label: string; description: string }[] = [
  {
    value: 'dating_sexual_solicitation',
    label: 'Permintaan Kencan / Pelecehan Seksual',
    description: 'Ajakan kencan, rayuan sensual, atau pelanggaran aturan non-dating YUKU.',
  },
  {
    value: 'safety_concern',
    label: 'Masalah Keselamatan / Lokasi Tertutup',
    description: 'Mengajak bertemu di tempat tertutup, hotel, kediaman pribadi, atau ancaman keselamatan.',
  },
  {
    value: 'unethical_behavior',
    label: 'Perilaku Tidak Etis / Melanggar Aturan',
    description: 'Ucapan kasar, intimidasi, atau perilaku tidak profesional selama sesi.',
  },
  {
    value: 'no_show',
    label: 'Tidak Hadir (No-Show)',
    description: 'Pihak terkait tidak hadir di lokasi pertemuan atau tidak merespons saat jadwal dimulai.',
  },
  {
    value: 'service_dispute',
    label: 'Sengketa Layanan / Pembayaran',
    description: 'Ketidaksesuaian durasi, aktivitas, atau kendala penyelesaian transaksi.',
  },
  {
    value: 'other',
    label: 'Lainnya',
    description: 'Kendala atau pelanggaran lain yang perlu ditinjau tim keamanan YUKU.',
  },
];

export function getReportCategoryLabel(category: string): string {
  const found = REPORT_CATEGORY_OPTIONS.find((opt) => opt.value === category);
  return found ? found.label : category;
}

export function getReportStatusMeta(status: ReportStatus | string): {
  label: string;
  badgeClass: string;
} {
  switch (status) {
    case 'open':
      return {
        label: 'Menunggu Tinjauan',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
      };
    case 'investigating':
      return {
        label: 'Sedang Diinvestigasi',
        badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
      };
    case 'resolved_action_taken':
      return {
        label: 'Ditindaklanjuti',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      };
    case 'dismissed':
      return {
        label: 'Ditutup',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
      };
    default:
      return {
        label: status,
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
      };
  }
}
