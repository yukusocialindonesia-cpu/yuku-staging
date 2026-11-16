import React, { useState } from 'react';
import { ExternalLink, Loader2, CreditCard } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatRupiah } from '../../utils/formatters';

type Props = { bookingId: string; amount: number; bookingStatus: string; paymentRoute?: string | null; onRouteClaimed?: (route: 'xendit') => void };

export const XenditCustomerPaymentPanel: React.FC<Props> = ({ bookingId, amount, bookingStatus, paymentRoute, onRouteClaimed }) => {
  const [busy, setBusy] = useState(false);
  const [invoiceUrl, setInvoiceUrl] = useState('');
  const [error, setError] = useState('');

  if (bookingStatus !== 'pending_payment') return null;
  if (paymentRoute && paymentRoute !== 'xendit') return null;

  const startCheckout = async () => {
    setBusy(true); setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-checkout', {
        body: { booking_id: bookingId },
      });
      if (fnError) throw fnError;
      if (!data?.invoice_url) throw new Error('Invoice Xendit tidak tersedia.');
      setInvoiceUrl(data.invoice_url);
      onRouteClaimed?.('xendit');
    } catch (e: any) {
      setError(e?.message || 'Gagal membuat pembayaran Xendit.');
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <h4 className="text-sm font-extrabold text-slate-900">Pembayaran Xendit</h4>
        <p className="mt-1 text-xs text-slate-500">Bayar online melalui invoice Xendit sebesar {formatRupiah(amount)}.</p>
      </div>
      {invoiceUrl ? (
        <a href={invoiceUrl} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white">
          <ExternalLink className="h-4 w-4" /> Lanjutkan Pembayaran Xendit
        </a>
      ) : (
        <button type="button" onClick={startCheckout} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          {busy ? 'Menyiapkan Invoice...' : 'Bayar dengan Xendit'}
        </button>
      )}
      {error && <p className="text-xs text-rose-700">{error}</p>}
      <p className="text-[10px] leading-relaxed text-slate-500">Setelah jalur Xendit dipilih, booking ini tidak dapat berpindah ke QRIS.</p>
    </div>
  );
};
