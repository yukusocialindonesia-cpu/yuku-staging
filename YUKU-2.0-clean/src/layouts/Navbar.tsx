import React, { useState, useEffect, useRef } from 'react';
import { Menu, X, User, Sparkles, LogOut, ShoppingBag, ShieldCheck, KeyRound, ChevronDown } from 'lucide-react';
import { BrandLogo } from '../components/common/BrandLogo';
import { NotificationBell } from '../components/common/NotificationBell';
import { AppRoute } from '../types/navigation';
import { supabase } from '../lib/supabase';

interface NavbarProps {
  currentPath: string;
  onNavigate: (path: AppRoute) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentPath, onNavigate }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const openMenu = () => setIsMobileMenuOpen(true);
    window.addEventListener('yuku:open-menu', openMenu);
    return () => window.removeEventListener('yuku:open-menu', openMenu);
  }, []);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadUserRole = async (userId: string) => {
      const { data: userRow } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      if (isMounted) {
        setUserRole(userRow?.role ?? null);
      }
    };

    // Check initial active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null;
      if (!isMounted) return;
      setCurrentUser(user);
      if (user) {
        loadUserRole(user.id);
      } else {
        setUserRole(null);
      }
    });

    // Listen for auth state changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      if (!isMounted) return;
      setCurrentUser(user);
      if (user) {
        loadUserRole(user.id);
      } else {
        setUserRole(null);
      }
    });

    const handleClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const navLinks: { label: string; href: AppRoute }[] = [
    { label: 'Beranda', href: '/' },
    { label: 'Jelajahi Talent', href: '/talent' },
    { label: 'Cara Kerja', href: '/cara-kerja' },
    { label: 'Tentang Kami', href: '/tentang' },
    { label: 'FAQ', href: '/faq' },
  ];

  const handleLinkClick = (href: AppRoute) => {
    setIsMobileMenuOpen(false);
    setIsAccountMenuOpen(false);
    onNavigate(href);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUserRole(null);
    setIsAccountMenuOpen(false);
    setIsMobileMenuOpen(false);
    onNavigate('/');
  };

  const displayName =
    currentUser?.user_metadata?.full_name ||
    currentUser?.email?.split('@')[0] ||
    'Pengguna';

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Bar 3-Zone Contract: Brand — Links — 1 Primary Action */}
        <div className="flex items-center justify-between gap-8 h-18">
          {/* Zone 1: Single Brand Element */}
          <div className="shrink-0 flex items-center">
            <BrandLogo
              size="md"
              showTagline={false}
              onClick={() => handleLinkClick('/')}
            />
          </div>

          {/* Zone 2: 4-5 Concise Single-line Nav Links (Desktop) */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-semibold text-slate-600">
            {navLinks.map((link) => {
              const isActive =
                currentPath === link.href ||
                (link.href !== '/' && currentPath.startsWith(link.href));
              return (
                <button
                  key={link.href}
                  onClick={() => handleLinkClick(link.href)}
                  className={`whitespace-nowrap transition-colors relative py-1 cursor-pointer ${
                    isActive
                      ? 'text-purple-900 font-bold'
                      : 'hover:text-purple-700 text-slate-600'
                  }`}
                >
                  {link.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-700 to-amber-500 rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Primary Action & Auth Links */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            {currentUser ? (
              <div className="flex items-center gap-2.5">
                {userRole === 'admin' && (
                  <button
                    onClick={() => handleLinkClick('/admin')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors flex items-center gap-1.5 cursor-pointer ${
                      currentPath === '/admin'
                        ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-xs'
                        : 'bg-amber-50 text-amber-950 border-amber-200 hover:bg-amber-100'
                    }`}
                    title="Buka Panel Admin & Kurasi YUKU"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                    <span>Admin Panel</span>
                  </button>
                )}

                {userRole === 'talent' && (
                  <button
                    onClick={() => handleLinkClick('/dashboard-talent')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors flex items-center gap-1.5 cursor-pointer ${
                      currentPath === '/dashboard-talent'
                        ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                        : 'bg-purple-50 text-purple-900 border-purple-200 hover:bg-purple-100'
                    }`}
                    title="Buka Dashboard Talent"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Dashboard Talent</span>
                  </button>
                )}

                {userRole === 'customer' && (
                  <>
                    <button
                      onClick={() => handleLinkClick('/riwayat-booking')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                        currentPath === '/riwayat-booking'
                          ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                      title="Lihat riwayat booking dan status pesanan customer"
                    >
                      <ShoppingBag className="w-3.5 h-3.5 text-slate-500" />
                      <span>Pesanan Saya</span>
                    </button>

                    <button
                      onClick={() => handleLinkClick('/verifikasi-ktp')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                        currentPath === '/verifikasi-ktp'
                          ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                      title="Ajukan atau periksa status verifikasi e-KTP customer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Verifikasi KTP</span>
                    </button>
                  </>
                )}

                <NotificationBell
                  userId={currentUser.id}
                  userRole={userRole}
                  onNavigate={handleLinkClick}
                />

                <div className="relative" ref={accountMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsAccountMenuOpen((prev) => !prev)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 hover:bg-purple-100/80 border border-purple-200 rounded-xl transition-colors cursor-pointer"
                    aria-expanded={isAccountMenuOpen}
                    aria-haspopup="menu"
                  >
                    <div className="w-6 h-6 rounded-full bg-purple-700 text-white flex items-center justify-center text-xs font-bold">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs font-bold text-purple-900 max-w-[120px] truncate">
                      {displayName}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-purple-700 transition-transform ${
                        isAccountMenuOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isAccountMenuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 mt-2 w-56 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 z-50"
                    >
                      <div className="px-3.5 py-2 border-b border-slate-100">
                        <div className="text-xs font-bold text-slate-900 truncate">{displayName}</div>
                        <div className="text-[11px] text-slate-500 truncate">{currentUser.email}</div>
                      </div>

                      <div className="py-1">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => handleLinkClick('/ganti-sandi')}
                          className={`w-full px-3.5 py-2 text-left text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
                            currentPath === '/ganti-sandi'
                              ? 'bg-purple-50 text-purple-900 font-bold'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <KeyRound className="w-3.5 h-3.5 text-purple-700" />
                          <span>Ganti Kata Sandi</span>
                        </button>

                        <button
                          type="button"
                          role="menuitem"
                          onClick={handleLogout}
                          className="w-full px-3.5 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Keluar</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={() => handleLinkClick('/login')}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 hover:text-purple-900 transition-colors cursor-pointer"
                >
                  Masuk
                </button>

                <button
                  onClick={() => handleLinkClick('/register')}
                  className="px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-purple-700 via-fuchsia-700 to-amber-600 hover:from-purple-800 hover:to-amber-700 rounded-lg shadow-xs hover:shadow transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Daftar Sekarang</span>
                </button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center gap-2">
            {currentUser ? (
              <NotificationBell
                userId={currentUser.id}
                userRole={userRole}
                onNavigate={handleLinkClick}
              />
            ) : (
              <button
                onClick={() => handleLinkClick('/register')}
                className="px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-purple-700 to-fuchsia-700 rounded-md shadow-xs"
              >
                Daftar
              </button>
            )}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label={isMobileMenuOpen ? 'Tutup navigasi' : 'Buka navigasi'}
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-6 shadow-xl max-h-[calc(100dvh-4.5rem)] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150">
          {currentUser && (
            <div className="mb-3 p-3 bg-purple-50 rounded-xl flex items-center justify-between border border-purple-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-purple-700 text-white flex items-center justify-center text-xs font-bold">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-xs font-bold text-purple-950">{displayName}</div>
                  <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                    {currentUser.email}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col space-y-1 mb-4">
            {currentUser && (
              <>
                {userRole === 'admin' && (
                  <button
                    onClick={() => handleLinkClick('/admin')}
                    className={`text-left px-3 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${
                      currentPath === '/admin'
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-amber-50 text-amber-950 hover:bg-amber-100'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4 text-amber-700" />
                    <span>Admin Panel</span>
                  </button>
                )}

                {userRole === 'talent' && (
                  <button
                    onClick={() => handleLinkClick('/dashboard-talent')}
                    className={`text-left px-3 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${
                      currentPath === '/dashboard-talent'
                        ? 'bg-purple-700 text-white'
                        : 'bg-purple-50 text-purple-900 hover:bg-purple-100'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Dashboard Talent</span>
                  </button>
                )}

                {userRole === 'customer' && (
                  <>
                    <button
                      onClick={() => handleLinkClick('/riwayat-booking')}
                      className={`text-left px-3 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${
                        currentPath === '/riwayat-booking'
                          ? 'bg-purple-100 text-purple-900'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <ShoppingBag className="w-4 h-4 text-purple-700" />
                      <span>Riwayat Booking (Customer)</span>
                    </button>

                    <button
                      onClick={() => handleLinkClick('/verifikasi-ktp')}
                      className={`text-left px-3 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${
                        currentPath === '/verifikasi-ktp'
                          ? 'bg-purple-100 text-purple-900'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>Verifikasi e-KTP Customer</span>
                    </button>
                  </>
                )}

                <button
                  onClick={() => handleLinkClick('/ganti-sandi')}
                  className={`text-left px-3 py-2.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${
                    currentPath === '/ganti-sandi'
                      ? 'bg-purple-100 text-purple-900'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <KeyRound className="w-4 h-4 text-purple-700" />
                  <span>Ganti Kata Sandi</span>
                </button>
              </>
            )}

            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => handleLinkClick(link.href)}
                className={`text-left px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  currentPath === link.href
                    ? 'bg-purple-50 text-purple-900 font-bold'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {link.label}
              </button>
            ))}
            <button
              onClick={() => handleLinkClick('/bantuan')}
              className="text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Pusat Bantuan
            </button>
          </div>

          <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
            {currentUser ? (
              <button
                onClick={handleLogout}
                className="w-full py-2.5 text-center text-sm font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Keluar dari Akun</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleLinkClick('/login')}
                  className="w-full py-2.5 text-center text-sm font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Masuk ke Akun
                </button>
                <button
                  onClick={() => handleLinkClick('/register')}
                  className="w-full py-2.5 text-center text-sm font-bold text-white bg-gradient-to-r from-purple-700 to-fuchsia-700 rounded-lg shadow-xs"
                >
                  Daftar Akun Customer
                </button>
                <button
                  onClick={() => handleLinkClick('/daftar-talent')}
                  className="w-full py-2 text-center text-xs font-semibold text-purple-700 hover:text-purple-900 transition-colors"
                >
                  Ingin bergabung jadi Talent?
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
