import React, { useEffect, useState } from 'react';
import { Home, Search, Bookmark, Bell, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AppRoute } from '../types/navigation';

interface MobileBottomNavProps {
  currentPath: string;
  onNavigate: (path: AppRoute) => void;
}

type NavEntry = { label: string; route: AppRoute | null; icon: React.ReactNode; onPress: () => void };

/**
 * Menu bawah khusus HP (disembunyikan di layar md ke atas).
 * Isi menu menyesuaikan status login dan peran pengguna.
 */
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ currentPath, onNavigate }) => {
  const [loggedIn, setLoggedIn] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async (userId: string | null) => {
      if (!userId) {
        if (alive) { setLoggedIn(false); setRole(null); }
        return;
      }
      if (alive) setLoggedIn(true);
      const { data } = await supabase.from('users').select('role').eq('id', userId).maybeSingle();
      if (alive) setRole(data?.role ?? null);
    };

    supabase.auth.getSession().then(({ data: { session } }) => load(session?.user?.id ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      load(session?.user?.id ?? null);
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  const icon = 'w-6 h-6';
  const ordersRoute: AppRoute =
    role === 'admin' ? '/admin' : role === 'talent' ? '/dashboard-talent' : '/riwayat-booking';

  const openNotifications = () => {
    if (!loggedIn) { onNavigate('/login'); return; }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.dispatchEvent(new CustomEvent('yuku:open-notifications'));
  };
  const openProfile = () => {
    if (!loggedIn) { onNavigate('/login'); return; }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.dispatchEvent(new CustomEvent('yuku:open-menu'));
  };

  const items: NavEntry[] = [
    { label: 'Beranda', route: '/', icon: <Home className={icon} />, onPress: () => onNavigate('/') },
    { label: 'Cari', route: '/talent', icon: <Search className={icon} />, onPress: () => onNavigate('/talent') },
    {
      label: 'Pesanan',
      route: ordersRoute,
      icon: <Bookmark className={icon} />,
      onPress: () => onNavigate(loggedIn ? ordersRoute : '/login'),
    },
    { label: 'Notifikasi', route: null, icon: <Bell className={icon} />, onPress: openNotifications },
    { label: 'Profil', route: null, icon: <User className={icon} />, onPress: openProfile },
  ];

  return (
    <nav
      aria-label="Menu utama HP"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur border-t border-purple-100 shadow-[0_-4px_16px_rgba(76,29,149,0.08)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const active = item.route !== null && currentPath === item.route && (loggedIn || item.route === '/' || item.route === '/talent');
          return (
            <li key={item.label}>
              <button
                type="button"
                onClick={item.onPress}
                aria-current={active ? 'page' : undefined}
                className={`relative w-full flex flex-col items-center justify-center gap-0.5 pt-2 pb-2.5 text-[11px] font-semibold transition-colors ${
                  active ? 'text-purple-700' : 'text-slate-500 hover:text-purple-600'
                }`}
              >
                {item.icon}
                {item.label}
                {active && <span className="absolute bottom-0 left-1/4 right-1/4 h-[3px] rounded-full bg-purple-700" />}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
