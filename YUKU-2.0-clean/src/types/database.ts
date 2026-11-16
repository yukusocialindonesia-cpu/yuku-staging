/**
 * Central Database Schema Types for YUKU (Supabase PostgreSQL)
 * Aligned with the current YUKU migration set; keep synchronized when schema migrations change.
 * Total: 22 Tables
 */

// ============================================================================
// 1. TIPE ENUM DATABASE (PostgreSQL Enums)
// ============================================================================

export type UserRole = 'customer' | 'talent' | 'admin';

export type AccountStatus = 'pending_verification' | 'active' | 'suspended' | 'banned';

export type KtpStatus = 'unsubmitted' | 'pending_review' | 'verified' | 'rejected';

/** Gender Inklusif (sesuai migration 01) */
export type GenderType = 'Pria' | 'Wanita' | 'Lainnya' | 'Pilih tidak menyebutkan';

export type ServiceMode = 'Offline & Online' | 'Offline Only' | 'Online Only';

export type BookingMode = 'offline' | 'online';

export type BookingStatus =
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

/** Database enum retains legacy simulation value; production flows must not use it. */
export type PaymentProvider = 'xendit' | 'midtrans' | 'manual_qris' | 'simulation';

export type PayoutProvider = 'manual' | 'xendit' | 'midtrans';

export type PaymentStatus =
  | 'pending'
  | 'settled_held'
  | 'released_to_talent'
  | 'disputed_hold'
  | 'refunded'
  | 'failed'
  | 'expired';

export type RefundStatus = 'requested' | 'approved' | 'processed' | 'rejected';

export type TalentEarningStatus =
  | 'held_in_escrow'
  | 'disputed_hold'
  | 'available_for_payout'
  | 'partially_paid_out'
  | 'fully_paid_out'
  | 'forfeited'
  | 'refund_adjusted';

export type ReferralRewardStatus = 'pending_completion' | 'credited' | 'cancelled_disputed';

export type PayoutStatus =
  | 'requested'
  | 'processing'
  | 'completed_provider_confirmed'
  | 'rejected'
  | 'failed';

export type PayoutAllocationStatus = 'reserved' | 'settled' | 'released_unreserved';

export type LedgerEntryType = 'earning' | 'payout' | 'refund_reversal' | 'commission';

export type ReportCategory =
  | 'unethical_behavior'
  | 'dating_sexual_solicitation'
  | 'no_show'
  | 'safety_concern'
  | 'service_dispute'
  | 'other';

export type ReportStatus = 'open' | 'investigating' | 'resolved_action_taken' | 'dismissed';

export type NotificationType =
  | 'booking_update'
  | 'payment_status'
  | 'referral_bonus'
  | 'payout_status'
  | 'system_alert';

export type ActorType = 'user' | 'system' | 'admin';

// ============================================================================
// 2. INTERFACE ENTITAS TABEL (22 Tables)
// ============================================================================

/** 1. public.users (Identity Core) */
export interface UserRow {
  id: string; // UUID references auth.users(id)
  email: string;
  full_name: string | null;
  phone_number: string | null;
  role: UserRole;
  is_verified_18: boolean;
  account_status: AccountStatus;
  created_at: string;
  updated_at: string;
}

/** 2. public.user_identities (Strictly Private PII & KTP) */
export interface UserIdentityRow {
  id: string; // UUID references public.users(id)
  full_legal_name: string;
  date_of_birth: string; // DATE
  ktp_number: string | null;
  ktp_storage_path: string | null;
  ktp_verification_status: KtpStatus;
  ktp_rejection_reason: string | null;
  verified_at: string | null;
  verified_by_admin_id: string | null;
  emergency_contact_phone: string | null;
  created_at: string;
  updated_at: string;
}

