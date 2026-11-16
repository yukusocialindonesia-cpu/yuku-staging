import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RotateCcw, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { DEFAULT_ICON, DEFAULT_LOGO, refreshBranding } from '../../utils/branding';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];
type Kind = 'logo' | 'icon';

interface SlotProps {
  title: string;
  hint: string;
  currentUrl: string;
  isCustom: boolean;
  busy: boolean;
  onSave: (file: File) => Promise<void>;
  onReset: () => Promise<void>;
}

const Slot: React.FC<SlotProps> = ({ title, hint, currentUrl, isCustom, busy, onSave, onReset }) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');

  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <div>
        <h3 className="font-extrabold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center justify-center">
        <img src={preview || currentUrl} alt={title} className="max-h-24 max-w-full object-contain" />
      </div>
      {preview && <p className="text-[11px] text-amber-700">Pratinjau file baru. Belum tersimpan.</p>}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="block w-full text-xs"
      />
      <div className="flex flex-wrap gap-2">
        <button
          disabled={busy || !file}
          onClick={async () => {
            if (!file) return;
            await onSave(file);
            setFile(null);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-purple-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Simpan
        </button>
        {isCustom && (
          <button
            disabled={busy}
            onClick={onReset}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" /> Kembalikan ke bawaan
          </button>
        )}
      </div>
    </section>
  );
};

export const BrandingAdminPanel: React.FC = () => {
  const [paths, setPaths] = useState<{ logo: string | null; icon: string | null }>({ logo: null, icon: null });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data } = await (supabase as any)
      .from('site_branding')
      .select('logo_path, icon_path')
      .eq('id', true)
      .maybeSingle();
    setPaths({ logo: data?.logo_path ?? null, icon: data?.icon_path ?? null });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const writePath = async (kind: Kind, path: string | null) => {
    const { data: auth } = await supabase.auth.getUser();
    const column = kind === 'logo' ? 'logo_path' : 'icon_path';
    const { data, error: updErr } = await (supabase as any)
      .from('site_branding')
      .update({ [column]: path, updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() })
      .eq('id', true)
      .select('id');
    if (updErr) throw updErr;
    if (!data || data.length === 0) throw new Error('Tidak ada izin mengubah branding (khusus Admin).');
  };

  const run = async (task: () => Promise<void>, okText: string) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await task();
      await refreshBranding();
      await load();
      setMessage(okText);
    } catch (e: any) {
      setError(e?.message || 'Gagal menyimpan branding.');
    } finally {
      setBusy(false);
    }
  };

  const handleSave = (kind: Kind) => (file: File) =>
    run(async () => {
      if (!ALLOWED.includes(file.type)) throw new Error('Format harus PNG, JPG, atau WebP.');
      if (file.size > MAX_BYTES) throw new Error('Ukuran file maksimal 5 MB.');
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
      const path = `${kind}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('branding')
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      await writePath(kind, path);
    }, kind === 'logo' ? 'Logo berhasil diganti.' : 'Ikon berhasil diganti.');

  const handleReset = (kind: Kind) => () =>
    run(() => writePath(kind, null), 'Dikembalikan ke gambar bawaan.');

  const urlOf = (p: string | null, fallback: string) =>
    p ? supabase.storage.from('branding').getPublicUrl(p).data.publicUrl : fallback;

  return (
    <div className="space-y-4">
      <Slot
        title="Logo Utama"
        hint="Tampil di navbar, footer, dan halaman login. Disarankan PNG transparan, maks. 5 MB."
        currentUrl={urlOf(paths.logo, DEFAULT_LOGO)}
        isCustom={!!paths.logo}
        busy={busy}
        onSave={handleSave('logo')}
        onReset={handleReset('logo')}
      />
      <Slot
        title="Ikon Kecil"
        hint="Versi persegi dari logo (tanpa tulisan), dipakai di tempat sempit. PNG transparan."
        currentUrl={urlOf(paths.icon, DEFAULT_ICON)}
        isCustom={!!paths.icon}
        busy={busy}
        onSave={handleSave('icon')}
        onReset={handleReset('icon')}
      />
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">{message}</p>}
      {error && <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800">{error}</p>}
    </div>
  );
};
