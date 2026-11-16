import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ShieldCheck,
  User,
  ArrowRight,
  RefreshCw,
  Loader2,
  CalendarCheck,
  ShoppingBag,
  ExternalLink,
  Star,
  MessageSquare,
  ShieldAlert,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AppRoute } from '../types/navigation';
import { formatRupiah } from '../utils/formatters';
import { Modal } from '../components/common/Modal';
import { BookingChatModal } from '../components/chat/BookingChatModal';
import { QrisCustomerPaymentPanel } from '../components/booking/QrisCustomerPaymentPanel';
import { XenditCustomerPaymentPanel } from '../components/booking/XenditCustomerPaymentPanel';
import { ReportCategory } from '../types/database';
import {
  REPORT_CATEGORY_OPTIONS,
  getReportCategoryLabel,
  getReportStatusMeta,
} from '../utils/reportHelpers';

interface BookingHistoryPageProps {
  onNavigate: (path: AppRoute, params?: Record<string, string>) => void;
}

interface BookingItem {
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
  payment_route: 'xendit' | 'manual_qris' | null;
  cancellation_reason: string | null;
  customer_completed_at: string | null;
  talent_completed_at: string | null;
  created_at: string;
  // Enriched metadata
  talentName?: string;
  talentAvatar?: string;
  talentCity?: string;
  customerName?: string;
  customerAvatar?: string;
  activityTitle?: string;
  refund?: {
    amount: number;
    status: 'requested' | 'approved' | 'processed' | 'rejected';
    provider_refund_id: string | null;
  } | null;
  review?: {
    id: string;
    rating: number;
    review_text: string | null;
    created_at: string;
  } | null;
  report?: {
    id: string;
    category: string;
    description: string;
    status: string;
    admin_notes: string | null;
    created_at: string;
  } | null;
}

