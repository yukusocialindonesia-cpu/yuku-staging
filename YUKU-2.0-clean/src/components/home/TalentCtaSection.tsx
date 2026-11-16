import React from 'react';
import { ArrowRight, CheckCircle2, Clock, ShieldCheck, Sparkles, MapPin, CalendarCheck } from 'lucide-react';

interface TalentCtaSectionProps {
  onExploreClick: () => void;
  onRegisterCustomerClick: () => void;
  onRegisterClick: () => void;
}

export const TalentCtaSection: React.FC<TalentCtaSectionProps> = ({
  onExploreClick,
  onRegisterCustomerClick,
  onRegisterClick,
}) => {
  return (
    <section className="py-16 bg-gradient-to-r from-[#210B3D] via-[#330C58] to-[#1E0938] text-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left Content: Customer-First */}
          <div className="lg:col-span-7">
            <span className="text-xs font-bold text-amber-400 tracking-wider uppercase mb-2 block">
              Mulai Pengalaman Sosial Baru
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-4">
              Cari Teman Ngopi, Nonton, atau Partner Acara di Kotamu
            </h2>
            <p className="text-purple-200/90 text-sm sm:text-base leading-relaxed mb-6">
              Tidak perlu datang sendirian ke kafe baru, konser, atau kondangan. Pilih Talent terverifikasi sesuai hobi dan jadwalmu, lalu pesan dengan sistem pembayaran yang aman.
            </p>

            {/* Customer Feature Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 text-xs">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block font-semibold text-sm">
                    Profil Terkurasi & Terverifikasi
                  </strong>
                  <span className="text-purple-200/70">
                    Semua Talent melalui verifikasi identitas 18+ dan standar etika komunikasi.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block font-semibold text-sm">
                    Bebas Pilih Lokasi Publik
                  </strong>
                  <span className="text-purple-200/70">
                    Bertemu nyaman di kafe, mall, bioskop, atau pilih sesi obrolan online.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-fuchsia-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block font-semibold text-sm">
                    Tarif Transparan per Jam
                  </strong>
                  <span className="text-purple-200/70">
                    Lihat tarif per jam langsung di profil sebelum mengajukan jadwal booking.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block font-semibold text-sm">
                    Dana Aman di Escrow
                  </strong>
                  <span className="text-purple-200/70">
                    Pembayaran ditahan aman dan hanya diteruskan setelah sesi selesai.
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                onClick={onExploreClick}
                className="px-7 py-3.5 text-sm font-bold text-white bg-gradient-to-r from-amber-500 via-orange-500 to-pink-600 hover:from-amber-600 hover:to-pink-700 rounded-xl shadow-lg shadow-orange-950/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Jelajahi Talent Sekarang</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={onRegisterCustomerClick}
                className="px-6 py-3.5 text-sm font-bold text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Daftar Akun Customer</span>
              </button>
            </div>
          </div>

          {/* Right Visual Card: Customer Quick Steps + Subtle Talent Link */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-7 rounded-3xl bg-white/10 backdrop-blur-md border border-white/15 text-white">
              <div className="inline-block px-3 py-1 bg-white/10 rounded-full text-xs font-semibold text-amber-300 mb-5">
                Langkah Mulai untuk Customer
              </div>

              <div className="space-y-3.5 text-xs text-purple-100">
                <div className="flex items-start gap-3 pb-3 border-b border-white/10">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>1. Daftar akun Customer dan lengkapi verifikasi e-KTP 18+.</span>
                </div>
                <div className="flex items-start gap-3 pb-3 border-b border-white/10">
                  <MapPin className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span>2. Pilih aktivitas, kota, dan Talent yang cocok dengan minatmu.</span>
                </div>
                <div className="flex items-start gap-3 pb-3 border-b border-white/10">
                  <CalendarCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>3. Tentukan jam pertemuan di ruang publik atau sesi online.</span>
                </div>
                <div className="flex items-start gap-3 pt-1">
                  <ShieldCheck className="w-4 h-4 text-pink-400 shrink-0 mt-0.5" />
                  <span>4. Nikmati momen pertemanan positif dengan perlindungan tim YUKU.</span>
                </div>
              </div>
            </div>

            {/* Secondary subtle Talent invitation */}
            <div className="p-4 rounded-2xl bg-purple-950/60 border border-purple-700/50 flex items-center justify-between gap-3">
              <div className="text-xs">
                <span className="font-bold text-white block">Ingin bergabung menjadi Talent?</span>
                <span className="text-purple-200/75 text-[11px]">
                  Atur jadwal sendiri dan temani aktivitas sosial positif.
                </span>
              </div>
              <button
                onClick={onRegisterClick}
                className="shrink-0 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-amber-300 transition-colors cursor-pointer whitespace-nowrap"
              >
                Daftar Talent →
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

