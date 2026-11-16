import React from 'react';
import { ShieldCheck, Ban, Lock, AlertCircle, FileCheck, PhoneCall } from 'lucide-react';

export const SafetySection: React.FC = () => {
  return (
    <section className="py-20 bg-[#17082A] text-white relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 right-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-3xl mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-900/60 border border-purple-700/60 rounded-full text-purple-300 text-xs font-semibold mb-4">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Protokol Keamanan & Integritas Komunitas</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-4">
            Keamanan, Privasi & Batasan Etika yang Tegas
          </h2>
          <p className="text-purple-200/80 text-sm sm:text-base leading-relaxed">
            YUKU didesain sejak awal dengan perlindungan ganda. Kami menciptakan ruang aman di mana setiap orang dapat memperluas pergaulan sosial tanpa rasa khawatir.
          </p>
        </div>

        {/* 3 Pillar Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {/* Card 1: Anti-Dating & Anti-Sexual Services */}
          <div className="p-6 rounded-2xl bg-purple-950/40 border border-purple-800/50 backdrop-blur-xs flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-pink-500/20 text-pink-400 flex items-center justify-center mb-4">
                <Ban className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">
                Bukan Layanan Kencan & Bukan Prostitusi
              </h3>
              <p className="text-xs text-purple-200/70 leading-relaxed mb-4">
                YUKU secara tegas melarang segala bentuk permintaan bernuansa asmara, rayuan sensual, atau layanan seksual. Pelanggaran terhadap aturan ini berakibat sanksi blokir permanen dan tindakan hukum.
              </p>
            </div>
            <div className="text-[11px] font-semibold text-pink-300 flex items-center gap-1.5 pt-3 border-t border-purple-900/60">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Zero-Tolerance Policy</span>
            </div>
          </div>

          {/* Card 2: 18+ & ID Verification */}
          <div className="p-6 rounded-2xl bg-purple-950/40 border border-purple-800/50 backdrop-blur-xs flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
                <FileCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">
                Verifikasi Usia Wajib 18+ (KTP)
              </h3>
              <p className="text-xs text-purple-200/70 leading-relaxed mb-4">
                Baik Customer maupun Talent wajib melalui proses validasi identitas resmi. Kami menjamin tidak ada pengguna di bawah umur demi menjaga keamanan hukum dan etika sosial.
              </p>
            </div>
            <div className="text-[11px] font-semibold text-amber-300 flex items-center gap-1.5 pt-3 border-t border-purple-900/60">
              <Lock className="w-4 h-4 shrink-0" />
              <span>Data Identitas Terenkripsi</span>
            </div>
          </div>

          {/* Card 3: Public Spaces Only */}
          <div className="p-6 rounded-2xl bg-purple-950/40 border border-purple-800/50 backdrop-blur-xs flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">
                Zona Publik & Pusat Bantuan
              </h3>
              <p className="text-xs text-purple-200/70 leading-relaxed mb-4">
                Pertemuan langsung hanya diizinkan di fasilitas umum beramai-ramai seperti kafe, restoran, mall, atau gedung pertemuan. Dilarang keras bertemu di kamar hotel atau kediaman pribadi tertutup.
              </p>
            </div>
            <div className="text-[11px] font-semibold text-emerald-300 flex items-center gap-1.5 pt-3 border-t border-purple-900/60">
              <PhoneCall className="w-4 h-4 shrink-0" />
              <span>Dukungan Laporan Insiden Cepat</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
