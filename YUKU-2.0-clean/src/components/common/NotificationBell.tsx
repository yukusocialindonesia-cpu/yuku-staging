import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bell,
  CheckCheck,
  Calendar,
  CreditCard,
  ShieldAlert,
  Gift,
  Wallet,
  Loader2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { NotificationRow, NotificationType } from '../../types/database';
import { AppRoute } from '../../types/navigation';

interface NotificationBellProps {
  userId: string;
  userRole?: string | null;
  onNavigate: (path: AppRoute) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  userId,
  userRole,
  onNavigate,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, user_id, title, message, type, is_read, metadata, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setNotifications(data as NotificationRow[]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadNotifications();

    if (!userId) return;
    // Nama channel harus unik per komponen; dua lonceng dengan userId sama
    // sebelumnya memakai channel yang sama dan membuat aplikasi crash.
    const channelName = `user-notifications-${userId}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, loadNotifications]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const openBell = () => setIsOpen(true);
    window.addEventListener('yuku:open-notifications', openBell);
    return () => window.removeEventListener('yuku:open-notifications', openBell);
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const getTargetRoute = (item: NotificationRow): AppRoute | null => {
    const metaRoute = item.metadata?.route;
    if (typeof metaRoute === 'string' && metaRoute.startsWith('/')) {
      return metaRoute as AppRoute;
    }

    switch (item.type) {
      case 'booking_update':
      case 'payment_status':
        return userRole === 'talent' ? '/dashboard-talent' : '/riwayat-booking';
      case 'payout_status':
      case 'referral_bonus':
        return '/dashboard-talent';
      case 'system_alert':
        if (item.title.toLowerCase().includes('ktp')) {
          return userRole === 'talent' ? '/dashboard-talent' : '/verifikasi-ktp';
        }
        return userRole === 'talent' ? '/dashboard-talent' : '/riwayat-booking';
      default:
        return null;
    }
  };

  const handleNotificationClick = async (item: NotificationRow) => {
    if (!item.is_read) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
      );
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', item.id)
        .eq('user_id', userId);
    }

    const targetRoute = getTargetRoute(item);
    if (targetRoute) {
      setIsOpen(false);
      onNavigate(targetRoute);
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || isMarkingAll) return;
    setIsMarkingAll(true);
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (!error) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      }
    } finally {
      setIsMarkingAll(false);
    }
  };

  const renderIcon = (type: NotificationType) => {
    switch (type) {
      case 'booking_update':
        return <Calendar className="w-4 h-4 text-purple-700" />;
      case 'payment_status':
        return <CreditCard className="w-4 h-4 text-emerald-600" />;
      case 'payout_status':
        return <Wallet className="w-4 h-4 text-amber-600" />;
      case 'referral_bonus':
        return <Gift className="w-4 h-4 text-fuchsia-600" />;
      case 'system_alert':
      default:
        return <ShieldAlert className="w-4 h-4 text-rose-600" />;
    }
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          const next = !isOpen;
          setIsOpen(next);
          if (next) loadNotifications();
        }}
        className="relative p-2 rounded-xl bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-200 text-slate-700 hover:text-purple-900 transition-colors cursor-pointer"
        aria-label="Notifikasi"
        aria-expanded={isOpen}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-extrabold flex items-center justify-center shadow-xs tabular-nums">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/70">
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-slate-900">Notifikasi</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 text-[10px] font-bold">
                  {unreadCount} baru
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={isMarkingAll}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 hover:text-purple-900 cursor-pointer disabled:opacity-50"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Tandai semua dibaca</span>
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {isLoading && notifications.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-purple-700" />
                <span>Memuat notifikasi...</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 px-4 text-center space-y-1">
                <Bell className="w-7 h-7 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-700">Belum ada notifikasi baru</p>
                <p className="text-[11px] text-slate-400">
                  Pembaruan status booking, verifikasi e-KTP, dan pencairan dana akan muncul di sini.
                </p>
              </div>
            ) : (
              notifications.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNotificationClick(item)}
                  className={`w-full text-left px-4 py-3 transition-colors flex items-start gap-3 cursor-pointer ${
                    item.is_read
                      ? 'bg-white hover:bg-slate-50'
                      : 'bg-purple-50/50 hover:bg-purple-50'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200/80 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                    {renderIcon(item.type)}
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-bold text-slate-900 leading-snug">
                        {item.title}
                      </p>
                      {!item.is_read && (
                        <span className="w-2 h-2 rounded-full bg-purple-600 shrink-0 mt-1" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2">
                      {item.message}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {formatTime(item.created_at)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
