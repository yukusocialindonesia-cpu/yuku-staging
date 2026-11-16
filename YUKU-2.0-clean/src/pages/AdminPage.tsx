import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Users,
  CreditCard,
  TrendingUp,
  DollarSign,
  AlertCircle,
  Eye,
  FileCheck,
  Search,
  Filter,
  RefreshCw,
  Loader2,
  Lock,
  ExternalLink,
  ChevronRight,
  Sparkles,
  MapPin,
  Calendar,
  Building,
  ShieldAlert,
  Image as ImageIcon,
  Upload,
  Trash2,
  EyeOff,
  Megaphone,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AppRoute } from '../types/navigation';
import { formatRupiah } from '../utils/formatters';
import { Modal } from '../components/common/Modal';
import { PromotionRow, ReportStatus } from '../types/database';
import { getReportCategoryLabel, getReportStatusMeta } from '../utils/reportHelpers';
import { QrisAdminPanel } from '../components/booking/QrisAdminPanel';
import { BrandingAdminPanel } from '../components/admin/BrandingAdminPanel';
import { HeroSlidesAdminPanel } from '../components/admin/HeroSlidesAdminPanel';

interface AdminPageProps {
  onNavigate: (path: AppRoute, params?: Record<string, string>) => void;
}

interface TalentCurationItem {
  id: string;
  display_name: string;
  avatar_url: string | null;
  city: string;
  gender: string;
  headline: string | null;
  bio: string | null;
  hourly_rate: number;
  is_approved: boolean;
  created_at: string;
  // Identities
  full_legal_name?: string;
  date_of_birth?: string;
  ktp_number?: string | null;
  ktp_storage_path?: string | null;
  ktp_verification_status?: string;
  ktp_rejection_reason?: string | null;
  emergency_contact_phone?: string | null;
  // User account
  email?: string;
  account_status?: string;
  is_verified_18?: boolean;
}

interface AdminPayoutItem {
  id: string;
  payout_number: string;
  talent_id: string;
  amount: number;
  bank_name: string;
  bank_account_number: string;
  bank_account_holder_name: string;
  payout_status: 'requested' | 'processing' | 'completed_provider_confirmed' | 'rejected' | 'failed';
  rejection_reason: string | null;
  created_at: string;
  talent_name?: string;
  talent_city?: string;
}

interface AdminRefundItem {
  id: string;
  payment_id: string;
  booking_id: string;
  customer_id: string;
  refund_amount: number;
  reason: string;
  provider_refund_id: string | null;
  status: 'requested' | 'approved' | 'processed' | 'rejected';
  created_at: string;
  booking_code?: string;
  customer_name?: string;
}

interface CustomerCancellationCaseItem {
  id: string;
  booking_id: string;
  customer_id: string;
  gross_amount: number;
  automatic_refund_amount: number;
  retained_pending_admin_amount: number;
  hours_before_session: number | null;
  policy_code: string;
  status: string;
  admin_hold_until?: string | null;
  created_at: string;
  booking_code?: string;
  customer_name?: string;
}

interface AdminBookingItem {
  id: string;
  booking_code: string;
  customer_id: string;
  talent_id: string;
  booking_mode: string;
  start_time: string;
  duration_hours: number;
  meeting_location_name: string;
  gross_amount: number;
  platform_fee_amount: number;
  talent_gross_share: number;
  status: string;
  created_at: string;
  customer_name?: string;
  talent_name?: string;
}

interface CustomerKtpItem {
  id: string;
  full_legal_name: string;
  date_of_birth: string;
  ktp_number: string | null;
  ktp_storage_path: string | null;
  ktp_verification_status: 'unsubmitted' | 'pending_review' | 'verified' | 'rejected';
  ktp_rejection_reason: string | null;
  emergency_contact_phone: string | null;
  email?: string;
  account_status?: string;
  is_verified_18?: boolean;
}

interface AdminReportItem {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  booking_id: string | null;
  category: string;
  description: string;
  status: ReportStatus;
  admin_notes: string | null;
  created_at: string;
  reporter_name?: string;
  reported_user_name?: string;
  booking_code?: string | null;
  booking_status?: string | null;
}

