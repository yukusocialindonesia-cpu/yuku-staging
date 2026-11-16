import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  User,
  Calendar,
  Clock,
  MapPin,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ShieldCheck,
  RefreshCw,
  Loader2,
  ArrowRight,
  Sparkles,
  Settings,
  CreditCard,
  Building,
  Smartphone,
  ChevronRight,
  ExternalLink,
  Ban,
  FileCheck,
  Eye,
  LogOut,
  HelpCircle,
  Award,
  ShieldAlert,
  Plus,
  Trash2,
  Gift,
  Copy,
  Check,
  Users,
  Image as ImageIcon,
  Video,
  Mic,
  Upload,
  Square,
  X,
  MessageSquare,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AppRoute } from '../types/navigation';
import { formatRupiah } from '../utils/formatters';
import { YUKU_BUSINESS_RULES } from '../utils/businessRules';
import { INDONESIA_CITIES } from '../utils/cities';
import { Modal } from '../components/common/Modal';
import { BookingChatModal } from '../components/chat/BookingChatModal';
import { ReportCategory, TalentAvailabilityRow, TalentMediaRow, TalentMediaType } from '../types/database';
import {
  REPORT_CATEGORY_OPTIONS,
  getReportCategoryLabel,
  getReportStatusMeta,
} from '../utils/reportHelpers';
import {
  DAY_OF_WEEK_OPTIONS,
  getDayOfWeekLabel,
  formatTimeShort,
} from '../utils/availabilityHelpers';

interface TalentDashboardPageProps {
  onNavigate: (path: AppRoute, params?: Record<string, string>) => void;
}

interface TalentProfileData {
  id: string;
  display_name: string;
  avatar_url: string | null;
  city: string;
  gender: string;
  headline: string | null;
  bio: string | null;
  hourly_rate: number;
  online_chat_rate: number | null;
  service_mode: string;
  rating: number;
  review_count: number;
  completed_hours: number;
  referral_code?: string | null;
}

interface UserAccountData {
  account_status: string;
  is_verified_18: boolean;
}

interface TalentEarningItem {
  id: string;
  booking_id: string;
  net_earning: number;
  allocated_payout_amount: number;
  paid_out_amount: number;
  status: string;
}

interface UserIdentityData {
  ktp_verification_status: 'unsubmitted' | 'pending_review' | 'verified' | 'rejected';
  full_legal_name: string;
  ktp_rejection_reason?: string | null;
  ktp_storage_path?: string | null;
}

interface TalentBookingItem {
  id: string;
  booking_code: string;
  customer_id: string;
  talent_id: string;
  activity_category_id: string;
  booking_mode: 'offline' | 'online';
  start_time: string;
  end_time: string;
  duration_hours: number;
  meeting_location_name: string;
  meeting_location_address: string | null;
  gross_amount: number;
  platform_fee_amount: number;
  talent_gross_share: number;
  status: string;
  payment_expires_at: string;
  cancellation_reason: string | null;
  customer_completed_at: string | null;
  talent_completed_at: string | null;
  created_at: string;
  // Joins
  customer_name?: string;
  customer_email?: string;
  activity_title?: string;
  report?: {
    id: string;
    category: string;
    description: string;
    status: string;
    admin_notes: string | null;
    created_at: string;
  } | null;
}

interface PayoutItem {
  id: string;
  payout_number: string;
  amount: number;
  bank_name: string;
  bank_account_number: string;
  bank_account_holder_name: string;
  payout_status: 'requested' | 'processing' | 'completed_provider_confirmed' | 'rejected' | 'failed';
  rejection_reason: string | null;
  created_at: string;
}

interface ReferralNetworkItem {
  id: string;
  referee_talent_id: string;
  referee_name: string;
  referee_city: string;
  referee_account_status: string;
  referral_code_used: string;
  is_active: boolean;
  created_at: string;
}

interface MyReferrerInfo {
  id: string;
  referrer_id: string;
  referral_code_used: string;
  created_at: string;
}

interface ReferralRewardItem {
  id: string;
  referral_relationship_id: string;
  booking_id: string;
  platform_commission_base: number;
  reward_amount: number;
  status: 'pending_completion' | 'credited' | 'cancelled_disputed';
  credited_at: string | null;
  created_at: string;
}

type BookingStatusFilter =
  | 'all'
  | 'pending_payment'
  | 'paid_held_in_escrow'
  | 'confirmed_by_talent'
  | 'in_progress'
  | 'completed'
  | 'disputed_hold'
  | 'cancelled_by_customer'
  | 'cancelled_by_talent'
  | 'refunded'
  | 'expired';

