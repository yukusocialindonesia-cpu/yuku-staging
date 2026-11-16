import React from 'react';
import { BrandLogo } from '../components/common/BrandLogo';
import { ShieldCheck, Heart, Sparkles, Users, Coffee, Ban, CheckCircle } from 'lucide-react';
import { AppRoute } from '../types/navigation';
import { CORE_VALUES } from '../utils/businessRules';

interface AboutPageProps {
  onNavigate: (path: AppRoute) => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({ onNavigate }) => {
  return (
    <div className="py-12 bg-[#FAF8FC]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-100 text-purple-800 text-xs font-bold rounded-full mb-4">
            <Sparkles className="w-3.5 h-3.5 text-purple-700" />
            <span>Kisah & Visi Kami</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-[#1E0938] tracking-tight mb-4">
            Tentang YUKU
          </h1>
          <p className="text-base sm:text-lg text-purple-900/80 font-bold mb-4">
            Real Friends. Real Moments.
          </p>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            YUKU adalah platform Social Experience & Paid Companionship Marketplace pertama di Indonesia yang menghubungkan individu dengan pendamping aktivitas sosial (Talent) secara bermartabat, aman, dan menyenangkan.
          </p>
        </div>

        {/* Brand Story & Philosophy */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center mb-16">
          <div className="lg:col-span-6 space-y-4 text-xs sm:text-sm text-slate-600 leading-relaxed">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Menghadirkan Solusi Kesepian Modern di Tengah Hiruk-Pikuk Kota
            </h2>
            <p>
              Di era serba digital, banyak orang memiliki jadwal padat dan lingkaran pertemanan yang menyempit. Sering kali kita ingin mencoba kafe baru, menonton pertunjukan bioskop favorit, menghadiri resepsi pernikahan teman lama, atau sekadar berdiskusi santai tentang hobi—namun teman dekat sedang sibuk.
            </p>
            <p>
              YUKU hadir untuk menjembatani kebutuhan tersebut. Kami percaya bahwa setiap orang berhak menikmati momen sosial berkualitas tanpa harus merasa canggung atau terkekang oleh komitmen romantis.
            </p>
            <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 text-purple-950 font-medium">
              "Kami bukan aplikasi perjodohan, dan bukan penyedia layanan seksual. YUKU adalah panggung interaksi sosial sehat di mana waktu dan kebersamaan dihargai secara profesional."
            </div>
          </div>

          <div className="lg:col-span-6 bg-gradient-to-tr from-[#1E0938] to-[#40126D] rounded-3xl p-8 sm:p-10 text-white shadow-xl relative overflow-hidden">
            <div className="relative z-10 space-y-6">
              <BrandLogo size="lg" showTagline={true} inverted={true} />
              <div className="space-y-3 pt-4 border-t border-purple-800/60 text-xs text-purple-200/90 leading-relaxed">
                <div>
                  <strong className="text-white block font-semibold text-sm">Cakupan Wilayah:</strong>
                  Seluruh Indonesia (kota-kota besar dan sekitarnya).
                </div>
                <div>
                  <strong className="text-white block font-semibold text-sm">Target Pengguna:</strong>
                  Semua gender dewasa (usia minimum 18 tahun) sebagai Customer maupun Talent.
                </div>
                <div>
                  <strong className="text-white block font-semibold text-sm">Prinsip Ruang:</strong>
                  Hanya berlangsung di fasilitas umum atau komunikasi daring aman.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Pillars of Values */}
        <div className="mb-16">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#1E0938]">
              Pilar Nilai Utama Kami
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {CORE_VALUES.map((val) => (
              <div
                key={val.title}
                className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center mb-3">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm mb-2">{val.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{val.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Call to action */}
        <div className="bg-white rounded-3xl border border-purple-200 p-8 sm:p-12 text-center max-w-4xl mx-auto shadow-xs">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-3">
            Ingin Mengalami Momen Nyata Bersama Teman Baru?
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto mb-6">
            Jelajahi berbagai profil Talent terkurasi atau buat akun Customer untuk mulai memesan pendamping aktivitas.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => onNavigate('/talent')}
              className="px-6 py-3 bg-purple-700 text-white font-bold text-xs sm:text-sm rounded-xl hover:bg-purple-800 transition-colors cursor-pointer"
            >
              Jelajahi Talent
            </button>
            <button
              onClick={() => onNavigate('/register')}
              className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer"
            >
              Daftar Akun Customer
            </button>
          </div>
          <div className="mt-4">
            <button
              onClick={() => onNavigate('/daftar-talent')}
              className="text-xs font-semibold text-purple-700 hover:text-purple-900 hover:underline cursor-pointer"
            >
              Ingin bergabung menjadi Talent? Daftar di sini
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
