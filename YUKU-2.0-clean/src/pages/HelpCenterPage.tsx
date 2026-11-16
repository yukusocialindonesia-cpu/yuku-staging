import React, { useState } from 'react';
import { Mail, MessageSquare, ShieldAlert, FileText, Send, CheckCircle2, PhoneCall } from 'lucide-react';
import { AppRoute } from '../types/navigation';

interface HelpCenterPageProps {
  onNavigate: (path: AppRoute) => void;
}

export const HelpCenterPage: React.FC<HelpCenterPageProps> = ({ onNavigate }) => {
  const [ticketData, setTicketData] = useState({
    name: '',
    email: '',
    category: 'Pertanyaan Umum',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="py-12 bg-[#FAF8FC]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold text-purple-700 tracking-wider uppercase mb-1 block">
            Dukungan Pengguna
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-[#1E0938] tracking-tight mb-2">
            Pusat Bantuan YUKU
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            Tim dukungan kami siap membantu menjawab pertanyaan, memandu verifikasi akun, dan menindaklanjuti laporan keamanan.
          </p>
        </div>

        {/* 3 Channels */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center mb-3">
                <Mail className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm mb-1">Email Resmi</h3>
              <p className="text-xs text-slate-600 mb-3">
                Kirim pertanyaan atau dokumen verifikasi ke alamat email resmi kami.
              </p>
            </div>
            <a
              href="mailto:halo@yuku.co.id"
              className="text-xs font-bold text-purple-700 hover:text-purple-900"
            >
              halo@yuku.co.id
            </a>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3">
                <MessageSquare className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm mb-1">Tiket Bantuan Online</h3>
              <p className="text-xs text-slate-600 mb-3">
                Sampaikan kendala jadwal, akun, atau verifikasi e-KTP melalui formulir di bawah ini.
              </p>
            </div>
            <span className="text-xs font-bold text-emerald-700">
              Respon via Email Terdaftar
            </span>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-rose-200 shadow-xs flex flex-col justify-between bg-rose-50/30">
            <div>
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center mb-3">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm mb-1">Laporan Pelanggaran Etika</h3>
              <p className="text-xs text-slate-600 mb-3">
                Laporkan indikasi permintaan kencan terlarang, pelecehan, atau perilaku non-sosial.
              </p>
            </div>
            <span className="text-xs font-bold text-rose-700">
              Prioritas Tindakan 24 Jam
            </span>
          </div>
        </div>

        {/* Contact Form & Help Articles */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Quick Guidance Box */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
              <h3 className="font-bold text-sm text-slate-900 mb-3">
                Topik Bantuan Populer
              </h3>
              <ul className="space-y-3 text-xs text-slate-600">
                <li
                  onClick={() => onNavigate('/faq')}
                  className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-200 transition-colors"
                >
                  <span>Cara membatalkan booking & refund</span>
                  <span className="text-purple-600 font-bold">Lihat &rarr;</span>
                </li>
                <li
                  onClick={() => onNavigate('/cara-kerja')}
                  className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-200 transition-colors"
                >
                  <span>Pedoman pertemuan di tempat umum</span>
                  <span className="text-purple-600 font-bold">Lihat &rarr;</span>
                </li>
                <li
                  onClick={() => onNavigate('/daftar-talent')}
                  className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-200 transition-colors"
                >
                  <span>Penghasilan talent & pencairan saldo</span>
                  <span className="text-purple-600 font-bold">Lihat &rarr;</span>
                </li>
                <li
                  onClick={() => onNavigate('/syarat-ketentuan')}
                  className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-200 transition-colors"
                >
                  <span>Syarat verifikasi KTP 18+ tahun</span>
                  <span className="text-purple-600 font-bold">Lihat &rarr;</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-7">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs">
              <h2 className="text-lg font-bold text-slate-900 mb-1">
                Kirim Pesan ke Tim Bantuan
              </h2>
              <p className="text-xs text-slate-500 mb-6">
                Silakan tuliskan kendalamu dan tim kami akan segera merespons.
              </p>

              {!submitted ? (
                <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Nama Lengkap *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Nama Anda"
                      value={ticketData.name}
                      onChange={(e) => setTicketData({ ...ticketData, name: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Email Anda *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="email@anda.com"
                      value={ticketData.email}
                      onChange={(e) => setTicketData({ ...ticketData, email: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Kategori Kendala *
                    </label>
                    <select
                      value={ticketData.category}
                      onChange={(e) => setTicketData({ ...ticketData, category: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
                    >
                      <option>Pertanyaan Umum</option>
                      <option>Kendala Pemesanan / Jadwal</option>
                      <option>Verifikasi Akun & KTP</option>
                      <option>Pencairan Saldo Talent</option>
                      <option>Laporan Pelanggaran Etika</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Pesan / Deskripsi Kendala *
                    </label>
                    <textarea
                      rows={4}
                      required
                      placeholder="Jelaskan kendala Anda secara rinci..."
                      value={ticketData.message}
                      onChange={(e) => setTicketData({ ...ticketData, message: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>Kirim Pesan Bantuan</span>
                  </button>
                </form>
              ) : (
                <div className="py-8 text-center space-y-3">
                  <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-base">
                    Pesan Bantuan Berhasil Terkirim
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Terima kasih telah menghubungi Tim Dukungan YUKU. Tim kami akan segera menanggapi pertanyaan Anda melalui email.
                  </p>
                  <button
                    onClick={() => setSubmitted(false)}
                    className="px-4 py-2 bg-purple-700 text-white text-xs font-semibold rounded-lg hover:bg-purple-800"
                  >
                    Kirim Pesan Lain
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
