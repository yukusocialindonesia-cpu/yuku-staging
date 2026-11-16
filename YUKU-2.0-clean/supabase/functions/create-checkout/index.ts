// Edge Function: create-checkout
// Membuat invoice Xendit untuk booking berstatus pending_payment milik pemanggil.
// Deploy:  supabase functions deploy create-checkout
// Secrets: XENDIT_SECRET_KEY, APP_BASE_URL  (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY otomatis tersedia)
// STATUS: belum diuji terhadap sandbox Xendit. Uji di staging sebelum mengaktifkan flag.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const XENDIT_API = 'https://api.xendit.co/v2/invoices';

function cors(origin: string | null) {
  const allowed = Deno.env.get('APP_BASE_URL') ?? '';
  return {
    'Access-Control-Allow-Origin': origin && origin === allowed ? origin : allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const xenditKey = Deno.env.get('XENDIT_SECRET_KEY');
  const appBaseUrl = Deno.env.get('APP_BASE_URL');
  if (!xenditKey || !appBaseUrl) return json({ error: 'Konfigurasi pembayaran belum lengkap.' }, 500, headers);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401, headers);

  // 1) Identitas pemanggil dari JWT-nya sendiri.
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'Unauthorized' }, 401, headers);
  const userId = userData.user.id;

  let bookingId: string;
  try {
    const body = await req.json();
    bookingId = String(body?.booking_id ?? '');
  } catch {
    return json({ error: 'Body tidak valid.' }, 400, headers);
  }
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return json({ error: 'booking_id tidak valid.' }, 400, headers);

  const admin = createClient(supabaseUrl, serviceKey);

  // 2) Feature flag server-side harus aktif.
  const { data: flag } = await admin
    .from('system_feature_flags').select('enabled').eq('flag_key', 'payment_checkout').maybeSingle();
  if (!flag?.enabled) return json({ error: 'Pembayaran belum aktif.' }, 403, headers);

  // 3) Booking harus milik pemanggil, masih pending_payment, dan belum kedaluwarsa.
  const { data: booking, error: bErr } = await admin
    .from('bookings')
    .select('id, booking_code, customer_id, status, gross_amount, payment_expires_at')
    .eq('id', bookingId).maybeSingle();
  if (bErr || !booking || booking.customer_id !== userId) return json({ error: 'Booking tidak ditemukan.' }, 404, headers);
  if (booking.status !== 'pending_payment') return json({ error: 'Booking tidak menunggu pembayaran.' }, 409, headers);

  const secondsLeft = Math.floor((new Date(booking.payment_expires_at).getTime() - Date.now()) / 1000);
  if (secondsLeft < 60) return json({ error: 'Batas waktu pembayaran hampir/sudah habis.' }, 409, headers);

  // Atomically claim Xendit as the only payment route for this booking.
  // If QRIS has already been selected, this fails and no Xendit invoice is created.
  const { error: routeError } = await userClient.rpc('claim_booking_payment_route', {
    p_booking_id: bookingId,
    p_route: 'xendit',
  });
  if (routeError) return json({ error: routeError.message }, 409, headers);

  const externalId = `yuku-${booking.id}`;
  const auth = 'Basic ' + btoa(`${xenditKey}:`);

  // 4) Buat invoice (jumlah SELALU dari database, bukan dari klien).
  const res = await fetch(XENDIT_API, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      external_id: externalId,
      amount: Number(booking.gross_amount),
      currency: 'IDR',
      description: `Booking YUKU ${booking.booking_code}`,
      invoice_duration: secondsLeft,
      payer_email: userData.user.email ?? undefined,
      success_redirect_url: `${appBaseUrl}/riwayat-booking`,
      failure_redirect_url: `${appBaseUrl}/riwayat-booking`,
    }),
  });

  if (res.ok) {
    const inv = await res.json();
    return json({ invoice_url: inv.invoice_url }, 200, headers);
  }

  // 5) Invoice untuk booking ini sudah ada -> ambil ulang.
  const err = await res.json().catch(() => ({}));
  if (err?.error_code === 'DUPLICATE_ERROR') {
    const existing = await fetch(`${XENDIT_API}?external_id=${encodeURIComponent(externalId)}`, { headers: { Authorization: auth } });
    if (existing.ok) {
      const list = await existing.json();
      const pending = Array.isArray(list) ? list.find((i: any) => i.status === 'PENDING') : null;
      if (pending?.invoice_url) return json({ invoice_url: pending.invoice_url }, 200, headers);
    }
  }
  console.error('Xendit invoice gagal', res.status, err?.error_code);
  return json({ error: 'Gagal membuat tagihan. Silakan coba lagi.' }, 502, headers);
});
