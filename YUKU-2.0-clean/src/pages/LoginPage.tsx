import React, { useState } from 'react';
import { BrandLogo } from '../components/common/BrandLogo';
import { Lock, Mail, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { AppRoute } from '../types/navigation';
import { supabase } from '../lib/supabase';

interface LoginPageProps {
  onNavigate: (path: AppRoute) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMsg(error.message);
      } else if (data.user) {
        const { data: userRow } = await supabase
          .from('users')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle();

        // Jika ada isian pendaftaran talent yang tersimpan (dibuat sebelum konfirmasi email),
        // lanjutkan langsung ke formulir agar pengguna tidak tersesat di dashboard kosong.
        let hasTalentDraft = false;
        try {
          hasTalentDraft = Boolean(localStorage.getItem('yuku_talent_registration_draft'));
        } catch {
          // Abaikan jika penyimpanan browser tidak tersedia
        }

        const targetRoute: AppRoute =
          userRow?.role === 'admin'
            ? '/admin'
            : hasTalentDraft
            ? '/daftar-talent'
            : userRow?.role === 'talent'
            ? '/dashboard-talent'
            : '/talent';

        setSuccessMsg(`Selamat datang kembali, ${data.user.email}!`);
        setTimeout(() => {
          onNavigate(targetRoute);
        }, 1200);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal masuk ke akun.');
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
            Masuk ke Akun YUKU
          </h1>
          <p className="text-xs text-slate-500">
            Masuk untuk mengelola jadwal teman aktivitas atau profil Talent-mu.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{errorMsg}</p>
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{successMsg}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Alamat Email
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
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-slate-700">Kata Sandi</label>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 text-xs"
              />
            </div>
            <div className="flex justify-end mt-1.5">
              <button
                type="button"
                onClick={() => onNavigate('/lupa-sandi')}
                className="text-[11px] font-bold text-purple-700 hover:underline cursor-pointer"
              >
                Lupa kata sandi?
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-600">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" className="accent-purple-700 rounded" />
              <span>Ingat saya</span>
            </label>
            <span className="text-slate-400">Verifikasi 18+</span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-purple-700 to-fuchsia-700 hover:from-purple-800 hover:to-fuchsia-800 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <span>{loading ? 'Memproses...' : 'Masuk Akun'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Footer Link */}
        <div className="text-center pt-2 border-t border-slate-100 text-xs text-slate-500">
          Belum punya akun YUKU?{' '}
          <button
            onClick={() => onNavigate('/register')}
            className="text-purple-700 font-bold hover:underline"
          >
            Daftar Sekarang
          </button>
        </div>
      </div>
    </div>
  );
};
