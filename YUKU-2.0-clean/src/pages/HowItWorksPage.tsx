import React, { useState } from 'react';
import { ShieldCheck, Ban, Coffee, Sparkles, CheckCircle2, ArrowRight, UserCheck } from 'lucide-react';
import { AppRoute } from '../types/navigation';
import { HOW_IT_WORKS_STEPS } from '../utils/contentData';

interface HowItWorksPageProps {
  onNavigate: (path: AppRoute) => void;
}

export const HowItWorksPage: React.FC<HowItWorksPageProps> = ({ onNavigate }) => {
  const [activeRole, setActiveRole] = useState<'customer' | 'talent'>('customer');

  const customerSteps = [
    {
      num: '01',
      title: 'Pilih Aktivitas & Jelajahi Profil',
      desc: 'Tentukan kegiatan yang ingin kamu lakukan—seperti ngopi, makan santai, berbelanja pakaian, nonton bioskop, atau mengobrol online. Filter Talent berdasarkan kota, hobi, dan tarif per jam.',
    },
    {
      num: '02',
      title: 'Ajukan Jadwal di Ruang Publik',
      desc: 'Sepakati jadwal dan tentukan lokasi pertemuan di area publik yang aman (kafe, mall ternama, bioskop, atau tempat pameran). Tidak diperkenankan memilih lokasi privat/tertutup.',
    },
    {
      num: '03',
      title: 'Nikmati Momen Tanpa Beban',
      desc: 'Jalani aktivitas bersama Talent dengan suasana bersahabat dan santai. Tanpa tuntutan kencan atau drama asmara, hanya kebersamaan sosial yang saling menghargai.',
    },
    {
      num: '04',
      title: 'Selesai & Beri Ulasan',
      desc: 'Setelah sesi selesai, konfirmasi penyelesaian dan berikan rating serta ulasan pengalamanmu untuk membantu menjaga kualitas komunitas.',
    },
  ];

  const talentSteps = [
    {
      num: '01',
      title: 'Registrasi & Verifikasi Identitas 18+',
      desc: 'Daftar sebagai Talent dengan mengunggah kartu identitas resmi (KTP) dan verifikasi swafoto. Semua Talent wajib berusia minimal 18 tahun.',
    },
    {
      num: '02',
      title: 'Atur Profil, Minat & Tarif Sendiri',
      desc: 'Tuliskan bio, aktivitas yang kamu minati, jam ketersediaan, serta tarif per jam yang kamu inginkan (misal: Rp 150.000/jam).',
    },
    {
      num: '03',
      title: 'Terima Permintaan Sesuai Keinginan',
      desc: 'Kamu memiliki kendali penuh untuk menerima atau menolak setiap permintaan booking yang masuk sesuai kenyamananmu.',
    },
    {
      num: '04',
      title: 'Pencairan Transparan & Apresiasi Rekan',
      desc: 'Dapatkan pembayaran langsung setelah sesi selesai terkonfirmasi dengan aman, serta bonus apresiasi saat mengundang rekan berkualitas.',
    },
  ];

  return (
    <div className="py-12 bg-[#FAF8FC]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <span className="text-xs font-bold text-purple-700 tracking-wider uppercase mb-2 block">
            Panduan Lengkap
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-[#1E0938] tracking-tight mb-4">
            Cara Kerja YUKU
          </h1>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            Membangun pengalaman sosial dan pertemanan berbayar yang transparan, profesional, dan mengutamakan rasa aman untuk Customer maupun Talent.
          </p>

          {/* Role Toggle */}
          <div className="mt-8 inline-flex p-1 bg-slate-200/80 rounded-xl">
            <button
              onClick={() => setActiveRole('customer')}
              className={`px-6 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeRole === 'customer'
                  ? 'bg-purple-800 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Untuk Customer (Pengguna)
            </button>
            <button
              onClick={() => setActiveRole('talent')}
              className={`px-6 py-2.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeRole === 'talent'
                  ? 'bg-purple-800 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Untuk Talent (Pendamping)
            </button>
          </div>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {(activeRole === 'customer' ? customerSteps : talentSteps).map((step) => (
            <div
              key={step.num}
              className="bg-white rounded-2xl border border-slate-200/80 p-6 flex flex-col justify-between shadow-xs hover:border-purple-200 transition-all"
            >
              <div>
                <span className="text-3xl font-black text-purple-700 block mb-3 font-mono">
                  {step.num}
                </span>
                <h3 className="font-bold text-base text-slate-900 mb-2">
                  {step.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Ethical Boundaries & Safety Protocol */}
        <div className="bg-white rounded-3xl border border-purple-200 p-8 sm:p-10 shadow-xs mb-16">
          <div className="max-w-3xl mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 text-red-700 text-xs font-bold rounded-full mb-3 border border-red-200">
              <Ban className="w-3.5 h-3.5" />
              <span>Standar Etika Ketat Platform YUKU</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
              Bukan Kencan. Murni Pengalaman Sosial Positif.
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Kami menetapkan batasan yang tidak dapat dinegosiasikan demi melindungi martabat dan keselamatan semua pihak:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 rounded-xl bg-purple-50/50 border border-purple-100 space-y-2">
              <div className="font-bold text-purple-950 text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-purple-700" />
                <span>1. Wajib Ruang Publik</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Seluruh aktivitas tatap muka wajib berlokasi di tempat umum berkeramaian (pusat perbelanjaan, restoran, kafe, bioskop). Dilarang bertemu di area privat atau kamar tidur.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-purple-50/50 border border-purple-100 space-y-2">
              <div className="font-bold text-purple-950 text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-purple-700" />
                <span>2. Nol Toleransi Seksual</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                YUKU melarang rayuan seksual, kontak fisik yang tidak diinginkan, atau permintaan prostitusi. Setiap pelanggaran berujung pada blacklist permanen dan pelaporan hukum.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-purple-50/50 border border-purple-100 space-y-2">
              <div className="font-bold text-purple-950 text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-purple-700" />
                <span>3. Verifikasi Usia 18+</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                YUKU hanya melayani individu dewasa (18 tahun ke atas) dengan validasi KTP resmi demi kepatuhan regulasi dan kedewasaan interaksi sosial.
              </p>
            </div>
          </div>
        </div>

        {/* Action Banner */}
        <div className="text-center bg-gradient-to-r from-purple-800 via-fuchsia-700 to-amber-600 rounded-3xl p-8 sm:p-12 text-white">
          <h2 className="text-2xl sm:text-3xl font-extrabold mb-3">
            Siap Memulai Pengalaman Sosial yang Menyenangkan?
          </h2>
          <p className="text-xs sm:text-sm text-purple-100 max-w-xl mx-auto mb-8">
            Jelajahi profil Talent terverifikasi atau daftar akun Customer untuk mulai menjadwalkan aktivitas pertamamu.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => onNavigate('/talent')}
              className="px-6 py-3 bg-white text-purple-900 font-bold text-xs sm:text-sm rounded-xl shadow-md hover:bg-purple-50 transition-colors cursor-pointer"
            >
              Jelajahi Talent
            </button>
            <button
              onClick={() => onNavigate('/register')}
              className="px-6 py-3 bg-purple-950/60 hover:bg-purple-950 text-white font-bold text-xs sm:text-sm rounded-xl border border-white/20 transition-colors cursor-pointer"
            >
              Daftar Akun Customer
            </button>
          </div>
          <div className="mt-5">
            <button
              onClick={() => onNavigate('/daftar-talent')}
              className="text-xs font-semibold text-purple-100 hover:text-white underline underline-offset-4 cursor-pointer"
            >
              Ingin bergabung sebagai Talent? Daftar di sini
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