export const BookingHistoryPage: React.FC<BookingHistoryPageProps> = ({ onNavigate }) => {
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filter Tab
  const [roleFilter, setRoleFilter] = useState<'customer' | 'talent'>('customer');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  // Review Modal States
  const [reviewTarget, setReviewTarget] = useState<BookingItem | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [reviewText, setReviewText] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Report Modal States
  const [reportTarget, setReportTarget] = useState<BookingItem | null>(null);
  const [reportCategory, setReportCategory] = useState<ReportCategory>('unethical_behavior');
  const [reportDescription, setReportDescription] = useState<string>('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Real-Time Chat Modal State
  const [chatTarget, setChatTarget] = useState<BookingItem | null>(null);

  // Monitor Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUser(session?.user ?? null);
      setIsCheckingAuth(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
      setIsCheckingAuth(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadBookings = useCallback(async () => {
    if (!currentUser) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      // 1. Fetch bookings for current user (handled safely by RLS)
      const { data: rawBookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false });

      if (bookingsError) {
        throw new Error(`Gagal memuat daftar booking: ${bookingsError.message}`);
      }

      if (!rawBookings || rawBookings.length === 0) {
        setBookings([]);
        setIsLoading(false);
        return;
      }

      // 2. Fetch related profiles, categories, and reviews
      const bookingIds = rawBookings.map((b) => b.id);
      const talentIds = Array.from(new Set(rawBookings.map((b) => b.talent_id)));
      const customerIds = Array.from(new Set(rawBookings.map((b) => b.customer_id)));
      const categoryIds = Array.from(new Set(rawBookings.map((b) => b.activity_category_id)));

      const [talentsRes, customersRes, categoriesRes, reviewsRes, reportsRes, refundsRes] = await Promise.all([
        talentIds.length > 0
          ? supabase.from('talent_profiles').select('id, display_name, avatar_url, city').in('id', talentIds)
          : { data: [] },
        customerIds.length > 0
          ? supabase.from('customer_profiles').select('id, display_name, avatar_url').in('id', customerIds)
          : { data: [] },
        categoryIds.length > 0
          ? supabase.from('activity_categories').select('id, title').in('id', categoryIds)
          : { data: [] },
        bookingIds.length > 0
          ? supabase
              .from('reviews')
              .select('id, booking_id, rating, review_text, created_at')
              .in('booking_id', bookingIds)
          : { data: [] },
        bookingIds.length > 0
          ? supabase
              .from('reports_complaints')
              .select('id, booking_id, category, description, status, admin_notes, created_at')
              .eq('reporter_id', currentUser.id)
              .in('booking_id', bookingIds)
              .order('created_at', { ascending: false })
          : { data: [] },
        bookingIds.length > 0
          ? supabase
              .from('refunds')
              .select('booking_id, refund_amount, status, provider_refund_id')
              .in('booking_id', bookingIds)
          : { data: [] },
      ]);

      const talentMap = new Map<string, any>();
      talentsRes.data?.forEach((t) => talentMap.set(t.id, t));

      const customerMap = new Map<string, any>();
      customersRes.data?.forEach((c) => customerMap.set(c.id, c));

      const categoryMap = new Map<string, string>();
      categoriesRes.data?.forEach((c) => categoryMap.set(c.id, c.title));

      const reviewMap = new Map<string, any>();
      reviewsRes.data?.forEach((r) => reviewMap.set(r.booking_id, r));

      const refundMap = new Map<string, any>();
      refundsRes.data?.forEach((refund) => refundMap.set(refund.booking_id, refund));

      const reportMap = new Map<string, any>();
      reportsRes.data?.forEach((rep) => {
        if (rep.booking_id && !reportMap.has(rep.booking_id)) {
          reportMap.set(rep.booking_id, rep);
        }
      });

      const enriched: BookingItem[] = rawBookings.map((b) => {
        const talent = talentMap.get(b.talent_id);
        const customer = customerMap.get(b.customer_id);
        const existingReview = reviewMap.get(b.id) ?? null;
        const existingReport = reportMap.get(b.id) ?? null;
        return {
          ...b,
          talentName: talent?.display_name || 'Talent YUKU',
          talentAvatar: talent?.avatar_url,
          talentCity: talent?.city,
          customerName: customer?.display_name || 'Customer YUKU',
          customerAvatar: customer?.avatar_url,
          activityTitle: categoryMap.get(b.activity_category_id) || b.activity_category_id,
          refund: refundMap.has(b.id)
            ? {
                amount: Number(refundMap.get(b.id).refund_amount),
                status: refundMap.get(b.id).status,
                provider_refund_id: refundMap.get(b.id).provider_refund_id ?? null,
              }
            : null,
          review: existingReview
            ? {
                id: existingReview.id,
                rating: Number(existingReview.rating),
                review_text: existingReview.review_text ?? null,
                created_at: existingReview.created_at,
              }
            : null,
          report: existingReport
            ? {
                id: existingReport.id,
                category: existingReport.category,
                description: existingReport.description,
                status: existingReport.status,
                admin_notes: existingReport.admin_notes ?? null,
                created_at: existingReport.created_at,
              }
            : null,
        };
      });

      setBookings(enriched);
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat mengambil riwayat booking.');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      loadBookings();
    } else {
      setIsLoading(false);
    }
  }, [currentUser, loadBookings]);

  // Cancel booking handler (Allowed for Customer on pending_payment)
  const handleCancelBooking = async (bookingId: string) => {
    if (!currentUser) return;
    const confirmCancel = window.confirm('Apakah Anda yakin ingin membatalkan reservasi booking ini?');
    if (!confirmCancel) return;

    setActionInProgressId(bookingId);
    setErrorMsg(null);
    try {
      const { data: result, error: cancelError } = await supabase.rpc('request_customer_cancellation', {
        p_booking_id: bookingId,
        p_reason: 'Dibatalkan oleh Customer melalui aplikasi',
      });

      if (cancelError) {
        throw new Error(`Gagal membatalkan booking: ${cancelError.message}`);
      }
      if (!result?.case_id) {
        throw new Error('Permintaan pembatalan tidak menghasilkan catatan transaksi. Silakan hubungi Admin YUKU.');
      }

      const refundAmount = Number(result.automatic_refund_amount || 0);
      const retainedAmount = Number(result.retained_pending_admin_amount || 0);
      if (result.policy_code === 'unpaid_cancel') {
        setSuccessMsg('Reservasi yang belum dibayar berhasil dibatalkan.');
      } else if (result.policy_code === 'more_than_24h') {
        setSuccessMsg(`Pembatalan tercatat. Refund ${formatRupiah(refundAmount)} menunggu proses Finance YUKU.`);
      } else if (result.policy_code === '6_to_24h') {
        setSuccessMsg(`Pembatalan tercatat. Refund ${formatRupiah(refundAmount)} menunggu Finance. Sisa ${formatRupiah(retainedAmount)} ditahan untuk keputusan Admin.`);
      } else {
        setSuccessMsg(`Pembatalan tercatat untuk peninjauan Admin. Tidak ada refund otomatis; dana ${formatRupiah(retainedAmount)} ditahan sampai keputusan Admin.`);
      }

      await loadBookings();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal membatalkan booking.');
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleConfirmCompletion = async (booking: BookingItem) => {
    if (!currentUser) return;
    const confirmed = window.confirm('Apakah sesi bersama Talent benar-benar sudah selesai? Konfirmasi ini akan dicatat dan menunggu konfirmasi Talent jika belum ada.');
    if (!confirmed) return;

    setActionInProgressId(booking.id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const { data, error } = await supabase.rpc('confirm_booking_completion', {
        p_booking_id: booking.id,
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Konfirmasi penyelesaian tidak berhasil diproses.');

      setSuccessMsg(
        data.completed
          ? 'Kedua pihak telah mengonfirmasi sesi selesai. Saldo Talent akan tersedia jika tidak ada sengketa aktif.'
          : 'Konfirmasi Anda tercatat. Booking menunggu konfirmasi penyelesaian dari Talent.'
      );
      await loadBookings();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal mengonfirmasi penyelesaian sesi.');
    } finally {
      setActionInProgressId(null);
    }
  };

  const openReviewModal = (booking: BookingItem) => {
    setReviewTarget(booking);
    setReviewRating(5);
    setHoverRating(0);
    setReviewText('');
    setReviewError(null);
    setSuccessMsg(null);
  };

  const closeReviewModal = () => {
    if (isSubmittingReview) return;
    setReviewTarget(null);
    setReviewError(null);
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !reviewTarget) return;

    if (reviewTarget.status !== 'completed') {
      setReviewError('Ulasan hanya dapat dikirim untuk sesi booking yang sudah selesai.');
      return;
    }

    if (reviewTarget.customer_id !== currentUser.id) {
      setReviewError('Hanya customer pemesan yang dapat memberikan ulasan pada sesi ini.');
      return;
    }

    if (reviewRating < 1 || reviewRating > 5) {
      setReviewError('Pilih rating antara 1 hingga 5 bintang.');
      return;
    }

    setIsSubmittingReview(true);
    setReviewError(null);

    try {
      const { error } = await supabase.from('reviews').insert({
        booking_id: reviewTarget.id,
        customer_id: currentUser.id,
        talent_id: reviewTarget.talent_id,
        rating: reviewRating,
        review_text: reviewText.trim() || null,
      });

      if (error) {
        if (error.code === '23505') {
          throw new Error('Anda sudah memberikan ulasan untuk booking ini.');
        }
        throw new Error(`Gagal mengirim ulasan: ${error.message}`);
      }

      const talentLabel = reviewTarget.talentName || 'Talent';
      setReviewTarget(null);
      setSuccessMsg(`Terima kasih! Ulasan Anda untuk ${talentLabel} berhasil disimpan.`);
      await loadBookings();
    } catch (err: any) {
      setReviewError(err?.message || 'Terjadi kesalahan saat menyimpan ulasan.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const getRatingLabel = (rating: number) => {
    switch (rating) {
      case 1:
        return '1 / 5 — Kurang Memuaskan';
      case 2:
        return '2 / 5 — Cukup';
      case 3:
        return '3 / 5 — Baik';
      case 4:
        return '4 / 5 — Sangat Baik';
      case 5:
        return '5 / 5 — Luar Biasa';
      default:
        return '';
    }
  };

  const openReportModal = (booking: BookingItem) => {
    setReportTarget(booking);
    setReportCategory('unethical_behavior');
    setReportDescription('');
    setReportError(null);
    setSuccessMsg(null);
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
      setReportError('Mohon jelaskan kronologi atau kendala minimal 15 karakter agar tim admin dapat menindaklanjuti.');
      return;
    }

    const reportedUserId =
      reportTarget.customer_id === currentUser.id ? reportTarget.talent_id : reportTarget.customer_id;

    setIsSubmittingReport(true);
    setReportError(null);

    try {
      const { error } = await supabase.from('reports_complaints').insert({
        reporter_id: currentUser.id,
        reported_user_id: reportedUserId,
        booking_id: reportTarget.id,
        category: reportCategory,
        description: trimmedDesc,
      });

      if (error) {
        throw new Error(`Gagal mengirim laporan: ${error.message}`);
      }

      const code = reportTarget.booking_code;
      setReportTarget(null);
      setSuccessMsg(`Laporan insiden untuk booking ${code} telah diterima dan akan segera ditinjau oleh Tim Keamanan YUKU.`);
      await loadBookings();
    } catch (err: any) {
      setReportError(err?.message || 'Terjadi kesalahan saat mengirim laporan insiden.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // Status Badge Helper
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_payment':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3.5 h-3.5" />
            <span>Menunggu Pembayaran</span>
          </span>
        );
      case 'paid_held_in_escrow':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Dibayar (Dana di Escrow)</span>
          </span>
        );
      case 'confirmed_by_talent':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Terkonfirmasi Talent</span>
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <Clock className="w-3.5 h-3.5" />
            <span>Aktivitas Berlangsung</span>
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Selesai</span>
          </span>
        );
      case 'cancelled_by_customer':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <XCircle className="w-3.5 h-3.5" />
            <span>Dibatalkan Customer</span>
          </span>
        );
      case 'cancelled_by_talent':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5" />
            <span>Dibatalkan Talent</span>
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-200">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Kedaluwarsa (15 Min)</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  // Format Date & Time
  const formatDateTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('id-ID', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  // Filter Bookings by Role & Status
  const filteredBookings = bookings.filter((b) => {
    const isAsCustomer = b.customer_id === currentUser?.id;
    const isAsTalent = b.talent_id === currentUser?.id;

    if (roleFilter === 'customer' && !isAsCustomer) return false;
    if (roleFilter === 'talent' && !isAsTalent) return false;

    if (statusFilter !== 'all' && b.status !== statusFilter) {
      return false;
    }

    return true;
  });

  const hasCustomerBookings = bookings.some((b) => b.customer_id === currentUser?.id);
  const hasTalentBookings = bookings.some((b) => b.talent_id === currentUser?.id);

  if (isCheckingAuth) {
    return (
      <div className="py-24 bg-[#FAF8FC] min-h-[60vh] flex items-center justify-center">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin text-purple-700" />
          <span>Memeriksa sesi pengguna...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="py-16 bg-[#FAF8FC] min-h-[60vh]">
        <div className="max-w-md mx-auto px-4 text-center bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="w-14 h-14 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center mx-auto">
            <ShoppingBag className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Masuk untuk Melihat Riwayat Booking
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Daftar reservasi dan transaksi aman YUKU tersimpan rapi di akun Anda. Silakan masuk terlebih dahulu untuk memantau status pesanan.
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              onClick={() => onNavigate('/login')}
              className="px-6 py-2.5 bg-purple-700 text-white font-bold text-xs rounded-xl hover:bg-purple-800 shadow-xs cursor-pointer"
            >
              Masuk ke Akun
            </button>
            <button
              onClick={() => onNavigate('/talent')}
              className="px-4 py-2.5 bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl hover:bg-slate-200 cursor-pointer"
            >
              Jelajahi Talent
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-10 bg-[#FAF8FC] min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-6">
          <div>
            <span className="text-xs font-bold text-purple-700 tracking-wider uppercase mb-1 block">
              Manajemen Reservasi & Transaksi
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-[#1E0938] tracking-tight">
              Riwayat Booking Saya
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Pantau jadwal pertemuan, status pembayaran, dan perlindungan escrow secara real-time dari Supabase.
            </p>
          </div>

          <button
            onClick={loadBookings}
            disabled={isLoading}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Muat Ulang Data</span>
          </button>
        </div>

        {/* Role Selector Tabs (shown only if user also has bookings as Talent) */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          {bookings.some((b) => b.talent_id === currentUser?.id) ? (
            <div className="flex items-center gap-2 p-1 bg-slate-200/70 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setRoleFilter('customer')}
                className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
                  roleFilter === 'customer'
                    ? 'bg-white text-purple-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sebagai Customer (Pesanan Saya)
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter('talent')}
                className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
                  roleFilter === 'talent'
                    ? 'bg-white text-purple-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sebagai Talent (Pesanan Masuk)
              </button>
            </div>
          ) : (
            <div className="text-xs font-bold text-purple-900 bg-purple-50 border border-purple-200 px-3.5 py-2 rounded-xl">
              Pesanan Saya (Customer)
            </div>
          )}

          {/* Status Filter */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium hidden sm:inline">Filter Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="p-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-purple-600"
            >
              <option value="all">Semua Status</option>
              <option value="pending_payment">Menunggu Pembayaran</option>
              <option value="paid_held_in_escrow">Dibayar (Escrow)</option>
              <option value="confirmed_by_talent">Terkonfirmasi</option>
              <option value="completed">Selesai</option>
              <option value="cancelled_by_customer">Dibatalkan</option>
            </select>
          </div>
        </div>

        {/* Success Notification */}
        {successMsg && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <p className="font-semibold">{successMsg}</p>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMsg(null)}
              className="text-emerald-700 hover:text-emerald-900 font-bold cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Error Notification */}
        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">{errorMsg}</p>
              <button
                onClick={loadBookings}
                className="mt-2 text-rose-700 underline font-bold cursor-pointer"
              >
                Coba Muat Ulang
              </button>
            </div>
          </div>
        )}

        {/* Loading Skeleton */}
        {isLoading ? (
          <div className="space-y-4">
            <div className="h-32 bg-slate-200 animate-pulse rounded-2xl" />
            <div className="h-32 bg-slate-200 animate-pulse rounded-2xl" />
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center space-y-4">
            <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
              <CalendarCheck className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">
              Belum Ada Reservasi {roleFilter === 'customer' ? 'Pesanan' : 'Masuk'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              {roleFilter === 'customer'
                ? 'Anda belum memiliki riwayat reservasi aktif. Jelajahi katalog Talent untuk menemukan teman aktivitas sosial positif.'
                : 'Belum ada pesanan yang masuk ke profil Talent Anda saat ini.'}
            </p>
            {roleFilter === 'customer' && (
              <button
                onClick={() => onNavigate('/talent')}
                className="px-5 py-2.5 bg-purple-700 text-white text-xs font-bold rounded-xl hover:bg-purple-800 shadow-xs cursor-pointer inline-flex items-center gap-1.5"
              >
                <span>Cari Teman Aktivitas</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredBookings.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-shadow p-5 sm:p-6 space-y-4"
              >
                {/* Top Row: Code, Date created, Status */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-extrabold text-purple-900 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-md">
                      {item.booking_code}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Diajukan {formatDateTime(item.created_at)}
                    </span>
                  </div>

                  <div>{renderStatusBadge(item.status)}</div>
                </div>

                {/* Main Booking Details */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                  {/* Partner Profile (Talent or Customer) */}
                  <div className="md:col-span-4 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200 flex items-center justify-center">
                      {(roleFilter === 'customer' ? item.talentAvatar : item.customerAvatar) ? (
                        <img
                          src={roleFilter === 'customer' ? item.talentAvatar : item.customerAvatar}
                          alt="Avatar"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="w-6 h-6 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase font-bold block">
                        {roleFilter === 'customer' ? 'Talent YUKU' : 'Customer Pemesan'}
                      </span>
                      <h4 className="text-sm font-extrabold text-slate-900">
                        {roleFilter === 'customer' ? item.talentName : item.customerName}
                      </h4>
                      <span className="text-xs text-purple-700 font-semibold block">
                        {item.activityTitle}
                      </span>
                    </div>
                  </div>

                  {/* Schedule & Location */}
                  <div className="md:col-span-5 space-y-1.5 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-purple-600 shrink-0" />
                      <span>
                        <strong>Jadwal:</strong> {formatDateTime(item.start_time)} ({item.duration_hours} Jam)
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <span>
                          <strong>Lokasi:</strong> {item.meeting_location_name}
                        </span>
                        {item.meeting_location_address && (
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {item.meeting_location_address}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Pricing & Escrow */}
                  <div className="md:col-span-3 text-right sm:text-right space-y-1">
                    <span className="text-[11px] text-slate-400 font-medium block">
                      Total Biaya Sesi
                    </span>
                    <div className="text-lg font-black text-[#1E0938] tabular-nums">
                      {formatRupiah(item.gross_amount)}
                    </div>
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full inline-block font-semibold">
                      Proteksi Escrow YUKU
                    </span>
                  </div>
                </div>

                {roleFilter === 'customer' && item.status === 'pending_payment' && (
                  <>
                    <XenditCustomerPaymentPanel
                      bookingId={item.id}
                      amount={Number(item.gross_amount)}
                      bookingStatus={item.status}
                      paymentRoute={item.payment_route}
                      onRouteClaimed={(route) => setBookings(prev => prev.map(b => b.id === item.id ? { ...b, payment_route: route } : b))}
                    />
                    <QrisCustomerPaymentPanel
                      bookingId={item.id}
                      expiresAt={item.payment_expires_at}
                      amount={Number(item.gross_amount)}
                      bookingStatus={item.status}
                      paymentRoute={item.payment_route}
                      onRouteClaimed={(route) => setBookings(prev => prev.map(b => b.id === item.id ? { ...b, payment_route: route } : b))}
                    />
                  </>
                )}

                {/* Bottom Row: Review Section for Completed Bookings */}
                {item.status === 'completed' && (
                  <div className="pt-3 border-t border-slate-100">
                    {item.review ? (
                      <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/80 space-y-1.5 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">
                              {roleFilter === 'customer' ? 'Ulasan Anda' : 'Ulasan dari Customer'}
                            </span>
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={`w-3.5 h-3.5 ${
                                    star <= item.review!.rating
                                      ? 'fill-amber-400 text-amber-400'
                                      : 'text-slate-300'
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="font-bold text-amber-800 tabular-nums">
                              {item.review.rating}/5
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {formatDateTime(item.review.created_at)}
                          </span>
                        </div>
                        {item.review.review_text ? (
                          <p className="text-slate-700 leading-relaxed">
                            "{item.review.review_text}"
                          </p>
                        ) : (
                          <p className="text-slate-400 italic">
                            Rating diberikan tanpa komentar tambahan.
                          </p>
                        )}
                      </div>
                    ) : roleFilter === 'customer' && item.customer_id === currentUser?.id ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                        <span className="text-slate-600">
                          Sesi telah selesai. Bagikan pengalaman Anda bersama {item.talentName}.
                        </span>
                        <button
                          type="button"
                          onClick={() => openReviewModal(item)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-xl shadow-2xs transition-colors cursor-pointer"
                        >
                          <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
                          <span>Beri Ulasan</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}

                {roleFilter === 'customer' && item.status === 'cancelled_by_talent' && item.refund && (
                  <div className="pt-3 border-t border-slate-100">
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-950 space-y-1">
                      <div className="font-bold">Permintaan refund penuh: {formatRupiah(item.refund.amount)}</div>
                      <div>Status: {item.refund.status === 'processed' ? 'Refund telah diproses' : 'Menunggu proses manual dari Finance YUKU'}</div>
                      {item.refund.provider_refund_id && <div>Referensi refund: <span className="font-mono">{item.refund.provider_refund_id}</span></div>}
                      {item.refund.status !== 'processed' && <div>Refund belum dinyatakan selesai sampai dana benar-benar dikembalikan dan referensi dicatat.</div>}
                    </div>
                  </div>
                )}

                {roleFilter === 'customer' && item.status === 'in_progress' && (
                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                    {item.customer_completed_at ? (
                      <span className="text-amber-700 font-semibold">Konfirmasi Anda tercatat. Menunggu Talent mengonfirmasi sesi selesai.</span>
                    ) : (
                      <>
                        <span className="text-slate-600">Jika sesi sudah benar-benar selesai, konfirmasikan di sini.</span>
                        <button
                          type="button"
                          onClick={() => handleConfirmCompletion(item)}
                          disabled={actionInProgressId === item.id}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs disabled:opacity-50"
                        >
                          {actionInProgressId === item.id ? 'Menyimpan...' : 'Konfirmasi Sesi Selesai'}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Bottom Row: Actions & Expiration Notice */}
                {roleFilter === 'customer' && ['pending_payment', 'paid_held_in_escrow', 'confirmed_by_talent'].includes(item.status) && new Date(item.start_time).getTime() > Date.now() && (
                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 text-amber-800 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 text-[11px]">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {item.status === 'pending_payment'
                          ? 'Slot waktu dikunci. Selesaikan pembayaran sebelum reservasi 15 menit kedaluwarsa.'
                          : 'Pembatalan mengikuti kebijakan refund YUKU berdasarkan waktu sebelum sesi. Sisa dana tertentu dapat ditahan untuk peninjauan Admin.'}
                      </span>
                    </div>

                    <button
                        onClick={() => handleCancelBooking(item.id)}
                        disabled={actionInProgressId === item.id}
                        className="px-3.5 py-1.5 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 rounded-lg font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {actionInProgressId === item.id ? 'Membatalkan...' : 'Batalkan Reservasi'}
                    </button>
                  </div>
                )}

                {/* Bottom Row: Incident Report Status or Action */}
                {item.report ? (
                  <div className="pt-3 border-t border-slate-100">
                    {(() => {
                      const statusMeta = getReportStatusMeta(item.report.status);
                      return (
                        <div className="p-3.5 rounded-xl bg-rose-50/60 border border-rose-200/80 space-y-1.5 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                              <span className="font-bold text-slate-900">
                                Laporan Insiden: {getReportCategoryLabel(item.report.category)}
                              </span>
                            </div>
                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusMeta.badgeClass}`}>
                              {statusMeta.label}
                            </span>
                          </div>
                          <p className="text-slate-700 leading-relaxed">{item.report.description}</p>
                          {item.report.admin_notes && (
                            <div className="p-2.5 rounded-lg bg-white border border-rose-100 text-[11px] text-slate-700">
                              <strong className="text-purple-900">Catatan Tim Keamanan YUKU:</strong>{' '}
                              {item.report.admin_notes}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  item.status !== 'expired' && (
                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setChatTarget(item)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 text-xs font-bold transition-colors cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-purple-700" />
                        <span>
                          Chat {roleFilter === 'customer' ? 'Talent' : 'Customer'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openReportModal(item)}
                        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-rose-700 transition-colors cursor-pointer"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Laporkan Insiden / Pelanggaran</span>
                      </button>
                    </div>
                  )
                )}
                {item.report && item.status !== 'expired' && (
                  <div className="pt-2 flex items-center justify-start">
                    <button
                      type="button"
                      onClick={() => setChatTarget(item)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 text-xs font-bold transition-colors cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-purple-700" />
                      <span>Chat {roleFilter === 'customer' ? 'Talent' : 'Customer'}</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review Submission Modal */}
      <Modal
        isOpen={Boolean(reviewTarget)}
        onClose={closeReviewModal}
        title="Beri Ulasan & Rating Sesi"
      >
        {reviewTarget && (
          <form onSubmit={handleSubmitReview} className="space-y-5 text-xs">
            <div className="p-3.5 rounded-xl bg-purple-50/70 border border-purple-100 flex items-center justify-between gap-3">
              <div>
                <span className="text-[11px] text-purple-700 font-bold uppercase block">
                  {reviewTarget.booking_code}
                </span>
                <p className="text-sm font-extrabold text-slate-900">
                  {reviewTarget.talentName}
                </p>
                <p className="text-[11px] text-slate-500">
                  {reviewTarget.activityTitle} • {formatDateTime(reviewTarget.start_time)}
                </p>
              </div>
            </div>

            {reviewError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{reviewError}</span>
              </div>
            )}

            {/* Star Rating Selector */}
            <div className="space-y-2">
              <label className="block font-bold text-slate-800">
                Penilaian Anda (1–5 Bintang)
              </label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((starValue) => {
                  const isFilled = starValue <= (hoverRating || reviewRating);
                  return (
                    <button
                      key={starValue}
                      type="button"
                      onClick={() => setReviewRating(starValue)}
                      onMouseEnter={() => setHoverRating(starValue)}
                      onMouseLeave={() => setHoverRating(0)}
                      aria-label={`Beri ${starValue} bintang`}
                      className="p-1.5 rounded-lg hover:bg-amber-50 transition-transform hover:scale-110 cursor-pointer focus:outline-none"
                    >
                      <Star
                        className={`w-7 h-7 transition-colors ${
                          isFilled ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                        }`}
                      />
                    </button>
                  );
                })}
                <span className="ml-2 text-xs font-bold text-slate-700">
                  {getRatingLabel(hoverRating || reviewRating)}
                </span>
              </div>
            </div>

            {/* Review Textarea */}
            <div className="space-y-1.5">
              <label htmlFor="review-text-input" className="flex items-center justify-between font-bold text-slate-800">
                <span className="inline-flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
                  <span>Ceritakan Pengalaman Anda (Opsional)</span>
                </span>
                <span className="text-[11px] font-normal text-slate-400">
                  {reviewText.length}/500
                </span>
              </label>
              <textarea
                id="review-text-input"
                rows={4}
                maxLength={500}
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Bagaimana kesan Anda selama aktivitas bersama Talent? (Contoh: ramah, tepat waktu, obrolan seru)"
                className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-purple-600 text-slate-800 placeholder:text-slate-400 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={closeReviewModal}
                disabled={isSubmittingReview}
                className="px-4 py-2.5 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmittingReview}
                className="px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold shadow-xs inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmittingReview ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Mengirim...</span>
                  </>
                ) : (
                  <span>Kirim Ulasan</span>
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Incident Report Modal */}
      <Modal
        isOpen={Boolean(reportTarget)}
        onClose={closeReportModal}
        title="Laporkan Insiden & Pelanggaran Etika"
      >
        {reportTarget && (
          <form onSubmit={handleSubmitReport} className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold text-rose-900">{reportTarget.booking_code}</span>
                <span className="text-[11px] font-semibold text-rose-700">
                  Terlapor: {roleFilter === 'customer' ? reportTarget.talentName : reportTarget.customerName}
                </span>
              </div>
              <p className="text-[11px] text-rose-800 leading-relaxed">
                Laporan Anda bersifat rahasia dan akan ditinjau langsung oleh Tim Keamanan YUKU. Untuk transaksi aktif, dana escrow dapat ditahan selama investigasi.
              </p>
            </div>

            {reportError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{reportError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="booking-report-category" className="block font-bold text-slate-800">
                Kategori Pelanggaran / Kendala *
              </label>
              <select
                id="booking-report-category"
                value={reportCategory}
                onChange={(e) => setReportCategory(e.target.value as ReportCategory)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 font-semibold text-slate-800"
              >
                {REPORT_CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">
                {REPORT_CATEGORY_OPTIONS.find((o) => o.value === reportCategory)?.description}
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="booking-report-desc" className="flex items-center justify-between font-bold text-slate-800">
                <span>Kronologi Kejadian (Minimal 15 karakter) *</span>
                <span className="text-[11px] font-normal text-slate-400">
                  {reportDescription.length}/1000
                </span>
              </label>
              <textarea
                id="booking-report-desc"
                rows={4}
                required
                minLength={15}
                maxLength={1000}
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
                placeholder="Jelaskan secara objektif waktu kejadian, lokasi, dan bentuk pelanggaran atau kendala yang terjadi..."
                className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-purple-600 text-slate-800 placeholder:text-slate-400 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={closeReportModal}
                disabled={isSubmittingReport}
                className="px-4 py-2.5 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmittingReport}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-xs inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmittingReport ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Mengirim Laporan...</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-4 h-4" />
                    <span>Kirim Laporan Insiden</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Real-Time Booking Chat Modal */}
      {currentUser && (
        <BookingChatModal
          isOpen={Boolean(chatTarget)}
          onClose={() => setChatTarget(null)}
          booking={
            chatTarget
              ? {
                  id: chatTarget.id,
                  booking_code: chatTarget.booking_code,
                  status: chatTarget.status,
                  start_time: chatTarget.start_time,
                  duration_hours: chatTarget.duration_hours,
                  meeting_location_name: chatTarget.meeting_location_name,
                  activity_title: chatTarget.activityTitle,
                }
              : null
          }
          currentUserId={currentUser.id}
          partnerName={
            chatTarget
              ? roleFilter === 'customer'
                ? chatTarget.talentName || 'Talent YUKU'
                : chatTarget.customerName || 'Customer YUKU'
              : ''
          }
          partnerRoleLabel={roleFilter === 'customer' ? 'Talent YUKU' : 'Customer'}
          partnerAvatar={
            chatTarget
              ? roleFilter === 'customer'
                ? chatTarget.talentAvatar
                : chatTarget.customerAvatar
              : null
          }
        />
      )}
    </div>
  );
};
