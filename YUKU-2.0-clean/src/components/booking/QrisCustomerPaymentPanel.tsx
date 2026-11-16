import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Loader2, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatRupiah } from '../../utils/formatters';

type Props = { bookingId: string; amount: number; bookingStatus: string; paymentRoute?: string | null; onRouteClaimed?: (route: 'manual_qris') => void; expiresAt?: string };
export const QrisCustomerPaymentPanel: React.FC<Props> = ({ bookingId, amount, bookingStatus, paymentRoute, onRouteClaimed, expiresAt }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = expiresAt ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000)) : null;
  const countdown = left === null ? '' : `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  const [settings, setSettings] = useState<any>(null); const [submission, setSubmission] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null); const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  useEffect(() => { let alive = true; const load = async () => {
    const db = supabase as any;
    const [{ data: config }, { data: proof }] = await Promise.all([
      db.from('qris_payment_settings').select('is_active,image_path,merchant_name,instructions').eq('id', true).maybeSingle(),
      db.from('qris_payment_submissions').select('status,admin_notes,created_at').eq('booking_id', bookingId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]); if (alive) { setSettings(config); setSubmission(proof); }
  }; load(); return () => { alive = false; }; }, [bookingId]);
  const imageUrl = settings?.image_path ? supabase.storage.from('qris-payment-display').getPublicUrl(settings.image_path).data.publicUrl : '';
  const submit = async () => {
    if (!file) { setError('Pilih bukti pembayaran terlebih dahulu.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Ukuran bukti maksimal 5 MB.'); return; }
    setBusy(true); setError(''); setSuccess('');
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'; const path = `${bookingId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('qris-payment-proofs').upload(path, file, { upsert: false, contentType: file.type });
      if (uploadError) throw uploadError;
      const { error: rpcError } = await (supabase as any).rpc('submit_qris_payment_proof', { p_booking_id: bookingId, p_proof_storage_path: path, p_claimed_amount: amount, p_transfer_reference: reference.trim() || null });
      if (rpcError) { await supabase.storage.from('qris-payment-proofs').remove([path]); throw rpcError; }
      setSubmission({ status: 'pending_review', created_at: new Date().toISOString() });
      onRouteClaimed?.('manual_qris'); setFile(null); setReference('');
      setSuccess('Bukti terkirim. Tunggu pemeriksaan Admin; booking belum dianggap lunas sampai disetujui.');
    } catch (e: any) { setError(e?.message || 'Gagal mengirim bukti pembayaran.'); } finally { setBusy(false); }
  };
  if (bookingStatus !== 'pending_payment') return null;
  if (paymentRoute === 'xendit') return null;
  if (submission?.status === 'pending_review') return <div className="mt-3 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 text-emerald-950"><div className="flex items-center gap-2 text-sm font-extrabold"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Bukti pembayaran sudah terkirim</div><p className="mt-2 text-xs">Sekarang tinggal menunggu Admin memeriksa. Anda tidak perlu mengunggah atau membayar ulang.</p><p className="mt-1 text-xs text-emerald-800">Status booking akan berubah otomatis setelah pembayaran diverifikasi.</p></div>;
  if (submission?.status === 'approved') return <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900"><CheckCircle2 className="mr-1 inline h-4 w-4" /> Pembayaran telah diverifikasi.</div>;
  if (!settings?.is_active || !imageUrl) return <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><AlertCircle className="mr-1 inline h-4 w-4" /> QRIS belum tersedia. Silakan hubungi Admin YUKU.</div>;
  return <div className="mt-4 space-y-3 rounded-2xl border border-purple-200 bg-purple-50/60 p-4">
    {left !== null && <div className={`rounded-xl px-3 py-2 text-center text-xs font-bold ${left < 180 ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"}`}>{left > 0 ? `Selesaikan pembayaran dalam ${countdown}` : "Waktu pembayaran habis. Buat booking baru."}</div>}
    <div><h4 className="text-sm font-extrabold text-purple-950">Pembayaran QRIS YUKU</h4><p className="mt-1 text-xs text-slate-600">Pindai QRIS dan bayar sesuai nominal booking.</p></div>
    <div className="flex flex-col items-center gap-2 rounded-xl bg-white p-3"><img src={imageUrl} alt="QRIS pembayaran YUKU" className="w-full max-w-[260px] object-contain" />{settings.merchant_name && <p className="text-xs font-bold text-slate-700">{settings.merchant_name}</p>}<p className="text-xl font-black text-purple-950">{formatRupiah(amount)}</p>{settings.instructions && <p className="text-center text-[11px] text-slate-500">{settings.instructions}</p>}</div>
    <div className="text-xs font-bold text-slate-700">Bukti pembayaran (JPG/PNG/WebP/PDF, maks. 5 MB)
      <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-purple-300 bg-white px-4 py-3 text-xs font-bold text-purple-800"><Upload className="h-4 w-4" />{file ? 'Ganti file' : 'Ketuk untuk memilih file bukti bayar'}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => { setFile(e.target.files?.[0] || null); setError(''); }} className="hidden" /></label>
      {file ? <p className="mt-2 flex items-center gap-1 break-all rounded-lg bg-emerald-50 px-3 py-2 font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0" /> File dipilih: {file.name} (belum dikirim, ketuk tombol di bawah)</p> : <p className="mt-2 font-normal text-slate-500">Belum ada file dipilih.</p>}
    </div>
    <label className="block text-xs font-bold text-slate-700">Nomor referensi transaksi (opsional)<input value={reference} onChange={e => setReference(e.target.value)} maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal" placeholder="Nomor referensi dari aplikasi pembayaran" /></label>
    {error && <p className="text-xs text-rose-700">{error}</p>}{success && <p className="text-xs text-emerald-700">{success}</p>}
    <button type="button" onClick={submit} disabled={busy || !file} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-purple-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {busy ? 'Mengirim...' : 'Kirim Bukti Pembayaran'}</button>
    <p className="text-[10px] leading-relaxed text-slate-500">Unggahan tidak otomatis mengesahkan pembayaran. Admin harus mencocokkan dana masuk pada akun merchant.</p>
  </div>;
};
