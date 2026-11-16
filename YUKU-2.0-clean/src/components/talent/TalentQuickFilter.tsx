import React, { useEffect, useState } from 'react';
import { CalendarCheck, MapPin, MessageCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { TalentProfile } from '../../types/talent';
import { TalentAvailabilityRow } from '../../types/database';

export type QuickFilter = 'all' | 'today' | 'offline' | 'online';

function toMinutes(timeStr: string): number {
  const [h, m] = timeStr.slice(0, 5).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function toLocalDateString(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Talent dianggap "tersedia hari ini" jika masih punya jam buka yang belum lewat.
 * Jadwal tanggal khusus menimpa jadwal mingguan. Talent tanpa jadwal tidak dihitung.
 */
export function isAvailableToday(slots: TalentAvailabilityRow[], now: Date = new Date()): boolean {
  const today = toLocalDateString(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const stillOpen = (s: TalentAvailabilityRow) => s.is_available && toMinutes(s.end_time) > nowMin;

  const specific = slots.filter((s) => s.specific_date === today);
  if (specific.length > 0) return specific.some(stillOpen);

  return slots
    .filter((s) => s.specific_date === null && s.day_of_week === now.getDay())
    .some(stillOpen);
}

/** Mengambil jadwal talent yang tampil, lalu menghitung siapa yang tersedia hari ini. */
export function useAvailableTodayIds(talents: TalentProfile[]) {
  const [availableTodayIds, setAvailableTodayIds] = useState<Set<string>>(new Set());
  const [todayReady, setTodayReady] = useState(false);
  const idsKey = talents.map((t) => t.id).join(',');

  useEffect(() => {
    if (talents.length === 0) {
      setAvailableTodayIds(new Set());
      setTodayReady(false);
      return;
    }
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('talent_availability')
        .select('talent_id, day_of_week, specific_date, start_time, end_time, is_available')
        .in('talent_id', talents.map((t) => t.id));

      if (!alive) return;
      if (error || !data) {
        // Jadwal gagal dimuat: chip "Hari ini" disembunyikan, filter lain tetap jalan.
        setTodayReady(false);
        return;
      }

      const byTalent = new Map<string, TalentAvailabilityRow[]>();
      (data as unknown as TalentAvailabilityRow[]).forEach((row) => {
        const list = byTalent.get(row.talent_id) ?? [];
        list.push(row);
        byTalent.set(row.talent_id, list);
      });

      const now = new Date();
      const result = new Set<string>();
      byTalent.forEach((slots, talentId) => {
        if (isAvailableToday(slots, now)) result.add(talentId);
      });
      setAvailableTodayIds(result);
      setTodayReady(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return { availableTodayIds, todayReady };
}

export function matchesQuickFilter(
  talent: TalentProfile,
  filter: QuickFilter,
  availableTodayIds: Set<string>
): boolean {
  switch (filter) {
    case 'today':
      return availableTodayIds.has(talent.id);
    case 'offline':
      return Boolean(talent.serviceMode?.includes('Offline'));
    case 'online':
      return Boolean(talent.serviceMode?.includes('Online'));
    default:
      return true;
  }
}

interface TalentQuickFilterProps {
  value: QuickFilter;
  onChange: (value: QuickFilter) => void;
  showToday: boolean;
}

export const TalentQuickFilter: React.FC<TalentQuickFilterProps> = ({ value, onChange, showToday }) => {
  const options: { id: QuickFilter; label: string; icon?: React.ReactNode }[] = [
    { id: 'all', label: 'Semua' },
    ...(showToday
      ? [{ id: 'today' as QuickFilter, label: 'Hari ini', icon: <CalendarCheck className="w-3.5 h-3.5" /> }]
      : []),
    { id: 'offline', label: 'Tatap muka', icon: <MapPin className="w-3.5 h-3.5" /> },
    { id: 'online', label: 'Online', icon: <MessageCircle className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter talent">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          aria-pressed={value === opt.id}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors cursor-pointer ${
            value === opt.id
              ? 'bg-purple-100 text-purple-800 border-purple-300'
              : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300'
          }`}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
};
