import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Star,
  MapPin,
  Clock,
  ShieldCheck,
  Ban,
  Calendar,
  Sparkles,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Users,
  User as UserIcon,
  Loader2,
  Lock,
  MessageSquare,
  Image as ImageIcon,
  Video,
  Mic,
  Volume2,
  X,
  ChevronLeft,
  ChevronRight,
  Share2,
} from 'lucide-react';
import { TalentProfile, ActivityCategory } from '../types/talent';
import { formatRupiah } from '../utils/formatters';
import { AppRoute } from '../types/navigation';
import { Modal } from '../components/common/Modal';
import { fetchTalentByIdFromSupabase, fetchCategoriesFromSupabase } from '../utils/supabaseMarketplace';
import { supabase } from '../lib/supabase';
import { TalentAvailabilityRow, TalentMediaRow } from '../types/database';
import {
  DAY_OF_WEEK_OPTIONS,
  formatTimeShort,
  checkBookingAgainstAvailability,
} from '../utils/availabilityHelpers';

interface TalentDetailPageProps {
  talentId: string;
  onNavigate: (path: AppRoute, params?: Record<string, string>) => void;
}

interface PublicReviewItem {
  id: string;
  booking_id: string;
  customer_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  reviewerName: string;
}

const AVATAR_GRADIENTS = [
  'from-purple-500 to-fuchsia-500',
  'from-indigo-500 to-purple-500',
  'from-rose-500 to-orange-400',
  'from-emerald-500 to-teal-500',
  'from-sky-500 to-indigo-500',
];
function avatarGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}
function avatarInitials(name: string): string {
  const parts = (name || '?').trim().split(/\s+/).slice(0, 2);
  return parts.map((w) => w.charAt(0).toUpperCase()).join('') || '?';
}

