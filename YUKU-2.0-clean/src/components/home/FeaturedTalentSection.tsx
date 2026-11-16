import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, AlertCircle, RefreshCw, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { TalentProfile } from '../../types/talent';
import { TalentCard } from '../talent/TalentCard';
import {
  TalentQuickFilter,
  QuickFilter,
  matchesQuickFilter,
  useAvailableTodayIds,
} from '../talent/TalentQuickFilter';
import { fetchTalentsFromSupabase } from '../../utils/supabaseMarketplace';

interface FeaturedTalentSectionProps {
  onSelectTalent: (talentId: string) => void;
  onViewAllClick: () => void;
}

export const FeaturedTalentSection: React.FC<FeaturedTalentSectionProps> = ({
  onSelectTalent,
  onViewAllClick,
}) => {
  const [talents, setTalents] = useState<TalentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollByCards = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.8, 240), behavior: 'smooth' });
  };
  const { availableTodayIds, todayReady } = useAvailableTodayIds(talents);

  const loadFeaturedTalents = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchTalentsFromSupabase(10);
      setTalents(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memuat data Talent dari Supabase.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeaturedTalents();
  }, []);

  const visibleTalents = talents.filter((t) => matchesQuickFilter(t, quickFilter, availableTodayIds));

  return (
    <section className="py-10 md:py-14 bg-[#FAF8FC]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-5 gap-4">
          <div>
            <span className="text-xs font-bold text-purple-700 tracking-wider uppercase mb-1 block">
              Kurasi Pilihan Terverifikasi
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Talent Pilihan di Kotamu
            </h2>
          </div>
          <button
            onClick={onViewAllClick}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-purple-800 hover:text-purple-950 transition-colors cursor-pointer"
          >
            <span>Lihat Semua Talent</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {!loading && !errorMsg && talents.length > 0 && (
          <div className="mb-6">
            <TalentQuickFilter value={quickFilter} onChange={setQuickFilter} showToday={todayReady} />
          </div>
        )}

        {loading ? (
          <div className="flex gap-4 overflow-hidden">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-80 w-[70vw] sm:w-[260px] shrink-0 rounded-2xl bg-slate-200 animate-pulse" />
            ))}
          </div>
        ) : errorMsg ? (
          <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={loadFeaturedTalents}
              className="px-3 py-1.5 bg-rose-600 text-white rounded-lg font-bold flex items-center gap-1 hover:bg-rose-700 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Coba Lagi</span>
            </button>
          </div>
        ) : talents.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-xs text-slate-500">
            <Users className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p>Belum ada profil Talent aktif yang terdaftar di Supabase.</p>
          </div>
        ) : visibleTalents.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-xs text-slate-500">
            <p className="mb-3">Belum ada talent yang cocok dengan filter ini.</p>
            <button
              type="button"
              onClick={() => setQuickFilter('all')}
              className="px-4 py-2 bg-purple-700 text-white font-semibold rounded-lg hover:bg-purple-800 transition-colors cursor-pointer"
            >
              Tampilkan semua
            </button>
          </div>
        ) : (
          <div className="relative">
          <button
            type="button"
            aria-label="Geser ke kiri"
            onClick={() => scrollByCards(-1)}
            className="hidden lg:flex absolute -left-4 top-1/3 z-10 w-10 h-10 items-center justify-center rounded-full bg-white shadow-lg border border-purple-100 text-purple-800 hover:bg-purple-50 cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label="Geser ke kanan"
            onClick={() => scrollByCards(1)}
            className="hidden lg:flex absolute -right-4 top-1/3 z-10 w-10 h-10 items-center justify-center rounded-full bg-white shadow-lg border border-purple-100 text-purple-800 hover:bg-purple-50 cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-3 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {visibleTalents.map((talent, i) => (
              <motion.div
                key={talent.id}
                className="snap-start shrink-0 flex [&>article]:w-full w-[68vw] sm:w-[260px] lg:w-[calc((100%-3rem)/4)]"
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.4, delay: Math.min(i, 5) * 0.06, ease: 'easeOut' }}
              >
                <TalentCard
                  talent={talent}
                  onSelect={onSelectTalent}
                  availableToday={availableTodayIds.has(talent.id)}
                />
              </motion.div>
            ))}
          </div>
          </div>
        )}
      </div>
    </section>
  );
};
