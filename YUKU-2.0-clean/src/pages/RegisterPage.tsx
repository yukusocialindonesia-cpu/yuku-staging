import React, { useState } from 'react';
import { BrandLogo } from '../components/common/BrandLogo';
import { User, Mail, Lock, Phone, ArrowRight, CheckCircle2, ShieldCheck, AlertCircle } from 'lucide-react';
import { AppRoute } from '../types/navigation';
import { supabase } from '../lib/supabase';

interface RegisterPageProps {
  onNavigate: (path: AppRoute) => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({ onNavigate }) => {
  const [role, setRole] = useState<'customer' | 'talent'>('customer');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [agreeAge, setAgreeAge] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (password.length < 8) {
      setErrorMsg('Kata sandi minimal 8 karakter');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            phone_number: phone,
            user_role: role,
          },
        },
      });

      if (error) {
        setErrorMsg(error.message);
      } else {
        setIsRegistered(true);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat pendaftaran.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="py-12 px-4 flex items-center justify-center bg-[#FAF8FC]">
      <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200/90 shadow-xl p-6 sm:p-8 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <BrandLogo size="md" showTagline={false} />
          <h1 className="text-2xl font-black text-[#1E0938] tracking-tight">
            Buat Akun YUKU
          </h1>
          <p className="text-xs text-slate-500">
            Daftar untuk menikmati pengalaman sosial teman aktivitas berbayar yang aman dan terpercaya.
          </p>
        </div>

        {/* Role Segmented */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl text-xs font-bold">
          <button
            type="button"
            onClick={() => setRole('customer')}
            className={`py-2 rounded-lg transition-all cursor-pointer ${
              role === 'customer'
                ? 'bg-white text-purple-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sebagai Customer
          </button>
          <button
            type="button"
            onClick={() => {
              setRole('talent');
              onNavigate('/daftar-talent');
            }}
            className={`py-2 rounded-lg transition-all cursor-pointer ${
              role === 'talent'
                ? 'bg-white text-purple-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sebagai Talent
          </button>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{errorMsg}</p>
          </div>
        )}

        {!isRegistered ? (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Nama Lengkap (sesuai KTP) *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="Nama Lengkap"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Alamat Email Aktif *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="nama@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Nomor WhatsApp Aktif *
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  required
                  placeholder="08123456789"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Kata Sandi *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Minimal 8 karakter"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 text-xs"
                />
              </div>
            </div>

            {/* Checkboxes */}
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <label className="flex items-start gap-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  required
                  checked={agreeAge}
                  onChange={(e) => setAgreeAge(e.target.checked)}
                  className="accent-purple-700 rounded mt-0.5"
                />
                <span>
                  Saya menyatakan telah <strong>berusia minimal 18 tahun</strong> dan bersedia
                  verifikasi identitas.
                </span>
              </label>

              <label className="flex items-start gap-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  required
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="accent-purple-700 rounded mt-0.5"
                />
                <span>
                  Saya memahami YUKU <strong>bukan platform kencan/seksual</strong> dan menyetujui
                  Syarat & Ketentuan serta Kebijakan Privasi.
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-purple-700 to-fuchsia-700 hover:from-purple-800 hover:to-fuchsia-800 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer mt-2 disabled:opacity-50"
            >
              <span>{loading ? 'Memproses...' : 'Daftar Akun'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <div className="py-6 text-center space-y-3">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">
              Pendaftaran Akun Berhasil
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Akun Anda telah berhasil dibuat di Supabase. Silakan masuk untuk mulai menggunakan YUKU.
            </p>
            <button
              onClick={() => onNavigate('/login')}
              className="px-4 py-2 bg-purple-700 text-white text-xs font-semibold rounded-lg hover:bg-purple-800"
            >
              Masuk ke Halaman Login
            </button>
          </div>
        )}

        {/* Footer Link */}
        <div className="text-center pt-2 border-t border-slate-100 text-xs text-slate-500">
          Sudah memiliki akun?{' '}
          <button
            onClick={() => onNavigate('/login')}
            className="text-purple-700 font-bold hover:underline"
          >
            Masuk di Sini
          </button>
        </div>
      </div>
    </div>
  );
};
