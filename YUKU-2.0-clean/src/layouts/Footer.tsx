import React from 'react';
import { BrandLogo } from '../components/common/BrandLogo';
import { AppRoute } from '../types/navigation';
import { ShieldCheck, Heart, MapPin, Mail } from 'lucide-react';

interface FooterProps {
  onNavigate: (path: AppRoute) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="bg-[#140624] text-slate-400 pt-16 pb-12 border-t border-purple-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-purple-900/40">
          {/* Brand Col */}
          <div className="lg:col-span-2 space-y-4">
            <BrandLogo size="md" showTagline={true} inverted={true} />
            <p className="text-xs text-slate-400 leading-relaxed max-w-sm mt-3">
              YUKU adalah platform Social Experience & Paid Companionship Marketplace pertama di Indonesia yang menghubungkan individu untuk berbagi momen aktivitas sosial yang positif, aman, dan beradab.
            </p>
            <div className="flex items-center gap-2 text-xs text-purple-300/80">
              <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Beroperasi di Seluruh Indonesia</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-purple-300/80">
              <Mail className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>halo@yuku.co.id</span>
            </div>
          </div>

          {/* Quick Nav Col */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4">
              Navigasi
            </h4>
            <ul className="space-y-2.5 text-xs">
              <li>
                <button
                  onClick={() => onNavigate('/')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Beranda
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/talent')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Jelajahi Talent
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/cara-kerja')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Cara Kerja
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/daftar-talent')}
                  className="hover:text-white transition-colors cursor-pointer text-amber-400 font-semibold"
                >
                  Daftar Jadi Talent
                </button>
              </li>
            </ul>
          </div>

          {/* Company & Support Col */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4">
              Informasi
            </h4>
            <ul className="space-y-2.5 text-xs">
              <li>
                <button
                  onClick={() => onNavigate('/tentang')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Tentang YUKU
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/faq')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  FAQ & Tanya Jawab
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/bantuan')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Pusat Bantuan
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/login')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Masuk Akun
                </button>
              </li>
            </ul>
          </div>

          {/* Legal & Compliance Col */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4">
              Ketentuan Hukum
            </h4>
            <ul className="space-y-2.5 text-xs">
              <li>
                <button
                  onClick={() => onNavigate('/syarat-ketentuan')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Syarat & Ketentuan
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/kebijakan-privasi')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Kebijakan Privasi
                </button>
              </li>
              <li className="pt-2 text-[11px] text-purple-300/70 leading-normal">
                Strict 18+ Verification Policy. Non-sexual & Non-dating companionship platform.
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar with Mandatory Legal Disclaimers */}
        <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <p>
            © {new Date().getFullYear()} YUKU (PT Inovasi Sosial Teman Indonesia). Seluruh hak cipta dilindungi undang-undang.
          </p>
          <div className="flex items-center gap-4 text-purple-300/80">
            <span>Usia Minimum 18 Tahun</span>
            <span>·</span>
            <span>Bukan Aplikasi Kencan</span>
            <span>·</span>
            <span className="text-purple-200/80">Ruang Publik & Aman</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