export const TalentDashboardPage: React.FC<TalentDashboardPageProps> = ({ onNavigate }) => {
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Profile & Verification
  const [profile, setProfile] = useState<TalentProfileData | null>(null);
  const [identity, setIdentity] = useState<UserIdentityData | null>(null);
  const [userAccount, setUserAccount] = useState<UserAccountData | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  // Bookings & Ledgers
  const [bookings, setBookings] = useState<TalentBookingItem[]>([]);
  const [earnings, setEarnings] = useState<TalentEarningItem[]>([]);
  const [payouts, setPayouts] = useState<PayoutItem[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<TalentAvailabilityRow[]>([]);
  const [referrals, setReferrals] = useState<ReferralNetworkItem[]>([]);
  const [referralRewards, setReferralRewards] = useState<ReferralRewardItem[]>([]);
  const [myReferrer, setMyReferrer] = useState<MyReferrerInfo | null>(null);
  const [copiedReferralField, setCopiedReferralField] = useState<'code' | 'link' | null>(null);
  const [referralInputCode, setReferralInputCode] = useState('');
  const [isSubmittingReferral, setIsSubmittingReferral] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Active Dashboard Tab
  const [activeTab, setActiveTab] = useState<
    'bookings' | 'availability' | 'media' | 'referral' | 'payouts' | 'profile' | 'safety'
  >('bookings');
  const [bookingFilter, setBookingFilter] = useState<BookingStatusFilter>('all');

  // Media Gallery & Voice Intro State
  const [mediaItems, setMediaItems] = useState<TalentMediaRow[]>([]);
  const [mediaMigrationMissing, setMediaMigrationMissing] = useState(false);
  const [mediaType, setMediaType] = useState<TalentMediaType>('photo');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaCaption, setMediaCaption] = useState('');
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);
  const [confirmDeleteMediaId, setConfirmDeleteMediaId] = useState<string | null>(null);

  // Voice Recorder State
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedVoiceBlob, setRecordedVoiceBlob] = useState<Blob | null>(null);
  const [recordedVoiceUrl, setRecordedVoiceUrl] = useState<string | null>(null);
  const mediaFileInputRef = useRef<HTMLInputElement | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<BlobPart[]>([]);
  const voiceTimerRef = useRef<number | null>(null);

  // Availability Form State
  const [availabilityForm, setAvailabilityForm] = useState({
    mode: 'weekly' as 'weekly' | 'specific',
    dayOfWeek: 1,
    specificDate: new Date().toISOString().split('T')[0],
    startTime: '10:00',
    endTime: '18:00',
    isAvailable: true,
  });

  // Modals
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [profileAvatarFile, setProfileAvatarFile] = useState<File | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // Incident Report Modal States
  const [reportTarget, setReportTarget] = useState<TalentBookingItem | null>(null);
  const [reportCategory, setReportCategory] = useState<ReportCategory>('unethical_behavior');
  const [reportDescription, setReportDescription] = useState('');
  const [reportError, setReportError] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Real-Time Chat Modal State
  const [chatTargetBooking, setChatTargetBooking] = useState<TalentBookingItem | null>(null);

  // Payout Form State
  const [payoutForm, setPayoutForm] = useState({
    amount: '150000',
    bankName: 'BCA',
    accountNumber: '',
    holderName: '',
  });

  // Edit Profile Form State
  const [profileForm, setProfileForm] = useState({
    hourlyRate: '150000',
    onlineChatRate: '75000',
    headline: '',
    bio: '',
    city: 'Jakarta',
    serviceMode: 'Offline & Online',
  });

  // Load Session and Profile
  const loadDashboardData = useCallback(async (userId: string) => {
    setIsLoadingData(true);
    setErrorMessage(null);

    try {
      // 1. Fetch Talent Profile
      const { data: profData, error: profError } = await supabase
        .from('talent_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profError) {
        console.warn('Gagal membaca profil talent:', profError.message);
      }

      if (profData) {
        setProfile(profData as TalentProfileData);
        setProfileForm({
          hourlyRate: String(profData.hourly_rate || 150000),
          onlineChatRate: String(profData.online_chat_rate || 75000),
          headline: profData.headline || '',
          bio: profData.bio || '',
          city: profData.city || 'Jakarta',
          serviceMode: profData.service_mode || 'Offline & Online',
        });
      }

      // 2. Fetch User Identity & Users Account Status
      const { data: idData } = await supabase
        .from('user_identities')
        .select('ktp_verification_status, full_legal_name, ktp_rejection_reason, ktp_storage_path')
        .eq('id', userId)
        .maybeSingle();

      if (idData) {
        setIdentity(idData as UserIdentityData);
      }

      const { data: userData } = await supabase
        .from('users')
        .select('account_status, is_verified_18')
        .eq('id', userId)
        .maybeSingle();

      if (userData) {
        setUserAccount(userData as UserAccountData);
      }

      // 3. Fetch Bookings for this Talent
      const { data: bookingRows, error: bookingErr } = await supabase
        .from('bookings')
        .select(`
          id,
          booking_code,
          customer_id,
          talent_id,
          activity_category_id,
          booking_mode,
          start_time,
          end_time,
          duration_hours,
          meeting_location_name,
          meeting_location_address,
          gross_amount,
          platform_fee_amount,
          talent_gross_share,
          status,
          payment_expires_at,
          cancellation_reason,
          customer_completed_at,
          talent_completed_at,
          created_at
        `)
        .eq('talent_id', userId)
        .order('created_at', { ascending: false });

      if (bookingErr) {
        console.warn('Gagal membaca pesanan talent:', bookingErr.message);
      }

      // Enrich with customer profiles, activities, and talent-submitted reports
      let enrichedBookings: TalentBookingItem[] = [];
      if (bookingRows && bookingRows.length > 0) {
        const bookingIds = bookingRows.map((b) => b.id);
        const customerIds = Array.from(new Set(bookingRows.map((b) => b.customer_id)));

        const [{ data: customers }, { data: categories }, { data: reportsData }] = await Promise.all([
          supabase.from('customer_profiles').select('id, display_name').in('id', customerIds),
          supabase.from('activity_categories').select('id, title'),
          supabase
            .from('reports_complaints')
            .select('id, booking_id, category, description, status, admin_notes, created_at')
            .eq('reporter_id', userId)
            .in('booking_id', bookingIds)
            .order('created_at', { ascending: false }),
        ]);

        const customerMap = new Map((customers || []).map((c) => [c.id, c.display_name]));
        const categoryMap = new Map((categories || []).map((cat) => [cat.id, cat.title]));
        const reportMap = new Map<string, any>();
        reportsData?.forEach((rep) => {
          if (rep.booking_id && !reportMap.has(rep.booking_id)) {
            reportMap.set(rep.booking_id, rep);
          }
        });

        enrichedBookings = bookingRows.map((b) => {
          const rep = reportMap.get(b.id) ?? null;
          return {
            ...b,
            customer_name: customerMap.get(b.customer_id) || 'Customer YUKU',
            activity_title: categoryMap.get(b.activity_category_id) || 'Pendamping Aktivitas',
            report: rep
              ? {
                  id: rep.id,
                  category: rep.category,
                  description: rep.description,
                  status: rep.status,
                  admin_notes: rep.admin_notes ?? null,
                  created_at: rep.created_at,
                }
              : null,
          };
        });
      }

      setBookings(enrichedBookings);

      // 4. Fetch Payout Requests
      const { data: payoutRows, error: payoutErr } = await supabase
        .from('payout_requests')
        .select(`
          id,
          payout_number,
          amount,
          bank_name,
          bank_account_number,
          bank_account_holder_name,
          payout_status,
          rejection_reason,
          created_at
        `)
        .eq('talent_id', userId)
        .order('created_at', { ascending: false });

      if (payoutErr) {
        console.warn('Gagal membaca riwayat payout:', payoutErr.message);
      }

      setPayouts((payoutRows as PayoutItem[]) || []);

      // 5. Fetch Talent Earnings Ledger
      const { data: earningRows, error: earningErr } = await supabase
        .from('talent_earnings')
        .select('id, booking_id, net_earning, allocated_payout_amount, paid_out_amount, status')
        .eq('talent_id', userId);

      if (earningErr) {
        console.warn('Gagal membaca data penghasilan talent:', earningErr.message);
      }

      setEarnings((earningRows as TalentEarningItem[]) || []);

      // 6. Fetch Talent Availability Schedule
      const { data: availabilityRows, error: availabilityErr } = await supabase
        .from('talent_availability')
        .select('id, talent_id, day_of_week, specific_date, start_time, end_time, is_available, created_at')
        .eq('talent_id', userId)
        .order('day_of_week', { ascending: true, nullsFirst: false })
        .order('specific_date', { ascending: true, nullsFirst: false })
        .order('start_time', { ascending: true });

      if (availabilityErr) {
        console.warn('Gagal membaca jadwal ketersediaan talent:', availabilityErr.message);
      }

      setAvailabilitySlots((availabilityRows as TalentAvailabilityRow[]) || []);

      // 7. Fetch Referral Network, Referrer Relation, and Referral Rewards
      const { data: rpcReferrals, error: rpcReferralsErr } = await supabase.rpc('get_my_referral_network');
      if (!rpcReferralsErr && Array.isArray(rpcReferrals)) {
        setReferrals(rpcReferrals as ReferralNetworkItem[]);
      } else {
        const { data: rawReferrals } = await supabase
          .from('referral_relationships')
          .select('id, referee_talent_id, referral_code_used, is_active, created_at')
          .eq('referrer_id', userId)
          .order('created_at', { ascending: false });

        if (rawReferrals && rawReferrals.length > 0) {
          const refereeIds = rawReferrals.map((r) => r.referee_talent_id);
          const { data: refereeProfiles } = await supabase
            .from('talent_profiles')
            .select('id, display_name, city')
            .in('id', refereeIds);
          const refProfileMap = new Map(
            (refereeProfiles || []).map((tp) => [tp.id, tp])
          );
          setReferrals(
            rawReferrals.map((r) => {
              const tp = refProfileMap.get(r.referee_talent_id);
              return {
                id: r.id,
                referee_talent_id: r.referee_talent_id,
                referee_name: tp?.display_name || 'Talent Terdaftar',
                referee_city: tp?.city || '-',
                referee_account_status: tp ? 'active' : 'pending_verification',
                referral_code_used: r.referral_code_used,
                is_active: r.is_active,
                created_at: r.created_at,
              };
            })
          );
        } else {
          setReferrals([]);
        }
      }

      const [{ data: myRefData }, { data: rewardRows, error: rewardErr }] = await Promise.all([
        supabase
          .from('referral_relationships')
          .select('id, referrer_id, referral_code_used, created_at')
          .eq('referee_talent_id', userId)
          .maybeSingle(),
        supabase
          .from('referral_rewards')
          .select(
            'id, referral_relationship_id, booking_id, platform_commission_base, reward_amount, status, credited_at, created_at'
          )
          .eq('referrer_id', userId)
          .order('created_at', { ascending: false }),
      ]);

      setMyReferrer((myRefData as MyReferrerInfo | null) ?? null);
      if (rewardErr) {
        console.warn('Gagal membaca riwayat bonus referral:', rewardErr.message);
      }
      setReferralRewards((rewardRows as ReferralRewardItem[]) || []);

      // 8. Fetch Talent Media Gallery & Voice Intro
      const { data: mediaRows, error: mediaErr } = await supabase
        .from('talent_media')
        .select('id, talent_id, media_type, media_url, storage_path, caption, sort_order, created_at')
        .eq('talent_id', userId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (mediaErr) {
        const msg = mediaErr.message.toLowerCase();
        if (msg.includes('talent_media') || msg.includes('does not exist') || msg.includes('schema cache')) {
          setMediaMigrationMissing(true);
        } else {
          console.warn('Gagal membaca galeri media talent:', mediaErr.message);
        }
        setMediaItems([]);
      } else {
        setMediaMigrationMissing(false);
        setMediaItems((mediaRows as TalentMediaRow[]) || []);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Terjadi kesalahan sistem saat memuat data dashboard.');
    } finally {
      setIsLoadingProfile(false);
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUser(session?.user ?? null);
      setIsCheckingAuth(false);
      if (session?.user) {
        loadDashboardData(session.user.id);
      } else {
        setIsLoadingProfile(false);
        setIsLoadingData(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
      if (session?.user) {
        loadDashboardData(session.user.id);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadDashboardData]);

  useEffect(() => {
    return () => {
      if (voiceTimerRef.current !== null) {
        window.clearInterval(voiceTimerRef.current);
      }
      if (voiceRecorderRef.current && voiceRecorderRef.current.state !== 'inactive') {
        try {
          voiceRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (voiceStreamRef.current) {
        voiceStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (recordedVoiceUrl) {
        URL.revokeObjectURL(recordedVoiceUrl);
      }
    };
  }, [recordedVoiceUrl]);

  // Derived Approval Status (KTP verified + users.account_status active + users.is_verified_18 true)
  const isApproved =
    identity?.ktp_verification_status === 'verified' &&
    userAccount?.account_status === 'active' &&
    userAccount?.is_verified_18 === true;

  // Financial Calculations (derived from talent_earnings ledger)
  const completedBookings = bookings.filter((b) => b.status === 'completed');

  const availableBalance = Math.max(
    0,
    earnings
      .filter((e) => e.status === 'available_for_payout' || e.status === 'partially_paid_out')
      .reduce(
        (sum, e) =>
          sum +
          Math.max(
            0,
            Number(e.net_earning || 0) -
              Number(e.allocated_payout_amount || 0) -
              Number(e.paid_out_amount || 0)
          ),
        0
      )
  );

  const escrowBalance = earnings
    .filter((e) => e.status === 'held_in_escrow' || e.status === 'disputed_hold')
    .reduce((sum, e) => sum + Number(e.net_earning || 0), 0);

  const totalEarnedShare = earnings
    .filter(
      (e) =>
        e.status === 'available_for_payout' ||
        e.status === 'partially_paid_out' ||
        e.status === 'paid_out'
    )
    .reduce((sum, e) => sum + Number(e.net_earning || 0), 0);

  const totalPaidOut = payouts
    .filter((p) => p.payout_status === 'completed_provider_confirmed')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  // Filtered Bookings
  const filteredBookings = bookings.filter((b) => {
    if (bookingFilter === 'all') return true;
    return b.status === bookingFilter;
  });

  // Action: Accept Booking (paid_held_in_escrow -> confirmed_by_talent)
  const handleAcceptBooking = async (bookingId: string) => {
    if (!currentUser) return;
    setIsSubmittingAction(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { data: updatedRows, error } = await supabase
        .from('bookings')
        .update({
          status: 'confirmed_by_talent',
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId)
        .eq('talent_id', currentUser.id)
        .eq('status', 'paid_held_in_escrow')
        .select('id');

      if (error) throw error;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error('Status booking tidak dapat dikonfirmasi atau data tidak ditemukan.');
      }

      setSuccessMessage('Pesanan berhasil Anda konfirmasi! Silakan periksa detail waktu dan lokasi pertemuan publik.');
      await loadDashboardData(currentUser.id);
    } catch (err: any) {
      setErrorMessage(`Gagal mengonfirmasi pesanan: ${err?.message}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action: Start Booking Session (confirmed_by_talent -> in_progress)
  const handleStartBooking = async (bookingId: string) => {
    if (!currentUser) return;
    setIsSubmittingAction(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { data: updatedRows, error } = await supabase
        .from('bookings')
        .update({
          status: 'in_progress',
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId)
        .eq('talent_id', currentUser.id)
        .eq('status', 'confirmed_by_talent')
        .select('id');

      if (error) throw error;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error('Sesi booking tidak dapat dimulai atau data tidak ditemukan.');
      }

      setSuccessMessage('Sesi aktivitas dimulai! Pastikan pertemuan berlangsung di lokasi ruang publik yang aman.');
      await loadDashboardData(currentUser.id);
    } catch (err: any) {
      setErrorMessage(`Gagal memulai sesi booking: ${err?.message}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action: Complete Booking (in_progress -> completed)
  const handleCompleteBooking = async (booking: TalentBookingItem) => {
    if (!currentUser) return;
    const confirmFinish = window.confirm(
      `Konfirmasi penyelesaian sesi aktivitas bersama ${booking.customer_name}?\nSesi baru dinyatakan selesai setelah Customer juga mengonfirmasi.`
    );
    if (!confirmFinish) return;

    setIsSubmittingAction(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { data: completionResult, error } = await supabase.rpc('confirm_booking_completion', {
        p_booking_id: booking.id,
      });

      if (error) throw error;
      if (!completionResult) {
        throw new Error('Konfirmasi penyelesaian sesi tidak berhasil diproses.');
      }

      setSuccessMessage(
        completionResult.completed
          ? `Sesi selesai setelah dikonfirmasi kedua pihak. Penghasilan ${formatRupiah(booking.talent_gross_share)} akan tersedia sesuai proses pelepasan escrow jika tidak ada sengketa.`
          : 'Konfirmasi penyelesaian Anda tercatat. Saldo akan diproses setelah Customer juga mengonfirmasi sesi.'
      );
      await loadDashboardData(currentUser.id);
    } catch (err: any) {
      setErrorMessage(`Gagal menyelesaikan sesi booking: ${err?.message}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action: Cancel Booking (paid_held_in_escrow | confirmed_by_talent -> cancelled_by_talent)
  const handleCancelBooking = async (bookingId: string) => {
    if (!currentUser) return;
    const reason = window.prompt('Masukkan alasan pembatalan sesi aktivitas:', 'Jadwal berhalangan mendesak');
    if (!reason || !reason.trim()) return;

    setIsSubmittingAction(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { data: cancellationResult, error } = await supabase.rpc('request_talent_cancellation', {
        p_booking_id: bookingId,
        p_reason: reason.trim(),
      });

      if (error) throw error;
      if (!cancellationResult?.refund_id) {
        throw new Error('Permintaan pembatalan dan refund tidak berhasil dibuat.');
      }

      setSuccessMessage(`Pembatalan dicatat dan permintaan refund penuh sebesar ${formatRupiah(Number(cancellationResult.refund_amount))} dibuat. Tim Finance harus memproses refund melalui provider sebelum dana dinyatakan kembali.`);
      await loadDashboardData(currentUser.id);
    } catch (err: any) {
      setErrorMessage(`Gagal membatalkan pesanan: ${err?.message}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action: Submit Payout Request
  const handlePayoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const amountNum = parseInt(payoutForm.amount, 10);
    if (isNaN(amountNum) || amountNum < 100000) {
      setErrorMessage('Nominal penarikan saldo minimal adalah Rp 100.000 (sesuai aturan platform YUKU).');
      return;
    }

    if (amountNum > availableBalance) {
      setErrorMessage(`Saldo tersedia Anda saat ini adalah ${formatRupiah(availableBalance)}. Anda tidak dapat mencairkan melebihi saldo tersedia.`);
      return;
    }

    if (!payoutForm.accountNumber.trim() || !payoutForm.holderName.trim()) {
      setErrorMessage('Harap lengkapi nomor rekening dan nama pemilik rekening secara valid.');
      return;
    }

    setIsSubmittingAction(true);
    setErrorMessage(null);

    try {
      const payoutNumber = 'WD-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();

      const { error } = await supabase.from('payout_requests').insert({
        payout_number: payoutNumber,
        talent_id: currentUser.id,
        amount: amountNum,
        bank_name: payoutForm.bankName,
        bank_account_number: payoutForm.accountNumber.trim(),
        bank_account_holder_name: payoutForm.holderName.trim(),
        payout_provider: 'manual',
        payout_status: 'requested',
      });

      if (error) throw error;

      setIsPayoutModalOpen(false);
      setSuccessMessage(
        `Permintaan pencairan dana sebesar ${formatRupiah(amountNum)} dengan nomor ${payoutNumber} berhasil diajukan! Tim Finance YUKU akan memverifikasi dan memproses transfer secara manual.`
      );
      setPayoutForm({
        amount: '150000',
        bankName: 'BCA',
        accountNumber: '',
        holderName: '',
      });
      await loadDashboardData(currentUser.id);
    } catch (err: any) {
      setErrorMessage(`Gagal mengajukan pencairan saldo: ${err?.message}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action: Update Profile Settings
  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const rateNum = parseInt(profileForm.hourlyRate, 10);
    const onlineNum = profileForm.onlineChatRate ? parseInt(profileForm.onlineChatRate, 10) : null;

    if (isNaN(rateNum) || rateNum < 50000) {
      setErrorMessage('Tarif per jam minimal adalah Rp 50.000.');
      return;
    }

    if (profileAvatarFile) {
      if (profileAvatarFile.size > 10 * 1024 * 1024) {
        setErrorMessage('Ukuran foto profil maksimal 10 MB.');
        return;
      }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(profileAvatarFile.type)) {
        setErrorMessage('Format foto profil harus JPG, PNG, atau WebP.');
        return;
      }
    }

    setIsSubmittingAction(true);
    setErrorMessage(null);

    try {
      let newAvatarUrl: string | undefined;
      if (profileAvatarFile) {
        const ext = (profileAvatarFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const avatarPath = `${currentUser.id}/avatar_${Date.now()}.${ext}`;
        const { error: avatarErr } = await supabase.storage
          .from('avatars')
          .upload(avatarPath, profileAvatarFile, { upsert: false, contentType: profileAvatarFile.type });
        if (avatarErr) throw new Error(`Gagal mengunggah foto profil: ${avatarErr.message}`);
        newAvatarUrl = supabase.storage.from('avatars').getPublicUrl(avatarPath).data.publicUrl;
      }

      const { error } = await supabase
        .from('talent_profiles')
        .update({
          ...(newAvatarUrl ? { avatar_url: newAvatarUrl } : {}),
          hourly_rate: rateNum,
          online_chat_rate: onlineNum,
          headline: profileForm.headline.trim(),
          bio: profileForm.bio.trim(),
          city: profileForm.city.trim(),
          service_mode: profileForm.serviceMode,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentUser.id);

      if (error) throw error;

      setIsEditProfileModalOpen(false);
      setProfileAvatarFile(null);
      setSuccessMessage('Profil dan tarif layanan Talent Anda berhasil diperbarui!');
      await loadDashboardData(currentUser.id);
    } catch (err: any) {
      setErrorMessage(`Gagal memperbarui profil: ${err?.message}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const openReportModal = (booking: TalentBookingItem) => {
    setReportTarget(booking);
    setReportCategory('safety_concern');
    setReportDescription('');
    setReportError(null);
    setSuccessMessage(null);
  };

  const closeReportModal = () => {
    if (isSubmittingReport) return;
    setReportTarget(null);
    setReportError(null);
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !reportTarget) return;

    const trimmedDesc = reportDescription.trim();
    if (trimmedDesc.length < 15) {
      setReportError('Mohon jelaskan kronologi kejadian minimal 15 karakter agar tim admin dapat menindaklanjuti.');
      return;
    }

    setIsSubmittingReport(true);
    setReportError(null);

    try {
      const { error } = await supabase.from('reports_complaints').insert({
        reporter_id: currentUser.id,
        reported_user_id: reportTarget.customer_id,
        booking_id: reportTarget.id,
        category: reportCategory,
        description: trimmedDesc,
      });

      if (error) throw error;

      const code = reportTarget.booking_code;
      setReportTarget(null);
      setSuccessMessage(`Laporan insiden untuk pesanan ${code} berhasil dikirim ke Tim Keamanan YUKU.`);
      await loadDashboardData(currentUser.id);
    } catch (err: any) {
      setReportError(`Gagal mengirim laporan insiden: ${err?.message}`);
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // Action: Add Availability Slot
  const handleAddAvailabilitySlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (availabilityForm.endTime <= availabilityForm.startTime) {
      setErrorMessage('Jam selesai harus lebih akhir dari jam mulai.');
      return;
    }

    if (availabilityForm.mode === 'specific' && !availabilityForm.specificDate) {
      setErrorMessage('Pilih tanggal spesifik terlebih dahulu.');
      return;
    }

    setIsSubmittingAction(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const payload = {
        talent_id: currentUser.id,
        day_of_week: availabilityForm.mode === 'weekly' ? availabilityForm.dayOfWeek : null,
        specific_date: availabilityForm.mode === 'specific' ? availabilityForm.specificDate : null,
        start_time: `${availabilityForm.startTime}:00`,
        end_time: `${availabilityForm.endTime}:00`,
        is_available: availabilityForm.isAvailable,
      };

      const { error } = await supabase.from('talent_availability').insert(payload);
      if (error) throw error;

      setSuccessMessage('Slot jadwal ketersediaan berhasil ditambahkan.');
      await loadDashboardData(currentUser.id);
    } catch (err: any) {
      setErrorMessage(`Gagal menambahkan slot jadwal: ${err?.message}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleToggleAvailabilitySlot = async (slot: TalentAvailabilityRow) => {
    if (!currentUser) return;
    setIsSubmittingAction(true);
    setErrorMessage(null);
    try {
      const { error } = await supabase
        .from('talent_availability')
        .update({ is_available: !slot.is_available })
        .eq('id', slot.id)
        .eq('talent_id', currentUser.id);

      if (error) throw error;
      await loadDashboardData(currentUser.id);
    } catch (err: any) {
      setErrorMessage(`Gagal mengubah status jadwal: ${err?.message}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleDeleteAvailabilitySlot = async (slotId: string) => {
    if (!currentUser) return;
    setIsSubmittingAction(true);
    setErrorMessage(null);
    try {
      const { error } = await supabase
        .from('talent_availability')
        .delete()
        .eq('id', slotId)
        .eq('talent_id', currentUser.id);

      if (error) throw error;
      setSuccessMessage('Slot jadwal ketersediaan berhasil dihapus.');
      await loadDashboardData(currentUser.id);
    } catch (err: any) {
      setErrorMessage(`Gagal menghapus slot jadwal: ${err?.message}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleCopyReferral = async (type: 'code' | 'link') => {
    const code = profile?.referral_code;
    if (!code) return;

    const valueToCopy =
      type === 'code' ? code : `${window.location.origin}/daftar-talent?ref=${encodeURIComponent(code)}`;

    try {
      await navigator.clipboard.writeText(valueToCopy);
      setCopiedReferralField(type);
      setTimeout(() => {
        setCopiedReferralField((prev) => (prev === type ? null : prev));
      }, 2200);
    } catch {
      setErrorMessage('Gagal menyalin ke clipboard browser.');
    }
  };

  const handleApplyReferralCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    const normalized = referralInputCode.trim().toUpperCase();
    if (!normalized) {
      setErrorMessage('Masukkan kode referral Talent pengundang terlebih dahulu.');
      return;
    }

    setIsSubmittingReferral(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { data: rpcData, error } = await supabase.rpc('apply_talent_referral_code', {
        p_referral_code: normalized,
      });

      if (error) throw error;

      const referrerName =
        typeof rpcData === 'object' && rpcData !== null && 'referrer_name' in rpcData
          ? String((rpcData as Record<string, unknown>).referrer_name)
          : 'Talent YUKU';

      setReferralInputCode('');
      setSuccessMessage(`Kode referral ${normalized} berhasil ditautkan (pengundang: ${referrerName}).`);
      await loadDashboardData(currentUser.id);
    } catch (err: any) {
      setErrorMessage(`Gagal menautkan kode referral: ${err?.message}`);
    } finally {
      setIsSubmittingReferral(false);
    }
  };

  const stopVoiceStreamAndTimer = useCallback(() => {
    if (voiceTimerRef.current !== null) {
      window.clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    if (voiceStreamRef.current) {
      voiceStreamRef.current.getTracks().forEach((track) => track.stop());
      voiceStreamRef.current = null;
    }
  }, []);

  const handleClearRecordedVoice = useCallback(() => {
    if (recordedVoiceUrl) {
      URL.revokeObjectURL(recordedVoiceUrl);
    }
    setRecordedVoiceBlob(null);
    setRecordedVoiceUrl(null);
    setRecordingSeconds(0);
  }, [recordedVoiceUrl]);

  const handleStopVoiceRecording = useCallback(() => {
    if (voiceRecorderRef.current && voiceRecorderRef.current.state !== 'inactive') {
      voiceRecorderRef.current.stop();
    }
    setIsRecordingVoice(false);
    stopVoiceStreamAndTimer();
  }, [stopVoiceStreamAndTimer]);

  const handleStartVoiceRecording = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    handleClearRecordedVoice();
    setMediaFile(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErrorMessage('Browser Anda tidak mendukung rekam suara langsung. Silakan unggah file audio (.mp3, .wav, .m4a, atau .ogg).');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStreamRef.current = stream;

      const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const chosenType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = chosenType ? new MediaRecorder(stream, { mimeType: chosenType }) : new MediaRecorder(stream);

      voiceChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          voiceChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blobType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(voiceChunksRef.current, { type: blobType });
        if (blob.size > 0) {
          const previewUrl = URL.createObjectURL(blob);
          setRecordedVoiceBlob(blob);
          setRecordedVoiceUrl(previewUrl);
        }
        stopVoiceStreamAndTimer();
      };

      voiceRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingVoice(true);
      setRecordingSeconds(0);

      voiceTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 59) {
            handleStopVoiceRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      stopVoiceStreamAndTimer();
      setErrorMessage(`Izin mikrofon ditolak atau tidak tersedia: ${err?.message || 'Periksa pengaturan mikrofon browser.'}`);
    }
  };

  const handleUploadMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    const existingCount = mediaItems.filter((item) => item.media_type === mediaType).length;
    const maxPerType: Record<TalentMediaType, number> = { photo: 8, video: 3, voice: 2 };
    const typeLabel: Record<TalentMediaType, string> = {
      photo: 'Foto',
      video: 'Video',
      voice: 'Voice Intro',
    };

    if (existingCount >= maxPerType[mediaType]) {
      setErrorMessage(`Maksimal ${maxPerType[mediaType]} ${typeLabel[mediaType]} per profil Talent. Hapus salah satu jika ingin mengganti.`);
      return;
    }

    let fileToUpload: File | Blob | null = mediaFile;
    let fileExt = 'bin';
    let contentType = mediaFile?.type || 'application/octet-stream';
    let rawFileName = mediaFile?.name || 'media';

    if (mediaType === 'voice' && !fileToUpload && recordedVoiceBlob) {
      fileToUpload = recordedVoiceBlob;
      contentType = recordedVoiceBlob.type || 'audio/webm';
      fileExt = contentType.includes('mp4') ? 'm4a' : contentType.includes('ogg') ? 'ogg' : 'webm';
      rawFileName = `voice-intro.${fileExt}`;
    }

    if (!fileToUpload) {
      setErrorMessage(
        mediaType === 'voice'
          ? 'Pilih file audio atau rekam suara langsung terlebih dahulu.'
          : `Pilih file ${typeLabel[mediaType].toLowerCase()} terlebih dahulu.`
      );
      return;
    }

    const maxBytes = mediaType === 'photo' ? 8 * 1024 * 1024 : mediaType === 'video' ? 50 * 1024 * 1024 : 15 * 1024 * 1024;
    if (fileToUpload.size > maxBytes) {
      const maxMb = Math.round(maxBytes / (1024 * 1024));
      setErrorMessage(`Ukuran file ${typeLabel[mediaType]} melebihi batas maksimal ${maxMb} MB.`);
      return;
    }

    if (mediaFile) {
      const parts = mediaFile.name.split('.');
      fileExt = parts.length > 1 ? parts.pop()!.toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin';
      rawFileName = mediaFile.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 32) || mediaType;
    } else {
      rawFileName = 'voice-intro';
    }

    const storagePath = `${currentUser.id}/${mediaType}/${Date.now()}-${rawFileName}.${fileExt}`;

    setIsUploadingMedia(true);
    try {
      const { error: uploadErr } = await supabase.storage
        .from('talent-media')
        .upload(storagePath, fileToUpload, {
          contentType,
          upsert: false,
        });

      if (uploadErr) {
        throw uploadErr;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from('talent-media').getPublicUrl(storagePath);

      const cleanCaption = mediaCaption.trim() || null;

      const { data: insertedRow, error: insertErr } = await supabase
        .from('talent_media')
        .insert({
          talent_id: currentUser.id,
          media_type: mediaType,
          media_url: publicUrl,
          storage_path: storagePath,
          caption: cleanCaption,
          sort_order: existingCount,
        })
        .select('id, talent_id, media_type, media_url, storage_path, caption, sort_order, created_at')
        .single();

      if (insertErr) {
        await supabase.storage.from('talent-media').remove([storagePath]);
        throw insertErr;
      }

      setMediaItems((prev) => [insertedRow as TalentMediaRow, ...prev]);
      setMediaFile(null);
      setMediaCaption('');
      handleClearRecordedVoice();
      if (mediaFileInputRef.current) {
        mediaFileInputRef.current.value = '';
      }
      setSuccessMessage(`${typeLabel[mediaType]} berhasil ditambahkan ke profil Anda!`);
    } catch (err: any) {
      setErrorMessage(`Gagal mengunggah ${typeLabel[mediaType].toLowerCase()}: ${err?.message || 'Pastikan migrasi database sudah dijalankan.'}`);
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleDeleteMedia = async (item: TalentMediaRow) => {
    if (!currentUser) return;
    setDeletingMediaId(item.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { error: deleteErr } = await supabase
        .from('talent_media')
        .delete()
        .eq('id', item.id)
        .eq('talent_id', currentUser.id);

      if (deleteErr) throw deleteErr;

      if (item.storage_path) {
        await supabase.storage.from('talent-media').remove([item.storage_path]);
      }

      setMediaItems((prev) => prev.filter((m) => m.id !== item.id));
      setConfirmDeleteMediaId(null);
      setSuccessMessage('Media berhasil dihapus dari galeri profil Anda.');
    } catch (err: any) {
      setErrorMessage(`Gagal menghapus media: ${err?.message}`);
    } finally {
      setDeletingMediaId(null);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="py-24 text-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-purple-700 mx-auto" />
        <p className="text-xs text-slate-500 font-medium">Memverifikasi sesi akun Talent...</p>
      </div>
    );
  }

  // Not Logged In View
  if (!currentUser) {
    return (
      <div className="py-20 bg-[#FAF8FC]">
        <div className="max-w-md mx-auto px-4 text-center space-y-5 bg-white p-8 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="w-14 h-14 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center mx-auto">
            <User className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Masuk ke Dashboard Talent</h1>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Silakan login dengan akun Talent Anda untuk mengelola jadwal, menerima pesanan, dan mencairkan penghasilan.
            </p>
          </div>
          <div className="pt-2 flex flex-col gap-2.5">
            <button
              onClick={() => onNavigate('/login')}
              className="w-full py-3 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-colors"
            >
              Masuk Sekarang
            </button>
            <button
              onClick={() => onNavigate('/daftar-talent')}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl cursor-pointer transition-colors"
            >
              Belum Menjadi Talent? Daftar di Sini
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Logged in user without talent profile
  if (!isLoadingProfile && !profile) {
    return (
      <div className="py-20 bg-[#FAF8FC]">
        <div className="max-w-lg mx-auto px-4 text-center space-y-6 bg-white p-8 rounded-2xl border border-purple-200 shadow-sm">
          <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
            <Sparkles className="w-8 h-8" />
          </div>
          <div>
            <span className="text-xs font-bold text-purple-700 uppercase tracking-wider block mb-1">
              Akun Customer Terdeteksi
            </span>
            <h1 className="text-2xl font-black text-slate-900">
              Anda Belum Terdaftar Sebagai Talent
            </h1>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Halo, <strong>{currentUser.email}</strong>. Akun Anda saat ini terdaftar sebagai pengguna umum (Customer). Dapatkan penghasilan dari aktivitas sosial positif dengan mendaftarkan diri sebagai Talent YUKU.
            </p>
          </div>
          <div className="p-4 bg-purple-50 rounded-xl text-left text-xs text-purple-900 border border-purple-100 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-purple-700" />
              <span>Keuntungan Menjadi Talent YUKU</span>
            </div>
            <ul className="text-[11px] text-purple-800 space-y-1 list-disc list-inside">
              <li>Mendapatkan 80% bagi hasil langsung dari setiap sesi aktivitas.</li>
              <li>Pertemuan 100% aman dan hanya diizinkan di ruang publik terbuka.</li>
              <li>Jadwal fleksibel yang dapat Anda tentukan sendiri sesuka hati.</li>
            </ul>
          </div>
          <button
            onClick={() => onNavigate('/daftar-talent')}
            className="w-full py-3.5 bg-gradient-to-r from-purple-700 via-fuchsia-700 to-amber-600 hover:from-purple-800 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all"
          >
            Ajukan Profil Talent Saya Sekarang
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 bg-[#FAF8FC] min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Top Notification Alerts */}
        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <p className="font-medium">{errorMessage}</p>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-500 hover:text-rose-700 font-bold"
            >
              ×
            </button>
          </div>
        )}

        {successMessage && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="font-medium">{successMessage}</p>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-500 hover:text-emerald-700 font-bold"
            >
              ×
            </button>
          </div>
        )}

        {/* Talent Profile Header Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-purple-50 border-2 border-purple-200 shrink-0 relative flex items-center justify-center">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-10 h-10 text-purple-400" />
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900">
                  {profile?.display_name || 'Talent YUKU'}
                </h1>

                {/* Approval Badge */}
                {isApproved ? (
                  <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Aktif di Katalog</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 text-[11px] font-bold rounded-full flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>Menunggu Kurasi Admin</span>
                  </span>
                )}

                {/* KTP Status */}
                {identity?.ktp_verification_status === 'verified' && userAccount?.is_verified_18 ? (
                  <span className="px-2.5 py-0.5 bg-purple-100 text-purple-900 text-[11px] font-bold rounded-full flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span>KTP Terverifikasi 18+</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 text-[11px] font-medium rounded-full">
                    KTP: {identity?.ktp_verification_status || 'unsubmitted'}
                  </span>
                )}
              </div>

              <p className="text-xs text-purple-700 font-semibold line-clamp-1 mb-2">
                {profile?.headline || 'Teman pendamping ramah & menyenangkan'}
              </p>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-amber-600" />
                  <span>{profile?.city || 'Jakarta'}</span>
                </span>
                <span>•</span>
                <span>Tarif: <strong className="text-slate-900 font-bold">{formatRupiah(profile?.hourly_rate || 150000)}/jam</strong></span>
                <span>•</span>
                <span>Total Selesai: <strong>{profile?.completed_hours || 0} Jam</strong></span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            <button
              onClick={() => setIsEditProfileModalOpen(true)}
              className="flex-1 md:flex-none px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Ubah Tarif & Bio</span>
            </button>
            <button
              onClick={() => currentUser && loadDashboardData(currentUser.id)}
              disabled={isLoadingData}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors cursor-pointer"
              title="Perbarui data"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingData ? 'animate-spin text-purple-700' : ''}`} />
            </button>
          </div>
        </div>

        {/* 4 Financial & Operational Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Available Balance */}
          <div className="bg-gradient-to-br from-purple-900 via-purple-950 to-[#1E0938] text-white p-5 rounded-2xl shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-purple-200">Saldo Siap Dicairkan</span>
              <DollarSign className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black tracking-tight text-white tabular-nums">
              {formatRupiah(availableBalance)}
            </div>
            <p className="text-[11px] text-purple-300 mt-1">
              Bersih setelah pembagian komisi 80% Talent.
            </p>
            <button
              onClick={() => setIsPayoutModalOpen(true)}
              disabled={availableBalance < 100000}
              className="mt-4 w-full py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-slate-950 font-black text-xs rounded-lg shadow-xs cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Tarik Saldo (Min. Rp100k)</span>
            </button>
          </div>

          {/* Card 2: Total Akumulasi Pendapatan & Dana di Escrow */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-500 uppercase">Total Pendapatan</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-slate-900 tabular-nums">
              {formatRupiah(totalEarnedShare)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Akumulasi dari {completedBookings.length} order yang telah selesai.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <div className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md font-medium inline-block">
                Sudah Dicairkan: {formatRupiah(totalPaidOut)}
              </div>
              <div className="text-[11px] text-amber-800 bg-amber-50 px-2 py-1 rounded-md font-medium inline-block">
                Dana di Escrow: {formatRupiah(escrowBalance)}
              </div>
            </div>
          </div>

          {/* Card 3: Pesanan Menunggu Konfirmasi */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-500 uppercase">Perlu Tanggapan</span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-black text-amber-600 tabular-nums">
              {bookings.filter((b) => b.status === 'paid_held_in_escrow').length}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Permintaan reservasi customer menunggu persetujuan Anda.
            </p>
            <button
              onClick={() => {
                setActiveTab('bookings');
                setBookingFilter('paid_held_in_escrow');
              }}
              className="mt-3 text-xs text-purple-700 font-bold hover:underline inline-flex items-center gap-1"
            >
              <span>Tinjau pesanan masuk</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* Card 4: Jadwal Aktif Mendatang */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-500 uppercase">Jadwal Terkonfirmasi</span>
              <Calendar className="w-4 h-4 text-purple-700" />
            </div>
            <div className="text-2xl font-black text-purple-900 tabular-nums">
              {bookings.filter((b) => b.status === 'confirmed_by_talent').length}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Pertemuan terjadwal yang siap dilaksanakan di tempat publik.
            </p>
            <button
              onClick={() => {
                setActiveTab('bookings');
                setBookingFilter('confirmed_by_talent');
              }}
              className="mt-3 text-xs text-purple-700 font-bold hover:underline inline-flex items-center gap-1"
            >
              <span>Lihat jadwal aktif</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-bold text-slate-600 overflow-x-auto">
          <button
            onClick={() => setActiveTab('bookings')}
            className={`px-4 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'bookings'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Manajemen Pesanan ({bookings.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('availability')}
            className={`px-4 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'availability'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Jadwal Ketersediaan ({availabilitySlots.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('media')}
            className={`px-4 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'media'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Galeri &amp; Voice ({mediaItems.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('referral')}
            className={`px-4 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'referral'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <Gift className="w-3.5 h-3.5" />
            <span>Program Referral ({referrals.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('payouts')}
            className={`px-4 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeTab === 'payouts'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Riwayat Tarik Saldo ({payouts.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('safety')}
            className={`px-4 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeTab === 'safety'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Protokol Keamanan Talent</span>
          </button>
        </div>

        {/* TAB 1: BOOKING MANAGEMENT */}
        {activeTab === 'bookings' && (
          <div className="space-y-4">
            {/* Filter Sub-nav */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-400 font-semibold mr-1">Filter:</span>
              {[
                { label: 'Semua', val: 'all' },
                { label: 'Menunggu Pembayaran', val: 'pending_payment' },
                { label: 'Dibayar (Perlu Konfirmasi)', val: 'paid_held_in_escrow' },
                { label: 'Terkonfirmasi', val: 'confirmed_by_talent' },
                { label: 'Sedang Berlangsung', val: 'in_progress' },
                { label: 'Selesai', val: 'completed' },
                { label: 'Dalam Sengketa', val: 'disputed_hold' },
                { label: 'Dibatalkan Customer', val: 'cancelled_by_customer' },
                { label: 'Dibatalkan Talent', val: 'cancelled_by_talent' },
                { label: 'Refund', val: 'refunded' },
                { label: 'Kedaluwarsa', val: 'expired' },
              ].map((f) => (
                <button
                  key={f.val}
                  onClick={() => setBookingFilter(f.val as BookingStatusFilter)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                    bookingFilter === f.val
                      ? 'bg-purple-50 text-purple-900 border-purple-300 font-bold'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {isLoadingData ? (
              <div className="py-12 bg-white rounded-2xl border border-slate-200/80 text-center space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-purple-700 mx-auto" />
                <p className="text-xs text-slate-500">Memuat daftar pesanan dari database Supabase...</p>
              </div>
            ) : filteredBookings.length === 0 ? (
              <div className="py-12 bg-white rounded-2xl border border-slate-200/80 text-center space-y-3 p-6">
                <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
                <h3 className="text-sm font-bold text-slate-800">
                  Tidak Ada Pesanan Pada Kategori Ini
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Belum ada permintaan booking dengan status tersebut. Pastikan profil Anda sudah diatur ke status aktif agar customer dapat menemukan Anda di katalog publik.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredBookings.map((b) => {
                  const startDate = new Date(b.start_time);
                  const isUpcoming = startDate.getTime() > Date.now();

                  return (
                    <div
                      key={b.id}
                      className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs transition-all hover:border-purple-200 space-y-4"
                    >
                      {/* Top Row: Code, Status & Compensation */}
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs bg-purple-50 text-purple-900 px-2.5 py-1 rounded-md border border-purple-100">
                            {b.booking_code}
                          </span>
                          <span className="text-xs text-slate-500">
                            Aktivitas: <strong className="text-slate-800">{b.activity_title}</strong>
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block font-semibold uppercase">
                              Kompensasi Anda (80%)
                            </span>
                            <span className="text-base font-black text-emerald-700 tabular-nums">
                              {formatRupiah(b.talent_gross_share || 0)}
                            </span>
                          </div>

                          {/* Status Badge */}
                          {b.status === 'pending_payment' ? (
                            <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-lg flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Menunggu Pembayaran</span>
                            </span>
                          ) : b.status === 'paid_held_in_escrow' ? (
                            <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-lg flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Dibayar (Menunggu Konfirmasi)</span>
                            </span>
                          ) : b.status === 'confirmed_by_talent' ? (
                            <span className="px-2.5 py-1 bg-purple-100 text-purple-900 text-xs font-bold rounded-lg flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Terkonfirmasi</span>
                            </span>
                          ) : b.status === 'in_progress' ? (
                            <span className="px-2.5 py-1 bg-blue-100 text-blue-900 text-xs font-bold rounded-lg flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Sedang Berlangsung</span>
                            </span>
                          ) : b.status === 'completed' ? (
                            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Selesai & Masuk Saldo</span>
                            </span>
                          ) : b.status === 'disputed_hold' ? (
                            <span className="px-2.5 py-1 bg-rose-100 text-rose-800 text-xs font-bold rounded-lg flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span>Dalam Sengketa (Hold)</span>
                            </span>
                          ) : b.status === 'cancelled_by_customer' ? (
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg flex items-center gap-1">
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Dibatalkan Customer</span>
                            </span>
                          ) : b.status === 'cancelled_by_talent' ? (
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg flex items-center gap-1">
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Dibatalkan Talent</span>
                            </span>
                          ) : b.status === 'refunded' ? (
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg flex items-center gap-1">
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Dana Dikembalikan</span>
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Kedaluwarsa</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Middle: Details Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600">
                        <div className="space-y-1">
                          <span className="text-slate-400 font-semibold block text-[11px]">Customer:</span>
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-purple-700" />
                            <span>{b.customer_name}</span>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-slate-400 font-semibold block text-[11px]">Jadwal & Durasi:</span>
                          <div className="font-medium text-slate-900 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              {startDate.toLocaleDateString('id-ID', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                              , {startDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} ({b.duration_hours} Jam)
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-slate-400 font-semibold block text-[11px]">Lokasi Ruang Publik:</span>
                          <div className="font-medium text-slate-900 flex items-start gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <span className="line-clamp-2">
                              {b.meeting_location_name} {b.meeting_location_address ? `(${b.meeting_location_address})` : ''}
                            </span>
                          </div>
                        </div>
                      </div>

                      {b.cancellation_reason && (
                        <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900">
                          <strong>Alasan Pembatalan:</strong> {b.cancellation_reason}
                        </div>
                      )}

                      {/* Bottom Action Buttons for Talent */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                        <div className="flex flex-wrap items-center gap-3">
                          {b.status !== 'expired' && (
                            <button
                              type="button"
                              onClick={() => setChatTargetBooking(b)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 text-xs font-bold transition-colors cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-purple-700" />
                              <span>Chat Customer</span>
                            </button>
                          )}

                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                              b.meeting_location_name + ' ' + (b.meeting_location_address || '')
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-purple-700 font-semibold hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Buka Peta Lokasi di Google Maps</span>
                          </a>

                          {!b.report && b.status !== 'expired' && (
                            <button
                              type="button"
                              onClick={() => openReportModal(b)}
                              className="text-[11px] text-slate-500 hover:text-rose-700 font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <ShieldAlert className="w-3.5 h-3.5" />
                              <span>Laporkan Insiden</span>
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {b.status === 'pending_payment' && (
                            <span className="text-xs font-medium text-amber-700">
                              Menunggu pembayaran customer
                            </span>
                          )}

                          {b.status === 'paid_held_in_escrow' && (
                            <>
                              <button
                                onClick={() => handleCancelBooking(b.id)}
                                disabled={isSubmittingAction}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                              >
                                Tolak
                              </button>
                              <button
                                onClick={() => handleAcceptBooking(b.id)}
                                disabled={isSubmittingAction}
                                className="px-4 py-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Terima & Konfirmasi</span>
                              </button>
                            </>
                          )}

                          {b.status === 'confirmed_by_talent' && (
                            <>
                              <button
                                onClick={() => handleCancelBooking(b.id)}
                                disabled={isSubmittingAction}
                                className="px-3 py-1.5 text-xs text-slate-500 hover:text-rose-600 font-semibold cursor-pointer"
                              >
                                Batalkan Jadwal
                              </button>
                              <button
                                onClick={() => handleStartBooking(b.id)}
                                disabled={isSubmittingAction}
                                className="px-4 py-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                              >
                                <Clock className="w-3.5 h-3.5" />
                                <span>Mulai Sesi</span>
                              </button>
                            </>
                          )}

                          {b.status === 'in_progress' && !b.talent_completed_at && (
                            <button
                              onClick={() => handleCompleteBooking(b)}
                              disabled={isSubmittingAction}
                              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Konfirmasi Sesi Selesai</span>
                            </button>
                          )}
                          {b.status === 'in_progress' && b.talent_completed_at && (
                            <span className="text-xs font-semibold text-amber-700">Menunggu konfirmasi Customer</span>
                          )}
                        </div>
                      </div>

                      {b.report && (() => {
                        const statusMeta = getReportStatusMeta(b.report.status);
                        return (
                          <div className="p-3 rounded-xl bg-rose-50/60 border border-rose-200/80 space-y-1 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold text-slate-900 inline-flex items-center gap-1.5">
                                <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                                <span>Laporan Anda: {getReportCategoryLabel(b.report.category)}</span>
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusMeta.badgeClass}`}>
                                {statusMeta.label}
                              </span>
                            </div>
                            <p className="text-slate-700">{b.report.description}</p>
                            {b.report.admin_notes && (
                              <p className="text-[11px] text-purple-900 bg-white p-2 rounded-lg border border-rose-100">
                                <strong>Catatan Admin:</strong> {b.report.admin_notes}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: AVAILABILITY SCHEDULE MANAGEMENT */}
        {activeTab === 'availability' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Form Add Schedule */}
            <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Tambah Slot Ketersediaan
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Atur jam operasional rutin mingguan atau tanggal khusus agar Customer memesan di waktu yang Anda inginkan.
                </p>
              </div>

              <form onSubmit={handleAddAvailabilitySlot} className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl font-bold">
                  <button
                    type="button"
                    onClick={() => setAvailabilityForm({ ...availabilityForm, mode: 'weekly' })}
                    className={`py-2 rounded-lg transition-colors cursor-pointer ${
                      availabilityForm.mode === 'weekly'
                        ? 'bg-white text-purple-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Rutin Mingguan
                  </button>
                  <button
                    type="button"
                    onClick={() => setAvailabilityForm({ ...availabilityForm, mode: 'specific' })}
                    className={`py-2 rounded-lg transition-colors cursor-pointer ${
                      availabilityForm.mode === 'specific'
                        ? 'bg-white text-purple-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tanggal Khusus
                  </button>
                </div>

                {availabilityForm.mode === 'weekly' ? (
                  <div>
                    <label htmlFor="avail-day" className="block font-bold text-slate-700 mb-1">
                      Hari *
                    </label>
                    <select
                      id="avail-day"
                      value={availabilityForm.dayOfWeek}
                      onChange={(e) =>
                        setAvailabilityForm({ ...availabilityForm, dayOfWeek: Number(e.target.value) })
                      }
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 font-semibold"
                    >
                      {DAY_OF_WEEK_OPTIONS.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label htmlFor="avail-date" className="block font-bold text-slate-700 mb-1">
                      Tanggal Spesifik *
                    </label>
                    <input
                      id="avail-date"
                      type="date"
                      required
                      min={new Date().toISOString().split('T')[0]}
                      value={availabilityForm.specificDate}
                      onChange={(e) =>
                        setAvailabilityForm({ ...availabilityForm, specificDate: e.target.value })
                      }
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="avail-start" className="block font-bold text-slate-700 mb-1">
                      Jam Mulai (WIB) *
                    </label>
                    <input
                      id="avail-start"
                      type="time"
                      required
                      value={availabilityForm.startTime}
                      onChange={(e) =>
                        setAvailabilityForm({ ...availabilityForm, startTime: e.target.value })
                      }
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600"
                    />
                  </div>
                  <div>
                    <label htmlFor="avail-end" className="block font-bold text-slate-700 mb-1">
                      Jam Selesai (WIB) *
                    </label>
                    <input
                      id="avail-end"
                      type="time"
                      required
                      value={availabilityForm.endTime}
                      onChange={(e) =>
                        setAvailabilityForm({ ...availabilityForm, endTime: e.target.value })
                      }
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Status Ketersediaan
                  </label>
                  <select
                    value={availabilityForm.isAvailable ? 'available' : 'blocked'}
                    onChange={(e) =>
                      setAvailabilityForm({
                        ...availabilityForm,
                        isAvailable: e.target.value === 'available',
                      })
                    }
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 font-semibold"
                  >
                    <option value="available">Tersedia untuk Dipesan</option>
                    <option value="blocked">Tandai Tidak Tersedia / Libur</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingAction}
                  className="w-full py-2.5 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-xl shadow-xs inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>Simpan Slot Jadwal</span>
                </button>
              </form>
            </div>

            {/* Existing Slots List */}
            <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Daftar Jadwal Aktif Anda
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Jadwal ini tampil di halaman profil publik Anda dan memandu Customer saat memilih waktu booking.
                  </p>
                </div>
              </div>

              {availabilitySlots.length === 0 ? (
                <div className="py-10 px-4 rounded-xl bg-slate-50 border border-slate-200/70 text-center space-y-1.5">
                  <Clock className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold text-slate-700">Belum Ada Jadwal Terdaftar</p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Saat ini profil Anda menggunakan mode fleksibel. Tambahkan slot jam rutin atau tanggal khusus di formulir sebelah kiri.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {availabilitySlots.map((slot) => (
                    <div
                      key={slot.id}
                      className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">
                            {slot.specific_date
                              ? new Date(`${slot.specific_date}T00:00:00`).toLocaleDateString('id-ID', {
                                  weekday: 'long',
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })
                              : `Setiap Hari ${getDayOfWeekLabel(slot.day_of_week)}`}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 font-bold text-[10px]">
                            {slot.specific_date ? 'Tanggal Khusus' : 'Rutin Mingguan'}
                          </span>
                        </div>
                        <p className="text-slate-600 font-mono">
                          {formatTimeShort(slot.start_time)} – {formatTimeShort(slot.end_time)} WIB
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleAvailabilitySlot(slot)}
                          disabled={isSubmittingAction}
                          className={`px-3 py-1 rounded-full text-[11px] font-bold border cursor-pointer transition-colors ${
                            slot.is_available
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200'
                              : 'bg-slate-200 text-slate-700 border-slate-300 hover:bg-slate-300'
                          }`}
                        >
                          {slot.is_available ? 'Tersedia' : 'Libur'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAvailabilitySlot(slot.id)}
                          disabled={isSubmittingAction}
                          aria-label="Hapus slot jadwal"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: GALERI FOTO, VIDEO & VOICE INTRO */}
        {activeTab === 'media' && (() => {
          const photoItems = mediaItems.filter((m) => m.media_type === 'photo');
          const videoItems = mediaItems.filter((m) => m.media_type === 'video');
          const voiceItems = mediaItems.filter((m) => m.media_type === 'voice');

          return (
            <div className="space-y-6">
              {mediaMigrationMissing && (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-bold">Tabel Galeri &amp; Voice Belum Tersedia di Supabase</div>
                    <p className="text-amber-800 leading-relaxed">
                      Jalankan migrasi <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded">supabase/migrations/16_talent_media_gallery.sql</code> di Supabase SQL Editor untuk mengaktifkan penyimpanan foto, video, dan voice intro Talent.
                    </p>
                  </div>
                </div>
              )}

              {/* Upload / Record Card */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Tambah Foto, Video &amp; Voice Intro
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Tampilkan kepribadian, hobi, dan sapaan suara Anda agar profil lebih menarik saat dilihat Customer.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100">Foto {photoItems.length}/8</span>
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100">Video {videoItems.length}/3</span>
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100">Voice {voiceItems.length}/2</span>
                  </div>
                </div>

                {/* Media Type Switcher */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { type: 'photo' as TalentMediaType, label: 'Foto Aktivitas', icon: ImageIcon, hint: 'Maks 8 foto (JPG/PNG/WebP)' },
                    { type: 'video' as TalentMediaType, label: 'Video Perkenalan', icon: Video, hint: 'Maks 3 video (MP4/WebM, 50MB)' },
                    { type: 'voice' as TalentMediaType, label: 'Voice Intro', icon: Mic, hint: 'Maks 2 audio (Rekam / Unggah)' },
                  ].map((opt) => {
                    const Icon = opt.icon;
                    const active = mediaType === opt.type;
                    return (
                      <button
                        key={opt.type}
                        type="button"
                        onClick={() => {
                          setMediaType(opt.type);
                          setMediaFile(null);
                          if (mediaFileInputRef.current) mediaFileInputRef.current.value = '';
                          if (opt.type !== 'voice') {
                            if (isRecordingVoice) handleStopVoiceRecording();
                            handleClearRecordedVoice();
                          }
                        }}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          active
                            ? 'bg-purple-50 border-purple-500 ring-1 ring-purple-500/30'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className={`flex items-center gap-2 text-xs font-bold ${active ? 'text-purple-900' : 'text-slate-800'}`}>
                          <Icon className={`w-4 h-4 ${active ? 'text-purple-700' : 'text-slate-400'}`} />
                          <span>{opt.label}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 hidden sm:block">{opt.hint}</p>
                      </button>
                    );
                  })}
                </div>

                <form onSubmit={handleUploadMedia} className="space-y-4">
                  {/* Voice Recorder Box (only when voice tab active) */}
                  {mediaType === 'voice' && (
                    <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200/80 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                            <Mic className="w-4 h-4 text-purple-700" />
                            <span>Rekam Sapaan Suara Langsung (Maks 60 Detik)</span>
                          </div>
                          <p className="text-[11px] text-purple-800/80 mt-0.5">
                            Ucapkan sapaan hangat singkat tentang aktivitas favorit Anda, atau unggah file audio di bawah.
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {!isRecordingVoice ? (
                            <button
                              type="button"
                              onClick={handleStartVoiceRecording}
                              className="px-3.5 py-2 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                            >
                              <Mic className="w-3.5 h-3.5" />
                              <span>{recordedVoiceUrl ? 'Rekam Ulang' : 'Mulai Rekam Suara'}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={handleStopVoiceRecording}
                              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                            >
                              <Square className="w-3.5 h-3.5 fill-current" />
                              <span>Berhenti ({recordingSeconds}d)</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {recordedVoiceUrl && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-white p-3 rounded-xl border border-purple-200">
                          <audio controls src={recordedVoiceUrl} className="w-full h-9" />
                          <button
                            type="button"
                            onClick={handleClearRecordedVoice}
                            className="px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 rounded-lg shrink-0 cursor-pointer flex items-center gap-1 self-end sm:self-center"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Buang Rekaman</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        {mediaType === 'photo'
                          ? 'Pilih File Foto (JPG, PNG, WebP · Maks 8 MB)'
                          : mediaType === 'video'
                          ? 'Pilih File Video (MP4, WebM, MOV · Maks 50 MB)'
                          : 'Atau Unggah File Audio (MP3, WAV, M4A, OGG · Maks 15 MB)'}
                      </label>
                      <input
                        ref={mediaFileInputRef}
                        type="file"
                        accept={
                          mediaType === 'photo'
                            ? 'image/jpeg,image/png,image/webp'
                            : mediaType === 'video'
                            ? 'video/mp4,video/webm,video/quicktime'
                            : 'audio/*'
                        }
                        onChange={(e) => {
                          const selected = e.target.files?.[0] ?? null;
                          setMediaFile(selected);
                          if (selected && mediaType === 'voice') {
                            handleClearRecordedVoice();
                          }
                        }}
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-100 file:text-purple-800 hover:file:bg-purple-200 cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Keterangan / Caption Singkat (Opsional)
                      </label>
                      <input
                        type="text"
                        maxLength={140}
                        value={mediaCaption}
                        onChange={(e) => setMediaCaption(e.target.value)}
                        placeholder={
                          mediaType === 'photo'
                            ? 'Misal: Ngopi sore & diskusi buku di Kemang'
                            : mediaType === 'video'
                            ? 'Misal: Sapaan singkat & cerita hobi traveling saya'
                            : 'Misal: Halo! Kenalan yuk lewat voice intro ini'
                        }
                        className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isUploadingMedia || isRecordingVoice}
                      className="px-5 py-2.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isUploadingMedia ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Mengunggah Media...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          <span>
                            Simpan{' '}
                            {mediaType === 'photo'
                              ? 'Foto'
                              : mediaType === 'video'
                              ? 'Video'
                              : 'Voice Intro'}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Voice Intro Preview List */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Mic className="w-4 h-4 text-purple-700" />
                    <span>Voice Intro ({voiceItems.length})</span>
                  </h4>
                </div>
                {voiceItems.length === 0 ? (
                  <p className="text-xs text-slate-500 bg-slate-50 p-4 rounded-xl border border-slate-200/70">
                    Belum ada Voice Intro. Rekaman suara singkat membantu Customer mengenal karakter ramah Anda sebelum booking.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {voiceItems.map((voice) => (
                      <div
                        key={voice.id}
                        className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-bold text-slate-800">
                            {voice.caption || 'Sapaan Suara Talent'}
                          </span>
                          {confirmDeleteMediaId === voice.id ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleDeleteMedia(voice)}
                                disabled={deletingMediaId === voice.id}
                                className="px-2 py-1 bg-rose-600 text-white text-[11px] font-bold rounded-lg cursor-pointer"
                              >
                                {deletingMediaId === voice.id ? 'Menghapus...' : 'Hapus'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteMediaId(null)}
                                className="px-2 py-1 bg-slate-200 text-slate-700 text-[11px] font-semibold rounded-lg cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteMediaId(voice.id)}
                              aria-label="Hapus voice intro"
                              className="p-1 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <audio controls preload="metadata" src={voice.media_url} className="w-full h-9" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Photo Gallery Grid */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-purple-700" />
                  <span>Galeri Foto ({photoItems.length})</span>
                </h4>
                {photoItems.length === 0 ? (
                  <p className="text-xs text-slate-500 bg-slate-50 p-4 rounded-xl border border-slate-200/70">
                    Belum ada foto tambahan. Unggah foto gaya kasual, hobi, atau aktivitas agar profil Anda tampil lebih hidup.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {photoItems.map((photo) => (
                      <div
                        key={photo.id}
                        className="group rounded-xl overflow-hidden border border-slate-200 bg-slate-100 flex flex-col"
                      >
                        <div className="relative aspect-[4/3] bg-slate-200 flex items-center justify-center overflow-hidden">
                          <img
                            src={photo.media_url}
                            alt={photo.caption || 'Foto profil Talent'}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                        <div className="p-2.5 bg-white flex items-center justify-between gap-2 text-xs">
                          <span className="text-[11px] text-slate-600 truncate">
                            {photo.caption || 'Foto Aktivitas'}
                          </span>
                          {confirmDeleteMediaId === photo.id ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleDeleteMedia(photo)}
                                disabled={deletingMediaId === photo.id}
                                className="px-2 py-0.5 bg-rose-600 text-white text-[10px] font-bold rounded cursor-pointer"
                              >
                                Hapus
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteMediaId(null)}
                                className="px-1.5 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-semibold rounded cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteMediaId(photo.id)}
                              aria-label="Hapus foto"
                              className="p-1 text-slate-400 hover:text-rose-600 rounded shrink-0 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Video Gallery Grid */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Video className="w-4 h-4 text-purple-700" />
                  <span>Video Perkenalan ({videoItems.length})</span>
                </h4>
                {videoItems.length === 0 ? (
                  <p className="text-xs text-slate-500 bg-slate-50 p-4 rounded-xl border border-slate-200/70">
                    Belum ada video perkenalan. Video singkat membantu membangun kepercayaan Customer sebelum melakukan booking.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {videoItems.map((vid) => (
                      <div
                        key={vid.id}
                        className="rounded-xl overflow-hidden border border-slate-200 bg-white flex flex-col"
                      >
                        <video
                          controls
                          playsInline
                          preload="metadata"
                          src={vid.media_url}
                          className="w-full aspect-video bg-slate-950 object-cover"
                        />
                        <div className="p-3 flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-slate-700 truncate">
                            {vid.caption || 'Video Perkenalan Talent'}
                          </span>
                          {confirmDeleteMediaId === vid.id ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleDeleteMedia(vid)}
                                disabled={deletingMediaId === vid.id}
                                className="px-2.5 py-1 bg-rose-600 text-white text-[11px] font-bold rounded-lg cursor-pointer"
                              >
                                {deletingMediaId === vid.id ? 'Menghapus...' : 'Hapus'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteMediaId(null)}
                                className="px-2 py-1 bg-slate-200 text-slate-700 text-[11px] font-semibold rounded-lg cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteMediaId(vid.id)}
                              aria-label="Hapus video"
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg shrink-0 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* TAB: REFERRAL PROGRAM */}
        {activeTab === 'referral' && (() => {
          const creditedTotal = referralRewards
            .filter((rw) => rw.status === 'credited')
            .reduce((sum, rw) => sum + Number(rw.reward_amount || 0), 0);
          const pendingTotal = referralRewards
            .filter((rw) => rw.status === 'pending_completion')
            .reduce((sum, rw) => sum + Number(rw.reward_amount || 0), 0);

          return (
            <div className="space-y-6">
              {/* Referral Hero & Code Share */}
              <div className="bg-gradient-to-br from-purple-950 via-purple-900 to-[#2D1052] text-white p-6 rounded-2xl border border-purple-800 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="space-y-2 max-w-2xl">
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300 uppercase tracking-wider">
                    <Gift className="w-4 h-4" />
                    <span>Program Referral Komunitas Talent (1-Tier Permanen)</span>
                  </div>
                  <h3 className="text-xl font-black text-white">
                    Undang Rekan Talent & Dapatkan Bonus {Math.round(YUKU_BUSINESS_RULES.referralCommissionRate * 100)}% dari Komisi Platform
                  </h3>
                  <p className="text-xs text-purple-200/90 leading-relaxed">
                    Bagikan kode atau tautan undangan Anda kepada calon Talent terpercaya. Setiap kali rekan yang Anda undang menyelesaikan sesi berbayar hingga masa tunggu escrow 24 jam selesai, Anda berhak atas apresiasi 10% dari komisi 20% YUKU.
                  </p>
                </div>

                <div className="bg-white/10 backdrop-blur-xs border border-white/15 rounded-2xl p-4 min-w-[270px] space-y-3">
                  <div>
                    <span className="text-[11px] text-purple-200 font-semibold block">
                      Kode Referral Unik Anda
                    </span>
                    <div className="text-xl font-mono font-black tracking-wider text-amber-300 mt-0.5">
                      {profile?.referral_code || 'Belum tersedia'}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyReferral('code')}
                      disabled={!profile?.referral_code}
                      className="flex-1 px-3 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {copiedReferralField === 'code' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Kode Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin Kode</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyReferral('link')}
                      disabled={!profile?.referral_code}
                      className="flex-1 px-3 py-2 bg-white/15 hover:bg-white/25 text-white font-bold text-xs rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {copiedReferralField === 'link' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Link Tersalin</span>
                        </>
                      ) : (
                        <>
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Salin Link</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* 3 Referral Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-500 uppercase">Talent Terundang</span>
                    <Users className="w-4 h-4 text-purple-700" />
                  </div>
                  <div className="text-2xl font-black text-slate-900 tabular-nums">
                    {referrals.length} Talent
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Relasi 1-tier permanen yang terdaftar melalui kode Anda.
                  </p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-500 uppercase">Bonus Dikreditkan</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-black text-emerald-700 tabular-nums">
                    {formatRupiah(creditedTotal)}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Akumulasi bonus referral dari sesi yang telah melewati escrow 24 jam.
                  </p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-500 uppercase">Bonus Tertunda</span>
                    <Clock className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-2xl font-black text-amber-600 tabular-nums">
                    {formatRupiah(pendingTotal)}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Menunggu sesi selesai & konfirmasi bebas sengketa 24 jam.
                  </p>
                </div>
              </div>

              {/* Optional: Bind Referrer Code if not yet linked */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                {myReferrer ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 text-slate-700">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        Akun Anda terhubung dengan kode referral pengundang:{' '}
                        <strong className="font-mono text-purple-900">{myReferrer.referral_code_used}</strong>
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      Terhubung pada{' '}
                      {new Date(myReferrer.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                ) : (
                  <form
                    onSubmit={handleApplyReferralCode}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <h4 className="font-bold text-slate-900">Punya Kode Referral dari Rekan Pengundang?</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Jika Anda diundang oleh Talent lain namun belum memasukkan kodenya saat mendaftar, tautkan di sini (1 kali & permanen).
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        maxLength={20}
                        placeholder="YUKU-XXXXXXXX"
                        value={referralInputCode}
                        onChange={(e) =>
                          setReferralInputCode(e.target.value.toUpperCase().replace(/\s+/g, ''))
                        }
                        className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs uppercase focus:outline-none focus:border-purple-600 w-40"
                      />
                      <button
                        type="submit"
                        disabled={isSubmittingReferral || !referralInputCode.trim()}
                        className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-xl cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        {isSubmittingReferral ? 'Menautkan...' : 'Tautkan Kode'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Invited Talents & Rewards Ledger */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Invited Talents List */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                  <h4 className="text-sm font-bold text-slate-900">
                    Daftar Talent yang Anda Undang ({referrals.length})
                  </h4>
                  {referrals.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200/70">
                      Belum ada rekan Talent yang mendaftar menggunakan kode referral Anda.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {referrals.map((ref) => (
                        <div
                          key={ref.id}
                          className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3 text-xs"
                        >
                          <div>
                            <div className="font-bold text-slate-900">{ref.referee_name}</div>
                            <div className="text-[11px] text-slate-500">
                              {ref.referee_city} • Bergabung{' '}
                              {new Date(ref.created_at).toLocaleDateString('id-ID', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </div>
                          </div>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              ref.referee_account_status === 'active'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {ref.referee_account_status === 'active' ? 'Aktif' : 'Menunggu Verifikasi'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Referral Rewards History */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                  <h4 className="text-sm font-bold text-slate-900">
                    Riwayat Bonus Referral ({referralRewards.length})
                  </h4>
                  {referralRewards.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200/70">
                      Belum ada transaksi bonus referral. Bonus tercatat otomatis saat Talent undangan menerima pembayaran sesi.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {referralRewards.map((rw) => (
                        <div
                          key={rw.id}
                          className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3 text-xs"
                        >
                          <div>
                            <div className="font-black text-slate-900 tabular-nums">
                              {formatRupiah(rw.reward_amount)}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Basis Komisi YUKU: {formatRupiah(rw.platform_commission_base)} •{' '}
                              {new Date(rw.created_at).toLocaleDateString('id-ID', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </div>
                          </div>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              rw.status === 'credited'
                                ? 'bg-emerald-100 text-emerald-800'
                                : rw.status === 'cancelled_disputed'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {rw.status === 'credited'
                              ? 'Dikreditkan'
                              : rw.status === 'cancelled_disputed'
                              ? 'Dibatalkan'
                              : 'Menunggu Escrow 24 Jam'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* TAB 3: PAYOUT HISTORY */}
        {activeTab === 'payouts' && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Riwayat Pencairan Penghasilan (Payout Requests)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Setiap penarikan dana diproses oleh tim keuangan YUKU langsung ke nomor rekening terdaftar.
                </p>
              </div>

              <button
                onClick={() => setIsPayoutModalOpen(true)}
                disabled={availableBalance < 100000}
                className="px-4 py-2.5 bg-gradient-to-r from-purple-700 via-fuchsia-700 to-amber-600 hover:from-purple-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-40"
              >
                + Ajukan Pencairan Baru
              </button>
            </div>

            {payouts.length === 0 ? (
              <div className="py-12 bg-white rounded-2xl border border-slate-200/80 text-center space-y-2 p-6">
                <CreditCard className="w-8 h-8 text-slate-300 mx-auto" />
                <h4 className="text-sm font-bold text-slate-800">Belum Ada Riwayat Penarikan Dana</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Setelah Anda menyelesaikan sesi aktivitas dan mengumpulkan saldo minimal Rp 100.000, Anda dapat mengajukan pencairan dana di sini.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                      <tr>
                        <th className="p-3.5">Nomor Payout</th>
                        <th className="p-3.5">Tanggal Pengajuan</th>
                        <th className="p-3.5">Bank / E-Wallet</th>
                        <th className="p-3.5">Nomor Rekening</th>
                        <th className="p-3.5">Nominal Dicairkan</th>
                        <th className="p-3.5">Status Transfer</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {payouts.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/60">
                          <td className="p-3.5 font-mono font-bold text-purple-900">
                            {p.payout_number}
                          </td>
                          <td className="p-3.5 text-slate-600">
                            {new Date(p.created_at).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="p-3.5 font-semibold text-slate-900">
                            {p.bank_name}
                          </td>
                          <td className="p-3.5 text-slate-600 font-mono">
                            {p.bank_account_number} ({p.bank_account_holder_name})
                          </td>
                          <td className="p-3.5 font-black text-slate-900 tabular-nums">
                            {formatRupiah(p.amount)}
                          </td>
                          <td className="p-3.5">
                            {p.payout_status === 'completed_provider_confirmed' ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                                Berhasil Ditransfer
                              </span>
                            ) : p.payout_status === 'processing' ? (
                              <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 text-[11px] font-bold">
                                Sedang Diproses Bank
                              </span>
                            ) : p.payout_status === 'rejected' ? (
                              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-bold">
                                Ditolak: {p.rejection_reason || 'Data rekening tidak valid'}
                              </span>
                            ) : p.payout_status === 'failed' ? (
                              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-bold">
                                Gagal Ditransfer
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">
                                Menunggu Verifikasi
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SAFETY & PROTOCOL */}
        {activeTab === 'safety' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-purple-200 shadow-xs space-y-4">
              <div className="flex items-center gap-2 text-purple-700 font-bold text-sm">
                <ShieldCheck className="w-5 h-5" />
                <span>PANDUAN KESELAMATAN TALENT YUKU</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                YUKU berkomitmen penuh menjaga keamanan fisik dan psikologis seluruh Talent pendamping sosial. Pastikan Anda selalu mematuhi batasan berikut:
              </p>
              <ul className="text-xs text-slate-700 space-y-2.5 list-disc list-inside">
                <li>
                  <strong>Hanya di Area Publik Terbuka:</strong> Pertemuan tatap muka wajib dilakukan di kafe, restoran, pusat perbelanjaan (mall), atau tempat terbuka umum yang ramai.
                </li>
                <li>
                  <strong>Larangan Keras Tempat Tertutup:</strong> Tolak dan batalkan sesi jika customer meminta bertemu di kamar hotel, apartemen tertutup, atau tempat tinggal pribadi.
                </li>
                <li>
                  <strong>Bukan Layanan Kencan:</strong> YUKU secara tegas melarang segala bentuk permintaan bernuansa seksual atau sentuhan fisik tidak sopan.
                </li>
                <li>
                  <strong>Hak Membatalkan Sesi:</strong> Anda memegang kendali penuh. Anda berhak meninggalkan lokasi dan membatalkan pesanan secara sepihak jika customer melanggar etika.
                </li>
              </ul>
            </div>

            <div className="bg-purple-950 text-white p-6 rounded-2xl border border-purple-900 shadow-xs space-y-4">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <Ban className="w-5 h-5" />
                <span>BANTUAN DARURAT & RESPONS CEPAT</span>
              </div>
              <p className="text-xs text-purple-200/90 leading-relaxed">
                Jika Anda merasa tidak aman, terancam, atau mengalami kendala saat mendampingi customer di lapangan, gunakan jalur komunikasi resmi:
              </p>
              <div className="p-3 bg-purple-900/60 rounded-xl border border-purple-800 text-xs space-y-1">
                <div className="font-bold text-amber-300">Tim Dukungan YUKU (24/7):</div>
                <div className="text-[11px] text-purple-200">Email: halo@yuku.co.id</div>
                <div className="text-[11px] text-purple-200">Bantuan Lapangan & Darurat: Keamanan Ruang Publik Terdekat</div>
              </div>
              <button
                onClick={() => onNavigate('/bantuan')}
                className="w-full py-2.5 bg-white text-purple-950 font-bold text-xs rounded-xl hover:bg-purple-50 transition-colors"
              >
                Pusat Bantuan & Lapor Pelanggaran
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: PAYOUT REQUEST */}
      <Modal
        isOpen={isPayoutModalOpen}
        onClose={() => setIsPayoutModalOpen(false)}
        title="Ajukan Penarikan Saldo Penghasilan"
      >
        <form onSubmit={handlePayoutSubmit} className="space-y-4 text-xs">
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-purple-900">
            <span className="text-slate-500 block text-[11px]">Saldo Tersedia Anda:</span>
            <span className="text-xl font-black text-purple-900 tabular-nums">
              {formatRupiah(availableBalance)}
            </span>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Pilih Bank Tujuan / E-Wallet *
            </label>
            <select
              value={payoutForm.bankName}
              onChange={(e) => setPayoutForm({ ...payoutForm, bankName: e.target.value })}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs font-semibold"
            >
              <option value="BCA">Bank Central Asia (BCA)</option>
              <option value="Mandiri">Bank Mandiri</option>
              <option value="BRI">Bank Rakyat Indonesia (BRI)</option>
              <option value="BNI">Bank Negara Indonesia (BNI)</option>
              <option value="BSI">Bank Syariah Indonesia (BSI)</option>
              <option value="Bank Jago">Bank Jago</option>
              <option value="SeaBank">SeaBank</option>
              <option value="GoPay">GoPay (Nomor HP Terdaftar)</option>
              <option value="OVO">OVO (Nomor HP Terdaftar)</option>
              <option value="DANA">DANA (Nomor HP Terdaftar)</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Nomor Rekening / Nomor Akun E-Wallet *
            </label>
            <input
              type="text"
              required
              placeholder="Contoh: 1234567890 / 08123456789"
              value={payoutForm.accountNumber}
              onChange={(e) => setPayoutForm({ ...payoutForm, accountNumber: e.target.value })}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Nama Lengkap Pemilik Rekening (Sesuai Buku Tabungan/KTP) *
            </label>
            <input
              type="text"
              required
              placeholder="Contoh: Sarah Dian Pratami"
              value={payoutForm.holderName}
              onChange={(e) => setPayoutForm({ ...payoutForm, holderName: e.target.value })}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Nominal Penarikan (Rp) * (Min. Rp 100.000)
            </label>
            <input
              type="number"
              step="10000"
              min="100000"
              max={availableBalance}
              required
              value={payoutForm.amount}
              onChange={(e) => setPayoutForm({ ...payoutForm, amount: e.target.value })}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs font-bold"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsPayoutModalOpen(false)}
              className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmittingAction || availableBalance < 100000}
              className="px-5 py-2.5 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmittingAction ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Memproses...</span>
                </>
              ) : (
                <span>Konfirmasi Penarikan</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: EDIT PROFILE & RATES */}
      <Modal
        isOpen={isEditProfileModalOpen}
        onClose={() => setIsEditProfileModalOpen(false)}
        title="Ubah Tarif Layanan & Bio Profil"
      >
        <form onSubmit={handleProfileUpdate} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Ganti Foto Profil <span className="font-normal text-slate-500">(opsional, JPG/PNG/WebP, maks. 10 MB)</span>
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setProfileAvatarFile(e.target.files?.[0] || null)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
            {profileAvatarFile && (
              <p className="text-[11px] text-emerald-700 mt-1">Dipilih: {profileAvatarFile.name}</p>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Tarif Pertemuan Tatap Muka (Rp/Jam) *
              </label>
              <input
                type="number"
                step="10000"
                min="50000"
                required
                value={profileForm.hourlyRate}
                onChange={(e) => setProfileForm({ ...profileForm, hourlyRate: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Tarif Online Chat (Rp/Jam Opsional)
              </label>
              <input
                type="number"
                step="5000"
                placeholder="75000"
                value={profileForm.onlineChatRate}
                onChange={(e) => setProfileForm({ ...profileForm, onlineChatRate: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Kota Domisili Utama *</label>
              <input
                type="text"
                list="talent-dashboard-cities-list"
                required
                value={profileForm.city}
                onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
              />
              <datalist id="talent-dashboard-cities-list">
                {INDONESIA_CITIES.map((city) => (
                  <option key={city} value={city} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Mode Layanan *</label>
              <select
                value={profileForm.serviceMode}
                onChange={(e) => setProfileForm({ ...profileForm, serviceMode: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
              >
                <option value="Offline & Online">Offline (Publik) & Online Chat</option>
                <option value="Hanya Offline">Hanya Tatap Muka di Tempat Publik</option>
                <option value="Hanya Online">Hanya Teman Online (Chat/Video)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Headline Sapaan Singkat (Maks. 150 karakter) *
            </label>
            <input
              type="text"
              required
              maxLength={150}
              value={profileForm.headline}
              onChange={(e) => setProfileForm({ ...profileForm, headline: e.target.value })}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Deskripsi Tentang Saya & Hobi *
            </label>
            <textarea
              rows={3}
              required
              value={profileForm.bio}
              onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsEditProfileModalOpen(false)}
              className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmittingAction}
              className="px-5 py-2.5 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              {isSubmittingAction ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <span>Simpan Perubahan</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL 3: LAPORAN INSIDEN & KESELAMATAN TALENT */}
      <Modal
        isOpen={Boolean(reportTarget)}
        onClose={closeReportModal}
        title="Laporkan Insiden Keamanan Customer"
      >
        {reportTarget && (
          <form onSubmit={handleSubmitReport} className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold text-rose-900">{reportTarget.booking_code}</span>
                <span className="text-[11px] font-semibold text-rose-700">
                  Customer: {reportTarget.customer_name}
                </span>
              </div>
              <p className="text-[11px] text-rose-800 leading-relaxed">
                Keselamatan Talent adalah prioritas utama YUKU. Segera laporkan jika Customer melanggar batas etika atau meminta pertemuan di ruang tertutup.
              </p>
            </div>

            {reportError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{reportError}</span>
              </div>
            )}

            <div>
              <label htmlFor="talent-report-category" className="block font-bold text-slate-700 mb-1">
                Kategori Pelanggaran *
              </label>
              <select
                id="talent-report-category"
                value={reportCategory}
                onChange={(e) => setReportCategory(e.target.value as ReportCategory)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs font-semibold"
              >
                {REPORT_CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="talent-report-desc" className="flex items-center justify-between font-bold text-slate-700 mb-1">
                <span>Kronologi Kejadian (Minimal 15 karakter) *</span>
                <span className="text-[11px] font-normal text-slate-400">
                  {reportDescription.length}/1000
                </span>
              </label>
              <textarea
                id="talent-report-desc"
                rows={4}
                required
                minLength={15}
                maxLength={1000}
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
                placeholder="Tuliskan detail kejadian secara lengkap agar Tim Keamanan YUKU dapat segera menindaklanjuti..."
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs resize-none"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={closeReportModal}
                disabled={isSubmittingReport}
                className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmittingReport}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSubmittingReport ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Mengirim...</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Kirim Laporan Insiden</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Real-Time Chat Modal with Customer */}
      {currentUser && (
        <BookingChatModal
          isOpen={Boolean(chatTargetBooking)}
          onClose={() => setChatTargetBooking(null)}
          booking={
            chatTargetBooking
              ? {
                  id: chatTargetBooking.id,
                  booking_code: chatTargetBooking.booking_code,
                  status: chatTargetBooking.status,
                  start_time: chatTargetBooking.start_time,
                  duration_hours: chatTargetBooking.duration_hours,
                  meeting_location_name: chatTargetBooking.meeting_location_name,
                  activity_title: chatTargetBooking.activity_title,
                }
              : null
          }
          currentUserId={currentUser.id}
          partnerName={chatTargetBooking?.customer_name || 'Customer YUKU'}
          partnerRoleLabel="Customer"
        />
      )}
    </div>
  );
};
