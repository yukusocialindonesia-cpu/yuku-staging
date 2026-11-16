// Edge Function: xendit-webhook
// Menerima callback invoice Xendit dan memanggil settle_booking_payment() (service_role).
// Deploy:  supabase functions deploy xendit-webhook --no-verify-jwt
// Secrets: XENDIT_CALLBACK_TOKEN  (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY otomatis tersedia)
// Di dashboard Xendit, set URL callback invoice "paid" ke:
//   https://<project-ref>.supabase.co/functions/v1/xendit-webhook
// STATUS: belum diuji terhadap sandbox Xendit. Uji di staging sebelum mengaktifkan flag.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const ok = (b: unknown = { ok: true }) =>
  new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
const fail = (status: number, message: string) =>
  new Response(JSON.stringify({ error: message }), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'Method not allowed');

  // 1) Verifikasi token callback (rahasia bersama dengan Xendit).
  const expected = Deno.env.get('XENDIT_CALLBACK_TOKEN');
  const received = req.headers.get('x-callback-token') ?? '';
  if (!expected || !safeEqual(received, expected)) return fail(401, 'Unauthorized');

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return fail(400, 'Bad request');
  }

  const status = String(payload?.status ?? '').toUpperCase();
  const externalId = String(payload?.external_id ?? '');
  const match = /^yuku-([0-9a-f-]{36})$/i.exec(externalId);
  if (!match) return ok({ ignored: 'external_id tidak dikenali' });
  const bookingId = match[1];

  // Hanya PAID/SETTLED yang melunasi. EXPIRED dibiarkan ke cron kedaluwarsa booking.
  if (status !== 'PAID' && status !== 'SETTLED') return ok({ ignored: `status ${status}` });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // 2) Cocokkan nominal dengan database (bukan percaya payload).
  const { data: booking } = await admin
    .from('bookings').select('id, gross_amount').eq('id', bookingId).maybeSingle();
  if (!booking) return ok({ ignored: 'booking tidak ditemukan' });

  const paid = Number(payload?.paid_amount ?? payload?.amount ?? 0);
  if (paid !== Number(booking.gross_amount)) {
    console.error('Nominal tidak cocok', bookingId, paid, booking.gross_amount);
    return fail(422, 'Nominal pembayaran tidak sesuai');
  }

  // 3) Lunasi (idempotent di sisi database).
  const method = String(payload?.payment_channel ?? payload?.payment_method ?? 'invoice').slice(0, 50);
  const { error } = await admin.rpc('settle_booking_payment', {
    p_booking_id: bookingId,
    p_provider: 'xendit',
    p_provider_charge_id: String(payload?.id ?? '').slice(0, 100) || null,
    p_payment_method: method,
    p_webhook_payload: payload,
  });

  if (error) {
    console.error('settle_booking_payment gagal', bookingId, error.message);
    // 5xx => Xendit akan mencoba ulang. Booking kedaluwarsa tidak perlu retry.
    const permanent = /kedaluwarsa|tidak ditemukan|tidak dapat dibayar/i.test(error.message);
    return permanent ? ok({ ignored: error.message }) : fail(500, 'Gagal memproses pembayaran');
  }
  return ok();
});
