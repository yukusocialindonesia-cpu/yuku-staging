import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  CheckCircle2,
  DollarSign,
  Gift,
  ShieldCheck,
  AlertCircle,
  Clock,
  ArrowRight,
  Send,
  Loader2,
  Lock,
  Mail,
  User,
  Phone,
  MapPin,
  Calendar,
  Image as ImageIcon,
} from 'lucide-react';
import { YUKU_BUSINESS_RULES } from '../utils/businessRules';
import { formatRupiah } from '../utils/formatters';
import { AppRoute } from '../types/navigation';
import { ActivityCategory } from '../types/talent';
import { fetchCategoriesFromSupabase } from '../utils/supabaseMarketplace';
import { supabase } from '../lib/supabase';
import { INDONESIA_CITIES } from '../utils/cities';

interface BecomeTalentPageProps {
  onNavigate: (path: AppRoute) => void;
}

const TALENT_DRAFT_KEY = 'yuku_talent_registration_draft';

export const BecomeTalentPage: React.FC<BecomeTalentPageProps> = ({ onNavigate }) => {
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  // Authentication check
  const [currentSessionUser, setCurrentSessionUser] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    talentId: string;
    emailNeedsConfirmation: boolean;
    email: string;
    referralStatus?: {
      ok: boolean;
      message: string;
    };
  } | null>(null);

  // Maximum date of birth for age 18+ (today minus 18 years)
  const maxDobDate = new Date();
  maxDobDate.setFullYear(maxDobDate.getFullYear() - 18);
  const maxDobString = maxDobDate.toISOString().split('T')[0];

  const [ktpFile, setKtpFile] = useState<File | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
    city: 'Jakarta',
    gender: 'Wanita' as 'Wanita' | 'Pria',
    dateOfBirth: '2002-01-15',
    ktpNumber: '',
    headline: 'Teman ramah, sopan, dan asik diajak mengobrol santai',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600',
    bio: '',
    hourlyRate: '150000',
    referralCode: '',
    selectedActivities: [] as string[],
    agreeTerms: false,
    agreeAge18: false,
  });

  // Auto-fill referral code from ?ref= query parameter or pending sessionStorage
  useEffect(() => {
    try {
      const refParam = new URLSearchParams(window.location.search).get('ref')?.trim().toUpperCase();
      const storedRef = sessionStorage.getItem('yuku_pending_referral_code')?.trim().toUpperCase();
      const initialRef = refParam || storedRef || '';
      if (initialRef) {
        setFormData((prev) => ({
          ...prev,
          referralCode: prev.referralCode || initialRef,
        }));
      }
    } catch {
      // Ignore storage access errors
    }
  }, []);

  // Pulihkan isian formulir yang tersimpan sebelum konfirmasi email,
  // supaya calon talent tidak perlu mengisi dua kali (password & KTP tidak pernah disimpan).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TALENT_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft && typeof draft === 'object') {
        setFormData((prev) => ({ ...prev, ...draft, password: '', ktpNumber: prev.ktpNumber }));
      }
    } catch {
      // Abaikan draf yang rusak atau penyimpanan yang tidak tersedia
    }
  }, []);

  // Check if user is already logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setCurrentSessionUser(session.user);
        setFormData((prev) => ({
          ...prev,
          email: session.user.email || prev.email,
          fullName: session.user.user_metadata?.full_name || prev.fullName,
          phone: session.user.user_metadata?.phone_number || prev.phone,
        }));
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setCurrentSessionUser(session.user);
        setFormData((prev) => ({
          ...prev,
          email: session.user.email || prev.email,
          fullName: session.user.user_metadata?.full_name || prev.fullName,
          phone: session.user.user_metadata?.phone_number || prev.phone,
        }));
      } else {
        setCurrentSessionUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function loadCategories() {
      try {
        setIsLoadingCategories(true);
        setCategoryError(null);
        const data = await fetchCategoriesFromSupabase();
        if (isMounted) {
          setCategories(data);
          if (data.length > 0) {
            setFormData((prev) => ({
              ...prev,
              selectedActivities: prev.selectedActivities.length > 0 ? prev.selectedActivities : [data[0].id],
            }));
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setCategoryError(err?.message || 'Gagal memuat kategori aktivitas.');
        }
      } finally {
        if (isMounted) {
          setIsLoadingCategories(false);
        }
      }
    }
    loadCategories();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleActivityToggle = (id: string) => {
    setFormData((prev) => {
      const exists = prev.selectedActivities.includes(id);
      return {
        ...prev,
        selectedActivities: exists
          ? prev.selectedActivities.filter((a) => a !== id)
          : [...prev.selectedActivities, id],
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    // 1. Validation
    if (!formData.agreeAge18 || !formData.agreeTerms) {
      setSubmitError('Harap setujui pernyataan usia minimal 18 tahun dan kepatuhan norma komunitas YUKU.');
      return;
    }

    if (formData.selectedActivities.length === 0) {
      setSubmitError('Pilih minimal satu kategori aktivitas yang ingin Anda temani.');
      return;
    }

    const rateNum = parseInt(formData.hourlyRate, 10);
    if (isNaN(rateNum) || rateNum < 50000) {
      setSubmitError('Usulan tarif minimal adalah Rp 50.000 / jam.');
      return;
    }

    if (!avatarFile) {
      setSubmitError('Unggah foto profil utama (JPG, PNG, atau WebP).');
      return;
    }
    if (avatarFile.size > 10 * 1024 * 1024) {
      setSubmitError('Ukuran foto profil maksimal 10 MB.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(avatarFile.type)) {
      setSubmitError('Format foto profil harus JPG, PNG, atau WebP.');
      return;
    }

    // Check age on client
    const birthDate = new Date(formData.dateOfBirth);
    const today = new Date();
    let ageCalc = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      ageCalc--;
    }
    if (ageCalc < 18) {
      setSubmitError('Pendaftaran ditolak: Usia minimal Talent adalah 18 tahun.');
      return;
    }

    setIsSubmitting(true);

    try {
      let activeUserId = currentSessionUser?.id;

      // 2. If not logged in, execute real signUp
      if (!activeUserId) {
        if (!formData.password || formData.password.length < 8) {
          setSubmitError('Kata sandi wajib diisi minimal 8 karakter untuk keamanan akun Anda.');
          setIsSubmitting(false);
          return;
        }

        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: formData.email.trim(),
          password: formData.password,
          options: {
            data: {
              full_name: formData.fullName.trim(),
              phone_number: formData.phone.trim(),
              user_role: 'talent', // Triggers public.handle_new_user() with role 'talent'
            },
          },
        });

        if (signUpError) {
          throw new Error(`Pendaftaran akun gagal: ${signUpError.message}`);
        }

        if (!signUpData.user) {
          throw new Error('Gagal membuat pengguna di sistem autentikasi.');
        }

        activeUserId = signUpData.user.id;

        // If email confirmation is required by Supabase and no active session was returned
        if (!signUpData.session) {
          const pendingRef = formData.referralCode.trim().toUpperCase();
          if (pendingRef) {
            try {
              sessionStorage.setItem('yuku_pending_referral_code', pendingRef);
            } catch {
              // Ignore storage access errors
            }
          }
          try {
            const { password: _pw, ktpNumber: _ktp, agreeTerms: _t, agreeAge18: _a, ...safeDraft } = formData;
            localStorage.setItem(TALENT_DRAFT_KEY, JSON.stringify(safeDraft));
          } catch {
            // Abaikan jika penyimpanan browser tidak tersedia
          }
          setSuccessInfo({
            talentId: activeUserId,
            emailNeedsConfirmation: true,
            email: formData.email,
          });
          setIsSubmitting(false);
          return;
        }
      }

      // 2b. Pastikan peran akun menjadi talent (customer yang mendaftar jadi talent).
      const { error: roleError } = await supabase.rpc('become_talent');
      if (roleError) {
        throw new Error(`Gagal mengaktifkan peran Talent: ${roleError.message}`);
      }

      // 2c. Unggah foto profil ke bucket publik 'avatars' (folder = id pengguna, sesuai aturan RLS).
      let uploadedAvatarUrl: string | null = null;
      if (avatarFile) {
        const avatarExt = (avatarFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const avatarPath = `${activeUserId}/avatar_${Date.now()}.${avatarExt}`;
        const { error: avatarUploadError } = await supabase.storage
          .from('avatars')
          .upload(avatarPath, avatarFile, { upsert: false, contentType: avatarFile.type });
        if (avatarUploadError) {
          throw new Error(`Gagal mengunggah foto profil: ${avatarUploadError.message}`);
        }
        uploadedAvatarUrl = supabase.storage.from('avatars').getPublicUrl(avatarPath).data.publicUrl;
      }

      // 3. Save public.talent_profiles (select first: update without id if exists, insert with id if new)
      const { data: existingProfile, error: profileLookupError } = await supabase
        .from('talent_profiles')
        .select('id')
        .eq('id', activeUserId)
        .maybeSingle();

      if (profileLookupError) {
        throw new Error(`Gagal memeriksa profil Talent: ${profileLookupError.message}`);
      }

      const profileFields = {
        display_name: formData.fullName.trim(),
        avatar_url:
          uploadedAvatarUrl ||
          formData.avatarUrl.trim() ||
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600',
        city: formData.city.trim(),
        gender: formData.gender,
        headline: formData.headline.trim() || `Teman ramah & terpercaya di ${formData.city}`,
        bio: formData.bio.trim(),
        hourly_rate: rateNum,
        service_mode: 'Offline & Online',
      };

      const { error: profileError } = existingProfile
        ? await supabase.from('talent_profiles').update(profileFields).eq('id', activeUserId)
        : await supabase.from('talent_profiles').insert({ id: activeUserId, ...profileFields });

      if (profileError) {
        throw new Error(`Gagal menyimpan profil Talent: ${profileError.message} (${profileError.code || 'RLS_ERR'})`);
      }

      // 4. Save public.talent_services
      if (formData.selectedActivities.length > 0) {
        const { error: deleteServicesError } = await supabase
          .from('talent_services')
          .delete()
          .eq('talent_id', activeUserId);

        if (deleteServicesError) {
          throw new Error(`Gagal memperbarui layanan talent: ${deleteServicesError.message}`);
        }

        const serviceRows = formData.selectedActivities.map((catId) => ({
          talent_id: activeUserId,
          activity_category_id: catId,
        }));

        const { error: servicesError } = await supabase.from('talent_services').insert(serviceRows);
        if (servicesError) {
          throw new Error(`Gagal menyimpan layanan talent: ${servicesError.message}`);
        }
      }

      // 5. Upload KTP to storage bucket ktp-documents if provided (using user folder prefix as required by RLS)
      let uploadedKtpPath: string | null = null;

      if (ktpFile) {
        const fileExt = ktpFile.name.split('.').pop() || 'jpg';
        const storagePath = `${activeUserId}/ktp_${Date.now()}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('ktp-documents')
          .upload(storagePath, ktpFile, {
            upsert: false,
          });

        if (uploadError || !uploadData) {
          throw new Error(`Gagal mengunggah dokumen KTP: ${uploadError?.message || 'Upload gagal'}`);
        }

        uploadedKtpPath = storagePath;
      }

      // 6. Save public.user_identities (select first: update without id if exists, insert with id if new; trigger manages ktp_verification_status)
      const { data: existingIdentity, error: identityLookupError } = await supabase
        .from('user_identities')
        .select('id')
        .eq('id', activeUserId)
        .maybeSingle();

      if (identityLookupError) {
        throw new Error(`Gagal memeriksa data identitas: ${identityLookupError.message}`);
      }

      const identityFields: Record<string, any> = {
        full_legal_name: formData.fullName.trim(),
        date_of_birth: formData.dateOfBirth,
        emergency_contact_phone: formData.phone.trim(),
      };

      if (formData.ktpNumber.trim()) {
        identityFields.ktp_number = formData.ktpNumber.trim();
      }
      if (uploadedKtpPath) {
        identityFields.ktp_storage_path = uploadedKtpPath;
      }

      const { error: identityError } = existingIdentity
        ? await supabase.from('user_identities').update(identityFields).eq('id', activeUserId)
        : await supabase.from('user_identities').insert({ id: activeUserId, ...identityFields });

      if (identityError) {
        throw new Error(`Gagal menyimpan data identitas legal: ${identityError.message}`);
      }

      // 7. Apply optional referral code (1-tier permanent, anti self-referral)
      let referralStatus: { ok: boolean; message: string } | undefined;
      const trimmedReferral = formData.referralCode.trim().toUpperCase();
      if (trimmedReferral) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('apply_talent_referral_code', {
          p_referral_code: trimmedReferral,
        });

        if (rpcError) {
          referralStatus = {
            ok: false,
            message: `Profil Talent berhasil dibuat, namun kode referral ${trimmedReferral} belum tertaut: ${rpcError.message}. Anda dapat mencoba menautkannya kembali di Dashboard Talent.`,
          };
        } else {
          const refName =
            typeof rpcData === 'object' && rpcData !== null && 'referrer_name' in rpcData
              ? String((rpcData as Record<string, unknown>).referrer_name)
              : 'Talent YUKU';
          referralStatus = {
            ok: true,
            message: `Kode referral ${trimmedReferral} berhasil ditautkan (diundang oleh ${refName}).`,
          };
          try {
            sessionStorage.removeItem('yuku_pending_referral_code');
          } catch {
            // Ignore storage access errors
          }
        }
      }

      try {
        localStorage.removeItem(TALENT_DRAFT_KEY);
      } catch {
        // Abaikan
      }
      setSuccessInfo({
        talentId: activeUserId,
        emailNeedsConfirmation: false,
        email: formData.email,
        referralStatus,
      });
    } catch (err: any) {
      setSubmitError(err?.message || 'Terjadi kesalahan sistem saat memproses pendaftaran.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="py-12 bg-[#FAF8FC]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <span className="text-xs font-bold text-purple-700 tracking-wider uppercase mb-2 block">
            Peluang Karir & Penghasilan Fleksibel
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-[#1E0938] tracking-tight mb-4">
            Daftar Menjadi Talent YUKU
          </h1>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            Dapatkan penghasilan dari aktivitas sosial positif yang kamu sukai. Jadwalkan waktu sesukamu dan bergabung dalam komunitas pendamping terpercaya di Indonesia.
          </p>
        </div>

        {/* Business Rules Spec Box (Transparent earnings) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-14">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-xs text-slate-500 font-semibold uppercase block mb-1">
              Sistem Penghasilan
            </span>
            <div className="text-xl font-black text-purple-700">Adil & Transparan</div>
            <p className="text-xs text-slate-600 mt-1">
              Talent menikmati kompensasi langsung yang layak dari setiap sesi aktivitas sosial berbayar.
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-xs text-slate-500 font-semibold uppercase block mb-1">
              Program Komunitas
            </span>
            <div className="text-xl font-black text-amber-600">Apresiasi Rekan</div>
            <p className="text-xs text-slate-600 mt-1">
              Bonus apresiasi tambahan saat mengundang rekan berintegritas untuk bergabung sebagai Talent.
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-xs text-slate-500 font-semibold uppercase block mb-1">
              Minimal Pencairan
            </span>
            <div className="text-2xl font-black text-slate-900">
              {formatRupiah(YUKU_BUSINESS_RULES.minPayoutAmount)}
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Cairkan penghasilanmu langsung ke bank lokal pilihanmu.
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-xs text-slate-500 font-semibold uppercase block mb-1">
              Kepatuhan Usia
            </span>
            <div className="text-2xl font-black text-fuchsia-700">18+ Tahun</div>
            <p className="text-xs text-slate-600 mt-1">
              Wajib memiliki KTP resmi untuk verifikasi identitas legal.
            </p>
          </div>
        </div>

        {/* Main 2-Column: Information vs Form */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Left Column: Requirements & Safety */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
              <h2 className="text-lg font-bold text-slate-900 mb-4">
                Syarat Menjadi Talent
              </h2>
              <ul className="space-y-3 text-xs sm:text-sm text-slate-600">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Warga Negara Indonesia berusia minimal 18 tahun (memiliki e-KTP sah).</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Memiliki etika komunikasi yang sopan, ramah, dan tepat waktu.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Bersedia hanya bertemu di tempat umum/publik yang aman.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Mematuhi larangan keras aktivitas seksual dan penipuan.</span>
                </li>
              </ul>
            </div>

            <div className="bg-purple-950 text-white rounded-2xl p-6 border border-purple-900">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-xs mb-2">
                <ShieldCheck className="w-4 h-4" />
                <span>KEAMANAN & PERLINDUNGAN TALENT</span>
              </div>
              <h3 className="font-bold text-sm text-white mb-2">
                Kamu Selalu Memegang Kendali
              </h3>
              <p className="text-xs text-purple-200/80 leading-relaxed mb-3">
                Sebagai Talent, kamu berhak menolak ajakan yang tidak sesuai kenyamananmu atau membatalkan sesi jika customer melanggar etika dan batasan ruang publik.
              </p>
              <div className="text-[11px] text-purple-300 border-t border-purple-900/60 pt-2">
                YUKU menyediakan tombol darurat dan tim dukungan respons cepat selama sesi berlangsung.
              </div>
            </div>
          </div>

          {/* Right Column: Registration Form Mockup */}
          <div className="lg:col-span-7">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs">
              <div className="mb-6">
                <span className="text-xs font-semibold text-purple-700 block mb-0.5">
                  Formulir Pendaftaran Talent
                </span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                  Ajukan Profil Talent Kamu
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Isi data dirimu di bawah ini untuk memulai proses kurasi dan verifikasi.
                </p>
              </div>

              {submitError && (
                <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed font-medium">{submitError}</p>
                </div>
              )}

              {currentSessionUser && (
                <div className="mb-5 p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-purple-700" />
                    <span>
                      Terhubung dengan akun: <strong>{currentSessionUser.email}</strong>
                    </span>
                  </div>
                  <span className="text-[10px] bg-purple-200 text-purple-800 font-bold px-2 py-0.5 rounded-full">
                    Sesi Aktif
                  </span>
                </div>
              )}

              {!successInfo ? (
                <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                  {/* Name & Email */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Nama Lengkap (sesuai KTP) *
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          placeholder="Contoh: Sarah Dian Pratami"
                          value={formData.fullName}
                          onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
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
                          disabled={Boolean(currentSessionUser)}
                          placeholder="nama@email.com"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs disabled:opacity-70 disabled:bg-slate-100"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Password & WhatsApp */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
                        />
                      </div>
                    </div>

                    {!currentSessionUser && (
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Kata Sandi Akun Baru * (min. 8 karakter)
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="password"
                            required
                            minLength={8}
                            placeholder="Minimal 8 karakter"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
                          />
                        </div>
                      </div>
                    )}

                    {currentSessionUser && (
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Kota Domisili Utama *
                        </label>
                        <div className="relative">
                          <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            list="indonesia-cities-list"
                            required
                            placeholder="Contoh: Jakarta Selatan, Surabaya"
                            value={formData.city}
                            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                            className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {!currentSessionUser && (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Kota Domisili Utama *
                      </label>
                      <div className="relative">
                        <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          list="indonesia-cities-list"
                          required
                          placeholder="Contoh: Jakarta Selatan, Bandung, Surabaya"
                          value={formData.city}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
                        />
                      </div>
                    </div>
                  )}

                  <datalist id="indonesia-cities-list">
                    {INDONESIA_CITIES.map((city) => (
                      <option key={city} value={city} />
                    ))}
                  </datalist>

                  {/* Gender, Tanggal Lahir (KTP 18+), Hourly Rate */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Gender *</label>
                      <select
                        value={formData.gender}
                        onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'Wanita' | 'Pria' })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
                      >
                        <option value="Wanita">Wanita</option>
                        <option value="Pria">Pria</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Tanggal Lahir Sesuai KTP *
                      </label>
                      <div className="relative">
                        <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="date"
                          max={maxDobString}
                          required
                          value={formData.dateOfBirth}
                          onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Usulan Tarif / Jam (Rp) *
                      </label>
                      <input
                        type="number"
                        step="10000"
                        min="50000"
                        required
                        value={formData.hourlyRate}
                        onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
                      />
                    </div>
                  </div>

                  {/* NIK e-KTP & Unggah Berkas KTP */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-purple-50/60 rounded-xl border border-purple-100">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Nomor Induk Kependudukan (NIK e-KTP)
                      </label>
                      <input
                        type="text"
                        maxLength={16}
                        placeholder="16 digit NIK resmi (opsional saat daftar)"
                        value={formData.ktpNumber}
                        onChange={(e) => setFormData({ ...formData, ktpNumber: e.target.value.replace(/\D/g, '') })}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Unggah Foto e-KTP (Dokumen Privat)
                      </label>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setKtpFile(e.target.files[0]);
                          }
                        }}
                        className="w-full p-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-[11px] file:font-semibold file:bg-purple-100 file:text-purple-800 hover:file:bg-purple-200 cursor-pointer"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        *Tersimpan di bucket storage privat terisolasi (hanya diverifikasi oleh Admin YUKU).
                      </span>
                    </div>
                  </div>

                  {/* Headline & Foto Profil */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Headline / Sapaan Singkat *
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={150}
                        placeholder="Contoh: Teman ngobrol asik & kulineran seru"
                        value={formData.headline}
                        onChange={(e) => setFormData({ ...formData, headline: e.target.value })}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Foto Profil Utama * <span className="font-normal text-slate-500">(JPG/PNG/WebP, maks. 10 MB)</span>
                      </label>
                      <div className="relative">
                        <ImageIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
                        />
                      </div>
                      {avatarFile && (
                        <p className="text-[11px] text-emerald-700 mt-1">Dipilih: {avatarFile.name}</p>
                      )}
                    </div>
                  </div>

                  {/* Activity Checkboxes */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-2">
                      Pilih Aktivitas yang Ingin Kamu Temani:
                    </label>
                    {isLoadingCategories ? (
                      <div className="flex items-center gap-2 p-4 text-xs text-slate-500 bg-slate-50 rounded-lg">
                        <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                        <span>Memuat kategori dari Supabase...</span>
                      </div>
                    ) : categoryError ? (
                      <div className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
                        {categoryError}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {categories.map((act) => {
                          const isChecked = formData.selectedActivities.includes(act.id);
                          return (
                            <label
                              key={act.id}
                              className={`p-2.5 rounded-lg border flex items-center gap-2 cursor-pointer transition-colors ${
                                isChecked
                                  ? 'bg-purple-50 border-purple-400 text-purple-900 font-semibold'
                                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleActivityToggle(act.id)}
                                className="accent-purple-700 rounded"
                              />
                              <span>{act.title}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Short Bio */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Ceritakan Singkat Tentang Dirimu & Hobi *
                    </label>
                    <textarea
                      rows={3}
                      required
                      placeholder="Contoh: Saya menyukai kulineran kafe baru dan jalan santai. Saya ramah, pendengar yang baik, dan suka mengobrol tentang musik dan film."
                      value={formData.bio}
                      onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs"
                    />
                  </div>

                  {/* Optional Referral Code */}
                  <div className="p-3.5 bg-amber-50/70 rounded-xl border border-amber-200/80">
                    <label
                      htmlFor="talent-referral-code"
                      className="flex items-center gap-1.5 font-bold text-slate-800 mb-1"
                    >
                      <Gift className="w-3.5 h-3.5 text-amber-600" />
                      <span>Kode Referral Talent Pengundang (Opsional)</span>
                    </label>
                    <input
                      id="talent-referral-code"
                      type="text"
                      maxLength={20}
                      placeholder="Contoh: YUKU-A1B2C3D4"
                      value={formData.referralCode}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          referralCode: e.target.value.toUpperCase().replace(/\s+/g, ''),
                        })
                      }
                      className="w-full p-2.5 bg-white border border-amber-200 rounded-lg focus:outline-none focus:border-purple-600 text-xs font-mono uppercase"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Isi jika Anda diundang bergabung oleh sesama Talent YUKU (hanya berlaku 1 kali & permanen).
                    </p>
                  </div>

                  {/* Mandatory Checkboxes */}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <label className="flex items-start gap-2 text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        required
                        checked={formData.agreeAge18}
                        onChange={(e) => setFormData({ ...formData, agreeAge18: e.target.checked })}
                        className="accent-purple-700 rounded mt-0.5"
                      />
                      <span>
                        Saya menyatakan telah <strong>berusia minimal 18 tahun</strong> dan bersedia
                        melakukan verifikasi KTP resmi.
                      </span>
                    </label>

                    <label className="flex items-start gap-2 text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        required
                        checked={formData.agreeTerms}
                        onChange={(e) => setFormData({ ...formData, agreeTerms: e.target.checked })}
                        className="accent-purple-700 rounded mt-0.5"
                      />
                      <span>
                        Saya memahami bahwa YUKU <strong>bukan aplikasi kencan</strong> dan menyetujui
                        seluruh Syarat & Ketentuan serta kebijakan anti-layanan seksual.
                      </span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 px-4 bg-gradient-to-r from-purple-700 via-fuchsia-700 to-amber-600 hover:from-purple-800 hover:to-amber-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer mt-4 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Mendaftarkan Profil ke Supabase...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Kirim Pendaftaran Talent Nyata</span>
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <div className="py-8 text-center space-y-4">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {successInfo.emailNeedsConfirmation
                      ? 'Akun Berhasil Dibuat. Tinggal Satu Langkah Lagi!'
                      : 'Pendaftaran Talent Berhasil Tercatat di Supabase!'}
                  </h3>
                  <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                    {successInfo.emailNeedsConfirmation ? (
                      <>
                        Akun Anda (<code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-[11px] text-purple-900">{successInfo.email}</code>) telah dibuat, namun data profil dan dokumen KTP Anda <strong>belum tersimpan</strong> karena email belum dikonfirmasi.
                      </>
                    ) : (
                      <>
                        Data akun Talent Anda (ID: <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-[11px] text-purple-900">{successInfo.talentId.slice(0, 8)}...</code>) telah berhasil tersimpan di sistem backend Supabase YUKU.
                      </>
                    )}
                  </p>

                  {successInfo.emailNeedsConfirmation ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs text-left space-y-1.5 max-w-md mx-auto">
                      <div className="font-bold flex items-center gap-1.5">
                        <Mail className="w-4 h-4 text-amber-700" />
                        <span>Konfirmasi Email Anda</span>
                      </div>
                      <p className="text-[11px] text-amber-800 leading-relaxed">
                        Tautan aktivasi telah dikirimkan ke <strong>{successInfo.email}</strong>. Setelah email Anda aktif, silakan <strong>login</strong> terlebih dahulu lalu <strong>buka kembali halaman ini</strong> untuk melanjutkan. Isian formulir Anda sudah tersimpan di perangkat ini; Anda hanya perlu memasukkan kembali kata sandi, nomor KTP, dan foto KTP.
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 bg-purple-50 border border-purple-200 text-purple-900 rounded-xl text-xs text-left space-y-1.5 max-w-md mx-auto">
                      <div className="font-bold flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-purple-700" />
                        <span>Tahap Kurasi & Verifikasi Identitas</span>
                      </div>
                      <p className="text-[11px] text-purple-800 leading-relaxed">
                        Profil Anda saat ini berstatus <span className="font-semibold underline">pending_verification</span> demi menjamin keamanan pengguna YUKU. Tim YUKU akan meninjau kelengkapan identitas resmi sebelum profil Anda tayang di katalog publik.
                      </p>
                    </div>
                  )}

                  {successInfo.referralStatus && (
                    <div
                      className={`p-3.5 rounded-xl border text-xs text-left max-w-md mx-auto flex items-start gap-2 ${
                        successInfo.referralStatus.ok
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                      }`}
                    >
                      <Gift className="w-4 h-4 shrink-0 mt-0.5" />
                      <p className="leading-relaxed">{successInfo.referralStatus.message}</p>
                    </div>
                  )}

                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                    <button
                      onClick={() => onNavigate('/talent')}
                      className="px-5 py-2.5 bg-purple-700 text-white text-xs font-bold rounded-lg hover:bg-purple-800 cursor-pointer"
                    >
                      Lihat Katalog Talent
                    </button>
                    <button
                      onClick={() => setSuccessInfo(null)}
                      className="px-4 py-2.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-200 cursor-pointer"
                    >
                      Daftar Akun Lain
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
