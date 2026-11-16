import { TalentAvailabilityRow } from '../types/database';

export const DAY_OF_WEEK_OPTIONS: { value: number; label: string; shortLabel: string }[] = [
  { value: 1, label: 'Senin', shortLabel: 'Sen' },
  { value: 2, label: 'Selasa', shortLabel: 'Sel' },
  { value: 3, label: 'Rabu', shortLabel: 'Rab' },
  { value: 4, label: 'Kamis', shortLabel: 'Kam' },
  { value: 5, label: 'Jumat', shortLabel: 'Jum' },
  { value: 6, label: 'Sabtu', shortLabel: 'Sab' },
  { value: 0, label: 'Minggu', shortLabel: 'Min' },
];

export function getDayOfWeekLabel(day: number | null): string {
  if (day === null || day === undefined) return '-';
  const found = DAY_OF_WEEK_OPTIONS.find((d) => d.value === day);
  return found ? found.label : `Hari ${day}`;
}

export function formatTimeShort(timeStr: string): string {
  if (!timeStr) return '';
  return timeStr.slice(0, 5);
}

function toMinutes(timeStr: string): number {
  const [hStr, mStr] = timeStr.slice(0, 5).split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export interface AvailabilityCheckResult {
  hasSchedule: boolean;
  isAvailable: boolean;
  reason?: string;
}

export function checkBookingAgainstAvailability(
  slots: TalentAvailabilityRow[],
  bookingDate: string,
  bookingTime: string,
  durationHours: number
): AvailabilityCheckResult {
  if (!slots || slots.length === 0) {
    return { hasSchedule: false, isAvailable: true };
  }

  const parsedDate = new Date(`${bookingDate}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return { hasSchedule: true, isAvailable: false, reason: 'Tanggal pertemuan tidak valid.' };
  }

  const startMin = toMinutes(bookingTime);
  const endMin = startMin + durationHours * 60;

  // 1. Check specific_date rules for this exact date
  const specificDateSlots = slots.filter((s) => s.specific_date === bookingDate);
  if (specificDateSlots.length > 0) {
    const blockedAllDayOrRange = specificDateSlots.some(
      (s) => !s.is_available && startMin < toMinutes(s.end_time) && endMin > toMinutes(s.start_time)
    );
    const availableSpecific = specificDateSlots.filter((s) => s.is_available);

    if (availableSpecific.length === 0 || blockedAllDayOrRange) {
      return {
        hasSchedule: true,
        isAvailable: false,
        reason: 'Talent menandai tanggal atau jam ini tidak tersedia (libur).',
      };
    }

    const fitsSpecific = availableSpecific.some(
      (s) => toMinutes(s.start_time) <= startMin && endMin <= toMinutes(s.end_time)
    );
    if (!fitsSpecific) {
      const windows = availableSpecific
        .map((s) => `${formatTimeShort(s.start_time)}–${formatTimeShort(s.end_time)}`)
        .join(', ');
      return {
        hasSchedule: true,
        isAvailable: false,
        reason: `Pada tanggal ini Talent hanya tersedia pukul ${windows} WIB.`,
      };
    }

    return { hasSchedule: true, isAvailable: true };
  }

  // 2. Fallback to recurring weekly schedule (day_of_week)
  const weeklySlots = slots.filter((s) => s.day_of_week !== null && s.specific_date === null);
  if (weeklySlots.length === 0) {
    // Talent only added future specific_date schedules; allow or inform?
    const hasAnyAvailableSpecific = slots.some((s) => s.specific_date && s.is_available);
    if (hasAnyAvailableSpecific) {
      return {
        hasSchedule: true,
        isAvailable: false,
        reason: 'Talent hanya membuka pemesanan pada tanggal khusus yang tertera di profil.',
      };
    }
    return { hasSchedule: false, isAvailable: true };
  }

  const dayOfWeek = parsedDate.getDay();
  const matchingDayAvailable = weeklySlots.filter(
    (s) => s.day_of_week === dayOfWeek && s.is_available
  );

  if (matchingDayAvailable.length === 0) {
    return {
      hasSchedule: true,
      isAvailable: false,
      reason: `Talent tidak membuka jadwal rutin pada hari ${getDayOfWeekLabel(dayOfWeek)}.`,
    };
  }

  const fitsWeekly = matchingDayAvailable.some(
    (s) => toMinutes(s.start_time) <= startMin && endMin <= toMinutes(s.end_time)
  );

  if (!fitsWeekly) {
    const windows = matchingDayAvailable
      .map((s) => `${formatTimeShort(s.start_time)}–${formatTimeShort(s.end_time)}`)
      .join(', ');
    return {
      hasSchedule: true,
      isAvailable: false,
      reason: `Pada hari ${getDayOfWeekLabel(dayOfWeek)}, Talent tersedia pukul ${windows} WIB.`,
    };
  }

  return { hasSchedule: true, isAvailable: true };
}
