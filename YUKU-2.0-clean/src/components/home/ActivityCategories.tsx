import React, { useEffect, useState } from 'react';
import { Coffee, ShoppingBag, Film, Sparkles, Users, MessageCircle, RefreshCw, AlertCircle } from 'lucide-react';
import { ActivityCategory, ActivityCategoryId } from '../../types/talent';
import { fetchCategoriesFromSupabase } from '../../utils/supabaseMarketplace';

interface ActivityCategoriesProps {
  onSelectCategory: (categoryId: ActivityCategoryId) => void;
}

export const ActivityCategories: React.FC<ActivityCategoriesProps> = ({ onSelectCategory }) => {
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadCategories = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchCategoriesFromSupabase();
      setCategories(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memuat data kategori dari Supabase.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Coffee':
      case 'utensils':
        return <Coffee className="w-5 h-5" />;
      case 'ShoppingBag':
        return <ShoppingBag className="w-5 h-5" />;
      case 'Film':
        return <Film className="w-5 h-5" />;
      case 'Sparkles':
        return <Sparkles className="w-5 h-5" />;
      case 'Users':
        return <Users className="w-5 h-5" />;
      case 'MessageCircle':
        return <MessageCircle className="w-5 h-5" />;
      default:
        return <Coffee className="w-5 h-5" />;
    }
  };

  /* HP: 2 kolom x 3 baris. PC (lg): 3 kolom x 2 baris. */
  const gridClass = 'flex gap-3 overflow-x-auto snap-x pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(120px,1fr))] lg:overflow-visible';

  return (
    <section className="py-8 sm:py-10 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-4 sm:mb-6 gap-1 md:gap-4">
          <div>
            <span className="text-[11px] font-bold text-purple-700 tracking-wider uppercase mb-0.5 block">
              Pilihan Pengalaman Sosial
            </span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Aktivitas Seru Bersama Teman Baru
            </h2>
          </div>
          {/* Teks penjelas hanya di layar lebar */}
          <p className="hidden xl:block text-sm text-slate-500 max-w-md">
            Mulai dari bersantai di kafe, berbelanja, menonton pertunjukan, hingga sesi mengobrol suportif online.
          </p>
        </div>

        {loading ? (
          <div className={gridClass}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="rounded-xl border border-slate-200/80 bg-slate-50 animate-pulse h-14 lg:h-20" />
            ))}
          </div>
        ) : errorMsg ? (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={loadCategories}
              className="px-3 py-1.5 bg-rose-600 text-white rounded-lg font-bold flex items-center gap-1 hover:bg-rose-700 cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Coba Lagi</span>
            </button>
          </div>
        ) : categories.length === 0 ? (
          <div className="p-6 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
            Belum ada data kategori aktivitas aktif di Supabase.
          </div>
        ) : (
          <div className={gridClass}>
            {categories.map((cat, idx) => {
              const tones = [
                'bg-purple-100 text-purple-700',
                'bg-fuchsia-100 text-fuchsia-700',
                'bg-amber-100 text-amber-700',
                'bg-sky-100 text-sky-700',
                'bg-rose-100 text-rose-700',
                'bg-emerald-100 text-emerald-700',
              ];
              return (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => onSelectCategory(cat.id)}
                  className="group snap-start shrink-0 w-[104px] lg:w-auto flex flex-col items-center gap-2 px-2 py-3.5 rounded-2xl border border-purple-100 bg-white hover:border-purple-300 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-purple-600"
                >
                  <span className={`w-12 h-12 rounded-2xl flex items-center justify-center ${tones[idx % tones.length]} group-hover:scale-105 transition-transform`}>
                    {getIcon(cat.iconName)}
                  </span>
                  <h3 className="font-bold text-[12px] leading-tight text-center text-slate-800 group-hover:text-purple-700 transition-colors">
                    {cat.title}
                  </h3>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