/** 3. public.customer_profiles */
export interface CustomerProfileRow {
  id: string; // UUID references public.users(id)
  display_name: string;
  avatar_url: string | null;
  city: string | null;
  gender: GenderType | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

/** 4. public.talent_profiles (Katalog & Profil Publik Talent) */
export interface TalentProfileRow {
  id: string; // UUID references public.users(id)
  display_name: string;
  avatar_url: string;
  city: string;
  gender: GenderType;
  headline: string;
  bio: string;
  hourly_rate: number; // BIGINT (Integer Rupiah)
  online_chat_rate: number | null; // BIGINT
  service_mode: ServiceMode;
  rating_average: number; // NUMERIC(3, 2)
  review_count: number;
  completed_hours: number;
  languages: string[];
  interests: string[];
  referral_code: string;
  created_at: string;
  updated_at: string;
}

/** 5. public.activity_categories */
export interface ActivityCategoryRow {
  id: string; // VARCHAR(50), e.g. 'ngopi-makan'
  title: string;
  description: string;
  icon_name: string;
  examples: string[];
  is_online_available: boolean;
  is_active: boolean;
  created_at: string;
}

/** 6. public.talent_services */
export interface TalentServiceRow {
  id: string; // UUID
  talent_id: string; // UUID
  activity_category_id: string;
  custom_rate_override: number | null; // BIGINT
  created_at: string;
}

/** 7. public.talent_availability */
export interface TalentAvailabilityRow {
  id: string; // UUID
  talent_id: string; // UUID
  day_of_week: number | null; // 0=Sunday, 6=Saturday
  specific_date: string | null; // DATE
  start_time: string; // TIME 'HH:MM:SS'
  end_time: string; // TIME 'HH:MM:SS'
  is_available: boolean;
  created_at: string;
}

/** 8. public.bookings */
export interface BookingRow {
  id: string; // UUID
  booking_code: string;
  customer_id: string; // UUID
  talent_id: string; // UUID
  activity_category_id: string;
  booking_mode: BookingMode;
  start_time: string; // TIMESTAMPTZ
  end_time: string; // TIMESTAMPTZ
  duration_hours: number;
  meeting_location_name: string;
  meeting_location_address: string | null;
  hourly_rate_snapshot: number; // BIGINT
  gross_amount: number; // BIGINT
  platform_fee_amount: number; // BIGINT (20%)
  talent_gross_share: number; // BIGINT (80%)
  status: BookingStatus;
  payment_expires_at: string;
  completion_confirmed_at: string | null;
  escrow_release_scheduled_at: string | null;
  customer_completed_at: string | null;
  talent_completed_at: string | null;
  status_before_dispute: BookingStatus | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** 9. public.booking_status_history (Audit Trail Transisi Status Booking) */
export interface BookingStatusHistoryRow {
  id: string; // UUID
  booking_id: string; // UUID
  previous_status: string | null;
  new_status: string;
  changed_by_user_id: string | null; // Nullable when actor_type = 'system'
  actor_type: ActorType;
  notes: string | null;
  created_at: string;
}

/** 10. public.payments (Dengan Idempotency & Webhook History) */
export interface PaymentRow {
  id: string; // UUID
  booking_id: string; // UUID
  provider: PaymentProvider;
  provider_charge_id: string | null;
  payment_method: string;
  amount: number; // BIGINT
  payment_status: PaymentStatus;
  paid_at: string | null;
  escrow_released_at: string | null;
  idempotency_key: string; // UUID
  webhook_payload_history: Record<string, any>[];
  created_at: string;
  updated_at: string;
}

/** 11. public.refunds */
export interface RefundRow {
  id: string; // UUID
  payment_id: string; // UUID
  booking_id: string; // UUID
  customer_id: string; // UUID
  refund_amount: number; // BIGINT
  reason: string;
  provider_refund_id: string | null;
  status: RefundStatus;
  processed_by_admin_id: string | null;
  processed_at: string | null;
  created_at: string;
}

/** 12. public.commission_records (Platform Revenue Ledger 20%) */
export interface CommissionRecordRow {
  id: string; // UUID
  booking_id: string; // UUID
  gross_booking_amount: number; // BIGINT
  platform_commission_amount: number; // BIGINT (20% YUKU)
  talent_gross_share: number; // BIGINT (80% Talent)
  referral_payout_reserved: number; // BIGINT (10% dari komisi YUKU)
  net_platform_revenue: number; // BIGINT
  created_at: string;
}

/** 13. public.talent_earnings (Earning Ledger 80% dengan Tracking Alokasi Parsial) */
export interface TalentEarningRow {
  id: string; // UUID
  talent_id: string; // UUID
  booking_id: string; // UUID
  gross_earning: number; // BIGINT (80%)
  tax_withheld: number; // BIGINT
  transfer_fee: number; // BIGINT
  net_earning: number; // BIGINT
  allocated_payout_amount: number; // BIGINT
  paid_out_amount: number; // BIGINT
  status: TalentEarningStatus;
  status_before_dispute: TalentEarningStatus | null;
  entry_type: LedgerEntryType;
  available_at: string | null;
  created_at: string;
}

/** 14. public.referral_relationships (1-Tier, Permanent, Anti Self-Referral) */
export interface ReferralRelationshipRow {
  id: string; // UUID
  referrer_id: string; // UUID
  referee_talent_id: string; // UUID
  referral_code_used: string;
  is_active: boolean;
  created_at: string;
}

/** 15. public.referral_rewards (10% dari Komisi 20% YUKU) */
export interface ReferralRewardRow {
  id: string; // UUID
  referral_relationship_id: string; // UUID
  booking_id: string; // UUID
  referrer_id: string; // UUID
  platform_commission_base: number; // BIGINT
  reward_amount: number; // BIGINT
  status: ReferralRewardStatus;
  status_before_dispute: ReferralRewardStatus | null;
  credited_at: string | null;
  created_at: string;
}

/** 16. public.payout_requests (Minimum Rp100.000 Threshold & Provider Ref) */
export interface PayoutRequestRow {
  id: string; // UUID
  payout_number: string;
  talent_id: string; // UUID
  amount: number; // BIGINT (min Rp100.000)
  bank_name: string;
  bank_account_number: string;
  bank_account_holder_name: string;
  payout_provider: PayoutProvider;
  payout_provider_ref: string | null;
  idempotency_key: string; // UUID
  payout_status: PayoutStatus;
  rejection_reason: string | null;
  processed_by_admin_id: string | null;
  provider_confirmed_at: string | null;
  created_at: string;
}

/** 17. public.payout_earnings_allocations (Pencairan Parsial & Preservasi Sisa Saldo) */
export interface PayoutEarningsAllocationRow {
  id: string; // UUID
  payout_request_id: string; // UUID
  talent_earning_id: string; // UUID
  allocated_amount: number; // BIGINT
  status: PayoutAllocationStatus;
  created_at: string;
}

/** 18. public.financial_adjustments_reversals (Refund Reversal History) */
export interface FinancialAdjustmentReversalRow {
  id: string; // UUID
  booking_id: string; // UUID
  talent_id: string; // UUID
  refund_id: string | null; // UUID
  original_talent_earning_id: string | null; // UUID
  reversal_amount: number; // BIGINT
  reason: string;
  created_at: string;
}

/** 19. public.reviews (Rating 1-5 & Ulasan Pasca-Booking) */
export interface ReviewRow {
  id: string; // UUID
  booking_id: string; // UUID
  customer_id: string; // UUID
  talent_id: string; // UUID
  rating: number; // 1 to 5
  review_text: string | null;
  is_visible: boolean;
  created_at: string;
}

/** 20. public.reports_complaints (Manajemen Insiden / Dispute Hold) */
export interface ReportComplaintRow {
  id: string; // UUID
  reporter_id: string; // UUID
  reported_user_id: string; // UUID
  booking_id: string | null; // UUID
  category: ReportCategory;
  description: string;
  evidence_urls: string[];
  status: ReportStatus;
  admin_notes: string | null;
  resolved_by_admin_id: string | null;
  created_at: string;
}

/** 21. public.notifications (Notifikasi Pengguna In-App) */
export interface NotificationRow {
  id: string; // UUID
  user_id: string; // UUID
  title: string;
  message: string;
  type: NotificationType;
  is_read: boolean;
  metadata: Record<string, any> | null;
  created_at: string;
}

/** 22. public.admin_audit_logs (Log Audit Keamanan & Akses Data KTP) */
export interface AdminAuditLogRow {
  id: string; // UUID
  admin_user_id: string; // UUID
  action_type: string;
  target_table: string;
  target_id: string;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  ip_address: string | null;
  created_at: string;
}

/** 23. public.promotions (Ruang Poster Promosi Berjalan di Beranda) */
export interface PromotionRow {
  id: string; // UUID
  title: string;
  image_url: string;
  link_url: string | null;
  storage_path: string | null;
  sort_order: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** public.hero_slides (Slide gambar bagian atas Beranda, dikelola Admin) */
export interface HeroSlideRow {
  id: string; // UUID
  title: string;
  image_url: string;
  mobile_image_url: string | null;
  link_url: string | null;
  storage_path: string | null;
  mobile_storage_path: string | null;
  sort_order: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** 24. public.talent_media (Galeri Foto, Video & Voice Intro Talent) */
export type TalentMediaType = 'photo' | 'video' | 'voice';

export interface TalentMediaRow {
  id: string; // UUID
  talent_id: string; // UUID
  media_type: TalentMediaType;
  media_url: string;
  storage_path: string | null;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

/** 25. public.booking_messages (Chat Real-Time Customer & Talent per Booking) */
export interface BookingMessageRow {
  id: string; // UUID
  booking_id: string; // UUID
  sender_id: string; // UUID
  message: string;
  is_read: boolean;
  created_at: string;
}
