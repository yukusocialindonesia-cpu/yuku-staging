import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, Loader2, RefreshCw, Upload, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatRupiah } from '../../utils/formatters';

export const QrisAdminPanel: React.FC = () => {
  const [config, setConfig] = useState<any>(null); const [rows, setRows] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null); const [merchant, setMerchant] = useState(''); const [identifier, setIdentifier] = useState('');
  const [instructions, setInstructions] = useState('Scan QRIS, bayar sesuai nominal, lalu unggah bukti pembayaran.');
  const [active, setActive] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const load = useCallback(async () => {
    const db = supabase as any;
    const [{ data: cfg }, { data: submissions }] = await Promise.all([
      db.from('qris_payment_settings').select('*').eq('id', true).maybeSingle(),
      db.from('qris_payment_submissions').select('id,booking_id,customer_id,proof_storage_path,claimed_amount,transfer_reference,status,created_at').eq('status', 'pending_review').order('created_at', { ascending: true }),
    ]);
    setConfig(cfg); setRows(submissions || []);
    if (cfg) { setMerchant(cfg.merchant_name || ''); setIdentifier(cfg.merchant_identifier || ''); setInstructions(cfg.instructions || ''); setActive(!!cfg.is_active); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      let path = config?.image_path || null;
      if (file) {
        if (file.size > 5 * 1024 * 1024) throw new Error('Ukuran QRIS maksimal 5 MB.');
        const ext = file.name.split('.').pop()?.toLowerCase() || 'png'; path = `versions/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('qris-payment-display').upload(path, file, { upsert: false, contentType: file.type });
        if (uploadError) throw uploadError;
      }
      const { error: rpcError } = await (supabase as any).rpc('admin_update_qris_settings', { p_is_active: active, p_image_path: path, p_merchant_name: merchant, p_merchant_identifier: identifier, p_instructions: instructions });
      if (rpcError) throw rpcError;
      setMessage('Pengaturan QRIS berhasil disimpan. Gambar lama tetap tersimpan sebagai versi historis.'); setFile(null); await load();
    } catch (e: any) { setError(e?.message || 'Gagal menyimpan QRIS.'); } finally { setBusy(false); }
  };
  const review = async (row: any, approve: boolean) => {
    const notes = window.prompt(approve ? 'Catatan verifikasi (wajib): pastikan dana benar-benar masuk di akun merchant.' : 'Alasan penolakan (wajib):');
    if (!notes?.trim()) return;
    const reference = approve ? window.prompt('Masukkan referensi transaksi yang terlihat di akun merchant/bank:') : null;
    if (approve && !reference?.trim()) return;
    setBusy(true); setError(''); setMessage('');
    const { error: rpcError } = await (supabase as any).rpc('admin_review_qris_payment', { p_submission_id: row.id, p_approve: approve, p_admin_notes: notes.trim(), p_transfer_reference: reference?.trim() || null });
    if (rpcError) setError(rpcError.message); else { setMessage(approve ? 'Pembayaran disahkan dan masuk escrow.' : 'Bukti ditolak; Customer dapat mengirim bukti baru.'); await load(); }
    setBusy(false);
  };
  const imageUrl = config?.image_path ? supabase.storage.from('qris-payment-display').getPublicUrl(config.image_path).data.publicUrl : '';
  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <div><h3 className="font-extrabold text-slate-900">Pengaturan QRIS</h3><p className="text-xs text-slate-500">Admin dapat mengganti gambar kapan saja. Setiap gambar memakai path versi baru agar catatan lama tidak berubah.</p></div>
      {imageUrl && <img src={imageUrl} alt="QRIS aktif" className="max-h-64 max-w-full rounded-xl border border-slate-200 bg-white object-contain p-2" />}
      <label className="block text-xs font-bold">Ganti gambar QRIS (opsional)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] || null)} className="mt-1 block w-full text-xs" /></label>
      <label className="block text-xs font-bold">Nama merchant<input value={merchant} onChange={e => setMerchant(e.target.value)} maxLength={120} className="mt-1 w-full rounded-lg border p-2 font-normal" /></label>
      <label className="block text-xs font-bold">ID merchant / NMID<input value={identifier} onChange={e => setIdentifier(e.target.value)} maxLength={120} className="mt-1 w-full rounded-lg border p-2 font-normal" /></label>
      <label className="block text-xs font-bold">Instruksi pembayaran<textarea value={instructions} onChange={e => setInstructions(e.target.value)} maxLength={500} rows={2} className="mt-1 w-full rounded-lg border p-2 font-normal" /></label>
      <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Aktifkan QRIS untuk Customer</label>
      <button onClick={save} disabled={busy || (active && !file && !config?.image_path)} className="inline-flex items-center gap-2 rounded-xl bg-purple-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Simpan Pengaturan QRIS</button>
    </section>
    {message && <p className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">{message}</p>}{error && <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800">{error}</p>}
    <section className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-extrabold text-slate-900">Bukti Menunggu Verifikasi ({rows.length})</h3><button onClick={load} className="inline-flex items-center gap-1 text-xs font-bold text-purple-700"><RefreshCw className="h-3.5 w-3.5" /> Muat ulang</button></div>
      {rows.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">Belum ada bukti pembayaran yang menunggu pemeriksaan.</p>}
      {rows.map(row => <QrisReviewCard key={row.id} row={row} busy={busy} onReview={review} />)}
    </section>
  </div>;
};

const QrisReviewCard: React.FC<{ row: any; busy: boolean; onReview: (row: any, approve: boolean) => void }> = ({ row, busy, onReview }) => {
  const [url, setUrl] = useState('');
  useEffect(() => { let alive = true; supabase.storage.from('qris-payment-proofs').createSignedUrl(row.proof_storage_path, 300).then(({ data }) => { if (alive) setUrl(data?.signedUrl || ''); }); return () => { alive = false; }; }, [row.proof_storage_path]);
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><strong>Booking: {row.booking_id}</strong><span className="inline-flex items-center gap-1 text-amber-700"><Clock className="h-3.5 w-3.5" /> Menunggu</span></div><p>Nominal: <strong>{formatRupiah(Number(row.claimed_amount))}</strong></p>{row.transfer_reference && <p>Referensi Customer: {row.transfer_reference}</p>}{url && <a href={url} target="_blank" rel="noreferrer" className="inline-block text-purple-700 underline">Lihat bukti pembayaran</a>}<div className="flex flex-wrap gap-2 pt-2"><button disabled={busy} onClick={() => onReview(row, true)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 font-bold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> Verifikasi & Setujui</button><button disabled={busy} onClick={() => onReview(row, false)} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 font-bold text-white disabled:opacity-50"><XCircle className="h-4 w-4" /> Tolak Bukti</button></div></article>;
};
