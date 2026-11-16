import React, { useEffect, useState } from 'react';
import { Star, MapPin, BadgeCheck, Sparkles, ArrowRight, Mic, Video, Image as ImageIcon, CalendarCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { TalentProfile } from '../../types/talent';
import { formatRupiah } from '../../utils/formatters';

interface TalentCardProps {
  talent: TalentProfile;
  onSelect: (talentId: string) => void;
  availableToday?: boolean;
}

// Foto stok bawaan lama dianggap "belum ada foto", supaya kartu tidak terlihat kembar.
const PLACEHOLDER_PHOTO_MARKER = 'photo-1534528741775-53994a69daeb';

const GRADIENTS = [
  'from-purple-600 via-fuchsia-600 to-pink-500',
  'from-indigo-600 via-purple-600 to-fuchsia-500',
  'from-fuchsia-600 via-pink-600 to-orange-400',
  'from-violet-700 via-purple-600 to-sky-500',
];

function pickGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Y';
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0];
  return letters.toUpperCase();
}

// Cache sederhana: jenis media (photo/video/voice) per talent, supaya kartu yang sama tidak query ulang.
const mediaTypesCache = new Map<string, string[]>();

export const TalentCard: React.FC<TalentCardProps> = ({ talent, onSelect, availableToday }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const [mediaTypes, setMediaTypes] = useState<string[]>(() => mediaTypesCache.get(talent.id) ?? []);

  useEffect(() => {
    if (mediaTypesCache.has(talent.id)) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase
          .from('talent_media')
          .select('media_type')
          .eq('talent_id', talent.id);
        const types = Array.from(new Set((data ?? []).map((m: any) => String(m.media_type))));
        mediaTypesCache.set(talent.id, types);
        if (alive) setMediaTypes(types);
      } catch {
        // Indikator media hanya pemanis; abaikan jika gagal.
      }
    })();
    return () => { alive = false; };
  }, [talent.id]);

  const hasVoice = mediaTypes.includes('voice');
  const hasVideo = mediaTypes.includes('video');
  const hasPhoto = mediaTypes.includes('photo');

  const hasRealPhoto =
    Boolean(talent.avatarUrl) &&
    !talent.avatarUrl!.includes(PLACEHOLDER_PHOTO_MARKER) &&
    !imageFailed;

  const isNew = !talent.reviewCount || talent.reviewCount === 0;

  return (
    <article
      onClick={() => onSelect(talent.id)}
      className="group relative bg-white rounded-3xl overflow-hidden border border-purple-100 shadow-sm hover:shadow-xl hover:shadow-purple-200/50 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer flex flex-col"
    >
      {/* Media */}
      <div className="relative aspect-[4/5] sm:aspect-[4/3] w-full overflow-hidden">
        {hasRealPhoto ? (
          <img
            src={talent.avatarUrl}
            alt={`Foto profil ${talent.name}`}
            className="w-full h-full object-cover object-[50%_25%] group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div
            className={`w-full h-full bg-gradient-to-br ${pickGradient(talent.id)} flex items-center justify-center`}
          >
            <span className="text-6xl font-black text-white/90 tracking-tight drop-shadow-sm">
              {initialsOf(talent.name)}
            </span>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/70 to-transparent" />

        {/* Badges (atas) */}
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2">
          <span className="inline-flex items-center gap-1 bg-white/95 text-emerald-700 text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm">
            <BadgeCheck className="w-3.5 h-3.5" />
            Terverifikasi
          </span>
          {isNew && (
            <span className="inline-flex items-center gap-1 bg-amber-400 text-amber-950 text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm">
              <Sparkles className="w-3 h-3" />
              Baru
            </span>
          )}
        </div>

        {availableToday && (
          <span className="absolute top-12 left-3 inline-flex items-center gap-1 bg-emerald-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm">
            <CalendarCheck className="w-3 h-3" />
            Tersedia hari ini
          </span>
        )}

        {/* Lokasi & mode (bawah foto) */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white text-xs font-medium">
          {talent.city ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              {talent.city}
            </span>
          ) : (
            <span />
          )}
          {talent.serviceMode && (
            <span className="text-[11px] bg-white/20 backdrop-blur-sm border border-white/30 px-2 py-0.5 rounded-full">
              {talent.serviceMode}
            </span>
          )}
        </div>
      </div>

      {/* Isi */}
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-extrabold text-[#1E0938] text-lg leading-tight group-hover:text-purple-700 transition-colors break-words min-w-0">
            {talent.name}
            {talent.age ? <span className="font-semibold text-slate-500">, {talent.age}</span> : null}
          </h3>
          {!isNew && talent.rating !== undefined && (
            <div className="shrink-0 inline-flex items-center gap-1 bg-amber-50 text-amber-800 text-xs font-bold px-2 py-1 rounded-full tabular-nums">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              {talent.rating.toFixed(1)}
              <span className="font-normal text-amber-700/70">({talent.reviewCount})</span>
            </div>
          )}
        </div>

        {talent.headline && (
          <p className="mt-1.5 text-sm font-medium text-purple-800 line-clamp-1">{talent.headline}</p>
        )}

        {talent.bio && (
          <p className="mt-2 text-xs text-slate-600 line-clamp-2 leading-relaxed">{talent.bio}</p>
        )}

        {(hasVoice || hasVideo || hasPhoto) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {hasVoice && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-fuchsia-800 bg-fuchsia-50 border border-fuchsia-100 px-2 py-0.5 rounded-full">
                <Mic className="w-3 h-3" /> Voice
              </span>
            )}
            {hasVideo && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-800 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                <Video className="w-3 h-3" /> Video
              </span>
            )}
            {hasPhoto && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-800 bg-sky-50 border border-sky-100 px-2 py-0.5 rounded-full">
                <ImageIcon className="w-3 h-3" /> Foto
              </span>
            )}
          </div>
        )}

        {talent.interests && talent.interests.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {talent.interests.slice(0, 3).map((item) => (
              <span
                key={item}
                className="text-[11px] font-medium text-purple-800 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full"
              >
                {item}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto pt-4">
          <div className="pt-4 border-t border-purple-100 flex items-center justify-between gap-3">
            <div>
              <span className="text-[11px] text-slate-400 block font-medium">Mulai dari</span>
              <div className="text-base font-black text-[#1E0938] tabular-nums leading-tight">
                {talent.hourlyRate ? formatRupiah(talent.hourlyRate) : 'Hubungi Talent'}
                {talent.hourlyRate ? (
                  <span className="text-xs font-medium text-slate-500"> / jam</span>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-purple-700 to-fuchsia-600 group-hover:from-purple-800 group-hover:to-fuchsia-700 rounded-full shadow-md shadow-purple-300/40 transition-all shrink-0"
            >
              Lihat Profil
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};
