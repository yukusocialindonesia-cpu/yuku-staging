import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import { SearchActivityWidget } from './SearchActivityWidget';
import { HeroSlideRow } from '../../types/database';
import { fetchHeroSlidesFromSupabase } from '../../utils/supabaseMarketplace';

interface HeroSectionProps {
  onExploreClick: () => void;
  onSearch: (activity: string, city: string) => void;
  onRegisterCustomerClick: () => void;
  /** Dipanggil saat slide dengan tautan internal (diawali "/") diklik. */
  onSlideLinkClick?: (path: string) => void;
}

const SLIDE_INTERVAL_MS = 6000;

/**
 * Hero Beranda berupa slide gambar yang diatur Admin
 * (Admin > "Slide Hero", tabel public.hero_slides).
 * Jika belum ada slide aktif, memakai /hero-home.jpg atau gradasi bermerek.
 */
export const HeroSection: React.FC<HeroSectionProps> = ({
  onSearch,
  onRegisterCustomerClick,
  onSlideLinkClick,
}) => {
  const [slides, setSlides] = useState<HeroSlideRow[]>([]);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [fallbackOk, setFallbackOk] = useState(true);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchHeroSlidesFromSupabase().then((rows) => {
      if (mounted) setSlides(rows);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(media.matches);
    const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  const total = slides.length;

  useEffect(() => {
    if (active >= total) setActive(0);
  }, [total, active]);

  const next = useCallback(() => {
    if (total > 1) setActive((i) => (i + 1) % total);
  }, [total]);
  const prev = useCallback(() => {
    if (total > 1) setActive((i) => (i - 1 + total) % total);
  }, [total]);

  useEffect(() => {
    if (total <= 1 || paused || reducedMotion) return;
    const timer = window.setInterval(next, SLIDE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [total, paused, reducedMotion, next, active]);

  const currentLink = total > 0 ? slides[active]?.link_url?.trim() || '' : '';
  const isExternal = /^https?:\/\//i.test(currentLink);
  const isInternal = currentLink.startsWith('/');

  const handleBackdropClick = () => {
    if (isInternal && onSlideLinkClick) onSlideLinkClick(currentLink);
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Sorotan YUKU"
      className="relative overflow-hidden bg-gradient-to-br from-purple-100 via-fuchsia-50 to-amber-50"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => {
        setTouchStartX(e.touches[0]?.clientX ?? null);
        setPaused(true);
      }}
      onTouchEnd={(e) => {
        const endX = e.changedTouches[0]?.clientX ?? null;
        if (touchStartX !== null && endX !== null) {
          const dx = endX - touchStartX;
          if (dx <= -50) next();
          else if (dx >= 50) prev();
        }
        setTouchStartX(null);
        setPaused(false);
      }}
    >
      {/* Gambar slide (crossfade): banner rasio tetap di HP, lapisan penuh di layar lebar.
          Rasio 12:5 sama dengan gambar desktop 1920x800, jadi foto tampil utuh di HP. */}
      <div className="absolute inset-0">
        {total > 0 ? (
          slides.map((slide, index) => {
            const isCurrent = index === active;
            return (
              <div
                key={slide.id}
                aria-hidden={!isCurrent}
                className={`absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none ${
                  isCurrent ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {broken[slide.id] ? (
                  <div className="w-full h-full bg-gradient-to-br from-purple-600 via-fuchsia-500 to-amber-400" />
                ) : (
                  <picture>
                    {slide.mobile_image_url && (
                      <source media="(max-width: 767px)" srcSet={slide.mobile_image_url} />
                    )}
                    <img
                      src={slide.image_url}
                      alt={slide.title}
                      referrerPolicy="no-referrer"
                      loading={index === 0 ? 'eager' : 'lazy'}
                      onError={() => setBroken((p) => ({ ...p, [slide.id]: true }))}
                      className={`w-full h-full object-cover md:object-[70%_20%] ${
                        slide.mobile_image_url ? 'object-center' : 'object-[70%_20%]'
                      }`}
                    />
                  </picture>
                )}
              </div>
            );
          })
        ) : fallbackOk ? (
          <div className="absolute top-0 right-0 h-full w-[52%] md:w-[60%]">
            <img
              src="/hero-home.jpg"
              alt=""
              aria-hidden="true"
              onError={() => setFallbackOk(false)}
              className="w-full h-full object-cover object-[60%_18%] [mask-image:linear-gradient(to_left,black_72%,transparent)]"
            />
          </div>
        ) : (
          <div className="absolute top-0 right-0 h-full w-[52%] md:w-[60%] bg-gradient-to-br from-purple-600 via-fuchsia-500 to-amber-400 opacity-90 rounded-bl-[4rem] md:rounded-l-[8rem]" />
        )}

        {/* Scrim kiri agar teks tetap terbaca di atas gambar apa pun */}
        {total > 0 && (
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/90 via-white/75 to-white/30 md:bg-gradient-to-r md:from-white/90 md:via-white/55 md:to-transparent md:w-[62%]" />
        )}

        {/* Area klik slide (di belakang konten) */}
        {isExternal && (
          <a
            href={currentLink}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={slides[active]?.title}
            className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-700"
          />
        )}
        {isInternal && (
          <button
            type="button"
            onClick={handleBackdropClick}
            aria-label={slides[active]?.title}
            className="absolute inset-0 w-full h-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-700"
          />
        )}

        {/* Kontrol slide: panah + titik */}
        {total > 1 && (
          <div className="absolute z-20 bottom-2 left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:bottom-5 md:right-6 flex items-center gap-2">
            <div role="tablist" aria-label="Pilih slide" className="flex items-center mr-1">
              {slides.map((slide, index) => {
                const isCurrent = index === active;
                return (
                  <button
                    key={slide.id}
                    type="button"
                    role="tab"
                    aria-selected={isCurrent}
                    aria-label={`Slide ${index + 1}: ${slide.title}`}
                    onClick={() => setActive(index)}
                    className="min-w-[28px] min-h-[40px] flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700 rounded-lg"
                  >
                    <span
                      className={`block h-2 rounded-full transition-all duration-200 ${
                        isCurrent ? 'w-6 bg-purple-700 md:bg-white shadow' : 'w-2 bg-purple-700/30 md:bg-white/60 hover:bg-purple-700/50 md:hover:bg-white/90'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={prev}
              aria-label="Slide sebelumnya"
              className="hidden md:inline-flex w-9 h-9 rounded-full bg-white/90 hover:bg-white text-purple-900 shadow items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Slide berikutnya"
              className="hidden md:inline-flex w-9 h-9 rounded-full bg-white/90 hover:bg-white text-purple-900 shadow items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Konten tetap di depan slide */}
      <div
        className={`relative z-10 pointer-events-none max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 md:pt-16 md:pb-16 ${
          total > 1 ? 'pb-14' : 'pb-8'
        }`}
      >
        <div className="md:max-w-xl">
          <div className="inline-flex max-w-full items-center gap-2 px-3 py-1 bg-white/80 border border-purple-200/80 rounded-full text-purple-900 text-xs font-semibold mb-5">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-purple-700" />
            <span className="truncate">Social Experience & Paid Companionship</span>
          </div>

          <h1 className="text-[2rem] leading-[1.08] sm:text-5xl md:text-6xl font-black text-[#1E0938] tracking-tight mb-4">
            Real Friends.{' '}
            <span className="bg-gradient-to-r from-purple-700 via-fuchsia-600 to-amber-500 bg-clip-text text-transparent">
              Real Moments.
            </span>
          </h1>

          <p className="text-[13px] sm:text-base md:text-lg text-slate-800 leading-relaxed">
            Temukan teman terbaik untuk menemani setiap aktivitas dan momen berharga dalam hidupmu.
          </p>
        </div>

        <div className="mt-6 md:mt-8 md:max-w-3xl pointer-events-auto">
          <SearchActivityWidget onSearch={onSearch} />
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-800">
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-purple-600" />Ruang publik & aman</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-purple-600" />Bukan aplikasi kencan</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-purple-600" />Verifikasi 18+</span>
            <button
              type="button"
              onClick={onRegisterCustomerClick}
              className="px-4 py-1.5 rounded-full border border-purple-300 bg-white/90 hover:bg-white font-bold text-purple-800 hover:text-purple-950 shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-700"
            >
              Daftar gratis
            </button>
          </div>
        </div>
      </div>

    </section>
  );
};
