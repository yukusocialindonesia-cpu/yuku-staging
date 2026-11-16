import React, { useState, useEffect, useMemo } from 'react';
import { Search, MapPin, Coffee, AlertCircle, RefreshCw } from 'lucide-react';
import { ActivityCategory, TalentProfile } from '../../types/talent';
import { fetchCategoriesFromSupabase, fetchTalentsFromSupabase } from '../../utils/supabaseMarketplace';
import { buildCityFilterOptions } from '../../utils/cities';

interface SearchActivityWidgetProps {
  onSearch: (activity: string, city: string) => void;
}

export const SearchActivityWidget: React.FC<SearchActivityWidgetProps> = ({ onSearch }) => {
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [talents, setTalents] = useState<TalentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedActivity, setSelectedActivity] = useState<string>('all');
  const [selectedCity, setSelectedCity] = useState<string>('Semua Kota');

  const loadSearchData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [catsData, talentsData] = await Promise.all([
        fetchCategoriesFromSupabase(),
        fetchTalentsFromSupabase(),
      ]);
      setCategories(catsData);
      setTalents(talentsData);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memuat pilihan pencarian dari Supabase.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSearchData();
  }, []);

  const availableCities = useMemo(() => {
    return buildCityFilterOptions(talents.map((t) => t.city));
  }, [talents]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(selectedActivity, selectedCity);
  };

  if (errorMsg) {
    return (
      <div className="bg-rose-50 border border-rose-200 p-3 rounded-2xl max-w-4xl mx-auto text-xs text-rose-900 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
        <button
          type="button"
          onClick={loadSearchData}
          className="px-3 py-1 bg-rose-600 text-white rounded-lg font-bold flex items-center gap-1 cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Coba Lagi</span>
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white p-3 md:p-4 rounded-2xl shadow-xl shadow-purple-950/5 border border-purple-100/80 max-w-4xl mx-auto"
    >
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        {/* Aktivitas Selector */}
        <div className="md:col-span-5 flex items-center gap-3 px-3 py-2 bg-slate-50 hover:bg-slate-100/70 rounded-xl border border-slate-200/60 transition-colors">
          <Coffee className="w-5 h-5 text-purple-700 shrink-0" />
          <div className="flex-1 text-left">
            <label htmlFor="search-activity" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Pilihan Aktivitas
            </label>
            <select
              id="search-activity"
              value={selectedActivity}
              disabled={loading}
              onChange={(e) => setSelectedActivity(e.target.value)}
              className="w-full bg-transparent text-sm font-semibold text-slate-800 focus:outline-none cursor-pointer disabled:opacity-50"
            >
              <option value="all">
                {loading ? 'Memuat Kategori...' : 'Semua Aktivitas Sosial'}
              </option>
              {categories.map((act) => (
                <option key={act.id} value={act.id}>
                  {act.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Kota Selector */}
        <div className="md:col-span-4 flex items-center gap-3 px-3 py-2 bg-slate-50 hover:bg-slate-100/70 rounded-xl border border-slate-200/60 transition-colors">
          <MapPin className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="flex-1 text-left">
            <label htmlFor="search-city" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Lokasi Kota
            </label>
            <select
              id="search-city"
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="w-full bg-transparent text-sm font-semibold text-slate-800 focus:outline-none cursor-pointer"
            >
              {availableCities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Submit Button */}
        <div className="md:col-span-3">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-5 bg-gradient-to-r from-purple-700 via-fuchsia-700 to-amber-600 hover:from-purple-800 hover:to-amber-700 text-white font-bold text-sm rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Search className="w-4 h-4" />
            <span>Cari Talent</span>
          </button>
        </div>
      </div>
    </form>
  );
};
