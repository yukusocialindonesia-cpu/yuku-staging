import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Upload,
  FileCheck,
  Loader2,
  User,
  Calendar,
  Phone,
  CreditCard,
  ArrowRight,
  RefreshCw,
  Lock,
  Camera,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AppRoute } from '../types/navigation';

interface VerifyKtpPageProps {
  onNavigate: (path: AppRoute) => void;
}

interface IdentityRecord {
  id: string;
  full_legal_name: string;
  date_of_birth: string;
  ktp_number: string | null;
  ktp_storage_path: string | null;
  ktp_verification_status: 'unsubmitted' | 'pending_review' | 'verified' | 'rejected';
  ktp_rejection_reason: string | null;
  emergency_contact_phone: string | null;
}

interface UserAccountInfo {
  account_status: string;
  is_verified_18: boolean;
  full_name: string | null;
  phone_number: string | null;
}

export const VerifyKtpPage: React.FC<VerifyKtpPageProps> = ({ onNavigate }) => {
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [identity, setIdentity] = useState<IdentityRecord | null>(null);
  const [userInfo, setUserInfo] = useState<UserAccountInfo | null>(null);

  // Max DOB for 18+
  const maxDobDate = new Date();
  maxDobDate.setFullYear(maxDobDate.getFullYear() - 18);
  const maxDobString = maxDobDate.toISOString().split('T')[0];

  // Form state
  const [fullLegalName, setFullLegalName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('2000-01-15');
  const [ktpNumber, setKtpNumber] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [ktpFile, setKtpFile] = useState<File | null>(null);
  const [ktpPreviewUrl, setKtpPreviewUrl] = useState<string | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreviewUrl, setSelfiePreviewUrl] = useState<string | null>(null);
  const [agreeStatement, setAgreeStatement] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadIdentityData = useCallback(async (user: any) => {
    setIsLoadingData(true);
    setErrorMessage(null);
    try {
      const [{ data: idData, error: idErr }, { data: uData, error: uErr }] = await Promise.all([
        supabase
          .from('user_identities')
          .select(
            'id, full_legal_name, date_of_birth, ktp_number, ktp_storage_path, ktp_verification_status, ktp_rejection_reason, emergency_contact_phone'
          )
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('users')
          .select('account_status, is_verified_18, full_name, phone_number')
          .eq('id', user.id)
          .maybeSingle(),
      ]);

      if (idErr) {
        throw new Error(`Gagal memuat status verifikasi KTP: ${idErr.message}`);
      }
      if (uErr) {
        console.warn('Gagal membaca info akun:', uErr.message);
      }

      const typedId = (idData as IdentityRecord | null) ?? null;
      const typedUser = (uData as UserAccountInfo | null) ?? null;

      setIdentity(typedId);
      setUserInfo(typedUser);

      setFullLegalName(
        typedId?.full_legal_name ||
          typedUser?.full_name ||
          user.user_metadata?.full_name ||
          ''
      );
      if (typedId?.date_of_birth) {
        setDateOfBirth(typedId.date_of_birth);
      }
      if (typedId?.ktp_number) {
        setKtpNumber(typedId.ktp_number);
      }
      setEmergencyPhone(
        typedId?.emergency_contact_phone ||
          typedUser?.phone_number ||
          user.user_metadata?.phone_number ||
          ''
      );
    } catch (err: any) {
      setErrorMessage(err?.message || 'Terjadi kesalahan saat memeriksa data identitas.');
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null;
      setCurrentUser(user);
      setIsCheckingAuth(false);
      if (user) {
        loadIdentityData(user);
      } else {
        setIsLoadingData(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setCurrentUser(user);
      setIsCheckingAuth(false);
      if (user) {
        loadIdentityData(user);
      } else {
        setIdentity(null);
        setUserInfo(null);
        setIsLoadingData(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadIdentityData]);

  useEffect(() => {
    return () => {
      if (ktpPreviewUrl) URL.revokeObjectURL(ktpPreviewUrl);
    };
  }, [ktpPreviewUrl]);

  useEffect(() => {
    return () => {
      if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl);
    };
  }, [selfiePreviewUrl]);

  const validateAndSelectImage = (
    e: React.ChangeEvent<HTMLInputElement>,
    label: string,
    setFile: React.Dispatch<React.SetStateAction<File | null>>,
    setPreview: React.Dispatch<React.SetStateAction<string | null>>
  ) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setFile(null);
      setPreview(null);
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    if (!allowedTypes.includes(file.type) || !allowedExtensions.includes(ext)) {
      setErrorMessage(
        `Format file ${label} tidak valid. Gunakan gambar JPG, JPEG, PNG, atau WEBP.`
      );
      e.target.value = '';
      setFile(null);
      setPreview(null);
      return;
    }

    if (file.size === 0 || file.size > 5 * 1024 * 1024) {
      setErrorMessage(`Ukuran file ${label} harus lebih dari 0 KB dan maksimal 5 MB.`);
      e.target.value = '';
      setFile(null);
      setPreview(null);
      return;
    }

    setErrorMessage(null);
    setFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    if (!fullLegalName.trim()) {
      setErrorMessage('Nama lengkap sesuai e-KTP wajib diisi.');
      return;
    }

    if (!/^\d{16}$/.test(ktpNumber.trim())) {
      setErrorMessage('Nomor NIK e-KTP wajib terdiri dari tepat 16 digit angka.');
      return;
    }

    if (!emergencyPhone.trim() || emergencyPhone.trim().length < 8) {
      setErrorMessage('Nomor WhatsApp / kontak darurat aktif wajib diisi dengan benar.');
      return;
    }

    // Age 18+ validation
    const birthDate = new Date(dateOfBirth);
    if (isNaN(birthDate.getTime())) {
      setErrorMessage('Tanggal lahir tidak valid.');
      return;
    }
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    if (age < 18) {
      setErrorMessage('Pengguna YUKU wajib berusia minimal 18 tahun sesuai KTP.');
      return;
    }

    if (!ktpFile) {
      setErrorMessage('Harap unggah foto e-KTP yang jelas dan terbaca.');
      return;
    }

    if (!selfieFile) {
      setErrorMessage('Harap unggah swafoto (selfie) sambil memegang e-KTP.');
      return;
    }

    if (!agreeStatement) {
      setErrorMessage('Harap centang pernyataan keaslian dokumen e-KTP dan swafoto.');
      return;
    }

    setIsSubmitting(true);

    try {
      const timestamp = Date.now();

      // 1. Upload Foto KTP & Swafoto KTP to private bucket ktp-documents with upsert: false
      const ktpExt = ktpFile.name.split('.').pop() || 'jpg';
      const ktpStoragePath = `${currentUser.id}/ktp_${timestamp}.${ktpExt}`;

      const selfieExt = selfieFile.name.split('.').pop() || 'jpg';
      const selfieStoragePath = `${currentUser.id}/selfie_${timestamp}.${selfieExt}`;

      const [ktpUploadRes, selfieUploadRes] = await Promise.all([
        supabase.storage.from('ktp-documents').upload(ktpStoragePath, ktpFile, {
          upsert: false,
        }),
        supabase.storage.from('ktp-documents').upload(selfieStoragePath, selfieFile, {
          upsert: false,
        }),
      ]);

      if (ktpUploadRes.error || !ktpUploadRes.data) {
        throw new Error(
          `Gagal mengunggah foto e-KTP: ${ktpUploadRes.error?.message || 'Upload gagal'}`
        );
      }

      if (selfieUploadRes.error || !selfieUploadRes.data) {
        throw new Error(
          `Gagal mengunggah swafoto dengan KTP: ${selfieUploadRes.error?.message || 'Upload gagal'}`
        );
      }

      // 2. Check if user_identities row already exists (never send ktp_verification_status or id on update)
      const { data: existingRow, error: lookupError } = await supabase
        .from('user_identities')
        .select('id')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (lookupError) {
        throw new Error(`Gagal memeriksa data identitas: ${lookupError.message}`);
      }

      const identityFields = {
        full_legal_name: fullLegalName.trim(),
        date_of_birth: dateOfBirth,
        ktp_number: ktpNumber.trim(),
        ktp_storage_path: ktpStoragePath,
        emergency_contact_phone: emergencyPhone.trim(),
      };

      const { error: saveError } = existingRow
        ? await supabase
            .from('user_identities')
            .update(identityFields)
            .eq('id', currentUser.id)
        : await supabase
            .from('user_identities')
            .insert({ id: currentUser.id, ...identityFields });

      if (saveError) {
        throw new Error(`Gagal menyimpan pengajuan verifikasi KTP: ${saveError.message}`);
      }

      setKtpFile(null);
      setKtpPreviewUrl(null);
      setSelfieFile(null);
      setSelfiePreviewUrl(null);
      setSuccessMessage(
        'Foto e-KTP dan swafoto Anda berhasil diunggah! Tim Admin YUKU akan meninjau dokumen Anda sebelum fitur booking aktif.'
      );
      await loadIdentityData(currentUser);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Terjadi kesalahan saat mengirim verifikasi KTP.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const maskNik = (nik: string | null) => {
    if (!nik || nik.length < 8) return nik || '-';
    return `${nik.slice(0, 4)}••••••••${nik.slice(-4)}`;
  };

  if (isCheckingAuth || (currentUser && isLoadingData && !identity && !errorMessage)) {
    return (
      <div className="py-24 bg-[#FAF8FC] min-h-[60vh] flex items-center justify-center">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin text-purple-700" />
          <span>Memeriksa status verifikasi KTP Anda...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="py-16 bg-[#FAF8FC] min-h-[60vh]">
        <div className="max-w-md mx-auto px-4 text-center bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="w-14 h-14 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            Masuk untuk Verifikasi e-KTP 18+
          </h1>
          <p className="text-xs text-slate-500 leading-relaxed">
            Demi keamanan komunitas YUKU, setiap Customer wajib menyelesaikan verifikasi e-KTP terlebih dahulu sebelum dapat membuat reservasi booking.
          </p>
          <div className="pt-2 flex flex-col gap-2.5">
            <button
              onClick={() => onNavigate('/login')}
              className="w-full py-3 bg-purple-700 text-white font-bold text-xs rounded-xl hover:bg-purple-800 shadow-xs cursor-pointer"
            >
              Masuk ke Akun
            </button>
            <button
              onClick={() => onNavigate('/register')}
              className="w-full py-3 bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl hover:bg-slate-200 cursor-pointer"
            >
              Belum Punya Akun? Daftar Customer
            </button>
          </div>
        </div>
      </div>
    );
  }

  const ktpStatus = identity?.ktp_verification_status || 'unsubmitted';
  const isFullyVerified = ktpStatus === 'verified';

  return (
    <div className="py-12 bg-[#FAF8FC] min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Page Header */}
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <span className="text-xs font-bold text-purple-700 tracking-wider uppercase block">
            Keamanan & Perlindungan Komunitas 18+
          </span>
          <h1 className="text-2xl sm:text-4xl font-black text-[#1E0938] tracking-tight">
            Verifikasi Identitas e-KTP Customer
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Verifikasi e-KTP hanya dilakukan satu kali. Dokumen Anda disimpan aman di penyimpanan privat terisolasi dan hanya ditinjau oleh Admin YUKU.
          </p>
        </div>

        {/* Alerts */}
        {errorMessage && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2.5 shadow-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <p className="font-medium leading-relaxed">{errorMessage}</p>
          </div>
        )}

        {successMessage && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2.5 shadow-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="font-medium leading-relaxed">{successMessage}</p>
          </div>
        )}

        {/* CASE 1: VERIFIED */}
        {isFullyVerified && identity && (
          <div className="bg-white rounded-3xl border border-emerald-200 p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-7 h-7" />
                </div>
                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold mb-1">
                    Terverifikasi 18+
                  </span>
                  <h2 className="text-lg font-extrabold text-slate-900">
                    Identitas e-KTP Anda Sudah Terverifikasi
                  </h2>
                </div>
              </div>
              <button
                onClick={() => onNavigate('/talent')}
                className="px-5 py-2.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer inline-flex items-center justify-center gap-1.5"
              >
                <span>Jelajahi Talent & Booking</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-xs">
              <div>
                <span className="text-slate-400 font-semibold block">Nama Legal Sesuai KTP</span>
                <span className="font-bold text-slate-900">{identity.full_legal_name}</span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block">Nomor NIK</span>
                <span className="font-mono font-bold text-slate-900">{maskNik(identity.ktp_number)}</span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block">Status Akun</span>
                <span className="font-bold text-emerald-700">
                  {userInfo?.account_status === 'active' && userInfo?.is_verified_18
                    ? 'Aktif & Memenuhi Syarat Booking'
                    : userInfo?.account_status || 'Terverifikasi'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block">Kontak Darurat / WA</span>
                <span className="font-semibold text-slate-800">{identity.emergency_contact_phone || '-'}</span>
              </div>
            </div>
          </div>
        )}

        {/* CASE 2: PENDING REVIEW */}
        {ktpStatus === 'pending_review' && identity && (
          <div className="bg-white rounded-3xl border border-amber-200 p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Clock className="w-7 h-7" />
                </div>
                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold mb-1">
                    Menunggu Peninjauan Admin (pending_review)
                  </span>
                  <h2 className="text-lg font-extrabold text-slate-900">
                    Dokumen e-KTP Anda Sedang Diverifikasi
                  </h2>
                </div>
              </div>

              <button
                onClick={() => loadIdentityData(currentUser)}
                disabled={isLoadingData}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer inline-flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? 'animate-spin' : ''}`} />
                <span>Perbarui Status</span>
              </button>
            </div>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 leading-relaxed">
              Berkas e-KTP Anda telah diterima oleh sistem YUKU dan terkunci selama proses pemeriksaan Admin. Setelah status berubah menjadi <strong>verified</strong>, Anda dapat langsung mengajukan reservasi booking ke Talent pilihan Anda.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-xs">
              <div>
                <span className="text-slate-400 font-semibold block">Nama Legal</span>
                <span className="font-bold text-slate-900">{identity.full_legal_name}</span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block">Nomor NIK</span>
                <span className="font-mono font-bold text-slate-900">{maskNik(identity.ktp_number)}</span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block">Tanggal Lahir</span>
                <span className="font-semibold text-slate-800">{identity.date_of_birth}</span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold block">Dokumen Terunggah</span>
                <span className="font-semibold text-purple-800 flex items-center gap-1">
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>Berkas KTP tersimpan di storage privat</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* CASE 3 & 4: UNSUBMITTED OR REJECTED -> SHOW FORM */}
        {(ktpStatus === 'unsubmitted' || ktpStatus === 'rejected') && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Guidelines */}
            <div className="lg:col-span-5 space-y-5">
              {ktpStatus === 'rejected' && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 space-y-2 text-xs text-rose-900">
                  <div className="font-bold flex items-center gap-1.5 text-rose-800">
                    <AlertCircle className="w-4 h-4" />
                    <span>Pengajuan Sebelumnya Ditolak</span>
                  </div>
                  <p className="leading-relaxed">
                    <strong>Alasan Admin:</strong>{' '}
                    {identity?.ktp_rejection_reason || 'Dokumen KTP kurang jelas atau data tidak sesuai. Silakan unggah ulang foto e-KTP yang valid.'}
                  </p>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-purple-700" />
                  <span>Panduan Foto e-KTP yang Valid</span>
                </h2>
                <ul className="space-y-2.5 text-xs text-slate-600">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Gunakan e-KTP asli milik sendiri yang masih berlaku dan berusia minimal 18 tahun.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Pastikan seluruh sudut KTP masuk frame, teks NIK dan nama terbaca jelas, dan tidak silau pantulan cahaya.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Dokumen dilindungi RLS storage privat terenkripsi dan tidak pernah ditampilkan ke Talent maupun publik.</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Right Form */}
            <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-sm">
              <div className="mb-6">
                <h2 className="text-xl font-extrabold text-slate-900">
                  {ktpStatus === 'rejected'
                    ? 'Ajukan Ulang Verifikasi e-KTP'
                    : 'Formulir Verifikasi e-KTP Customer'}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Terhubung sebagai <strong>{currentUser.email}</strong>
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nama Lengkap (Sesuai e-KTP) *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="Contoh: Budi Santoso"
                      value={fullLegalName}
                      onChange={(e) => setFullLegalName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Tanggal Lahir (Minimal 18+) *
                    </label>
                    <div className="relative">
                      <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="date"
                        required
                        max={maxDobString}
                        value={dateOfBirth}
                        onChange={(e) => setDateOfBirth(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Nomor WhatsApp / Kontak Darurat *
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        required
                        placeholder="08123456789"
                        value={emergencyPhone}
                        onChange={(e) => setEmergencyPhone(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nomor Induk Kependudukan (16 Digit NIK e-KTP) *
                  </label>
                  <div className="relative">
                    <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      minLength={16}
                      maxLength={16}
                      placeholder="Masukkan 16 digit NIK sesuai e-KTP"
                      value={ktpNumber}
                      onChange={(e) => setKtpNumber(e.target.value.replace(/\D/g, ''))}
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-600 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Upload Foto KTP */}
                  <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-2xl space-y-2.5">
                    <label className="block font-bold text-slate-800">
                      Unggah Foto e-KTP Asli *
                    </label>
                    <p className="text-[11px] text-slate-500">
                      JPG / PNG / WEBP, maks. 5 MB. Pastikan NIK & nama terbaca jelas.
                    </p>
                    <div className="flex items-center gap-2">
                      <Upload className="w-4 h-4 text-purple-700 shrink-0" />
                      <input
                        type="file"
                        required
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) =>
                          validateAndSelectImage(e, 'Foto e-KTP', setKtpFile, setKtpPreviewUrl)
                        }
                        className="w-full p-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-[11px] file:font-semibold file:bg-purple-100 file:text-purple-800 hover:file:bg-purple-200 cursor-pointer"
                      />
                    </div>
                    {ktpPreviewUrl && ktpFile && (
                      <div className="space-y-1.5 pt-1">
                        <img
                          src={ktpPreviewUrl}
                          alt="Pratinjau foto e-KTP"
                          className="w-full h-32 object-cover rounded-xl border border-purple-200 bg-white"
                        />
                        <p className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1 truncate">
                          <FileCheck className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">
                            {ktpFile.name} ({Math.round(ktpFile.size / 1024)} KB)
                          </span>
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Upload Swafoto dengan KTP */}
                  <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-2xl space-y-2.5">
                    <label className="block font-bold text-slate-800">
                      Unggah Swafoto Memegang e-KTP *
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Foto wajah Anda sambil memegang e-KTP di sebelah wajah tanpa menutupi NIK.
                    </p>
                    <div className="flex items-center gap-2">
                      <Camera className="w-4 h-4 text-purple-700 shrink-0" />
                      <input
                        type="file"
                        required
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) =>
                          validateAndSelectImage(
                            e,
                            'Swafoto KTP',
                            setSelfieFile,
                            setSelfiePreviewUrl
                          )
                        }
                        className="w-full p-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-[11px] file:font-semibold file:bg-purple-100 file:text-purple-800 hover:file:bg-purple-200 cursor-pointer"
                      />
                    </div>
                    {selfiePreviewUrl && selfieFile && (
                      <div className="space-y-1.5 pt-1">
                        <img
                          src={selfiePreviewUrl}
                          alt="Pratinjau swafoto memegang e-KTP"
                          className="w-full h-32 object-cover rounded-xl border border-purple-200 bg-white"
                        />
                        <p className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1 truncate">
                          <FileCheck className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">
                            {selfieFile.name} ({Math.round(selfieFile.size / 1024)} KB)
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <label className="flex items-start gap-2.5 pt-2 border-t border-slate-100 text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={agreeStatement}
                    onChange={(e) => setAgreeStatement(e.target.checked)}
                    className="accent-purple-700 rounded mt-0.5"
                  />
                  <span className="leading-relaxed">
                    Saya menyatakan bahwa data dan foto e-KTP yang diunggah adalah asli milik saya sendiri, saya berusia minimal 18 tahun, dan data ini hanya digunakan untuk verifikasi keamanan YUKU.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-purple-700 via-fuchsia-700 to-amber-600 hover:from-purple-800 hover:to-amber-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Mengunggah & Mengirim Pengajuan...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Kirim Pengajuan Verifikasi KTP</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
