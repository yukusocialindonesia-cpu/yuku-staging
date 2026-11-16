import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, ArrowUpRight, Megaphone } from 'lucide-react';
import { PromotionRow } from '../../types/database';
import { AppRoute } from '../../types/navigation';

interface PromoCarouselProps {
  promotions: PromotionRow[];
  isLoading?: boolean;
  onNavigate: (path: AppRoute, params?: Record<string, string>) => void;
}

export const PromoCarousel: React.FC<PromoCarouselProps> = ({
  promotions,
  isLoading = false,
  onNavigate,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [brokenImageIds, setBrokenImageIds] = useState<Record<string, boolean>>({});
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const media = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(media.matches);
      const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, []);

  useEffect(() => {
    if (activeIndex >= promotions.length) {
      setActiveIndex(0);
    }
  }, [promotions.length, activeIndex]);

  const totalSlides = promotions.length;

  const handleNext = useCallback(() => {
    if (totalSlides <= 1) return;
    setActiveIndex((prev) => (prev + 1) % totalSlides);
  }, [totalSlides]);

  const handlePrev = useCallback(() => {
    if (totalSlides <= 1) return;
    setActiveIndex((prev) => (prev - 1 + totalSlides) % totalSlides);
  }, [totalSlides]);

  useEffect(() => {
    if (totalSlides <= 1 || isPaused || prefersReducedMotion) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % totalSlides);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [totalSlides, isPaused, prefersReducedMotion]);

  const handlePosterClick = (promo: PromotionRow) => {
    const rawLink = promo.link_url?.trim();
    if (!rawLink) return;
    if (rawLink.startsWith('/')) {
      onNavigate(rawLink as AppRoute);
    }
  };

  return (
    <section
      aria-label="Ruang Promosi YUKU"
      className="py-8 bg-white border-b border-slate-100"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-[#1E0938] tracking-tight truncate">
              Ruang Promosi &amp; Info YUKU
            </h2>
            {totalSlides > 0 && (
              <span className="text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap shrink-0">
                {activeIndex + 1} / {totalSlides}
              </span>
            )}
          </div>

          {totalSlides > 1 && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsPaused((prev) => !prev)}
                aria-label={isPaused ? 'Putar slide promosi' : 'Jeda slide promosi'}
                className="min-w-[40px] min-h-[40px] px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700"
              >
                {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{isPaused ? 'Putar' : 'Jeda'}</span>
              </button>
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Poster sebelumnya"
                className="w-10 h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors inline-flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Poster berikutnya"
                className="w-10 h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors inline-flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="w-full aspect-[16/7] sm:aspect-[21/7] rounded-2xl bg-slate-100 animate-pulse border border-slate-200/80" />
        ) : totalSlides === 0 ? (
          <div className="w-full min-h-[144px] sm:aspect-[21/6] rounded-2xl border border-slate-200 bg-gradient-to-r from-[#FAF8FC] via-purple-50/60 to-amber-50/50 px-4 py-5 sm:px-6 sm:py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3 sm:gap-4 max-w-2xl">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-purple-950 text-amber-400 flex items-center justify-center shrink-0">
                <Megaphone className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm sm:text-base font-bold text-[#1E0938]">
                  Etalase Poster Promosi Resmi
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Belum ada poster promosi aktif saat ini. Penawaran spesial, kampanye komunitas, dan pengumuman resmi YUKU akan tampil berjalan otomatis di sini.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('/talent')}
              className="w-full sm:w-auto px-4 py-2.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700"
            >
              Jelajahi Talent
            </button>
          </div>
        ) : (
          <div
            className="relative"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onTouchStart={(e) => {
              setTouchStartX(e.touches[0]?.clientX ?? null);
              setIsPaused(true);
            }}
            onTouchEnd={(e) => {
              const endX = e.changedTouches[0]?.clientX ?? null;
              if (touchStartX !== null && endX !== null) {
                const deltaX = endX - touchStartX;
                if (deltaX <= -40) {
                  handleNext();
                } else if (deltaX >= 40) {
                  handlePrev();
                }
              }
              setTouchStartX(null);
              setIsPaused(false);
            }}
          >
            <div className="w-full aspect-[16/8] sm:aspect-[21/7] rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 relative touch-pan-y">
              <div
                className="flex h-full transition-transform duration-500 ease-out motion-reduce:transition-none"
                style={{ transform: `translateX(-${activeIndex * 100}%)` }}
              >
                {promotions.map((promo) => {
                  const isBroken = Boolean(brokenImageIds[promo.id]);
                  const link = promo.link_url?.trim() || '';
                  const isExternal = link.startsWith('http://') || link.startsWith('https://');
                  const isInternal = link.startsWith('/');

                  const slideBody = (
                    <div className="relative w-full h-full">
                      {isBroken ? (
                        <div className="w-full h-full bg-gradient-to-br from-purple-950 via-[#2D1052] to-slate-900 flex flex-col items-center justify-center p-6 text-center text-white">
                          <Megaphone className="w-8 h-8 text-amber-400 mb-2" />
                          <p className="text-sm sm:text-base font-bold">{promo.title}</p>
                        </div>
                      ) : (
                        <img
                          src={promo.image_url}
                          alt={promo.title || 'Poster promosi YUKU'}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setBrokenImageIds((prev) => ({ ...prev, [promo.id]: true }))
                          }
                          className="w-full h-full object-cover"
                        />
                      )}

                      {(isInternal || isExternal) && (
                        <div className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 px-3.5 py-2 rounded-xl bg-slate-950/80 text-white text-xs font-bold inline-flex items-center gap-1.5 backdrop-blur-xs">
                          <span>Lihat Promo</span>
                          <ArrowUpRight className="w-3.5 h-3.5 text-amber-400" />
                        </div>
                      )}
                    </div>
                  );

                  return (
                    <div key={promo.id} className="w-full h-full shrink-0">
                      {isExternal ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-full h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400"
                          aria-label={promo.title}
                        >
                          {slideBody}
                        </a>
                      ) : isInternal ? (
                        <button
                          type="button"
                          onClick={() => handlePosterClick(promo)}
                          className="block w-full h-full text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400"
                          aria-label={promo.title}
                        >
                          {slideBody}
                        </button>
                      ) : (
                        slideBody
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {totalSlides > 1 && (
              <div className="flex items-center justify-center gap-1 mt-3" role="tablist" aria-label="Pilih poster promosi">
                {promotions.map((promo, index) => {
                  const isCurrent = index === activeIndex;
                  return (
                    <button
                      key={promo.id}
                      type="button"
                      role="tab"
                      aria-selected={isCurrent}
                      aria-label={`Tampilkan poster ${index + 1}: ${promo.title}`}
                      onClick={() => setActiveIndex(index)}
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700 rounded-lg"
                    >
                      <span
                        className={`block h-1.5 rounded-full transition-all duration-200 ${
                          isCurrent ? 'w-7 bg-purple-700' : 'w-2.5 bg-slate-300 hover:bg-slate-400'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
