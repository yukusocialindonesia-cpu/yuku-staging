-- ============================================================================
-- MIGRATION 12: MODERASI LAPORAN INSIDEN & SENGKETA (reports_complaints)
-- Aman dijalankan ulang (Idempoten).
-- ============================================================================

-- 1. Pastikan Admin memiliki policy UPDATE pada public.reports_complaints
GRANT UPDATE (status, admin_notes, resolved_by_admin_id) ON public.reports_complaints TO authenticated;

DROP POLICY IF EXISTS "reports_update_admin" ON public.reports_complaints;
CREATE POLICY "reports_update_admin" ON public.reports_complaints
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 2. RPC Admin untuk meninjau & menindaklanjuti laporan insiden secara atomik
CREATE OR REPLACE FUNCTION public.admin_resolve_report(
  p_report_id UUID,
  p_new_status public.report_status_type,
  p_admin_notes TEXT DEFAULT NULL,
  p_hold_booking BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_report RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses Ditolak: Hanya Admin YUKU yang berhak memproses laporan insiden.';
  END IF;

  SELECT * INTO v_report
  FROM public.reports_complaints
  WHERE id = p_report_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Laporan insiden tidak ditemukan.';
  END IF;

  UPDATE public.reports_complaints
  SET
    status = p_new_status,
    admin_notes = NULLIF(TRIM(COALESCE(p_admin_notes, '')), ''),
    resolved_by_admin_id = auth.uid()
  WHERE id = p_report_id;

  -- Jika diminta dan terhubung ke booking aktif/escrow, tahan booking ke disputed_hold
  IF p_hold_booking AND v_report.booking_id IS NOT NULL THEN
    UPDATE public.bookings
    SET
      status = 'disputed_hold'::public.booking_status_type,
      updated_at = NOW()
    WHERE id = v_report.booking_id
      AND status IN (
        'paid_held_in_escrow'::public.booking_status_type,
        'confirmed_by_talent'::public.booking_status_type,
        'in_progress'::public.booking_status_type
      );
  END IF;

  INSERT INTO public.admin_audit_logs (
    admin_user_id,
    action_type,
    target_table,
    target_id,
    old_data,
    new_data
  ) VALUES (
    auth.uid(),
    'admin_resolve_report',
    'reports_complaints',
    p_report_id::text,
    jsonb_build_object('status', v_report.status, 'admin_notes', v_report.admin_notes),
    jsonb_build_object('status', p_new_status, 'admin_notes', p_admin_notes, 'hold_booking', p_hold_booking)
  );

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_resolve_report(UUID, public.report_status_type, TEXT, BOOLEAN) TO authenticated;
