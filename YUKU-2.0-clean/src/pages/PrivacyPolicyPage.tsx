import React from 'react';
import { ShieldCheck, Lock, Eye, FileText } from 'lucide-react';

export const PrivacyPolicyPage: React.FC = () => {
  return (
    <div className="py-12 bg-[#FAF8FC]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 pb-6 border-b border-slate-200">
          <div className="flex items-center gap-2 text-xs font-bold text-purple-700 uppercase tracking-wider mb-2">
            <Lock className="w-4 h-4" />
            <span>Kerahasiaan & Perlindungan Data Pribadi</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-[#1E0938] tracking-tight mb-2">
            Kebijakan Privasi YUKU
          </h1>
          <p className="text-xs text-slate-500">
            Terakhir Diperbarui: November 2026 · Mengacu pada UU Perlindungan Data Pribadi (UU PDP) Indonesia
          </p>
        </div>

        {/* Content */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-10 shadow-xs space-y-8 text-xs sm:text-sm text-slate-700 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              1. Komitmen Privasi YUKU
            </h2>
            <p>
              YUKU berkomitmen menjaga kerahasiaan dan perlindungan data pribadi pengguna sebagai kewajiban operasional utama. Kebijakan ini menjelaskan rencana, kewajiban, dan prinsip pengolahan data pribadi Customer dan Talent pada platform YUKU.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              2. Data yang Diproses
            </h2>
            <ul className="list-disc list-inside space-y-1.5 pl-1">
              <li>
                <strong>Data Identitas & Usia:</strong> Nama lengkap, tanggal lahir, serta foto e-KTP dan swafoto untuk verifikasi batas usia minimal 18 tahun dan keamanan komunitas.
              </li>
              <li>
                <strong>Data Kontak:</strong> Alamat email dan nomor telepon/WhatsApp aktif.
              </li>
              <li>
                <strong>Data Profil Publik:</strong> Foto profil, deskripsi hobi, minat sosial, dan ketersediaan waktu. (Nomor KTP dan alamat pribadi tidak pernah ditampilkan kepada publik).
              </li>
              <li>
                <strong>Data Transaksi:</strong> Riwayat booking dan nomor rekening tujuan pencairan bagi Talent.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              3. Penggunaan & Pembatasan Informasi
            </h2>
            <p>
              Data pribadi dirancang semata-mata untuk memfasilitasi operasional layanan marketplace, pencocokan jadwal aktivitas sosial, pemrosesan transaksi yang aman, dan pencegahan tindakan kriminal atau pelanggaran etika.
            </p>
            <p>
              <strong>YUKU tidak pernah menjual, menyewakan, atau memperdagangkan data pribadi pengguna kepada pihak ketiga untuk kepentingan periklanan.</strong>
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              4. Komitmen Pengamanan Data
            </h2>
            <p>
              YUKU menerapkan standar perlindungan data dan pembatasan akses sesuai UU Perlindungan Data Pribadi (UU PDP) Indonesia. Dokumen e-KTP dan swafoto disimpan di penyimpanan privat terisolasi dan hanya dapat ditinjau oleh tim admin yang berwenang untuk keperluan verifikasi.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              5. Hak Pengguna & Pengajuan Informasi
            </h2>
            <p>
              Anda memiliki hak untuk memperbarui informasi profil Anda, meminta salinan data pribadi, atau mengajukan permohonan penutupan akun dengan menghubungi Pusat Bantuan YUKU melalui <a href="mailto:halo@yuku.co.id" className="text-purple-700 underline font-semibold">halo@yuku.co.id</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
