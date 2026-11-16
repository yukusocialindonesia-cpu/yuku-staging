import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Loader2, Trash2, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { HeroSlideRow } from '../../types/database';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];
const BUCKET = 'hero';

const extOf = (file: File) =>
  (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';

function validate(file: File) {
  if (!ALLOWED.includes(file.type)) throw new Error('Format gambar harus PNG, JPG, atau WebP.');
  if (file.size > MAX_BYTES) throw new Error('Ukuran gambar maksimal 5 MB.');
}

async function uploadTo(folder: string, file: File) {
  validate(file);
  const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.${extOf(file)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type,
  });
  if (error) throw new Error(`Gagal mengunggah gambar: ${error.message}`);
  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return { path, url };
}

export const HeroSlidesAdminPanel: React.FC = () => {
  const [slides, setSlides] = useState<HeroSlideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [desktopFile, setDesktopFile] = useState<File | null>(null);
  const [mobileFile, setMobileFile] = useState<File | null>(null);
  const [desktopPreview, setDesktopPreview] = useState('');
  const [mobilePreview, setMobilePreview] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('hero_slides')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (err) {
      setMigrationMissing(err.code === '42P01' || err.message.includes('hero_slides'));
      setSlides([]);
    } else {
      setMigrationMissing(false);
      setSlides((data as HeroSlideRow[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!desktopFile) return setDesktopPreview('');
    const url = URL.createObjectURL(desktopFile);
    setDesktopPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [desktopFile]);

  useEffect(() => {
    if (!mobileFile) return setMobilePreview('');
    const url = URL.createObjectURL(mobileFile);
    setMobilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [mobileFile]);

  const run = async (task: () => Promise<void>, okText: string) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await task();
      await load();
      setMessage(okText);
    } catch (e: any) {
      setError(e?.message || 'Terjadi kesalahan.');
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!desktopFile) {
      setError('Pilih gambar slide (desktop) terlebih dahulu.');
      return;
    }
    const trimmedLink = link.trim();
    if (trimmedLink && !trimmedLink.startsWith('/') && !/^https?:\/\//i.test(trimmedLink)) {
      setError('Tautan harus diawali "/" (halaman YUKU, mis. /talent) atau "https://".');
      return;
    }
    run(async () => {
      const { data: auth } = await supabase.auth.getUser();
      const desktop = await uploadTo('desktop', desktopFile);
      const mobile = mobileFile ? await uploadTo('mobile', mobileFile) : null;
      const nextOrder = slides.length ? Math.max(...slides.map((s) => s.sort_order)) + 1 : 0;
      const { error: insErr } = await supabase.from('hero_slides').insert({
        title: title.trim() || 'Slide YUKU',
        image_url: desktop.url,
        storage_path: desktop.path,
        mobile_image_url: mobile?.url ?? null,
        mobile_storage_path: mobile?.path ?? null,
        link_url: trimmedLink || null,
        sort_order: nextOrder,
        is_active: true,
        created_by: auth.user?.id ?? null,
      });
      if (insErr) throw new Error(`Gagal menyimpan slide: ${insErr.message}`);
      setTitle('');
      setLink('');
      setDesktopFile(null);
      setMobileFile(null);
    }, 'Slide baru berhasil ditambahkan ke Beranda.');
  };

  const toggleActive = (s: HeroSlideRow) =>
    run(async () => {
      const { error: err } = await supabase.from('hero_slides').update({ is_active: !s.is_active }).eq('id', s.id);
      if (err) throw new Error(err.message);
    }, s.is_active ? 'Slide disembunyikan dari Beranda.' : 'Slide ditampilkan di Beranda.');

  const move = (index: number, delta: number) => {
    const other = slides[index + delta];
    const current = slides[index];
    if (!other || !current) return;
    run(async () => {
      // Tukar urutan; jika nilainya sama, pakai indeks agar tetap bergeser.
      const a = index + delta;
      const b = index;
      const r1 = await supabase.from('hero_slides').update({ sort_order: a }).eq('id', current.id);
      const r2 = await supabase.from('hero_slides').update({ sort_order: b }).eq('id', other.id);
      if (r1.error || r2.error) throw new Error((r1.error || r2.error)!.message);
    }, 'Urutan slide diperbarui.');
  };

  const handleDelete = (s: HeroSlideRow) =>
    run(async () => {
      const { error: err } = await supabase.from('hero_slides').delete().eq('id', s.id);
      if (err) throw new Error(err.message);
      const paths = [s.storage_path, s.mobile_storage_path].filter(Boolean) as string[];
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
      setConfirmDeleteId(null);
    }, 'Slide dihapus.');

  return (
    <div className="space-y-4">
      {migrationMissing && (
        <p className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
          <strong>Tabel slide hero belum aktif.</strong> Jalankan{' '}
          <code className="font-mono">supabase/migrations/37_hero_slides.sql</code> di SQL Editor Supabase.
        </p>
      )}

      <form onSubmit={handleAdd} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <div>
          <h3 className="font-extrabold text-slate-900 flex items-center gap-2">
            <ImagePlus className="w-4 h-4 text-purple-700" /> Tambah Slide Hero
          </h3>
          <p className="text-xs text-slate-500">
            Gambar tampil di bagian paling atas Beranda dan berganti otomatis. Taruh objek utama di sisi kanan
            gambar, karena sisi kiri tertutup teks &quot;Real Friends. Real Moments.&quot; dan kolom pencarian.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-bold text-slate-700 space-y-1">
            Gambar desktop (wajib) — disarankan 1920×800 px
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setDesktopFile(e.target.files?.[0] || null)}
              className="block w-full text-xs font-normal"
            />
          </label>
          <label className="block text-xs font-bold text-slate-700 space-y-1">
            Gambar mobile (opsional) — disarankan 900×1100 px
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setMobileFile(e.target.files?.[0] || null)}
              className="block w-full text-xs font-normal"
            />
          </label>
        </div>

        {(desktopPreview || mobilePreview) && (
          <div className="flex flex-wrap gap-3">
            {desktopPreview && (
              <img src={desktopPreview} alt="Pratinjau desktop" className="h-24 rounded-lg border border-slate-200 object-cover" />
            )}
            {mobilePreview && (
              <img src={mobilePreview} alt="Pratinjau mobile" className="h-24 rounded-lg border border-slate-200 object-cover" />
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-bold text-slate-700 space-y-1">
            Judul (untuk aksesibilitas)
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={150}
              placeholder="Mis. Temukan Teman Terbaik di YUKU"
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-normal"
            />
          </label>
          <label className="block text-xs font-bold text-slate-700 space-y-1">
            Tautan saat diklik (opsional)
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="/talent atau https://..."
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-normal"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={busy || !desktopFile}
          className="inline-flex items-center gap-2 rounded-xl bg-purple-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50 cursor-pointer"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Terbitkan Slide
        </button>
      </form>

      {message && <p className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">{message}</p>}
      {error && <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800">{error}</p>}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <h3 className="font-extrabold text-slate-900">
          Slide Saat Ini ({slides.filter((s) => s.is_active).length} aktif dari {slides.length})
        </h3>
        {loading ? (
          <p className="text-xs text-slate-500">Memuat…</p>
        ) : slides.length === 0 ? (
          <p className="text-xs text-slate-500">
            Belum ada slide. Beranda memakai hero bawaan sampai Anda menambahkan slide pertama.
          </p>
        ) : (
          <ul className="space-y-3">
            {slides.map((s, i) => (
              <li
                key={s.id}
                className={`flex flex-col sm:flex-row gap-3 rounded-xl border p-3 ${
                  s.is_active ? 'border-slate-200' : 'border-slate-200 bg-slate-50 opacity-70'
                }`}
              >
                <img src={s.image_url} alt={s.title} className="w-full sm:w-56 h-24 rounded-lg object-cover bg-slate-100" />
                <div className="flex-1 min-w-0 text-xs space-y-0.5">
                  <p className="font-bold text-slate-900 truncate">
                    {i + 1}. {s.title}
                  </p>
                  <p className="text-slate-500 truncate">{s.link_url || 'Tanpa tautan'}</p>
                  <p className="text-slate-500">
                    {s.mobile_image_url ? 'Ada versi mobile' : 'Tanpa versi mobile'} ·{' '}
                    {s.is_active ? 'Aktif' : 'Disembunyikan'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                  <button
                    type="button"
                    disabled={busy || i === 0}
                    onClick={() => move(i, -1)}
                    aria-label="Geser ke atas"
                    className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 inline-flex items-center justify-center cursor-pointer"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={busy || i === slides.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label="Geser ke bawah"
                    className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 inline-flex items-center justify-center cursor-pointer"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => toggleActive(s)}
                    className="px-3 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {s.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    {s.is_active ? 'Sembunyikan' : 'Tampilkan'}
                  </button>
                  {confirmDeleteId === s.id ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDelete(s)}
                        className="px-3 h-9 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer"
                      >
                        Ya, hapus
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-3 h-9 rounded-lg bg-slate-100 text-xs font-bold cursor-pointer"
                      >
                        Batal
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmDeleteId(s.id)}
                      aria-label="Hapus slide"
                      className="w-9 h-9 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 inline-flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