export const TalentDetailPage: React.FC<TalentDetailPageProps> = ({ talentId, onNavigate }) => {
  const isPaymentCheckoutEnabled = import.meta.env.VITE_PAYMENT_CHECKOUT_ENABLED === 'true';
  const [talent, setTalent] = useState<TalentProfile | null>(null);
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [reviews, setReviews] = useState<PublicReviewItem[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<TalentAvailabilityRow[]>([]);
  const [mediaItems, setMediaItems] = useState<TalentMediaRow[]>([]);
  const [serviceRateOverrides, setServiceRateOverrides] = useState<Record<string, number | null>>({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auth state for booking
  const [currentUser, setCurrentUser] = useState<any | null>(null);

  // Real Booking Form States
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [durationHours, setDurationHours] = useState(2);
  const [selectedActivity, setSelectedActivity] = useState<string>('');
  const [meetingLocation, setMeetingLocation] = useState('');
  const [meetingAddress, setMeetingAddress] = useState('');
  const [bookingMode, setBookingMode] = useState<'offline' | 'online'>('offline');

  // Tomorrow date string as minimum booking date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const [bookingDate, setBookingDate] = useState(tomorrowStr);
  const [bookingTime, setBookingTime] = useState('14:00');

  // Submission & Result States
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [createdBooking, setCreatedBooking] = useState<{
    id: string;
    booking_code: string;
    start_time: string;
    end_time: string;
    duration_hours: number;
    gross_amount: number;
    status: string;
    payment_expires_at: string;
  } | null>(null);

  // Monitor Auth Session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadTalentDetail = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [talentData, categoriesData, reviewsRes, availabilityRes, mediaRes, serviceRatesRes] = await Promise.all([
        fetchTalentByIdFromSupabase(talentId),
        fetchCategoriesFromSupabase(),
        supabase
          .from('reviews')
          .select('id, booking_id, customer_id, rating, review_text, created_at')
          .eq('talent_id', talentId)
          .eq('is_visible', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('talent_availability')
          .select('id, talent_id, day_of_week, specific_date, start_time, end_time, is_available, created_at')
          .eq('talent_id', talentId)
          .order('day_of_week', { ascending: true, nullsFirst: false })
          .order('specific_date', { ascending: true, nullsFirst: false })
          .order('start_time', { ascending: true }),
        supabase
          .from('talent_media')
          .select('id, talent_id, media_type, media_url, storage_path, caption, sort_order, created_at')
          .eq('talent_id', talentId)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false }),
        supabase
          .from('talent_services')
          .select('activity_category_id, custom_rate_override')
          .eq('talent_id', talentId),
      ]);

      setTalent(talentData);
      setCategories(categoriesData);
      setAvailabilitySlots((availabilityRes.data as TalentAvailabilityRow[]) || []);
      if (serviceRatesRes.error) throw new Error(`Gagal membaca tarif layanan Talent: ${serviceRatesRes.error.message}`);
      setServiceRateOverrides(Object.fromEntries((serviceRatesRes.data || []).map((row) => [row.activity_category_id, row.custom_rate_override == null ? null : Number(row.custom_rate_override)])));
      setMediaItems(mediaRes.error ? [] : ((mediaRes.data as TalentMediaRow[]) || []));
      if (talentData && talentData.activities.length > 0) {
        setSelectedActivity(talentData.activities[0]);
      }

      const rawReviews = reviewsRes.data ?? [];
      if (rawReviews.length > 0) {
        const customerIds = Array.from(new Set(rawReviews.map((r) => r.customer_id)));
        const customerNameMap = new Map<string, string>();
        if (customerIds.length > 0) {
          const { data: customerProfiles } = await supabase
            .from('customer_profiles')
            .select('id, display_name')
            .in('id', customerIds);
          customerProfiles?.forEach((c) => {
            if (c.display_name) {
              customerNameMap.set(c.id, c.display_name);
            }
          });
        }

        setReviews(
          rawReviews.map((r) => ({
            id: r.id,
            booking_id: r.booking_id,
            customer_id: r.customer_id,
            rating: Number(r.rating),
            review_text: r.review_text ?? null,
            created_at: r.created_at,
            reviewerName: customerNameMap.get(r.customer_id) || 'Customer YUKU',
          }))
        );
      } else {
        setReviews([]);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memuat detail Talent dari Supabase.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTalentDetail();
  }, [talentId]);

  const photoMedia = mediaItems.filter((m) => m.media_type === 'photo');
  const videoMedia = mediaItems.filter((m) => m.media_type === 'video');
  const voiceMedia = mediaItems.filter((m) => m.media_type === 'voice');

  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxIndex(null);
      } else if (e.key === 'ArrowRight' && photoMedia.length > 1) {
        setLightboxIndex((prev) => (prev === null ? null : (prev + 1) % photoMedia.length));
      } else if (e.key === 'ArrowLeft' && photoMedia.length > 1) {
        setLightboxIndex((prev) => (prev === null ? null : (prev - 1 + photoMedia.length) % photoMedia.length));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, photoMedia.length]);

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingError(null);

    if (!talent) return;

    // 1. Auth Guard
    if (!currentUser) {
      setBookingError('Anda harus masuk (login) terlebih dahulu untuk mengajukan reservasi.');
      return;
    }

    // 2. Self-Booking Guard
    if (currentUser.id === talent.id) {
      setBookingError('Pemesanan ditolak: Anda tidak dapat membuat reservasi untuk profil Talent milik Anda sendiri.');
      return;
    }

    // 3. Activity Guard
    const finalActivity = selectedActivity || (talent.activities.length > 0 ? talent.activities[0] : '');
    if (!finalActivity) {
      setBookingError('Pilih jenis aktivitas terlebih dahulu.');
      return;
    }

    // 4. Meeting Location Guard
    if (!meetingLocation.trim()) {
      setBookingError('Tentukan lokasi ruang publik untuk pertemuan.');
      return;
    }

    // 5. Date & Time Validation
    const startDateTime = new Date(`${bookingDate}T${bookingTime}:00`);
    if (isNaN(startDateTime.getTime())) {
      setBookingError('Tanggal atau jam pertemuan tidak valid.');
      return;
    }

    if (startDateTime.getTime() <= Date.now()) {
      setBookingError('Jadwal pertemuan harus di masa mendatang (minimal beberapa jam dari sekarang).');
      return;
    }

    // 5b. Check configured talent availability schedule
    const availCheck = checkBookingAgainstAvailability(
      availabilitySlots,
      bookingDate,
      bookingTime,
      durationHours
    );
    if (availCheck.hasSchedule && !availCheck.isAvailable) {
      setBookingError(
        availCheck.reason || 'Waktu yang dipilih berada di luar jadwal ketersediaan Talent.'
      );
      return;
    }

    setIsSubmittingBooking(true);

    try {
      // 6. Create booking via server-side RPC create_booking
      const { data: rpcData, error: rpcError } = await supabase.rpc('create_booking', {
        p_talent_id: talent.id,
        p_activity_category_id: finalActivity,
        p_booking_mode: bookingMode,
        p_start_time: startDateTime.toISOString(),
        p_duration_hours: durationHours,
        p_meeting_location_name: meetingLocation.trim(),
        p_meeting_location_address: meetingAddress.trim() || null,
      });

      if (rpcError) {
        const rawMessage = rpcError.message || '';
        if (rpcError.code === '23P01') {
          throw new Error('jadwal talent bentrok');
        }
        if (rawMessage.includes('Customer KTP verification required')) {
          throw new Error('KTP Anda belum terverifikasi');
        }
        if (rawMessage.includes('Customer account is not eligible')) {
          throw new Error('akun belum memenuhi syarat');
        }
        if (rawMessage.includes('Talent is not available')) {
          throw new Error('talent sedang tidak tersedia');
        }
        if (rawMessage.includes('Talent does not offer this category')) {
          throw new Error('talent tidak menawarkan aktivitas ini');
        }
        throw new Error(rawMessage || 'Terjadi kesalahan saat memproses booking ke Supabase.');
      }

      const createdRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!createdRow) {
        throw new Error('Data reservasi tidak berhasil dikembalikan oleh sistem.');
      }

      setCreatedBooking(createdRow);
    } catch (err: any) {
      setBookingError(err?.message || 'Terjadi kesalahan saat memproses booking ke Supabase.');
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  const handleCloseModal = () => {
    setIsBookingModalOpen(false);
    setCreatedBooking(null);
    setBookingError(null);
  };

  const selectedBaseHourlyRate = bookingMode === 'online'
    ? (talent?.onlineChatRate ?? talent?.hourlyRate)
    : talent?.hourlyRate;
  const selectedHourlyRate = selectedActivity && serviceRateOverrides[selectedActivity] != null
    ? serviceRateOverrides[selectedActivity]
    : selectedBaseHourlyRate;

  if (loading) {
    return (
      <div className="py-16 bg-[#FAF8FC]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="h-8 w-40 bg-slate-200 animate-pulse rounded-lg" />
          <div className="h-64 bg-slate-200 animate-pulse rounded-2xl" />
          <div className="h-96 bg-slate-200 animate-pulse rounded-2xl" />
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="py-16 bg-[#FAF8FC]">
        <div className="max-w-xl mx-auto px-4 text-center">
          <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
            <p>{errorMsg}</p>
            <button
              onClick={loadTalentDetail}
              className="px-4 py-2 bg-rose-600 text-white rounded-lg font-bold inline-flex items-center gap-1.5 hover:bg-rose-700 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Coba Lagi</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!talent) {
    return (
      <div className="py-16 bg-[#FAF8FC]">
        <div className="max-w-md mx-auto px-4 text-center bg-white p-8 rounded-2xl border border-slate-200 space-y-3">
          <Users className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="font-bold text-slate-800 text-base">Talent Tidak Ditemukan</h3>
          <p className="text-xs text-slate-500">
            Profil Talent yang Anda cari tidak tersedia atau belum terdaftar di Supabase.
          </p>
          <button
            onClick={() => onNavigate('/talent')}
            className="px-4 py-2 bg-purple-700 text-white text-xs font-bold rounded-lg hover:bg-purple-800"
          >
            Kembali ke Katalog Talent
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-0 sm:pt-10 pb-28 lg:pb-12 bg-[#FAF8FC]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Link */}
        <button
          onClick={() => onNavigate('/talent')}
          className="hidden lg:inline-flex items-center gap-2 text-xs font-semibold text-purple-700 hover:text-purple-900 mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Jelajahi Talent</span>
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Photos & Details */}
          <div className="lg:col-span-8 space-y-6">
            {/* Mobile / tablet profile header (layout ala aplikasi) */}
            <div className="lg:hidden">
              {(() => {
                const avatarOk = !!talent.avatarUrl && !talent.avatarUrl.includes('photo-1534528741775-53994a69daeb');
                const heroUrl = avatarOk ? talent.avatarUrl : photoMedia[0]?.media_url;
                const effectiveReviewCount =
                  reviews.length > 0 ? reviews.length : (talent.reviewCount ?? 0);
                const effectiveRating =
                  reviews.length > 0
                    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
                    : (talent.rating ?? 0);
                const handleShare = async () => {
                  const url = window.location.href;
                  try {
                    if (navigator.share) {
                      await navigator.share({ title: talent.name, url });
                    } else {
                      await navigator.clipboard.writeText(url);
                    }
                  } catch {
                    /* dibatalkan pengguna */
                  }
                };
                return (
                  <>
                    <div className="relative rounded-3xl overflow-hidden aspect-[5/6] w-full bg-slate-100">
                      {heroUrl && !avatarFailed ? (
                        <img
                          src={heroUrl}
                          alt={talent.name}
                          className="w-full h-full object-cover object-top"
                          referrerPolicy="no-referrer"
                          onError={() => setAvatarFailed(true)}
                        />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${avatarGradient(talent.id)} flex items-center justify-center`}>
                          <span className="text-7xl font-black text-white/95">{avatarInitials(talent.name)}</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => onNavigate('/talent')}
                        aria-label="Kembali"
                        className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/95 shadow flex items-center justify-center text-slate-800 cursor-pointer sm:hidden"
                      >
                        <ArrowLeft className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleShare}
                        aria-label="Bagikan"
                        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-purple-900/70 text-white flex items-center justify-center cursor-pointer"
                      >
                        <Share2 className="w-5 h-5" />
                      </button>
                      <span className="absolute left-4 bottom-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-50/95 border border-emerald-200 text-emerald-700 px-3 py-1.5 text-xs font-bold">
                        <ShieldCheck className="w-4 h-4" /> Terverifikasi 18+
                      </span>
                      {photoMedia.length > 0 && (
                        <span className="absolute right-4 bottom-4 rounded-full bg-black/45 text-white px-3 py-1 text-xs font-semibold tabular-nums">
                          1 / {photoMedia.length}
                        </span>
                      )}
                    </div>

                    <div className="relative mt-4 px-0.5 space-y-4">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h1 className="text-2xl font-extrabold text-slate-900">{talent.name}</h1>
                        <div className="flex items-center gap-1 text-sm font-bold text-slate-800 tabular-nums">
                          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                          <span>{effectiveReviewCount > 0 ? effectiveRating.toFixed(1) : 'Baru'}</span>
                          <span className="text-xs text-slate-500 font-normal">({effectiveReviewCount} ulasan)</span>
                        </div>
                      </div>

                      {effectiveReviewCount === 0 && (
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 border border-purple-200 px-3 py-1.5 text-xs font-bold text-purple-700">
                            <Star className="w-3.5 h-3.5 fill-purple-700" /> Talent Baru
                          </span>
                        </div>
                      )}

                      <div className="grid grid-cols-3 text-center py-1">
                        <div>
                          <Clock className="w-5 h-5 mx-auto text-slate-700" />
                          <div className="text-lg font-extrabold text-slate-900 tabular-nums">{talent.completedHours ?? 0}</div>
                          <div className="text-xs text-slate-500">Jam Selesai</div>
                        </div>
                        <div className="border-x border-slate-200">
                          <MessageSquare className="w-5 h-5 mx-auto text-slate-700" />
                          <div className="text-lg font-extrabold text-slate-900 tabular-nums">{effectiveReviewCount}</div>
                          <div className="text-xs text-slate-500">Ulasan</div>
                        </div>
                        <div>
                          <MapPin className="w-5 h-5 mx-auto text-slate-700" />
                          <div className="text-lg font-extrabold text-slate-900 truncate px-1">{talent.city || '-'}</div>
                          <div className="text-xs text-slate-500">Lokasi</div>
                        </div>
                      </div>

                      {talent.headline && (
                        <div className="rounded-2xl bg-purple-50 border border-purple-100 px-4 py-3.5 flex items-center gap-3 text-[15px] text-slate-800">
                          <span className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 font-black flex items-center justify-center shrink-0">&ldquo;</span>
                          <span>{talent.headline}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-center gap-5 text-sm text-slate-700">
                        {talent.serviceMode && (
                          <span className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                            {talent.serviceMode}
                          </span>
                        )}
                        {talent.age && (
                          <span className="flex items-center gap-1.5 font-semibold">
                            <UserIcon className="w-4 h-4" /> Usia {talent.age}+
                          </span>
                        )}
                      </div>

                      {talent.activities && talent.activities.length > 0 && (
                        <div>
                          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 mb-3">
                            <Star className="w-5 h-5 fill-amber-400 text-amber-400" /> Aktivitas Favorit
                          </h2>
                          <div className="grid grid-cols-3 gap-3">
                            {talent.activities.slice(0, 3).map((actId) => {
                              const cat = categories.find((c) => c.id === actId);
                              if (!cat) return null;
                              return (
                                <div key={actId} className="rounded-2xl bg-slate-50 border border-slate-200/60 py-4 px-2 text-center">
                                  <Sparkles className="w-6 h-6 mx-auto text-purple-700 mb-1.5" />
                                  <span className="text-sm text-slate-800 line-clamp-1">{cat.title}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
            {/* Header Card (desktop) */}
            <div className="hidden lg:block bg-white rounded-3xl lg:rounded-2xl border border-slate-200/80 p-4 sm:p-6 md:p-8 shadow-xs">
              <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
                {/* Avatar */}
                <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl overflow-hidden bg-slate-100 shrink-0 border-2 border-purple-100 shadow-sm relative flex items-center justify-center">
                  {talent.avatarUrl && !avatarFailed && !talent.avatarUrl.includes('photo-1534528741775-53994a69daeb') ? (
                    <img
                      src={talent.avatarUrl}
                      alt={talent.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarFailed(true)}
                    />
                  ) : (
                    <div className={`w-full h-full bg-gradient-to-br ${avatarGradient(talent.id)} flex items-center justify-center`}>
                      <span className="text-4xl sm:text-5xl font-black text-white/95 tracking-tight">{avatarInitials(talent.name)}</span>
                    </div>
                  )}
                </div>

                {/* Identity Info */}
                <div className="flex-1 w-full text-center sm:text-left">
                  <div className="flex flex-wrap items-center justify-center sm:justify-between gap-2 mb-1">
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                      {talent.name}{talent.age ? `, ${talent.age}` : ''}
                    </h1>
                    {(() => {
                      const effectiveReviewCount =
                        reviews.length > 0 ? reviews.length : (talent.reviewCount ?? 0);
                      const effectiveRating =
                        reviews.length > 0
                          ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
                          : (talent.rating ?? 0);

                      return (
                        <div className="flex items-center gap-1 text-sm font-bold text-slate-700 tabular-nums">
                          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                          <span>{effectiveReviewCount > 0 ? effectiveRating.toFixed(1) : 'Baru'}</span>
                          <span className="text-xs text-slate-400 font-normal">
                            ({effectiveReviewCount} ulasan)
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                      <ShieldCheck className="w-3.5 h-3.5" /> Terverifikasi 18+
                    </span>
                    {!(reviews.length > 0 || (talent.reviewCount ?? 0) > 0) && (
                      <span className="inline-flex items-center rounded-full bg-purple-50 border border-purple-200 px-2.5 py-0.5 text-[11px] font-bold text-purple-700">Talent Baru</span>
                    )}
                  </div>

                  {talent.headline && (
                    <p className="text-sm font-semibold text-purple-700 mb-3">
                      {talent.headline}
                    </p>
                  )}

                  {/* Metadata Row */}
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1 text-xs text-slate-500 mb-4">
                    {talent.city && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-amber-600" />
                        <span>{talent.city}</span>
                      </span>
                    )}
                    {talent.gender && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Gender: {talent.gender}</span>
                      </>
                    )}
                    {talent.serviceMode && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Layanan: {talent.serviceMode}</span>
                      </>
                    )}
                    {talent.completedHours !== undefined && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">Total Selesai: {talent.completedHours} jam</span>
                      </>
                    )}
                  </div>

                  {/* Language List */}
                  {talent.languages && talent.languages.length > 0 && (
                    <div className="text-xs text-slate-600 flex items-center justify-center sm:justify-start gap-2">
                      <span className="font-semibold text-slate-700">Bahasa:</span>
                      <span>{talent.languages.join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Voice Intro Card (if available) */}
            {voiceMedia.length > 0 && (
              <div className="bg-gradient-to-br from-purple-950 via-purple-900 to-[#2D1052] text-white rounded-2xl border border-purple-800/80 p-5 sm:p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-400/20 border border-amber-300/30 text-amber-300 flex items-center justify-center shrink-0">
                      <Volume2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5">
                        <span>Voice Intro {talent.name}</span>
                      </h2>
                      <p className="text-[11px] text-purple-200/85">
                        Dengarkan sapaan suara langsung untuk mengenal vibe &amp; gaya komunikasi Talent.
                      </p>
                    </div>
                  </div>
                  <Mic className="w-4 h-4 text-amber-300 shrink-0 hidden sm:block" />
                </div>

                <div className="space-y-2.5">
                  {voiceMedia.map((voice, idx) => (
                    <div
                      key={voice.id}
                      className="bg-white/10 backdrop-blur-xs border border-white/15 rounded-xl p-3 space-y-1.5"
                    >
                      <div className="text-xs font-semibold text-amber-200">
                        {voice.caption || `Rekaman Suara #${idx + 1}`}
                      </div>
                      <audio
                        controls
                        preload="metadata"
                        src={voice.media_url}
                        className="w-full h-9 rounded-lg"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Galeri Foto & Video Card */}
            {(photoMedia.length > 0 || videoMedia.length > 0) && (
              <div className="bg-white rounded-3xl lg:rounded-2xl border border-slate-200/80 p-4 sm:p-6 md:p-8 shadow-xs space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-purple-700" />
                    <h2 className="text-lg font-bold text-slate-900">
                      Galeri Foto &amp; Video
                    </h2>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                    {photoMedia.length > 0 && <span>{photoMedia.length} Foto</span>}
                    {photoMedia.length > 0 && videoMedia.length > 0 && <span aria-hidden="true">·</span>}
                    {videoMedia.length > 0 && <span>{videoMedia.length} Video</span>}
                  </div>
                </div>

                {photoMedia.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-3 gap-2 sm:gap-3">
                    {photoMedia.map((photo, idx) => (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => setLightboxIndex(idx)}
                        className="group relative aspect-[3/4] sm:aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 border border-slate-200/80 text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-600"
                      >
                        <img
                          src={photo.media_url}
                          alt={photo.caption || `Foto ${talent.name}`}
                          className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        {photo.caption && (
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 via-slate-950/35 to-transparent p-2.5 pt-6">
                            <p className="text-[11px] font-medium text-white line-clamp-1">
                              {photo.caption}
                            </p>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {videoMedia.length > 0 && (
                  <div className="space-y-3">
                    {photoMedia.length > 0 && (
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Video className="w-3.5 h-3.5 text-purple-700" />
                        <span>Video Perkenalan &amp; Aktivitas</span>
                      </h3>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {videoMedia.map((vid) => (
                        <div
                          key={vid.id}
                          className="rounded-xl overflow-hidden border border-slate-200/80 bg-slate-50 flex flex-col"
                        >
                          <video
                            controls
                            playsInline
                            preload="metadata"
                            src={vid.media_url}
                            className="w-full aspect-video bg-slate-950 object-cover"
                          />
                          {vid.caption && (
                            <div className="px-3.5 py-2.5 text-xs font-medium text-slate-700 bg-white border-t border-slate-100">
                              {vid.caption}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* About & Bio Card */}
            <div className="bg-white rounded-3xl lg:rounded-2xl border border-slate-200/80 p-4 sm:p-6 md:p-8 shadow-xs">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 mb-3">
                <UserIcon className="w-5 h-5 text-purple-700 lg:hidden" />
                <span className="lg:hidden">Tentang Talent</span>
                <span className="hidden lg:inline">Tentang Saya</span>
              </h2>
              {talent.bio ? (
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line mb-6">
                  {talent.bio}
                </p>
              ) : (
                <p className="text-xs text-slate-400 italic mb-6">Belum ada deskripsi profil.</p>
              )}

              {/* Interests */}
              {talent.interests && talent.interests.length > 0 && (
                <>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Minat & Hobi Favorit
                  </h3>
                  <div className="flex flex-wrap gap-2 mb-6">
                    {talent.interests.map((interest) => (
                      <span
                        key={interest}
                        className="px-3 py-1 bg-purple-50 text-purple-900 text-xs font-medium rounded-lg border border-purple-100"
                      >
                        {interest}
                      </span>
                    ))}
                  </div>
                </>
              )}

              {/* Supported Activities */}
              {talent.activities && talent.activities.length > 0 && (
                <div className="hidden lg:block">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Aktivitas yang Didukung
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {talent.activities.map((actId) => {
                      const cat = categories.find((c) => c.id === actId);
                      if (!cat) return null;
                      return (
                        <div
                          key={actId}
                          className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-xs"
                        >
                          <strong className="text-slate-900 block font-semibold mb-0.5">
                            {cat.title}
                          </strong>
                          <span className="text-slate-500 line-clamp-1">{cat.description}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Detail Layanan (HP) */}
              <div className="lg:hidden mt-5">
                <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 mb-2.5">
                  <Sparkles className="w-5 h-5 text-purple-700" /> Detail Layanan
                </h3>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 border border-purple-100 px-3 py-2 text-sm font-medium text-purple-900">
                    <Clock className="w-4 h-4 text-purple-700" /> Durasi: min. 1 jam
                  </span>
                  {talent.city && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 border border-purple-100 px-3 py-2 text-sm font-medium text-purple-900">
                      <MapPin className="w-4 h-4 text-purple-700" /> Lokasi: {talent.city}
                    </span>
                  )}
                  {talent.serviceMode && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 border border-purple-100 px-3 py-2 text-sm font-medium text-purple-900">
                      <Users className="w-4 h-4 text-purple-700" /> Tersedia: {talent.serviceMode}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Talent Availability Schedule Card */}
            <div className="bg-white rounded-3xl lg:rounded-2xl border border-slate-200/80 p-4 sm:p-6 md:p-8 shadow-xs space-y-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-purple-700" />
                <h2 className="text-lg font-bold text-slate-900">
                  Jadwal Ketersediaan
                </h2>
              </div>

              {availabilitySlots.length === 0 ? (
                <p className="text-xs text-slate-600 leading-relaxed">
                  Jadwal fleksibel — Anda dapat memilih tanggal dan jam pertemuan secara langsung melalui tombol Ajukan Booking.
                </p>
              ) : (
                <div className="space-y-4 text-xs">
                  {(() => {
                    const weeklyActive = availabilitySlots.filter(
                      (s) => s.day_of_week !== null && s.specific_date === null && s.is_available
                    );
                    const todayIso = new Date().toISOString().split('T')[0];
                    const specificUpcoming = availabilitySlots.filter(
                      (s) => s.specific_date && s.specific_date >= todayIso
                    );

                    return (
                      <>
                        {weeklyActive.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {DAY_OF_WEEK_OPTIONS.map((dayOpt) => {
                              const daySlots = weeklyActive.filter((s) => s.day_of_week === dayOpt.value);
                              if (daySlots.length === 0) return null;
                              return (
                                <div
                                  key={dayOpt.value}
                                  className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between gap-2"
                                >
                                  <span className="font-bold text-slate-800">{dayOpt.label}</span>
                                  <span className="font-mono text-purple-900 font-semibold">
                                    {daySlots
                                      .map((s) => `${formatTimeShort(s.start_time)}–${formatTimeShort(s.end_time)}`)
                                      .join(', ')}{' '}
                                    WIB
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {specificUpcoming.length > 0 && (
                          <div className="space-y-2">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                              Jadwal / Pengecualian Tanggal Khusus
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {specificUpcoming.map((s) => (
                                <span
                                  key={s.id}
                                  className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold ${
                                    s.is_available
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : 'bg-rose-50 text-rose-700 border-rose-200'
                                  }`}
                                >
                                  {new Date(`${s.specific_date}T00:00:00`).toLocaleDateString('id-ID', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}{' '}
                                  • {formatTimeShort(s.start_time)}–{formatTimeShort(s.end_time)} WIB{' '}
                                  {s.is_available ? '(Tersedia)' : '(Libur)'}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Customer Reviews Card */}
            <div className="bg-white rounded-3xl lg:rounded-2xl border border-slate-200/80 p-4 sm:p-6 md:p-8 shadow-xs space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-purple-700" />
                  <h2 className="text-lg font-bold text-slate-900">
                    Ulasan Customer
                  </h2>
                </div>
                {reviews.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full tabular-nums">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>
                      {(reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)}
                    </span>
                    <span className="text-slate-500 font-normal">
                      dari {reviews.length} ulasan
                    </span>
                  </div>
                )}
              </div>

              {reviews.length === 0 ? (
                <div className="p-6 rounded-xl bg-slate-50 border border-slate-200/70 text-center space-y-1.5">
                  <p className="text-sm font-semibold text-slate-700">
                    Belum ada ulasan dari Customer.
                  </p>
                  <p className="text-xs text-slate-500">
                    Jadilah yang pertama menyelesaikan sesi bersama {talent.name} dan membagikan pengalaman Anda.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reviews.map((rev) => (
                    <div
                      key={rev.id}
                      className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold">
                            {rev.reviewerName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900">{rev.reviewerName}</p>
                            <p className="text-[11px] text-slate-400">
                              {new Date(rev.created_at).toLocaleDateString('id-ID', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`w-3.5 h-3.5 ${
                                star <= rev.rating
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-300'
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      {rev.review_text ? (
                        <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                          {rev.review_text}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 italic">
                          Memberikan rating {rev.rating}/5 bintang.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Safety Notice */}
            <div className="bg-purple-950 text-white rounded-3xl lg:rounded-2xl p-5 lg:p-6 border border-purple-900 space-y-3">
              <div className="flex items-center gap-2 text-pink-400 text-xs font-bold">
                <Ban className="w-4 h-4 shrink-0" />
                <span>KEBIJAKAN KESELAMATAN & KEPATUHAN ETIKA</span>
              </div>
              <h3 className="font-bold text-sm text-white">
                Panduan Sesi Bersama Talent YUKU
              </h3>
              <ul className="text-xs text-purple-200/80 space-y-1.5 list-disc list-inside">
                <li>Pertemuan tatap muka hanya boleh dilakukan di tempat umum dan terbuka (mall, kafe, bioskop).</li>
                <li>Dilarang mengajak Talent ke tempat tertutup, kamar hotel, atau tempat tinggal pribadi.</li>
                <li>YUKU secara tegas bukan layanan kencan dan menolak keras segala bentuk permintaan seksual.</li>
                <li>Semua pihak wajib berusia minimal 18 tahun dan telah terverifikasi identitas.</li>
              </ul>
            </div>
          </div>

          {/* Right Column: Booking Widget Card */}
          <div className="lg:col-span-4 lg:sticky lg:top-24">
            <div className="bg-white rounded-2xl border border-purple-200 shadow-lg p-6 space-y-5">
              <div className="border-b border-slate-100 pb-4">
                <span className="text-xs text-slate-500 block font-medium">Tarif Layanan</span>
                <div className="text-2xl font-black text-[#1E0938] tabular-nums mt-0.5">
                  {talent.hourlyRate ? formatRupiah(talent.hourlyRate) : 'Disesuaikan'}
                  {talent.hourlyRate ? <span className="text-xs font-normal text-slate-500"> / jam offline</span> : null}
                </div>
                {talent.onlineChatRate && (
                  <div className="text-xs text-purple-700 font-semibold mt-1">
                    {formatRupiah(talent.onlineChatRate)} / jam teman online chat
                  </div>
                )}
              </div>

              <div className="space-y-3 text-xs text-slate-600">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span>Minimal Booking:</span>
                  </span>
                  <span className="font-semibold text-slate-800">1 Jam</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Perlindungan Escrow:</span>
                  </span>
                  <span className="font-semibold text-emerald-700">Dana Terlindungi</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Status Verifikasi:</span>
                  </span>
                  <span className="font-semibold text-purple-900">Terverifikasi 18+</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsBookingModalOpen(true)}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-purple-700 via-fuchsia-700 to-amber-600 hover:from-purple-800 hover:to-amber-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Calendar className="w-4 h-4" />
                <span>Ajukan Booking</span>
              </button>

              <p className="text-[11px] text-slate-400 text-center leading-tight">
                *Seluruh transaksi dilindungi oleh Sistem Escrow & Komitmen Keamanan YUKU.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sticky Bottom Booking CTA Bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shadow-[0_-6px_20px_rgba(15,23,42,0.08)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xl font-black text-[#1E0938] tabular-nums truncate">
              {talent.hourlyRate ? formatRupiah(talent.hourlyRate) : 'Disesuaikan'}
              {talent.hourlyRate ? <span className="text-sm font-normal text-slate-500"> / jam</span> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsBookingModalOpen(true)}
            className="px-6 py-3.5 bg-gradient-to-r from-purple-700 via-fuchsia-700 to-amber-600 hover:from-purple-800 hover:to-amber-700 text-white font-bold text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Calendar className="w-4 h-4" />
            <span>Ajukan Booking</span>
          </button>
        </div>
      </div>

      {/* Booking Modal */}
      <Modal
        isOpen={isBookingModalOpen}
        onClose={handleCloseModal}
        title={`Reservasi Aktivitas — ${talent.name}`}
      >
        {!createdBooking ? (
          <div>
            {!currentUser ? (
              <div className="py-6 text-center space-y-4 text-xs">
                <div className="w-12 h-12 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center mx-auto">
                  <Lock className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-slate-900">
                  Login Diperlukan untuk Reservasi
                </h4>
                <p className="text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Untuk keamanan transaksi dan perlindungan data kedua belah pihak, silakan masuk ke akun YUKU Anda sebelum melanjutkan pemesanan Talent.
                </p>
                <div className="pt-2 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleCloseModal();
                      onNavigate('/login');
                    }}
                    className="px-5 py-2 bg-purple-700 text-white font-bold rounded-lg hover:bg-purple-800 cursor-pointer shadow-xs"
                  >
                    Masuk Sekarang
                  </button>
                </div>
              </div>
            ) : currentUser.id === talent.id ? (
              <div className="py-6 text-center space-y-3 text-xs">
                <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-slate-900">
                  Profil Milik Anda Sendiri
                </h4>
                <p className="text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Anda sedang melihat profil Talent Anda sendiri. Pengguna tidak dapat membuat reservasi untuk akun mereka sendiri.
                </p>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 bg-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-300"
                >
                  Tutup
                </button>
              </div>
            ) : (
              <form onSubmit={handleBookingSubmit} className="space-y-4 text-xs">
                {bookingError && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="space-y-2">
                      <p className="leading-relaxed font-medium">{bookingError}</p>
                      {bookingError.toLowerCase().includes('ktp') && (
                        <button
                          type="button"
                          onClick={() => {
                            handleCloseModal();
                            onNavigate('/verifikasi-ktp');
                          }}
                          className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-lg text-[11px] cursor-pointer transition-colors"
                        >
                          Ajukan Verifikasi KTP Sekarang
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="p-3 rounded-lg bg-purple-50 text-purple-900 border border-purple-200 leading-relaxed">
                  <strong>Ketentuan Layanan YUKU:</strong> Seluruh pertemuan wajib dilakukan di area publik terbuka. Sistem escrow menjamin kebebasan dan keamanan transaksi Anda.
                </div>

                {/* Activity & Booking Mode */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Pilih Aktivitas *
                    </label>
                    <select
                      value={selectedActivity}
                      onChange={(e) => setSelectedActivity(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
                    >
                      {talent.activities.length > 0 ? (
                        talent.activities.map((actId) => {
                          const cat = categories.find((c) => c.id === actId);
                          return (
                            <option key={actId} value={actId}>
                              {cat?.title || actId}
                            </option>
                          );
                        })
                      ) : (
                        categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Mode Aktivitas *
                    </label>
                    <select
                      value={bookingMode}
                      onChange={(e) => setBookingMode(e.target.value as 'offline' | 'online')}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
                    >
                      <option value="offline">Tatap Muka di Tempat Publik (Offline)</option>
                      {talent.onlineChatRate && (
                        <option value="online">Online Companion / Video Chat</option>
                      )}
                    </select>
                  </div>
                </div>

                {/* Date & Time Picker */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Tanggal Pertemuan *
                    </label>
                    <input
                      type="date"
                      required
                      min={tomorrowStr}
                      value={bookingDate}
                      onChange={(e) => setBookingDate(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Jam Mulai Pertemuan *
                    </label>
                    <select
                      value={bookingTime}
                      onChange={(e) => setBookingTime(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
                    >
                      <option value="09:00">09:00 Pagi</option>
                      <option value="10:00">10:00 Pagi</option>
                      <option value="11:00">11:00 Siang</option>
                      <option value="12:00">12:00 Siang</option>
                      <option value="13:00">13:00 Siang</option>
                      <option value="14:00">14:00 Siang</option>
                      <option value="15:00">15:00 Sore</option>
                      <option value="16:00">16:00 Sore</option>
                      <option value="17:00">17:00 Sore</option>
                      <option value="18:00">18:00 Malam</option>
                      <option value="19:00">19:00 Malam</option>
                      <option value="20:00">20:00 Malam</option>
                    </select>
                  </div>
                </div>

                {(() => {
                  const availCheck = checkBookingAgainstAvailability(
                    availabilitySlots,
                    bookingDate,
                    bookingTime,
                    durationHours
                  );
                  if (!availCheck.hasSchedule) return null;
                  return (
                    <div
                      className={`p-2.5 rounded-lg border text-[11px] flex items-center gap-2 ${
                        availCheck.isAvailable
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                      }`}
                    >
                      {availCheck.isAvailable ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      )}
                      <span>
                        {availCheck.isAvailable
                          ? 'Waktu pilihan Anda sesuai dengan jadwal ketersediaan Talent.'
                          : availCheck.reason}
                      </span>
                    </div>
                  );
                })()}

                {/* Duration & Price Estimate */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Durasi Pertemuan *
                    </label>
                    <select
                      value={durationHours}
                      onChange={(e) => setDurationHours(Number(e.target.value))}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
                    >
                      <option value={1}>1 Jam</option>
                      <option value={2}>2 Jam</option>
                      <option value={3}>3 Jam</option>
                      <option value={4}>4 Jam</option>
                      <option value={5}>5 Jam</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Perkiraan Total Biaya
                    </label>
                    <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-lg font-black text-purple-900 text-sm">
                      {formatRupiah((selectedHourlyRate || 0) * durationHours)}
                    </div>
                  </div>
                </div>

                {/* Location */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nama Lokasi Ruang Publik (Kafe / Mall / Restoran) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Kafe Titik Temu, Senopati / Grand Indonesia Mall"
                    value={meetingLocation}
                    onChange={(e) => setMeetingLocation(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Detail Alamat / Titik Temu Spesifik (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Lobby Utama East Mall Lantai Dasar dekat Starbucks"
                    value={meetingAddress}
                    onChange={(e) => setMeetingAddress(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    disabled={isSubmittingBooking}
                    className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingBooking}
                    className="px-5 py-2.5 bg-purple-700 text-white font-bold rounded-lg hover:bg-purple-800 shadow-xs cursor-pointer flex items-center gap-2 disabled:opacity-50"
                  >
                    {isSubmittingBooking ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Menyimpan ke Supabase...</span>
                      </>
                    ) : (
                      <span>Kirim Permintaan Booking Nyata</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          <div className="py-6 text-center space-y-4 text-xs">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-slate-900">
              Reservasi Booking Berhasil Tersimpan di Supabase!
            </h4>
            
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left space-y-2 max-w-md mx-auto">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Kode Booking Resmi:</span>
                <span className="font-mono font-bold text-purple-900 bg-purple-100 px-2 py-0.5 rounded">
                  {createdBooking.booking_code}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Talent:</span>
                <span className="font-semibold text-slate-800">{talent.name}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Durasi:</span>
                <span className="font-semibold text-slate-800">{createdBooking.duration_hours} Jam</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Total Biaya (Server):</span>
                <span className="font-bold text-slate-900">{formatRupiah(createdBooking.gross_amount)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Status Reservasi:</span>
                <span className="inline-block bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded text-[11px]">
                  {createdBooking.status}
                </span>
              </div>
            </div>

            <p className="text-slate-600 max-w-sm mx-auto leading-relaxed text-[11px]">
              Slot Anda diamankan selama <strong>15 menit</strong>. Langkah berikutnya: ketuk <strong>Bayar Sekarang</strong>, scan QRIS, lalu unggah bukti pembayaran. Booking baru aktif setelah pembayaran diverifikasi Admin.
            </p>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  handleCloseModal();
                  onNavigate('/riwayat-booking');
                }}
                className="w-full sm:w-auto px-5 py-2.5 bg-purple-700 text-white font-bold rounded-lg hover:bg-purple-800 cursor-pointer text-xs flex items-center justify-center gap-1.5 shadow-xs"
              >
                <span>Bayar Sekarang</span>
                <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
              </button>
              <button
                type="button"
                onClick={handleCloseModal}
                className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200 cursor-pointer text-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Photo Lightbox Overlay */}
      {lightboxIndex !== null && photoMedia[lightboxIndex] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pratinjau foto Talent"
          onClick={() => setLightboxIndex(null)}
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            aria-label="Tutup galeri foto"
            className="absolute top-4 right-4 p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          {photoMedia.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((lightboxIndex - 1 + photoMedia.length) % photoMedia.length);
              }}
              aria-label="Foto sebelumnya"
              className="absolute left-3 sm:left-6 p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-4xl w-full flex flex-col items-center gap-3"
          >
            <img
              src={photoMedia[lightboxIndex].media_url}
              alt={photoMedia[lightboxIndex].caption || `Foto ${talent.name}`}
              className="max-h-[80vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl"
              referrerPolicy="no-referrer"
            />
            <div className="flex items-center justify-between gap-4 text-xs text-white/90 px-2">
              <span>{photoMedia[lightboxIndex].caption || `Foto ${talent.name}`}</span>
              <span className="font-mono text-white/60 tabular-nums">
                {lightboxIndex + 1} / {photoMedia.length}
              </span>
            </div>
          </div>

          {photoMedia.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((lightboxIndex + 1) % photoMedia.length);
              }}
              aria-label="Foto berikutnya"
              className="absolute right-3 sm:right-6 p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