export const AdminPage: React.FC<AdminPageProps> = ({ onNavigate }) => {
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAdminAuthorized, setIsAdminAuthorized] = useState(false);

  // Active Tab
  const [activeTab, setActiveTab] = useState<
    'talents' | 'customer_ktp' | 'payouts' | 'refunds' | 'bookings' | 'reports' | 'promos' | 'qris' | 'branding' | 'hero' | 'overview'
  >('talents');

  // Data States
  const [talents, setTalents] = useState<TalentCurationItem[]>([]);
  const [customerKtps, setCustomerKtps] = useState<CustomerKtpItem[]>([]);
  const [payouts, setPayouts] = useState<AdminPayoutItem[]>([]);
  const [refunds, setRefunds] = useState<AdminRefundItem[]>([]);
  const [customerCancellationCases, setCustomerCancellationCases] = useState<CustomerCancellationCaseItem[]>([]);
  const [bookings, setBookings] = useState<AdminBookingItem[]>([]);
  const [reports, setReports] = useState<AdminReportItem[]>([]);
  const [promoPosters, setPromoPosters] = useState<PromotionRow[]>([]);
  const [promoMigrationMissing, setPromoMigrationMissing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [talentFilter, setTalentFilter] = useState<'pending' | 'approved' | 'all'>('pending');
  const [payoutFilter, setPayoutFilter] = useState<
    'all' | 'requested' | 'processing' | 'completed_provider_confirmed' | 'rejected' | 'failed'
  >('requested');
  const [reportFilter, setReportFilter] = useState<'all' | ReportStatus>('open');
  const [searchQuery, setSearchQuery] = useState('');

  // Promo Poster Form States
  const [promoFile, setPromoFile] = useState<File | null>(null);
  const [promoPreviewUrl, setPromoPreviewUrl] = useState<string | null>(null);
  const [promoTitle, setPromoTitle] = useState('');
  const [promoTargetLink, setPromoTargetLink] = useState('');
  const [promoSortOrder, setPromoSortOrder] = useState('0');
  const [promoImageUrlInput, setPromoImageUrlInput] = useState('');
  const [isUploadingPromo, setIsUploadingPromo] = useState(false);
  const [confirmDeletePromoId, setConfirmDeletePromoId] = useState<string | null>(null);

  // Modals & Action States
  const [selectedKtpItem, setSelectedKtpItem] = useState<TalentCurationItem | null>(null);
  const [selectedReportItem, setSelectedReportItem] = useState<AdminReportItem | null>(null);
  const [reportDecision, setReportDecision] = useState<ReportStatus>('investigating');
  const [reportAdminNotes, setReportAdminNotes] = useState('');
  const [holdBookingOnDispute, setHoldBookingOnDispute] = useState(false);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // Check auth and admin role
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user ?? null;
      setCurrentUser(user);

      if (user) {
        // Check public.users role
        const { data: userRow } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

        setIsAdminAuthorized(userRow?.role === 'admin');
      } else {
        setIsAdminAuthorized(false);
      }
      setIsCheckingAuth(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user ?? null;
      setCurrentUser(user);
      if (user) {
        const { data: userRow } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

        setIsAdminAuthorized(userRow?.role === 'admin');
      } else {
        setIsAdminAuthorized(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Load Admin Data
  const loadAdminData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      // 1. Fetch all Talents and Identities
      const { data: talentRows, error: talentErr } = await supabase
        .from('talent_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (talentErr) console.warn('Error loading talents:', talentErr.message);

      // Fetch corresponding identities and users
      let combinedTalents: TalentCurationItem[] = [];
      if (talentRows && talentRows.length > 0) {
        const talentIds = talentRows.map((t) => t.id);

        const { data: identityRows } = await supabase
          .from('user_identities')
          .select('*')
          .in('id', talentIds);

        const { data: userRows } = await supabase
          .from('users')
          .select('id, email, account_status, is_verified_18')
          .in('id', talentIds);

        const idMap = new Map((identityRows || []).map((id) => [id.id, id]));
        const userMap = new Map((userRows || []).map((u) => [u.id, u]));

        combinedTalents = talentRows.map((t) => {
          const idRecord = idMap.get(t.id);
          const uRecord = userMap.get(t.id);
          const ktpStatus = idRecord?.ktp_verification_status || 'unsubmitted';
          const accountStatus = uRecord?.account_status;
          const isVerified18 = uRecord?.is_verified_18 === true;
          const isApproved =
            ktpStatus === 'verified' && accountStatus === 'active' && isVerified18;

          return {
            ...t,
            is_approved: isApproved,
            full_legal_name: idRecord?.full_legal_name,
            date_of_birth: idRecord?.date_of_birth,
            ktp_number: idRecord?.ktp_number,
            ktp_storage_path: idRecord?.ktp_storage_path,
            ktp_verification_status: ktpStatus,
            ktp_rejection_reason: idRecord?.ktp_rejection_reason,
            emergency_contact_phone: idRecord?.emergency_contact_phone,
            email: uRecord?.email,
            account_status: accountStatus,
            is_verified_18: uRecord?.is_verified_18,
          };
        });
      }
      setTalents(combinedTalents);

      // 2. Fetch Payout Requests
      const { data: payoutRows, error: payoutErr } = await supabase
        .from('payout_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (payoutErr) console.warn('Error loading payouts:', payoutErr.message);

      let enrichedPayouts: AdminPayoutItem[] = [];
      if (payoutRows && payoutRows.length > 0) {
        const talentIds = Array.from(new Set(payoutRows.map((p) => p.talent_id)));
        const { data: tProfiles } = await supabase
          .from('talent_profiles')
          .select('id, display_name, city')
          .in('id', talentIds);

        const tMap = new Map((tProfiles || []).map((t) => [t.id, t]));

        enrichedPayouts = payoutRows.map((p) => ({
          ...p,
          talent_name: tMap.get(p.talent_id)?.display_name || 'Talent YUKU',
          talent_city: tMap.get(p.talent_id)?.city || 'Jakarta',
        }));
      }
      setPayouts(enrichedPayouts);

      // 3. Fetch Bookings
      const { data: bookingRows, error: bookingErr } = await supabase
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false });

      if (bookingErr) console.warn('Error loading bookings:', bookingErr.message);

      let enrichedBookings: AdminBookingItem[] = [];
      if (bookingRows && bookingRows.length > 0) {
        const custIds = Array.from(new Set(bookingRows.map((b) => b.customer_id)));
        const talIds = Array.from(new Set(bookingRows.map((b) => b.talent_id)));

        const { data: customers } = await supabase
          .from('customer_profiles')
          .select('id, display_name')
          .in('id', custIds);

        const { data: talProfiles } = await supabase
          .from('talent_profiles')
          .select('id, display_name')
          .in('id', talIds);

        const custMap = new Map((customers || []).map((c) => [c.id, c.display_name]));
        const talMap = new Map((talProfiles || []).map((t) => [t.id, t.display_name]));

        enrichedBookings = bookingRows.map((b) => ({
          ...b,
          customer_name: custMap.get(b.customer_id) || 'Customer',
          talent_name: talMap.get(b.talent_id) || 'Talent',
        }));
      }
      setBookings(enrichedBookings);

      // 4. Fetch Customer KTP Verifications (non-talent users who submitted user_identities)
      const { data: allIdentityRows } = await supabase
        .from('user_identities')
        .select(
          'id, full_legal_name, date_of_birth, ktp_number, ktp_storage_path, ktp_verification_status, ktp_rejection_reason, emergency_contact_phone'
        )
        .order('created_at', { ascending: false });

      if (allIdentityRows && allIdentityRows.length > 0) {
        const talentIdSet = new Set((talentRows || []).map((t) => t.id));
        const nonTalentIdentities = allIdentityRows.filter((row) => !talentIdSet.has(row.id));

        if (nonTalentIdentities.length > 0) {
          const custIdentityIds = nonTalentIdentities.map((row) => row.id);
          const { data: custUserRows } = await supabase
            .from('users')
            .select('id, email, account_status, is_verified_18')
            .in('id', custIdentityIds);

          const custUserMap = new Map((custUserRows || []).map((u) => [u.id, u]));
          setCustomerKtps(
            nonTalentIdentities.map((row) => {
              const uRec = custUserMap.get(row.id);
              return {
                ...row,
                email: uRec?.email,
                account_status: uRec?.account_status,
                is_verified_18: uRec?.is_verified_18,
              } as CustomerKtpItem;
            })
          );
        } else {
          setCustomerKtps([]);
        }
      } else {
        setCustomerKtps([]);
      }

      // 5. Fetch Reports & Complaints
      const { data: reportRows, error: reportErr } = await supabase
        .from('reports_complaints')
        .select('id, reporter_id, reported_user_id, booking_id, category, description, status, admin_notes, created_at')
        .order('created_at', { ascending: false });

      if (reportErr) console.warn('Error loading reports:', reportErr.message);

      if (reportRows && reportRows.length > 0) {
        const partyIds = Array.from(
          new Set(reportRows.flatMap((r) => [r.reporter_id, r.reported_user_id]))
        );
        const { data: partyUsers } = await supabase
          .from('users')
          .select('id, full_name, email')
          .in('id', partyIds);

        const userLabelMap = new Map<string, string>();
        partyUsers?.forEach((u) => {
          userLabelMap.set(u.id, u.full_name || u.email || 'Pengguna YUKU');
        });

        const bookingInfoMap = new Map<string, { code: string; status: string }>();
        enrichedBookings.forEach((b) => {
          bookingInfoMap.set(b.id, { code: b.booking_code, status: b.status });
        });

        setReports(
          reportRows.map((r) => {
            const bInfo = r.booking_id ? bookingInfoMap.get(r.booking_id) : undefined;
            return {
              ...r,
              reporter_name: userLabelMap.get(r.reporter_id) || 'Pengguna YUKU',
              reported_user_name: userLabelMap.get(r.reported_user_id) || 'Pengguna YUKU',
              booking_code: bInfo?.code || null,
              booking_status: bInfo?.status || null,
            } as AdminReportItem;
          })
        );
      } else {
        setReports([]);
      }

      // 6. Fetch Refund Requests
      const { data: refundRows, error: refundErr } = await supabase
        .from('refunds')
        .select('*')
        .order('created_at', { ascending: false });

      if (refundErr) console.warn('Error loading refunds:', refundErr.message);
      if (refundRows && refundRows.length > 0) {
        const refundCustomerIds = Array.from(new Set(refundRows.map((r) => r.customer_id)));
        const { data: refundCustomers } = await supabase
          .from('customer_profiles')
          .select('id, display_name')
          .in('id', refundCustomerIds);
        const refundCustomerMap = new Map((refundCustomers || []).map((c) => [c.id, c.display_name]));
        const bookingCodeMap = new Map(enrichedBookings.map((b) => [b.id, b.booking_code]));
        setRefunds(refundRows.map((r) => ({
          ...r,
          customer_name: refundCustomerMap.get(r.customer_id) || 'Customer YUKU',
          booking_code: bookingCodeMap.get(r.booking_id) || r.booking_id,
        })) as AdminRefundItem[]);
      } else {
        setRefunds([]);
      }

      // 6b. Fetch Customer cancellation cases and retained funds awaiting Admin review
      const { data: cancellationCaseRows, error: cancellationCaseErr } = await supabase
        .from('customer_cancellation_cases')
        .select('*')
        .order('created_at', { ascending: false });
      if (cancellationCaseErr) console.warn('Error loading customer cancellation cases:', cancellationCaseErr.message);
      if (cancellationCaseRows && cancellationCaseRows.length > 0) {
        const caseCustomerIds = Array.from(new Set(cancellationCaseRows.map((c) => c.customer_id)));
        const { data: caseCustomers } = await supabase
          .from('customer_profiles')
          .select('id, display_name')
          .in('id', caseCustomerIds);
        const caseCustomerMap = new Map((caseCustomers || []).map((c) => [c.id, c.display_name]));
        const caseBookingMap = new Map(enrichedBookings.map((b) => [b.id, b.booking_code]));
        setCustomerCancellationCases(cancellationCaseRows.map((c) => ({
          ...c,
          customer_name: caseCustomerMap.get(c.customer_id) || 'Customer YUKU',
          booking_code: caseBookingMap.get(c.booking_id) || c.booking_id,
        })) as CustomerCancellationCaseItem[]);
      } else {
        setCustomerCancellationCases([]);
      }

      // 7. Fetch Promotional Posters for Homepage Carousel
      const { data: promoRows, error: promoErr } = await supabase
        .from('promotions')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (promoErr) {
        if (promoErr.code === '42P01' || promoErr.message.includes('promotions')) {
          setPromoMigrationMissing(true);
        }
        setPromoPosters([]);
      } else {
        setPromoMigrationMissing(false);
        setPromoPosters((promoRows as PromotionRow[]) || []);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Gagal memuat data panel admin.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdminAuthorized) {
      loadAdminData();
    }
  }, [isAdminAuthorized, loadAdminData]);

  // Action: Approve Talent
  const handleApproveTalent = async (talent: TalentCurationItem) => {
    setIsSubmittingAction(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { error: rpcError } = await supabase.rpc('admin_review_talent', {
        p_talent_id: talent.id,
        p_is_approved: true,
        p_ktp_status: 'verified',
        p_notes: null,
      });

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      setSuccessMessage(
        `Sukses! Profil Talent "${talent.display_name}" telah disetujui dan kini tayang di katalog publik YUKU.`
      );
      setSelectedKtpItem(null);
      await loadAdminData();
    } catch (err: any) {
      setErrorMessage(`Gagal menyetujui profil talent: ${err?.message}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action: Reject Talent
  const handleRejectTalent = async (talent: TalentCurationItem) => {
    const reason = window.prompt(
      'Masukkan alasan penolakan berkas / profil talent:',
      'Foto KTP buram atau profil tidak memenuhi standar etika komunitas YUKU'
    );
    if (!reason || !reason.trim()) return;

    setIsSubmittingAction(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { error: rpcError } = await supabase.rpc('admin_review_talent', {
        p_talent_id: talent.id,
        p_is_approved: false,
        p_ktp_status: 'rejected',
        p_notes: reason.trim(),
      });

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      setSuccessMessage(`Profil Talent "${talent.display_name}" telah ditolak dengan alasan: "${reason.trim()}".`);
      setSelectedKtpItem(null);
      await loadAdminData();
    } catch (err: any) {
      setErrorMessage(`Gagal menolak profil talent: ${err?.message}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleResolveCancellationCase = async (caseItem: CustomerCancellationCaseItem, decision: 'refund_customer' | 'compensate_talent' | 'extend_hold') => {
    const amountLabel = formatRupiah(Number(caseItem.retained_pending_admin_amount));
    let adminNotes = '';
    let providerRefundId: string | null = null;
    let holdUntil: string | null = null;

    if (decision === 'refund_customer') {
      adminNotes = window.prompt(`Catatan keputusan refund ${amountLabel}. Pastikan dana sudah benar-benar dikembalikan melalui provider/bank. Masukkan alasan:`, '') || '';
      if (!adminNotes.trim()) return;
      providerRefundId = window.prompt('Masukkan referensi refund provider/bank yang sudah berhasil:', '') || '';
      if (!providerRefundId.trim()) return;
      if (!window.confirm(`Konfirmasi: ${amountLabel} sudah benar-benar dikembalikan kepada Customer. Catat keputusan ini?`)) return;
    } else if (decision === 'compensate_talent') {
      adminNotes = window.prompt(`Catatan kompensasi Talent sebesar ${amountLabel}. Seluruh nominal kotor dialokasikan kepada Talent tanpa komisi YUKU. Catatan wajib:`, '') || '';
      if (!adminNotes.trim() || !window.confirm(`Setujui kompensasi Talent sebesar ${amountLabel}? Dana akan menjadi saldo tersedia untuk payout, bukan transfer bank otomatis.`)) return;
    } else {
      adminNotes = window.prompt(`Alasan memperpanjang penahanan dana ${amountLabel}:`, '') || '';
      if (!adminNotes.trim()) return;
      const holdInput = window.prompt('Masukkan batas waktu penahanan baru dalam format ISO, contoh 2026-11-20T17:00:00+07:00:', '');
      if (!holdInput || Number.isNaN(Date.parse(holdInput)) || Date.parse(holdInput) <= Date.now()) {
        setErrorMessage('Tanggal/jam penahanan tidak valid atau harus berada di masa depan.');
        return;
      }
      holdUntil = new Date(holdInput).toISOString();
      if (!window.confirm(`Perpanjang penahanan dana sampai ${new Date(holdUntil).toLocaleString('id-ID')}?`)) return;
    }

    setIsSubmittingAction(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const { error } = await supabase.rpc('admin_resolve_customer_cancellation_case', {
        p_case_id: caseItem.id,
        p_decision: decision,
        p_admin_notes: adminNotes.trim(),
        p_provider_refund_id: providerRefundId,
        p_hold_until: holdUntil,
      });
      if (error) throw new Error(error.message);
      const labels = {
        refund_customer: 'Refund Customer berhasil dicatat. Pastikan referensi provider tersimpan.',
        compensate_talent: 'Kompensasi 100% dana tertahan telah dialokasikan ke saldo Talent tanpa komisi YUKU.',
        extend_hold: 'Masa penahanan dana berhasil diperpanjang; kasus tetap menunggu keputusan Admin.',
      };
      setSuccessMessage(labels[decision]);
      await loadAdminData();
    } catch (err: any) {
      setErrorMessage(`Gagal menyelesaikan kasus pembatalan: ${err?.message}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleProcessRefund = async (refundId: string) => {
    const reference = window.prompt('Masukkan referensi refund dari provider/bank setelah dana benar-benar dikembalikan:', '');
    if (!reference || !reference.trim()) return;
    const providerRefundId = reference.trim();

    const confirmed = window.confirm('Pastikan refund sudah benar-benar dikirim ke Customer di luar aplikasi. Lanjutkan pencatatan?');
    if (!confirmed) return;

    setIsSubmittingAction(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const { error } = await supabase.rpc('admin_process_refund', {
        p_refund_id: refundId,
        p_new_status: 'processed',
        p_provider_refund_id: providerRefundId,
        p_admin_notes: null,
      });
      if (error) throw new Error(error.message);
      setSuccessMessage('Refund dicatat selesai dengan referensi provider/bank.');
      await loadAdminData();
    } catch (err: any) {
      setErrorMessage(`Gagal memproses refund: ${err?.message}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action: Process Payout (requested -> processing -> transfer confirmed)
  const handleProcessPayout = async (
    payoutId: string,
    newStatus: 'processing' | 'completed_provider_confirmed' | 'rejected'
  ) => {
    let rejectionReason: string | null = null;
    let providerReference: string | null = null;
    if (newStatus === 'completed_provider_confirmed') {
      const reference = window.prompt('Masukkan nomor referensi transfer bank/provider yang sudah berhasil:', '');
      if (!reference || !reference.trim()) return;
      providerReference = reference.trim();
    }
    if (newStatus === 'rejected') {
      const promptReason = window.prompt(
        'Masukkan alasan penolakan pencairan saldo:',
        'Nomor rekening tidak cocok dengan nama KTP terdaftar'
      );
      if (!promptReason) return;
      rejectionReason = promptReason.trim();
    }

    const confirmAction = window.confirm(
      newStatus === 'completed_provider_confirmed'
        ? 'Konfirmasi bahwa dana telah benar-benar ditransfer dan referensinya valid?'
        : newStatus === 'processing'
          ? 'Mulai proses pencairan ini? Status akan berubah menjadi Sedang Diproses.'
          : 'Konfirmasi penolakan permohonan pencairan dana ini?'
    );
    if (!confirmAction) return;

    setIsSubmittingAction(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { error: rpcError } = await supabase.rpc('admin_process_payout', {
        p_payout_id: payoutId,
        p_new_status: newStatus,
        p_rejection_reason: rejectionReason,
        p_provider_reference: providerReference,
      });

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      setSuccessMessage(
        newStatus === 'completed_provider_confirmed'
          ? 'Pencairan ditandai selesai dengan referensi transfer yang dicatat.'
          : newStatus === 'processing'
            ? 'Permintaan pencairan sekarang berstatus Sedang Diproses.'
            : 'Penarikan saldo berhasil ditolak.'
      );
      await loadAdminData();
    } catch (err: any) {
      setErrorMessage(`Gagal memproses penarikan saldo: ${err?.message}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action: Review Customer KTP via admin_review_ktp RPC
  const handleReviewCustomerKtp = async (
    item: CustomerKtpItem,
    decision: 'verified' | 'rejected'
  ) => {
    let reason: string | null = null;
    if (decision === 'rejected') {
      const promptReason = window.prompt(
        'Masukkan alasan penolakan KTP customer:',
        'Foto KTP buram atau NIK tidak terbaca dengan jelas'
      );
      if (!promptReason || !promptReason.trim()) return;
      reason = promptReason.trim();
    } else {
      const confirmApprove = window.confirm(
        `Setujui verifikasi e-KTP 18+ untuk customer "${item.full_legal_name}"?`
      );
      if (!confirmApprove) return;
    }

    setIsSubmittingAction(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { error: rpcError } = await supabase.rpc('admin_review_ktp', {
        p_user_id: item.id,
        p_decision: decision,
        p_reason: reason,
      });

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      setSuccessMessage(
        decision === 'verified'
          ? `e-KTP customer "${item.full_legal_name}" berhasil diverifikasi (18+). Customer kini dapat membuat booking.`
          : `Pengajuan e-KTP customer "${item.full_legal_name}" telah ditolak.`
      );
      await loadAdminData();
    } catch (err: any) {
      setErrorMessage(`Gagal memproses verifikasi KTP customer: ${err?.message}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action: Open & Resolve Incident Report via admin_resolve_report RPC
  const openReportModerationModal = (report: AdminReportItem) => {
    setSelectedReportItem(report);
    setReportDecision(report.status === 'open' ? 'investigating' : report.status);
    setReportAdminNotes(report.admin_notes || '');
    setHoldBookingOnDispute(false);
  };

  const handleResolveReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReportItem) return;

    setIsSubmittingAction(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { error: rpcError } = await supabase.rpc('admin_resolve_report', {
        p_report_id: selectedReportItem.id,
        p_new_status: reportDecision,
        p_admin_notes: reportAdminNotes.trim() || null,
        p_hold_booking: holdBookingOnDispute,
      });

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      setSuccessMessage('Status laporan insiden berhasil diperbarui dan dicatat dalam log audit admin.');
      setSelectedReportItem(null);
      await loadAdminData();
    } catch (err: any) {
      setErrorMessage(
        `Gagal memproses laporan insiden: ${err?.message}. Pastikan migrasi 12_reports_admin_moderation.sql sudah dijalankan di Supabase.`
      );
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Actions: Promo Posters Management
  const handlePromoFileChange = (file: File | null) => {
    if (promoPreviewUrl && promoPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(promoPreviewUrl);
    }

    if (!file) {
      setPromoFile(null);
      setPromoPreviewUrl(promoImageUrlInput.trim() || null);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Ukuran file poster maksimal 5 MB.');
      return;
    }

    setErrorMessage(null);
    setPromoFile(file);
    setPromoPreviewUrl(URL.createObjectURL(file));
  };

  const handleUploadPromoPoster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const trimmedUrl = promoImageUrlInput.trim();
    if (!promoFile && !trimmedUrl) {
      setErrorMessage('Pilih file gambar poster atau masukkan URL gambar terlebih dahulu.');
      return;
    }

    setIsUploadingPromo(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      let finalImageUrl = trimmedUrl;
      let storagePath: string | null = null;

      if (promoFile) {
        const cleanExt = (promoFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        storagePath = `posters/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${cleanExt}`;

        const { error: uploadErr } = await supabase.storage
          .from('promotions')
          .upload(storagePath, promoFile, { upsert: false, contentType: promoFile.type });

        if (uploadErr) {
          throw new Error(`Gagal mengunggah gambar ke bucket promotions: ${uploadErr.message}`);
        }

        const { data: publicUrlData } = supabase.storage
          .from('promotions')
          .getPublicUrl(storagePath);

        finalImageUrl = publicUrlData.publicUrl;
      }

      const parsedOrder = parseInt(promoSortOrder, 10);
      const { error: insertErr } = await supabase.from('promotions').insert({
        title: promoTitle.trim() || 'Promo YUKU',
        image_url: finalImageUrl,
        storage_path: storagePath,
        link_url: promoTargetLink.trim() || null,
        sort_order: Number.isNaN(parsedOrder) ? 0 : parsedOrder,
        is_active: true,
        created_by: currentUser.id,
      });

      if (insertErr) {
        throw new Error(insertErr.message);
      }

      if (promoPreviewUrl && promoPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(promoPreviewUrl);
      }

      setPromoFile(null);
      setPromoPreviewUrl(null);
      setPromoTitle('');
      setPromoTargetLink('');
      setPromoSortOrder('0');
      setPromoImageUrlInput('');
      setSuccessMessage('Poster promosi baru berhasil diterbitkan ke ruang poster berjalan di Beranda!');
      await loadAdminData();
    } catch (err: any) {
      setErrorMessage(
        `Gagal menerbitkan poster promosi: ${err?.message}. Pastikan migrasi 15_promotions.sql sudah dijalankan di Supabase.`
      );
    } finally {
      setIsUploadingPromo(false);
    }
  };

  const handleTogglePromoActive = async (poster: PromotionRow) => {
    setIsSubmittingAction(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const { error } = await supabase
        .from('promotions')
        .update({ is_active: !poster.is_active })
        .eq('id', poster.id);

      if (error) throw error;
      setSuccessMessage(
        !poster.is_active
          ? `Poster "${poster.title}" sekarang tayang di Beranda.`
          : `Poster "${poster.title}" disembunyikan dari Beranda.`
      );
      await loadAdminData();
    } catch (err: any) {
      setErrorMessage(`Gagal mengubah status poster: ${err?.message}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleShiftPromoOrder = async (poster: PromotionRow, delta: number) => {
    setIsSubmittingAction(true);
    setErrorMessage(null);
    try {
      const nextOrder = Math.max(0, (poster.sort_order || 0) + delta);
      const { error } = await supabase
        .from('promotions')
        .update({ sort_order: nextOrder })
        .eq('id', poster.id);

      if (error) throw error;
      await loadAdminData();
    } catch (err: any) {
      setErrorMessage(`Gagal mengubah urutan poster: ${err?.message}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleDeletePromoPoster = async (poster: PromotionRow) => {
    setIsSubmittingAction(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const { error } = await supabase
        .from('promotions')
        .delete()
        .eq('id', poster.id);

      if (error) throw error;

      if (poster.storage_path) {
        await supabase.storage.from('promotions').remove([poster.storage_path]);
      }

      setConfirmDeletePromoId(null);
      setSuccessMessage(`Poster "${poster.title}" berhasil dihapus.`);
      await loadAdminData();
    } catch (err: any) {
      setErrorMessage(`Gagal menghapus poster: ${err?.message}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Financial Stats
  const completedBookings = bookings.filter((b) => b.status === 'completed');
  const grossMarketplaceVolume = completedBookings.reduce((sum, b) => sum + (b.gross_amount || 0), 0);
  const platformRevenueFee = completedBookings.reduce((sum, b) => sum + (b.platform_fee_amount || 0), 0);
  const talentPayoutsPending = payouts
    .filter((p) => p.payout_status === 'requested')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  // Filtered Talents
  const filteredTalents = talents.filter((t) => {
    if (talentFilter === 'pending') return !t.is_approved;
    if (talentFilter === 'approved') return t.is_approved;
    return true;
  }).filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.display_name.toLowerCase().includes(q) ||
      t.city.toLowerCase().includes(q) ||
      (t.email && t.email.toLowerCase().includes(q))
    );
  });

  // Filtered Payouts
  const filteredPayouts = payouts.filter((p) => {
    if (payoutFilter === 'all') return true;
    return p.payout_status === payoutFilter;
  });

  // Filtered Reports
  const filteredReports = reports.filter((r) => {
    if (reportFilter === 'all') return true;
    return r.status === reportFilter;
  });

  const activeReportsCount = reports.filter(
    (r) => r.status === 'open' || r.status === 'investigating'
  ).length;

  if (isCheckingAuth) {
    return (
      <div className="py-24 text-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-purple-700 mx-auto" />
        <p className="text-xs text-slate-500 font-medium">Memeriksa hak akses Administrator...</p>
      </div>
    );
  }

  // Not Authorized View
  if (!currentUser || !isAdminAuthorized) {
    return (
      <div className="py-20 bg-[#FAF8FC]">
        <div className="max-w-md mx-auto px-4 text-center space-y-6 bg-white p-8 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Akses Terbatas: Tim Admin YUKU</h1>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Halaman ini dikhususkan bagi tim kurasi dan administrasi platform YUKU. Silakan masuk menggunakan akun resmi yang memiliki peran <em>admin</em>.
            </p>
          </div>

          <div className="pt-2 flex flex-col gap-2.5">
            <button
              onClick={() => onNavigate('/login')}
              className="w-full py-3 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-colors"
            >
              Masuk dengan Akun Admin
            </button>
            <button
              onClick={() => onNavigate('/')}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl cursor-pointer transition-colors"
            >
              Kembali ke Beranda
            </button>
          </div>
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
            <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700 font-bold">
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
            <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700 font-bold">
              ×
            </button>
          </div>
        )}

        {/* Admin Header */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-700 to-amber-600 text-white flex items-center justify-center font-black shadow-xs">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900">
                  Panel Kurasi & Admin YUKU
                </h1>
                <span className="px-2.5 py-0.5 bg-purple-100 text-purple-900 text-[10px] font-black rounded-full uppercase tracking-wider">
                  Super Admin
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Terhubung sebagai <strong>{currentUser.email}</strong> • Mengelola persetujuan Talent, verifikasi e-KTP 18+, dan pencairan dana platform.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <button
              onClick={loadAdminData}
              disabled={isLoading}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-purple-700' : ''}`} />
              <span>Segarkan Data</span>
            </button>
            <button
              onClick={() => onNavigate('/talent')}
              className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-900 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Lihat Katalog Live
            </button>
          </div>
        </div>

        {/* 4 Financial & Operational Platform Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-500 uppercase">Talent Menunggu Review</span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-black text-amber-600 tabular-nums">
              {talents.filter((t) => !t.is_approved).length}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Pendaftar baru belum disetujui / belum terverifikasi e-KTP.
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-500 uppercase">Permohonan Tarik Dana</span>
              <CreditCard className="w-4 h-4 text-purple-700" />
            </div>
            <div className="text-2xl font-black text-purple-900 tabular-nums">
              {payouts.filter((p) => p.payout_status === 'requested').length}
            </div>
            <p className="text-[11px] text-purple-700 font-semibold mt-1">
              Total Antrian: {formatRupiah(talentPayoutsPending)}
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-500 uppercase">Pendapatan Platform (20%)</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-emerald-700 tabular-nums">
              {formatRupiah(platformRevenueFee)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Dari {completedBookings.length} order yang telah selesai.
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-500 uppercase">Total Nilai Transaksi (GMV)</span>
              <DollarSign className="w-4 h-4 text-slate-700" />
            </div>
            <div className="text-2xl font-black text-slate-900 tabular-nums">
              {formatRupiah(grossMarketplaceVolume)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Akumulasi perputaran dana di sistem Escrow.
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-bold text-slate-600 overflow-x-auto">
          <button
            onClick={() => setActiveTab('talents')}
            className={`px-4 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'talents' ? 'bg-purple-700 text-white shadow-xs' : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Kurasi Talent ({talents.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('customer_ktp')}
            className={`px-4 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'customer_ktp' ? 'bg-purple-700 text-white shadow-xs' : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" />
            <span>
              KTP Customer ({customerKtps.filter((c) => c.ktp_verification_status === 'pending_review').length})
            </span>
          </button>
          <button
            onClick={() => setActiveTab('payouts')}
            className={`px-4 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'payouts' ? 'bg-purple-700 text-white shadow-xs' : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Pencairan Dana ({payouts.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('refunds')}
            className={`px-4 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'refunds' ? 'bg-purple-700 text-white shadow-xs' : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${activeTab === 'refunds' ? 'text-white' : 'text-rose-600'}`} />
            <span>Refund ({refunds.filter((r) => r.status === 'requested' || r.status === 'approved').length})</span>
          </button>
          <button
            onClick={() => setActiveTab('bookings')}
            className={`px-4 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'bookings' ? 'bg-purple-700 text-white shadow-xs' : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Audit Booking & Escrow ({bookings.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'reports' ? 'bg-purple-700 text-white shadow-xs' : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <ShieldAlert className={`w-3.5 h-3.5 ${activeTab === 'reports' ? 'text-white' : 'text-rose-600'}`} />
            <span>Laporan Insiden ({activeReportsCount})</span>
          </button>
          <button
            onClick={() => setActiveTab('qris')}
            className={`px-4 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'qris' ? 'bg-purple-700 text-white shadow-xs' : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <CreditCard className={`w-3.5 h-3.5 ${activeTab === 'qris' ? 'text-white' : 'text-emerald-600'}`} />
            <span>QRIS & Verifikasi</span>
          </button>
          <button
            onClick={() => setActiveTab('promos')}
            className={`px-4 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'promos' ? 'bg-purple-700 text-white shadow-xs' : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <Megaphone className={`w-3.5 h-3.5 ${activeTab === 'promos' ? 'text-white' : 'text-amber-600'}`} />
            <span>Poster Promo ({promoPosters.filter((p) => p.is_active).length})</span>
          </button>
          <button
            onClick={() => setActiveTab('hero')}
            className={`px-4 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'hero' ? 'bg-purple-700 text-white shadow-xs' : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <ImageIcon className={`w-3.5 h-3.5 ${activeTab === 'hero' ? 'text-white' : 'text-fuchsia-600'}`} />
            <span>Slide Hero</span>
          </button>
          <button
            onClick={() => setActiveTab('branding')}
            className={`px-4 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'branding' ? 'bg-purple-700 text-white shadow-xs' : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <ImageIcon className={`w-3.5 h-3.5 ${activeTab === 'branding' ? 'text-white' : 'text-purple-600'}`} />
            <span>Logo & Branding</span>
          </button>
        </div>

        {activeTab === 'qris' && <QrisAdminPanel />}
        {activeTab === 'branding' && <BrandingAdminPanel />}
        {activeTab === 'hero' && <HeroSlidesAdminPanel />}

        {/* TAB 1: TALENT CURATION & KTP APPROVAL */}
        {activeTab === 'talents' && (
          <div className="space-y-4">
            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-xs">
                {[
                  { label: `Perlu Review (${talents.filter((t) => !t.is_approved).length})`, val: 'pending' },
                  { label: `Sudah Disetujui (${talents.filter((t) => t.is_approved).length})`, val: 'approved' },
                  { label: `Semua Talent (${talents.length})`, val: 'all' },
                ].map((f) => (
                  <button
                    key={f.val}
                    onClick={() => setTalentFilter(f.val as any)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                      talentFilter === f.val
                        ? 'bg-purple-50 text-purple-900 border-purple-300 font-bold'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari nama atau kota..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
                />
              </div>
            </div>

            {isLoading ? (
              <div className="py-12 bg-white rounded-2xl border border-slate-200/80 text-center space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-purple-700 mx-auto" />
                <p className="text-xs text-slate-500">Memuat berkas profil talent dari database Supabase...</p>
              </div>
            ) : filteredTalents.length === 0 ? (
              <div className="py-12 bg-white rounded-2xl border border-slate-200/80 text-center space-y-2 p-6">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                <h3 className="text-sm font-bold text-slate-800">
                  Semua Berkas Talent Selesai Ditinjau
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Tidak ada permohonan pendaftaran Talent yang membutuhkan peninjauan saat ini.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTalents.map((t) => (
                  <div
                    key={t.id}
                    className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-purple-200 transition-all space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      {/* Avatar and Basic Info */}
                      <div className="flex items-center gap-3.5">
                        <div className="w-14 h-14 rounded-xl overflow-hidden bg-purple-50 border border-purple-200 shrink-0 relative flex items-center justify-center">
                          {t.avatar_url ? (
                            <img src={t.avatar_url} alt={t.display_name} className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-8 h-8 text-purple-400" />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-black text-slate-900">{t.display_name}</h3>
                            <span className="text-xs text-slate-400">({t.gender}, {t.city})</span>
                            {t.is_approved ? (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
                                Tayang di Katalog
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full">
                                Menunggu Review
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-purple-700 font-semibold line-clamp-1">{t.headline}</p>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Email: <strong>{t.email || '-'}</strong> • Tarif: <strong>{formatRupiah(t.hourly_rate)}/jam</strong>
                          </div>
                        </div>
                      </div>

                      {/* Status Badges */}
                      <div className="flex items-center gap-2">
                        {t.ktp_verification_status === 'verified' ? (
                          <span className="px-2.5 py-1 bg-purple-100 text-purple-900 text-xs font-bold rounded-lg flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>KTP 18+ Sah</span>
                          </span>
                        ) : t.ktp_verification_status === 'pending_review' ? (
                          <span className="px-2.5 py-1 bg-amber-100 text-amber-900 text-xs font-bold rounded-lg flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            <span>KTP Menunggu Verifikasi</span>
                          </span>
                        ) : t.ktp_verification_status === 'rejected' ? (
                          <span className="px-2.5 py-1 bg-rose-100 text-rose-800 text-xs font-bold rounded-lg flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>KTP Ditolak</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-lg">
                            KTP Belum Diunggah
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bio & Details Box */}
                    <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 space-y-1">
                      <div><strong>Nama Legal KTP:</strong> {t.full_legal_name || t.display_name}</div>
                      <div><strong>Tanggal Lahir:</strong> {t.date_of_birth || '-'}</div>
                      <div><strong>Nomor e-KTP:</strong> {t.ktp_number ? <span className="font-mono">{t.ktp_number}</span> : 'Belum diisi saat pendaftaran'}</div>
                      {t.emergency_contact_phone && <div><strong>Kontak Darurat / WA:</strong> {t.emergency_contact_phone}</div>}
                      {t.bio && <div className="pt-1 text-slate-500 italic line-clamp-2">"{t.bio}"</div>}
                    </div>

                    {/* Curation Action Buttons */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedKtpItem(t)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Lihat Berkas KTP Lengkap</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRejectTalent(t)}
                          disabled={isSubmittingAction}
                          className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                        >
                          Tolak Berkas
                        </button>

                        <button
                          onClick={() => handleApproveTalent(t)}
                          disabled={isSubmittingAction || t.is_approved}
                          className="px-4 py-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t.is_approved ? 'Sudah Aktif di Katalog' : 'Setujui & Terbitkan Profil'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PAYOUT REQUESTS APPROVAL */}
        {activeTab === 'payouts' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-xs">
                {[
                  { label: `Menunggu Transfer (${payouts.filter((p) => p.payout_status === 'requested').length})`, val: 'requested' },
                  { label: `Diproses (${payouts.filter((p) => p.payout_status === 'processing').length})`, val: 'processing' },
                  {
                    label: `Berhasil Ditransfer (${payouts.filter((p) => p.payout_status === 'completed_provider_confirmed').length})`,
                    val: 'completed_provider_confirmed',
                  },
                  { label: `Ditolak (${payouts.filter((p) => p.payout_status === 'rejected').length})`, val: 'rejected' },
                  { label: `Gagal (${payouts.filter((p) => p.payout_status === 'failed').length})`, val: 'failed' },
                  { label: `Semua (${payouts.length})`, val: 'all' },
                ].map((f) => (
                  <button
                    key={f.val}
                    onClick={() => setPayoutFilter(f.val as any)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                      payoutFilter === f.val
                        ? 'bg-purple-50 text-purple-900 border-purple-300 font-bold'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredPayouts.length === 0 ? (
              <div className="py-12 bg-white rounded-2xl border border-slate-200/80 text-center space-y-2 p-6">
                <CreditCard className="w-8 h-8 text-slate-300 mx-auto" />
                <h4 className="text-sm font-bold text-slate-800">Tidak Ada Antrian Pencairan Saldo</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Semua permohonan penarikan dana Talent pada kategori ini telah selesai diproses.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                      <tr>
                        <th className="p-3.5">Nomor Payout</th>
                        <th className="p-3.5">Talent Penerima</th>
                        <th className="p-3.5">Bank / E-Wallet Tujuan</th>
                        <th className="p-3.5">Nomor Rekening</th>
                        <th className="p-3.5">Atas Nama</th>
                        <th className="p-3.5">Nominal Transfer</th>
                        <th className="p-3.5">Status</th>
                        <th className="p-3.5 text-right">Tindakan Admin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPayouts.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/60">
                          <td className="p-3.5 font-mono font-bold text-purple-900">{p.payout_number}</td>
                          <td className="p-3.5 font-semibold text-slate-900">{p.talent_name}</td>
                          <td className="p-3.5 font-semibold text-purple-950">{p.bank_name}</td>
                          <td className="p-3.5 font-mono text-slate-700">{p.bank_account_number}</td>
                          <td className="p-3.5 text-slate-700 font-medium">{p.bank_account_holder_name}</td>
                          <td className="p-3.5 font-black text-slate-900 tabular-nums">{formatRupiah(p.amount)}</td>
                          <td className="p-3.5">
                            {p.payout_status === 'completed_provider_confirmed' ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                                Selesai Ditransfer
                              </span>
                            ) : p.payout_status === 'processing' ? (
                              <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 text-[11px] font-bold">
                                Sedang Diproses
                              </span>
                            ) : p.payout_status === 'rejected' ? (
                              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-bold">
                                Ditolak
                              </span>
                            ) : p.payout_status === 'failed' ? (
                              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-bold">
                                Gagal Ditransfer
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">
                                Menunggu Transfer
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 text-right">
                            {p.payout_status === 'requested' && (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleProcessPayout(p.id, 'rejected')}
                                  disabled={isSubmittingAction}
                                  className="px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded text-xs font-semibold cursor-pointer"
                                >
                                  Tolak
                                </button>
                                <button
                                  onClick={() => handleProcessPayout(p.id, 'processing')}
                                  disabled={isSubmittingAction}
                                  className="px-3 py-1 bg-purple-700 hover:bg-purple-800 text-white rounded text-xs font-bold cursor-pointer"
                                >
                                  Mulai Proses
                                </button>
                              </div>
                            )}
                            {p.payout_status === 'processing' && (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleProcessPayout(p.id, 'rejected')}
                                  disabled={isSubmittingAction}
                                  className="px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded text-xs font-semibold cursor-pointer"
                                >
                                  Tolak
                                </button>
                                <button
                                  onClick={() => handleProcessPayout(p.id, 'completed_provider_confirmed')}
                                  disabled={isSubmittingAction}
                                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold cursor-pointer"
                                >
                                  Konfirmasi Transfer
                                </button>
                              </div>
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

        {/* TAB: REFUND REQUESTS */}
        {activeTab === 'refunds' && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
              Refund saat ini diproses manual di dashboard provider/bank. Tandai selesai hanya setelah dana benar-benar dikembalikan dan referensinya tersedia.
            </div>
            <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
              <div className="p-4 border-b border-amber-100">
                <h3 className="text-sm font-bold text-slate-900">Sisa Dana Menunggu Keputusan Admin</h3>
                <p className="text-xs text-slate-500 mt-1">Dana ini bukan pendapatan YUKU dan bukan saldo Talent. Jangan dicairkan sebelum keputusan dan jurnal penyesuaian tersedia.</p>
              </div>
              {customerCancellationCases.filter((c) => c.status === 'pending_admin_review').length === 0 ? (
                <div className="p-4 text-xs text-slate-500">Tidak ada sisa dana yang menunggu peninjauan.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[700px]">
                    <thead className="bg-amber-50 text-slate-500"><tr><th className="p-3">Booking</th><th className="p-3">Customer</th><th className="p-3">Aturan</th><th className="p-3">Refund Customer</th><th className="p-3">Ditahan untuk Admin</th><th className="p-3">Batas Penahanan</th><th className="p-3">Keputusan Admin</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {customerCancellationCases.filter((c) => c.status === 'pending_admin_review').map((c) => (
                        <tr key={c.id}>
                          <td className="p-3 font-mono font-semibold">{c.booking_code}</td>
                          <td className="p-3">{c.customer_name}</td>
                          <td className="p-3">{c.policy_code === '6_to_24h' ? 'Pembatalan 6–24 jam' : 'Pembatalan kurang dari 6 jam'}</td>
                          <td className="p-3 tabular-nums">{formatRupiah(Number(c.automatic_refund_amount))}</td>
                          <td className="p-3 font-bold tabular-nums text-amber-800">{formatRupiah(Number(c.retained_pending_admin_amount))}</td>
                          <td className="p-3 text-slate-600">{c.admin_hold_until ? new Date(c.admin_hold_until).toLocaleString('id-ID') : 'Belum diperpanjang'}</td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-2">
                              <button disabled={isSubmittingAction} onClick={() => handleResolveCancellationCase(c, 'refund_customer')} className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">Refund Customer</button>
                              <button disabled={isSubmittingAction} onClick={() => handleResolveCancellationCase(c, 'compensate_talent')} className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-50">Kompensasi Talent</button>
                              <button disabled={isSubmittingAction} onClick={() => handleResolveCancellationCase(c, 'extend_hold')} className="px-2.5 py-1.5 rounded-lg bg-amber-600 text-white font-semibold disabled:opacity-50">Perpanjang Tahan</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {refunds.length === 0 ? (
              <div className="py-12 bg-white rounded-2xl border border-slate-200 text-center text-xs text-slate-500">Belum ada permintaan refund.</div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[760px]">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="p-3">Booking</th>
                      <th className="p-3">Customer</th>
                      <th className="p-3">Nominal Refund</th>
                      <th className="p-3">Alasan</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {refunds.map((refund) => (
                      <tr key={refund.id}>
                        <td className="p-3 font-mono font-semibold text-purple-900">{refund.booking_code}</td>
                        <td className="p-3 font-semibold">{refund.customer_name}</td>
                        <td className="p-3 font-bold tabular-nums">{formatRupiah(Number(refund.refund_amount))}</td>
                        <td className="p-3 max-w-xs whitespace-normal">{refund.reason}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${refund.status === 'processed' ? 'bg-emerald-100 text-emerald-800' : refund.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
                            {refund.status === 'processed' ? 'Selesai' : refund.status === 'rejected' ? 'Ditolak' : 'Menunggu Proses'}
                          </span>
                          {refund.provider_refund_id && <div className="mt-1 text-[10px] text-slate-500">Ref: {refund.provider_refund_id}</div>}
                        </td>
                        <td className="p-3 text-right">
                          {(refund.status === 'requested' || refund.status === 'approved') && (
                            <div className="flex justify-end gap-1.5">
                              <button onClick={() => handleProcessRefund(refund.id)} disabled={isSubmittingAction} className="px-2.5 py-1 rounded bg-emerald-600 text-white font-semibold">Konfirmasi Refund</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: BOOKINGS & ESCROW AUDIT */}
        {activeTab === 'bookings' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Seluruh Transaksi Booking Platform YUKU</h3>
                <span className="text-xs text-slate-500">Total: {bookings.length} Transaksi</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                    <tr>
                      <th className="p-3.5">Kode Booking</th>
                      <th className="p-3.5">Customer</th>
                      <th className="p-3.5">Talent</th>
                      <th className="p-3.5">Lokasi Publik</th>
                      <th className="p-3.5">Total Bayar</th>
                      <th className="p-3.5">Fee YUKU (20%)</th>
                      <th className="p-3.5">Share Talent (80%)</th>
                      <th className="p-3.5">Status Escrow</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bookings.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/60">
                        <td className="p-3.5 font-mono font-bold text-purple-900">{b.booking_code}</td>
                        <td className="p-3.5 font-semibold text-slate-900">{b.customer_name}</td>
                        <td className="p-3.5 font-semibold text-purple-950">{b.talent_name}</td>
                        <td className="p-3.5 text-slate-600 max-w-[180px] truncate">{b.meeting_location_name}</td>
                        <td className="p-3.5 font-bold text-slate-900 tabular-nums">{formatRupiah(b.gross_amount)}</td>
                        <td className="p-3.5 font-bold text-emerald-700 tabular-nums">{formatRupiah(b.platform_fee_amount)}</td>
                        <td className="p-3.5 font-bold text-purple-700 tabular-nums">{formatRupiah(b.talent_gross_share)}</td>
                        <td className="p-3.5">
                          {b.status === 'completed' ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                              Selesai (Released)
                            </span>
                          ) : b.status === 'confirmed' ? (
                            <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 text-[11px] font-bold">
                              Terkonfirmasi (Held)
                            </span>
                          ) : b.status === 'cancelled' ? (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold">
                              Dibatalkan
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">
                              Menunggu Pembayaran
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CUSTOMER KTP VERIFICATION */}
        {activeTab === 'customer_ktp' && (
          <div className="space-y-4">
            {customerKtps.length === 0 ? (
              <div className="py-12 bg-white rounded-2xl border border-slate-200/80 text-center space-y-2 p-6">
                <FileCheck className="w-8 h-8 text-slate-300 mx-auto" />
                <h4 className="text-sm font-bold text-slate-800">Belum Ada Pengajuan KTP Customer</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Pengajuan verifikasi e-KTP dari akun Customer akan tampil di sini untuk ditinjau.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {customerKtps.map((c) => (
                  <div
                    key={c.id}
                    className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="text-sm font-black text-slate-900">{c.full_legal_name}</h3>
                        <p className="text-[11px] text-slate-500">
                          Email: <strong>{c.email || '-'}</strong> • Tanggal Lahir: <strong>{c.date_of_birth}</strong>
                        </p>
                      </div>

                      <div>
                        {c.ktp_verification_status === 'verified' ? (
                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg">
                            Terverifikasi 18+
                          </span>
                        ) : c.ktp_verification_status === 'pending_review' ? (
                          <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-lg">
                            Menunggu Review
                          </span>
                        ) : c.ktp_verification_status === 'rejected' ? (
                          <span className="px-2.5 py-1 bg-rose-100 text-rose-800 text-xs font-bold rounded-lg">
                            Ditolak
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg">
                            Belum Lengkap
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 space-y-1">
                      <div>
                        <strong>NIK e-KTP:</strong>{' '}
                        <span className="font-mono">{c.ktp_number || '-'}</span>
                      </div>
                      <div>
                        <strong>WhatsApp / Darurat:</strong> {c.emergency_contact_phone || '-'}
                      </div>
                      {c.ktp_storage_path && (
                        <div>
                          <strong>Storage Path:</strong>{' '}
                          <code className="text-[11px] bg-purple-50 text-purple-900 px-1.5 py-0.5 rounded">
                            {c.ktp_storage_path}
                          </code>
                        </div>
                      )}
                      {c.ktp_rejection_reason && (
                        <div className="text-rose-700">
                          <strong>Alasan Penolakan:</strong> {c.ktp_rejection_reason}
                        </div>
                      )}
                    </div>

                    {c.ktp_verification_status === 'pending_review' && (
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          onClick={() => handleReviewCustomerKtp(c, 'rejected')}
                          disabled={isSubmittingAction}
                          className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg cursor-pointer"
                        >
                          Tolak KTP
                        </button>
                        <button
                          onClick={() => handleReviewCustomerKtp(c, 'verified')}
                          disabled={isSubmittingAction}
                          className="px-4 py-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Setujui KTP 18+</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: INCIDENT REPORTS & DISPUTE MODERATION */}
        {activeTab === 'reports' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {[
                { label: `Menunggu Tinjauan (${reports.filter((r) => r.status === 'open').length})`, val: 'open' },
                { label: `Diinvestigasi (${reports.filter((r) => r.status === 'investigating').length})`, val: 'investigating' },
                { label: `Ditindaklanjuti (${reports.filter((r) => r.status === 'resolved_action_taken').length})`, val: 'resolved_action_taken' },
                { label: `Ditutup (${reports.filter((r) => r.status === 'dismissed').length})`, val: 'dismissed' },
                { label: `Semua (${reports.length})`, val: 'all' },
              ].map((f) => (
                <button
                  key={f.val}
                  onClick={() => setReportFilter(f.val as 'all' | ReportStatus)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                    reportFilter === f.val
                      ? 'bg-purple-50 text-purple-900 border-purple-300 font-bold'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {filteredReports.length === 0 ? (
              <div className="py-12 bg-white rounded-2xl border border-slate-200/80 text-center space-y-2 p-6">
                <ShieldAlert className="w-8 h-8 text-slate-300 mx-auto" />
                <h4 className="text-sm font-bold text-slate-800">Tidak Ada Laporan Insiden</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Belum ada laporan pelanggaran atau sengketa transaksi pada kategori ini.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredReports.map((rep) => {
                  const statusMeta = getReportStatusMeta(rep.status);
                  return (
                    <div
                      key={rep.id}
                      className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-black text-slate-900">
                              {getReportCategoryLabel(rep.category)}
                            </span>
                            {rep.booking_code && (
                              <span className="font-mono text-[11px] font-bold bg-purple-50 text-purple-900 border border-purple-200 px-2 py-0.5 rounded">
                                {rep.booking_code}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500">
                            Pelapor: <strong className="text-slate-700">{rep.reporter_name}</strong> • Terlapor:{' '}
                            <strong className="text-rose-700">{rep.reported_user_name}</strong> •{' '}
                            {new Date(rep.created_at).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>

                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${statusMeta.badgeClass}`}>
                          {statusMeta.label}
                        </span>
                      </div>

                      <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                        {rep.description}
                      </p>

                      {rep.admin_notes && (
                        <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-100 text-xs text-purple-950">
                          <strong>Catatan Penanganan Admin:</strong> {rep.admin_notes}
                        </div>
                      )}

                      <div className="flex items-center justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => openReportModerationModal(rep)}
                          className="px-4 py-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer"
                        >
                          Tinjau & Ubah Status
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 6: HOMEPAGE PROMO POSTERS */}
        {activeTab === 'promos' && (
          <div className="space-y-6">
            {promoMigrationMissing && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Tabel &amp; Bucket Promosi Belum Aktif di Supabase:</strong> Jalankan file migrasi{' '}
                  <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono">
                    supabase/migrations/15_promotions.sql
                  </code>{' '}
                  di SQL Editor Supabase untuk mengaktifkan unggahan poster promosi beranda.
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Upload New Promo Poster Form */}
              <form
                onSubmit={handleUploadPromoPoster}
                className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4 text-xs"
              >
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Pasang Poster Promosi Baru
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Unggah gambar poster promosi (disarankan rasio lebar 21:7 atau 16:6). Poster aktif langsung tampil berjalan di Beranda.
                  </p>
                </div>

                {/* Image File Picker + Live Preview */}
                <div className="space-y-2">
                  <label htmlFor="promo-file-upload" className="block font-bold text-slate-700">
                    Pilih Gambar Poster (JPG / PNG / WebP, maks. 5 MB) *
                  </label>
                  <label
                    htmlFor="promo-file-upload"
                    className="block rounded-xl border border-dashed border-purple-300 bg-purple-50/40 hover:bg-purple-50 p-4 text-center cursor-pointer transition-colors"
                  >
                    <Upload className="w-5 h-5 text-purple-700 mx-auto mb-1.5" />
                    <span className="font-bold text-purple-900 block">
                      {promoFile ? promoFile.name : 'Klik untuk memilih gambar dari perangkat'}
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      Rekomendasi lebar minimal 1200px agar tajam di desktop
                    </span>
                  </label>
                  <input
                    id="promo-file-upload"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => handlePromoFileChange(e.target.files?.[0] || null)}
                    className="sr-only"
                  />
                </div>

                {(promoPreviewUrl || promoImageUrlInput.trim()) && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-slate-500 block">
                      Pratinjau Tampilan di Beranda
                    </span>
                    <div className="w-full aspect-[21/7] rounded-xl overflow-hidden border border-slate-200 bg-slate-900">
                      <img
                        src={promoPreviewUrl || promoImageUrlInput.trim()}
                        alt="Pratinjau poster promosi"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="promo-image-url" className="block font-bold text-slate-700 mb-1">
                    Atau Tempel URL Gambar (Opsional jika tidak unggah file)
                  </label>
                  <input
                    id="promo-image-url"
                    type="url"
                    placeholder="https://..."
                    value={promoImageUrlInput}
                    onChange={(e) => {
                      setPromoImageUrlInput(e.target.value);
                      if (!promoFile) {
                        setPromoPreviewUrl(e.target.value.trim() || null);
                      }
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600"
                  />
                </div>

                <div>
                  <label htmlFor="promo-title" className="block font-bold text-slate-700 mb-1">
                    Judul / Keterangan Poster (Opsional)
                  </label>
                  <input
                    id="promo-title"
                    type="text"
                    maxLength={150}
                    placeholder="Contoh: Promo Akhir Pekan Bebas Biaya Admin"
                    value={promoTitle}
                    onChange={(e) => setPromoTitle(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label htmlFor="promo-link" className="block font-bold text-slate-700 mb-1">
                      Tautan Saat Diklik (Opsional)
                    </label>
                    <input
                      id="promo-link"
                      type="text"
                      placeholder="/talent atau https://..."
                      value={promoTargetLink}
                      onChange={(e) => setPromoTargetLink(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600"
                    />
                  </div>
                  <div>
                    <label htmlFor="promo-order" className="block font-bold text-slate-700 mb-1">
                      Urutan
                    </label>
                    <input
                      id="promo-order"
                      type="number"
                      min={0}
                      value={promoSortOrder}
                      onChange={(e) => setPromoSortOrder(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 tabular-nums"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isUploadingPromo || (!promoFile && !promoImageUrlInput.trim())}
                  className="w-full py-2.5 px-4 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-xl shadow-xs transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isUploadingPromo ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Mengunggah Poster...</span>
                    </>
                  ) : (
                    <>
                      <ImageIcon className="w-4 h-4" />
                      <span>Terbitkan Poster ke Beranda</span>
                    </>
                  )}
                </button>
              </form>

              {/* Existing Posters List */}
              <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Daftar Poster Promosi ({promoPosters.length})
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Atur urutan tampil, sembunyikan sementara, atau hapus poster yang sudah berakhir.
                    </p>
                  </div>
                </div>

                {promoPosters.length === 0 ? (
                  <div className="py-12 px-4 rounded-xl bg-slate-50 border border-slate-200/70 text-center space-y-1.5">
                    <Megaphone className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-sm font-bold text-slate-700">Belum Ada Poster Promosi</p>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Unggah gambar poster promosi pertama di formulir sebelah kiri untuk menampilkannya di beranda utama YUKU.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {promoPosters.map((poster) => (
                      <div
                        key={poster.id}
                        className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/70 space-y-3"
                      >
                        <div className="w-full aspect-[21/7] rounded-lg overflow-hidden border border-slate-200 bg-slate-900">
                          <img
                            src={poster.image_url}
                            alt={poster.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="space-y-0.5 min-w-0">
                            <div className="font-bold text-slate-900 truncate">{poster.title}</div>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                              <span className="font-mono tabular-nums">Urutan: {poster.sort_order}</span>
                              <span aria-hidden="true">·</span>
                              <span className={poster.is_active ? 'text-emerald-700 font-semibold' : 'text-slate-500 font-semibold'}>
                                {poster.is_active ? 'Tayang di Beranda' : 'Disembunyikan'}
                              </span>
                              {poster.link_url && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono truncate max-w-[180px]">{poster.link_url}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleShiftPromoOrder(poster, -1)}
                              disabled={isSubmittingAction || poster.sort_order <= 0}
                              aria-label="Naikkan prioritas urutan"
                              className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg cursor-pointer disabled:opacity-40"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleShiftPromoOrder(poster, 1)}
                              disabled={isSubmittingAction}
                              aria-label="Turunkan prioritas urutan"
                              className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg cursor-pointer disabled:opacity-40"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleTogglePromoActive(poster)}
                              disabled={isSubmittingAction}
                              className={`px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                                poster.is_active
                                  ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                                  : 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
                              }`}
                            >
                              {poster.is_active ? (
                                <>
                                  <EyeOff className="w-3.5 h-3.5" />
                                  <span>Sembunyikan</span>
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Tayangkan</span>
                                </>
                              )}
                            </button>

                            {confirmDeletePromoId === poster.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleDeletePromoPoster(poster)}
                                  disabled={isSubmittingAction}
                                  className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg cursor-pointer whitespace-nowrap"
                                >
                                  Yakin Hapus
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeletePromoId(null)}
                                  disabled={isSubmittingAction}
                                  className="px-2 py-1.5 bg-slate-200 text-slate-700 font-semibold rounded-lg cursor-pointer"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeletePromoId(poster.id)}
                                disabled={isSubmittingAction}
                                aria-label="Hapus poster promosi"
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: VIEW KTP DETAILS & VERIFICATION */}
      <Modal
        isOpen={Boolean(selectedKtpItem)}
        onClose={() => setSelectedKtpItem(null)}
        title={`Peninjauan Dokumen KTP — ${selectedKtpItem?.display_name}`}
      >
        {selectedKtpItem && (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Nama Lengkap (sesuai KTP):</span>
                <span className="font-bold text-slate-900">{selectedKtpItem.full_legal_name || selectedKtpItem.display_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tanggal Lahir:</span>
                <span className="font-semibold text-slate-800">{selectedKtpItem.date_of_birth || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Nomor NIK e-KTP:</span>
                <span className="font-mono font-bold text-purple-900">{selectedKtpItem.ktp_number || 'Belum diisi'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status Verifikasi Saat Ini:</span>
                <span className="font-bold text-purple-700">{selectedKtpItem.ktp_verification_status || 'unsubmitted'}</span>
              </div>
              {selectedKtpItem.ktp_storage_path && (
                <div className="flex justify-between">
                  <span className="text-slate-500">File Storage:</span>
                  <span className="font-mono text-[11px] text-slate-600 truncate max-w-[200px]">
                    {selectedKtpItem.ktp_storage_path}
                  </span>
                </div>
              )}
            </div>

            {selectedKtpItem.ktp_storage_path ? (
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl space-y-2">
                <div className="font-bold text-purple-900 flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4 text-purple-700" />
                  <span>Dokumen e-KTP Privat Terlampir</span>
                </div>
                <p className="text-[11px] text-purple-800">
                  Berkas foto e-KTP tersimpan di bucket terenkripsi privat <code>ktp-documents</code> pada path:
                  <br />
                  <code className="bg-purple-100 px-1 py-0.5 rounded text-[10px] mt-1 inline-block">
                    {selectedKtpItem.ktp_storage_path}
                  </code>
                </p>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px]">
                Talent belum mengunggah berkas foto fisik e-KTP saat pendaftaran awal. Anda tetap dapat menyetujui profil jika verifikasi identitas dilakukan via wawancara / kontak darurat resmi.
              </div>
            )}

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedKtpItem(null)}
                className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => handleRejectTalent(selectedKtpItem)}
                disabled={isSubmittingAction}
                className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg cursor-pointer"
              >
                Tolak Berkas
              </button>
              <button
                type="button"
                onClick={() => handleApproveTalent(selectedKtpItem)}
                disabled={isSubmittingAction || selectedKtpItem.is_approved}
                className="px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{selectedKtpItem.is_approved ? 'Sudah Disetujui' : 'Setujui & Verifikasi 18+'}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: MODERASI LAPORAN INSIDEN */}
      <Modal
        isOpen={Boolean(selectedReportItem)}
        onClose={() => !isSubmittingAction && setSelectedReportItem(null)}
        title="Penanganan Laporan Insiden"
      >
        {selectedReportItem && (
          <form onSubmit={handleResolveReport} className="space-y-4 text-xs">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="font-bold text-slate-900">
                {getReportCategoryLabel(selectedReportItem.category)}
              </div>
              <div className="text-[11px] text-slate-500">
                Pelapor: <strong>{selectedReportItem.reporter_name}</strong> → Terlapor:{' '}
                <strong className="text-rose-700">{selectedReportItem.reported_user_name}</strong>
              </div>
              {selectedReportItem.booking_code && (
                <div className="text-[11px] text-purple-900 font-mono font-bold">
                  Booking: {selectedReportItem.booking_code} ({selectedReportItem.booking_status || '-'})
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="admin-report-status" className="block font-bold text-slate-800">
                Status Penanganan *
              </label>
              <select
                id="admin-report-status"
                value={reportDecision}
                onChange={(e) => setReportDecision(e.target.value as ReportStatus)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 font-semibold"
              >
                <option value="open">Menunggu Tinjauan (Open)</option>
                <option value="investigating">Sedang Diinvestigasi (Investigating)</option>
                <option value="resolved_action_taken">Ditindaklanjuti (Resolved)</option>
                <option value="dismissed">Ditutup / Tidak Terbukti (Dismissed)</option>
              </select>
            </div>

            {selectedReportItem.booking_id && (
              <label className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={holdBookingOnDispute}
                  onChange={(e) => setHoldBookingOnDispute(e.target.checked)}
                  className="mt-0.5 rounded border-amber-400 text-purple-700"
                />
                <span className="text-[11px] text-amber-900">
                  <strong>Tahan Escrow Booking (Disputed Hold):</strong> Ubah status booking aktif menjadi <code>disputed_hold</code> selama investigasi berlangsung.
                </span>
              </label>
            )}

            <div className="space-y-1.5">
              <label htmlFor="admin-report-notes" className="block font-bold text-slate-800">
                Catatan Keputusan Admin (Terlihat oleh Pelapor)
              </label>
              <textarea
                id="admin-report-notes"
                rows={3}
                value={reportAdminNotes}
                onChange={(e) => setReportAdminNotes(e.target.value)}
                placeholder="Tuliskan hasil investigasi atau langkah tindak lanjut dari Tim Keamanan YUKU..."
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 resize-none"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedReportItem(null)}
                disabled={isSubmittingAction}
                className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmittingAction}
                className="px-5 py-2.5 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSubmittingAction ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <span>Simpan Keputusan</span>
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
