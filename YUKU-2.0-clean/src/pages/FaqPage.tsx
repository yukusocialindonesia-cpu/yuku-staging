import React, { useState, useMemo } from 'react';
import { Search, ChevronDown, HelpCircle, ArrowRight } from 'lucide-react';
import { FAQ_ITEMS } from '../utils/contentData';
import { AppRoute } from '../types/navigation';

interface FaqPageProps {
  onNavigate: (path: AppRoute) => void;
}

export const FaqPage: React.FC<FaqPageProps> = ({ onNavigate }) => {
  const [activeCategory, setActiveCategory] = useState<string>('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const categories = ['Semua', 'Umum', 'Keamanan', 'Talent & Penghasilan', 'Status Platform'];

  const filteredFaqs = useMemo(() => {
    return FAQ_ITEMS.filter((item) => {
      if (activeCategory !== 'Semua' && item.category !== activeCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q);
      }
      return true;
    });
  }, [activeCategory, searchQuery]);

  return (
    <div className="py-12 bg-[#FAF8FC]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <span className="text-xs font-bold text-purple-700 tracking-wider uppercase mb-1 block">
            Pusat Informasi & Tanya Jawab
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-[#1E0938] tracking-tight mb-3">
            Pertanyaan yang Sering Diajukan
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 max-w-xl mx-auto">
            Temukan informasi jelas seputar konsep paid companionship, peluang karir talent, kebijakan anti-kencan, dan keamanan pengguna.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative mb-6">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari pertanyaan (contoh: kencan, talent, 18 tahun, pembayaran)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm shadow-xs focus:outline-none focus:border-purple-600"
          />
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2 mb-8">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeCategory === cat
                  ? 'bg-purple-800 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* FAQ Accordion List */}
        <div className="space-y-3 mb-12">
          {filteredFaqs.length > 0 ? (
            filteredFaqs.map((item, idx) => (
              <div
                key={item.q}
                className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden"
              >
                <button
                  onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                  className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 font-bold text-slate-900 hover:text-purple-700 transition-colors cursor-pointer"
                >
                  <span className="text-xs sm:text-sm">{item.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                      openIndex === idx ? 'rotate-180 text-purple-700' : ''
                    }`}
                  />
                </button>
                {openIndex === idx && (
                  <div className="px-4 sm:px-5 pb-5 pt-1 text-xs text-slate-600 leading-relaxed border-t border-slate-100">
                    {item.a}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200 p-6 text-xs text-slate-500">
              Tidak ada pertanyaan yang sesuai dengan kata kunci "{searchQuery}".
            </div>
          )}
        </div>

        {/* Still have questions card */}
        <div className="bg-purple-50 rounded-2xl border border-purple-200 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-sm text-purple-950">
              Masih Memiliki Pertanyaan Lain?
            </h3>
            <p className="text-xs text-purple-800/80 mt-0.5">
              Kunjungi Pusat Bantuan kami atau hubungi tim customer service YUKU.
            </p>
          </div>
          <button
            onClick={() => onNavigate('/bantuan')}
            className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-lg transition-colors shrink-0"
          >
            Buka Pusat Bantuan
          </button>
        </div>
      </div>
    </div>
  );
};
