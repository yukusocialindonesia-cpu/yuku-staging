import React from 'react';
import { Shield, Sparkles, Wallet, HeartHandshake, Eye, CheckCircle2 } from 'lucide-react';

export const ValuePropsSection: React.FC = () => {
  const values = [
    {
      icon: <Shield className="w-6 h-6 text-purple-600" />,
      title: 'Verifikasi Usia Wajib 18+',
      desc: 'Standar kepatuhan hukum yang ketat untuk memastikan ekosistem dewasa yang bertanggung jawab dan aman.',
    },
    {
      icon: <Eye className="w-6 h-6 text-fuchsia-600" />,
      title: 'Hanya di Ruang Publik',
      desc: 'Pertemuan tatap muka wajib di tempat umum (kafe, mall, bioskop, dsb) untuk menjamin rasa aman kedua pihak.',
    },
    {
      icon: <Wallet className="w-6 h-6 text-amber-600" />,
      title: 'Sistem Pembayaran Terlindungi',
      desc: 'Dana customer diamankan oleh platform dan hanya dicairkan kepada Talent setelah aktivitas selesai terkonfirmasi.',
    },
    {
      icon: <HeartHandshake className="w-6 h-6 text-rose-600" />,
      title: 'Murni Koneksi Sosial Positif',
      desc: 'Menghadirkan pendamping aktivitas ramah tanpa tekanan kencan, komitmen asmara, atau ekspektasi non-sosial.',
    },
    {
      icon: <Sparkles className="w-6 h-6 text-purple-600" />,
      title: 'Tarif Jelas & Transparan per Jam',
      desc: 'Lihat tarif per jam langsung di setiap profil sebelum memesan, tanpa biaya tersembunyi.',
    },
    {
      icon: <CheckCircle2 className="w-6 h-6 text-emerald-600" />,
      title: 'Pilihan Fleksibel Offline & Online',
      desc: 'Dapat memilih teman jalan santai di kotamu atau teman mengobrol online dari kenyamanan rumahmu.',
    },
  ];

  return (
    <section className="py-20 bg-gradient-to-b from-white to-[#FAF8FC]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-bold text-purple-700 tracking-wider uppercase mb-2 block">
            Standar Standout
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1E0938] tracking-tight mb-4">
            Keunggulan Platform YUKU
          </h2>
          <p className="text-slate-600 text-sm sm:text-base">
            Membangun ekosistem companionship berbayar yang etis, saling menghargai, dan profesional di Indonesia.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {values.map((item) => (
            <div
              key={item.title}
              className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-purple-200 hover:shadow-md transition-all flex flex-col justify-start"
            >
              <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center mb-4 shrink-0">
                {item.icon}
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">
                {item.title}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
