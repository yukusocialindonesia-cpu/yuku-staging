import React from 'react';
import { ShieldCheck, Ban, FileText, CheckCircle2, AlertOctagon } from 'lucide-react';
import { YUKU_BUSINESS_RULES } from '../utils/businessRules';
import { formatRupiah } from '../utils/formatters';

export const TermsPage: React.FC = () => {
  return (
    <div className="py-12 bg-[#FAF8FC]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 pb-6 border-b border-slate-200">
          <div className="flex items-center gap-2 text-xs font-bold text-purple-700 uppercase tracking-wider mb-2">
            <FileText className="w-4 h-4" />
            <span>Dokumen Ketentuan Layanan</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-[#1E0938] tracking-tight mb-2">
            Syarat dan Ketentuan Penggunaan YUKU
          </h1>
          <p className="text-xs text-slate-500">
            Terakhir Diperbarui: November 2026 · Berlaku untuk seluruh pengguna di Indonesia
          </p>
        </div>

        {/* Highlight Alert */}
        <div className="p-4 rounded-2xl bg-purple-950 text-white mb-8 border border-purple-900 space-y-2 text-xs leading-relaxed">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <span>Prinsip Fundamental Platform YUKU</span>
          </div>
          <p className="text-purple-200/90">
            YUKU adalah platform Social Experience & Paid Companionship Marketplace. YUKU secara tegas <strong>BUKAN aplikasi kencan (dating app)</strong> dan <strong>BUKAN penyedia layanan seksual dalam bentuk apa pun</strong>. Seluruh pengguna wajib berusia minimal <strong>18 tahun</strong>.
          </p>
        </div>

        {/* Terms Articles */}
        <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-10 shadow-xs space-y-8 text-xs sm:text-sm text-slate-700 leading-relaxed">
          {/* Pasal 1 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              1. Definisi dan Ruang Lingkup Layanan
            </h2>
            <p>
              1.1 <strong>YUKU</strong> adalah platform marketplace yang mempertemukan pengguna (Customer) dengan mitra penyedia jasa pertemanan sosial (Talent) untuk menemani aktivitas seperti ngopi, kulineran, jalan santai, menonton film, menghadiri acara sosial/formal, atau berdiskusi secara daring (online).
            </p>
            <p>
              1.2 Pembayaran melalui platform dan sistem escrow dirancang untuk melindungi transaksi antara Customer dan Talent. Pemesanan yang diajukan menunggu penyelesaian pembayaran sebelum dikonfirmasi oleh Talent.
            </p>
          </section>

          {/* Pasal 2 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              2. Kriteria Pengguna & Verifikasi Usia 18+
            </h2>
            <p>
              2.1 Pengguna (baik Customer maupun Talent) wajib berusia <strong>minimal 18 (delapan belas) tahun</strong> pada saat pendaftaran akun.
            </p>
            <p>
              2.2 YUKU mensyaratkan verifikasi identitas resmi (e-KTP dan swafoto) bagi Customer maupun Talent sebelum dapat mengajukan pemesanan atau tampil di katalog publik.
            </p>
          </section>

          {/* Pasal 3 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              3. Batasan Etika, Larangan Kencan & Layanan Seksual
            </h2>
            <p>
              3.1 Dilarang keras meminta, menawarkan, memfasilitasi, atau melakukan kontak fisik intim, aktivitas bernuansa asmara, atau segala bentuk layanan prostitusi/seksual.
            </p>
            <p>
              3.2 Pertemuan offline (tatap muka) <strong>hanya diizinkan di tempat umum / ruang publik terbuka</strong> (contoh: kafe, restoran, pusat perbelanjaan, bioskop, atau tempat acara publik). Dilarang keras melakukan pertemuan di kamar hotel tertutup, indekos, apartemen privat, atau kediaman pribadi.
            </p>
            <p>
              3.3 Pelanggaran terhadap pasal ini akan berakibat pemblokiran permanen serta pelaporan kepada pihak berwajib jika mengandung unsur pidana.
            </p>
          </section>

          {/* Pasal 4 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              4. Ketentuan Finansial & Pencairan Pendapatan
            </h2>
            <p>
              4.1 <strong>Kompensasi Talent:</strong> Talent berhak menerima kompensasi atas setiap sesi aktivitas sosial yang diselesaikan secara valid dan profesional sesuai ketentuan platform.
            </p>
            <p>
              4.2 <strong>Layanan Platform:</strong> YUKU mengelola platform, keamanan, dan dukungan teknis untuk menjamin kelancaran transaksi dan interaksi antara Customer dan Talent.
            </p>
            <p>
              4.3 <strong>Program Komunitas:</strong> Pengguna atau Talent yang mengajak rekan berkualitas berhak menerima apresiasi atau bonus komunitas atas transaksi yang memenuhi syarat sesuai kebijakan internal platform.
            </p>
            <p>
              4.4 <strong>Ketentuan Komunitas:</strong> Apresiasi komunitas hanya berlaku untuk transaksi yang valid, selesai, dan pembayarannya terverifikasi. Apresiasi tidak berlaku untuk transaksi pembatalan, pengembalian dana (refund), maupun rujukan diri sendiri.
            </p>
            <p>
              4.5 <strong>Batas Minimum Pencairan Dana:</strong> Penarikan saldo pendapatan Talent ke rekening bank lokal terdaftar memiliki nilai minimum <strong>{formatRupiah(YUKU_BUSINESS_RULES.minPayoutAmount)}</strong>.
            </p>
          </section>

          {/* Pasal 5 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              5. Pembatalan dan Pengembalian Dana
            </h2>
            <p>
              5.1 Rancangan sistem mengizinkan pengembalian dana jika pembatalan dilakukan sesuai ketentuan sebelum waktu pertemuan. Transaksi yang dibatalkan atau direfund tidak menghasilkan komisi referral.
            </p>
            <p>
              5.2 Talent berhak menolak atau menghentikan sesi sewaktu-waktu jika Customer melanggar batas kenyamanan atau etika ruang publik.
            </p>
          </section>

          {/* Pasal 6 */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              6. Ketersediaan Layanan & Pembaruan Sistem
            </h2>
            <p>
              6.1 Pendaftaran akun, pengajuan verifikasi identitas e-KTP, penelusuran katalog Talent, dan pengajuan jadwal pemesanan beroperasi secara langsung pada sistem YUKU. Fitur integrasi kanal pembayaran otomatis terus dikembangkan mengikuti kesiapan mitra pembayaran resmi.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
