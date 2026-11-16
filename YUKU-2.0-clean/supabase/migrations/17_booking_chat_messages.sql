-- ============================================================================
-- MIGRATION 17: CHAT REAL-TIME CUSTOMER & TALENT PER BOOKING
-- Aman dijalankan ulang (Idempoten).
-- ============================================================================

-- 1. Tabel public.booking_messages untuk diskusi detail booking secara real-time
CREATE TABLE IF NOT EXISTS public.booking_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (char_length(trim(message)) >= 1 AND char_length(message) <= 1000),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_messages_booking_created
  ON public.booking_messages (booking_id, created_at ASC);

-- 2. Row Level Security & Grants (Hanya Customer & Talent peserta booking atau Admin)
ALTER TABLE public.booking_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "booking_messages_select_participants" ON public.booking_messages;
CREATE POLICY "booking_messages_select_participants" ON public.booking_messages
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND (b.customer_id = auth.uid() OR b.talent_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "booking_messages_insert_participants" ON public.booking_messages;
CREATE POLICY "booking_messages_insert_participants" ON public.booking_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND (b.customer_id = auth.uid() OR b.talent_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "booking_messages_update_read_recipient" ON public.booking_messages;
CREATE POLICY "booking_messages_update_read_recipient" ON public.booking_messages
  FOR UPDATE
  USING (
    sender_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND (b.customer_id = auth.uid() OR b.talent_id = auth.uid())
    )
  )
  WITH CHECK (
    sender_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND (b.customer_id = auth.uid() OR b.talent_id = auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.booking_messages TO authenticated;

-- 3. Aktifkan Supabase Realtime untuk public.booking_messages
ALTER TABLE public.booking_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'booking_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_messages;
  END IF;
END $$;
