import React, { useEffect, useState } from 'react';
import { Lock, ArrowRight, CheckCircle2, AlertCircle, Eye, EyeOff, KeyRound } from 'lucide-react';
import { BrandLogo } from '../components/common/BrandLogo';
import { AppRoute } from '../types/navigation';
import { supabase } from '../lib/supabase';

interface ResetPasswordPageProps {
  onNavigate: (path: AppRoute) => void;
  initialRecoveryActive?: boolean;
}

function translateRecoveryError(message?: string): string {
  const msg = (message || '').toLowerCase();
  if (msg.includes('different from the old password') || msg.includes('same password')) {
    return 'Kata sandi baru harus berbeda dari kata sandi sebelumnya.';
  }
  if (msg.includes('at least') || msg.includes('weak')) {
    return 'Kata sandi baru terlalu lemah. Gunakan minimal 8 karakter yang kuat.';
  }
  if (msg.includes('expired') || msg.includes('invalid') || msg.includes('session')) {
    return 'Sesi reset kata sandi tidak valid atau sudah kedaluwarsa. Silakan minta tautan baru.';
  }
  return message || 'Gagal mengatur ulang kata sandi. Silakan coba lagi.';
}

export const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({
  onNavigate,
  initialRecoveryActive = false,
}) => {
  const [isCheckingSession, setIsCheckingSession] = useState(!initialRecoveryActive);
  const [hasRecoverySession, setHasRecoverySession] = useState(initialRecoveryActive);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (initialRecoveryActive) {
      setHasRecoverySession(true);
      setIsCheckingSession(false);
    }
  }, [initialRecoveryActive]);

  useEffect(() => {
    let isMounted = true;
    let recoveryDetected = initialRecoveryActive;

    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
    const searchParams = new URLSearchParams(search);

    const hasErrorInUrl =
      Boolean(hashParams.get('error')) ||
      Boolean(hashParams.get('error_code')) ||
      Boolean(searchParams.get('error')) ||
      Boolean(searchParams.get('error_code'));

    if (hasErrorInUrl) {
      setHasRecoverySession(false);
      setIsCheckingSession(false);
      return;
    }

    const hasRecoveryParam =
      hashParams.get('type') === 'recovery' ||
      searchParams.get('type') === 'recovery';

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (event === 'PASSWORD_RECOVERY' && session) {
        recoveryDetected = true;
        setHasRecoverySession(true);
        setIsCheckingSession(false);
      } else if (event === 'SIGNED_OUT') {
        setHasRecoverySession(false);
      }
    });

    const hasAuthCode = Boolean(searchParams.get('code')) || Boolean(hashParams.get('access_token'));

    const fallbackTimer = window.setTimeout(() => {
      if (!isMounted || recoveryDetected) return;
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!isMounted || recoveryDetected) return;
        if (hasRecoveryParam && session) {
          setHasRecoverySession(true);
        } else {
          setHasRecoverySession(false);
        }
        setIsCheckingSession(false);
      });
    }, hasAuthCode || hasRecoveryParam ? 800 : 150);

    return () => {
      isMounted = false;
      window.clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (newPassword.length < 8) {
      setErrorMsg('Kata sandi baru minimal harus 8 karakter.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Konfirmasi kata sandi baru tidak cocok.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setErrorMsg(translateRecoveryError(error.message));
        return;
      }

      setSuccessMsg('Kata sandi berhasil diperbarui. Anda sekarang dapat masuk menggunakan kata sandi baru.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setErrorMsg(translateRecoveryError(err?.message));
    } finally {
      setLoading(false);
    }
  };

  if (isCheckingSession) {
    return (
      <div className="py-16 px-4 flex items-center justify-center bg-[#FAF8FC]">
        <div className="text-xs font-semibold text-slate-500">Memverifikasi tautan reset kata sandi...</div>
      </div>
    );
  }

  return (
    <div className="py-12 px-4 flex items-center justify-center bg-[#FAF8FC]">
      <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200/90 shadow-xl p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <BrandLogo size="md" showTagline={false} />
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 border border-purple-100 text-[11px] font-bold text-purple-800">
            <KeyRound className="w-3.5 h-3.5" />
            <span>Pemulihan Akun</span>
          </div>
          <h1 className="text-2xl font-black text-[#1E0938] tracking-tight">
            Reset Kata Sandi
          </h1>
          <p className="text-xs text-slate-500">
            Buat kata sandi baru untuk akun YUKU Anda.
          </p>
        </div>

        {!hasRecoverySession && !successMsg ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Tautan reset kata sandi tidak valid atau sudah kedaluwarsa. Silakan ajukan permintaan reset kata sandi baru.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/lupa-sandi')}
              className="w-full py-3 bg-gradient-to-r from-purple-700 to-fuchsia-700 hover:from-purple-800 hover:to-fuchsia-800 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Minta Tautan Reset Baru</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">{errorMsg}</p>
              </div>
            )}

            {successMsg ? (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">{successMsg}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('/login')}
                  className="w-full py-3 bg-gradient-to-r from-purple-700 to-fuchsia-700 hover:from-purple-800 hover:to-fuchsia-800 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Masuk ke Akun</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Kata Sandi Baru
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      placeholder="Minimal 8 karakter"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      aria-label={showNewPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Konfirmasi Kata Sandi Baru
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      placeholder="Ulangi kata sandi baru"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      aria-label={showConfirmPassword ? 'Sembunyikan konfirmasi kata sandi' : 'Lihat konfirmasi kata sandi'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-purple-700 to-fuchsia-700 hover:from-purple-800 hover:to-fuchsia-800 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <span>{loading ? 'Menyimpan...' : 'Simpan Kata Sandi Baru'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
};
