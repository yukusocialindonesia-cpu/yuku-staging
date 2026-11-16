-- ============================================================================
-- MIGRATION 13: TRIGGER OTOMATIS NOTIFIKASI IN-APP (public.notifications)
-- Aman dijalankan ulang (Idempoten).
-- ============================================================================

-- 1. Helper internal untuk membuat notifikasi
CREATE OR REPLACE FUNCTION public.create_in_app_notification(
  p_user_id UUID,
  p_title VARCHAR(150),
  p_message TEXT,
  p_type public.notification_type,
  p_metadata JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, metadata)
  VALUES (p_user_id, p_title, p_message, p_type, p_metadata);
END;
$$;

-- 2. Trigger Notifikasi Status Booking
CREATE OR REPLACE FUNCTION public.notify_on_booking_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'paid_held_in_escrow' THEN
    PERFORM public.create_in_app_notification(
      NEW.talent_id,
      'Pesanan Baru Siap Dikonfirmasi',
      'Booking ' || NEW.booking_code || ' telah dibayar Customer. Segera konfirmasi jadwal di Dashboard Talent.',
      'booking_update'::public.notification_type,
      jsonb_build_object('booking_id', NEW.id, 'booking_code', NEW.booking_code, 'route', '/dashboard-talent')
    );
    PERFORM public.create_in_app_notification(
      NEW.customer_id,
      'Pembayaran Diterima (Escrow)',
      'Pembayaran untuk booking ' || NEW.booking_code || ' telah diamankan di escrow YUKU.',
      'payment_status'::public.notification_type,
      jsonb_build_object('booking_id', NEW.id, 'booking_code', NEW.booking_code, 'route', '/riwayat-booking')
    );
  ELSIF NEW.status = 'confirmed_by_talent' THEN
    PERFORM public.create_in_app_notification(
      NEW.customer_id,
      'Booking Dikonfirmasi Talent',
      'Talent telah mengonfirmasi jadwal untuk booking ' || NEW.booking_code || '.',
      'booking_update'::public.notification_type,
      jsonb_build_object('booking_id', NEW.id, 'booking_code', NEW.booking_code, 'route', '/riwayat-booking')
    );
  ELSIF NEW.status = 'in_progress' THEN
    PERFORM public.create_in_app_notification(
      NEW.customer_id,
      'Sesi Aktivitas Dimulai',
      'Sesi untuk booking ' || NEW.booking_code || ' sedang berlangsung.',
      'booking_update'::public.notification_type,
      jsonb_build_object('booking_id', NEW.id, 'booking_code', NEW.booking_code, 'route', '/riwayat-booking')
    );
  ELSIF NEW.status = 'completed' THEN
    PERFORM public.create_in_app_notification(
      NEW.customer_id,
      'Sesi Selesai — Beri Ulasan',
      'Sesi booking ' || NEW.booking_code || ' telah selesai. Anda dapat memberikan rating dan ulasan di Riwayat Booking.',
      'booking_update'::public.notification_type,
      jsonb_build_object('booking_id', NEW.id, 'booking_code', NEW.booking_code, 'route', '/riwayat-booking')
    );
    PERFORM public.create_in_app_notification(
      NEW.talent_id,
      'Sesi Selesai & Dana Masuk Proses Escrow',
      'Sesi booking ' || NEW.booking_code || ' selesai. Kompensasi 80% akan tersedia setelah masa tunggu 24 jam.',
      'booking_update'::public.notification_type,
      jsonb_build_object('booking_id', NEW.id, 'booking_code', NEW.booking_code, 'route', '/dashboard-talent')
    );
  ELSIF NEW.status = 'cancelled_by_talent' THEN
    PERFORM public.create_in_app_notification(
      NEW.customer_id,
      'Booking Dibatalkan Talent',
      'Booking ' || NEW.booking_code || ' dibatalkan oleh Talent.',
      'booking_update'::public.notification_type,
      jsonb_build_object('booking_id', NEW.id, 'booking_code', NEW.booking_code, 'route', '/riwayat-booking')
    );
  ELSIF NEW.status = 'cancelled_by_customer' AND OLD.status <> 'pending_payment' THEN
    PERFORM public.create_in_app_notification(
      NEW.talent_id,
      'Booking Dibatalkan Customer',
      'Booking ' || NEW.booking_code || ' dibatalkan oleh Customer.',
      'booking_update'::public.notification_type,
      jsonb_build_object('booking_id', NEW.id, 'booking_code', NEW.booking_code, 'route', '/dashboard-talent')
    );
  ELSIF NEW.status = 'disputed_hold' THEN
    PERFORM public.create_in_app_notification(
      NEW.customer_id,
      'Booking Ditahan untuk Peninjauan',
      'Status booking ' || NEW.booking_code || ' ditahan sementara oleh Tim Keamanan YUKU.',
      'system_alert'::public.notification_type,
      jsonb_build_object('booking_id', NEW.id, 'booking_code', NEW.booking_code, 'route', '/riwayat-booking')
    );
    PERFORM public.create_in_app_notification(
      NEW.talent_id,
      'Booking Ditahan untuk Peninjauan',
      'Status booking ' || NEW.booking_code || ' ditahan sementara oleh Tim Keamanan YUKU.',
      'system_alert'::public.notification_type,
      jsonb_build_object('booking_id', NEW.id, 'booking_code', NEW.booking_code, 'route', '/dashboard-talent')
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_booking_status_change ON public.bookings;
CREATE TRIGGER trg_notify_booking_status_change
  AFTER INSERT OR UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_booking_status_change();

-- 3. Trigger Notifikasi Status Verifikasi e-KTP
CREATE OR REPLACE FUNCTION public.notify_on_ktp_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.ktp_verification_status IS NOT DISTINCT FROM OLD.ktp_verification_status THEN
    RETURN NEW;
  END IF;

  IF NEW.ktp_verification_status = 'verified' THEN
    PERFORM public.create_in_app_notification(
      NEW.id,
      'Verifikasi e-KTP 18+ Disetujui',
      'Identitas e-KTP Anda telah terverifikasi. Kini Anda dapat menggunakan layanan penuh di YUKU.',
      'system_alert'::public.notification_type,
      jsonb_build_object('ktp_status', 'verified')
    );
  ELSIF NEW.ktp_verification_status = 'rejected' THEN
    PERFORM public.create_in_app_notification(
      NEW.id,
      'Verifikasi e-KTP Perlu Diperbaiki',
      COALESCE('Pengajuan e-KTP ditolak: ' || NEW.ktp_rejection_reason, 'Pengajuan e-KTP ditolak. Silakan unggah ulang dokumen yang jelas.'),
      'system_alert'::public.notification_type,
      jsonb_build_object('ktp_status', 'rejected')
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ktp_status_change ON public.user_identities;
CREATE TRIGGER trg_notify_ktp_status_change
  AFTER UPDATE OF ktp_verification_status ON public.user_identities
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_ktp_status_change();

-- 4. Trigger Notifikasi Status Pencairan Dana Talent
CREATE OR REPLACE FUNCTION public.notify_on_payout_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.payout_status IS NOT DISTINCT FROM OLD.payout_status THEN
    RETURN NEW;
  END IF;

  IF NEW.payout_status = 'completed_provider_confirmed' THEN
    PERFORM public.create_in_app_notification(
      NEW.talent_id,
      'Pencairan Dana Berhasil Ditransfer',
      'Permohonan penarikan ' || NEW.payout_number || ' telah berhasil ditransfer ke rekening Anda.',
      'payout_status'::public.notification_type,
      jsonb_build_object('payout_id', NEW.id, 'route', '/dashboard-talent')
    );
  ELSIF NEW.payout_status IN ('rejected', 'failed') THEN
    PERFORM public.create_in_app_notification(
      NEW.talent_id,
      'Permohonan Pencairan Dana Ditolak/Gagal',
      COALESCE('Penarikan ' || NEW.payout_number || ' tidak dapat diproses: ' || NEW.rejection_reason, 'Penarikan ' || NEW.payout_number || ' gagal diproses.'),
      'payout_status'::public.notification_type,
      jsonb_build_object('payout_id', NEW.id, 'route', '/dashboard-talent')
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_payout_status_change ON public.payout_requests;
CREATE TRIGGER trg_notify_payout_status_change
  AFTER UPDATE OF payout_status ON public.payout_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_payout_status_change();

-- 5. Trigger Notifikasi Penanganan Laporan Insiden
CREATE OR REPLACE FUNCTION public.notify_on_report_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  PERFORM public.create_in_app_notification(
    NEW.reporter_id,
    'Pembaruan Laporan Insiden Anda',
    'Status laporan Anda telah diperbarui menjadi: ' || NEW.status::text ||
    COALESCE('. Catatan Admin: ' || NEW.admin_notes, '.'),
    'system_alert'::public.notification_type,
    jsonb_build_object('report_id', NEW.id, 'booking_id', NEW.booking_id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_report_status_change ON public.reports_complaints;
CREATE TRIGGER trg_notify_report_status_change
  AFTER UPDATE OF status ON public.reports_complaints
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_report_status_change();
