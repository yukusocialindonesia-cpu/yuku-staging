import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Send,
  Loader2,
  AlertCircle,
  Calendar,
  MapPin,
  ShieldCheck,
  Check,
  CheckCheck,
  MessageSquare,
  User,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { BookingMessageRow } from '../../types/database';

export interface ChatBookingSummary {
  id: string;
  booking_code: string;
  status: string;
  start_time: string;
  duration_hours: number;
  meeting_location_name: string;
  activity_title?: string;
}

interface BookingChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: ChatBookingSummary | null;
  currentUserId: string;
  partnerName: string;
  partnerRoleLabel: string;
  partnerAvatar?: string | null;
}

interface UiChatMessage extends BookingMessageRow {
  pending?: boolean;
}

const STARTER_PROMPTS = [
  'Halo! Konfirmasi jadwal & titik temu kita ya.',
  'Di area mana persisnya kita ketemu nanti?',
  'Apakah ada preferensi topik atau aktivitas?',
];

export const BookingChatModal: React.FC<BookingChatModalProps> = ({
  isOpen,
  onClose,
  booking,
  currentUserId,
  partnerName,
  partnerRoleLabel,
  partnerAvatar,
}) => {
  const [messages, setMessages] = useState<UiChatMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);

  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
  const [isPartnerOnline, setIsPartnerOnline] = useState(false);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingClearTimerRef = useRef<number | null>(null);
  const lastTypingEmitRef = useRef<number>(0);

  const scrollToBottom = useCallback((instant = false) => {
    window.setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: instant ? 'auto' : 'smooth',
      });
    }, 30);
  }, []);

  const markIncomingAsRead = useCallback(
    async (bookingId: string) => {
      try {
        await supabase
          .from('booking_messages')
          .update({ is_read: true })
          .eq('booking_id', bookingId)
          .neq('sender_id', currentUserId)
          .eq('is_read', false);
      } catch {
        // Non-critical read-receipt update
      }
    },
    [currentUserId]
  );

  const loadMessages = useCallback(
    async (bookingId: string) => {
      setIsLoadingMessages(true);
      setErrorMsg(null);
      try {
        const { data, error } = await supabase
          .from('booking_messages')
          .select('id, booking_id, sender_id, message, is_read, created_at')
          .eq('booking_id', bookingId)
          .order('created_at', { ascending: true });

        if (error) {
          const msg = error.message.toLowerCase();
          if (msg.includes('booking_messages') || msg.includes('does not exist') || msg.includes('schema cache')) {
            setMigrationMissing(true);
            setMessages([]);
            return;
          }
          throw error;
        }

        setMigrationMissing(false);
        const rows = (data as BookingMessageRow[]) || [];
        setMessages(rows);
        scrollToBottom(true);

        if (rows.some((r) => r.sender_id !== currentUserId && !r.is_read)) {
          markIncomingAsRead(bookingId);
        }
      } catch (err: any) {
        setErrorMsg(err?.message || 'Gagal memuat riwayat percakapan.');
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [currentUserId, markIncomingAsRead, scrollToBottom]
  );

  useEffect(() => {
    if (!isOpen || !booking) return;

    document.body.style.overflow = 'hidden';
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);

    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, booking, onClose]);

  useEffect(() => {
    if (!isOpen || !booking?.id || !currentUserId) return;

    setMessages([]);
    setDraft('');
    setIsPartnerOnline(false);
    setIsPartnerTyping(false);
    setConnectionState('connecting');

    loadMessages(booking.id);

    const channel = supabase.channel(`booking-chat:${booking.id}`, {
      config: {
        presence: { key: currentUserId },
      },
    });

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'booking_messages',
          filter: `booking_id=eq.${booking.id}`,
        },
        (payload) => {
          const incoming = payload.new as BookingMessageRow;
          if (!incoming?.id) return;

          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) {
              return prev;
            }
            return [...prev, incoming];
          });

          if (incoming.sender_id !== currentUserId) {
            setIsPartnerTyping(false);
            markIncomingAsRead(booking.id);
          }

          scrollToBottom();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'booking_messages',
          filter: `booking_id=eq.${booking.id}`,
        },
        (payload) => {
          const updated = payload.new as BookingMessageRow;
          if (!updated?.id) return;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? { ...m, is_read: updated.is_read } : m))
          );
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const otherUsersOnline = Object.keys(state).some((key) => key !== currentUserId);
        setIsPartnerOnline(otherUsersOnline);
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload || payload.user_id === currentUserId) return;
        setIsPartnerTyping(Boolean(payload.is_typing));
        if (typingClearTimerRef.current !== null) {
          window.clearTimeout(typingClearTimerRef.current);
        }
        if (payload.is_typing) {
          typingClearTimerRef.current = window.setTimeout(() => {
            setIsPartnerTyping(false);
          }, 2600);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setConnectionState('connected');
          try {
            await channel.track({ user_id: currentUserId, online_at: new Date().toISOString() });
          } catch {
            // Presence tracking optional
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnectionState('reconnecting');
        }
      });

    channelRef.current = channel;

    return () => {
      if (typingClearTimerRef.current !== null) {
        window.clearTimeout(typingClearTimerRef.current);
        typingClearTimerRef.current = null;
      }
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [isOpen, booking?.id, currentUserId, loadMessages, markIncomingAsRead, scrollToBottom]);

  const emitTypingStatus = useCallback(
    (isTyping: boolean) => {
      const channel = channelRef.current;
      if (!channel) return;
      const now = Date.now();
      if (isTyping && now - lastTypingEmitRef.current < 1200) return;
      lastTypingEmitRef.current = now;

      channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { user_id: currentUserId, is_typing: isTyping },
      });
    },
    [currentUserId]
  );

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booking || !currentUserId || isSending) return;

    const cleanText = draft.trim();
    if (!cleanText) return;
    if (cleanText.length > 1000) {
      setErrorMsg('Pesan maksimal 1.000 karakter.');
      return;
    }

    setErrorMsg(null);
    setIsSending(true);
    emitTypingStatus(false);

    const tempId = `optimistic-${Date.now()}`;
    const optimisticMessage: UiChatMessage = {
      id: tempId,
      booking_id: booking.id,
      sender_id: currentUserId,
      message: cleanText,
      is_read: false,
      created_at: new Date().toISOString(),
      pending: true,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setDraft('');
    scrollToBottom();

    try {
      const { data: insertedRow, error } = await supabase
        .from('booking_messages')
        .insert({
          booking_id: booking.id,
          sender_id: currentUserId,
          message: cleanText,
        })
        .select('id, booking_id, sender_id, message, is_read, created_at')
        .single();

      if (error) throw error;

      const confirmed = insertedRow as BookingMessageRow;
      setMessages((prev) => {
        const alreadyInsertedViaRealtime = prev.some((m) => m.id === confirmed.id);
        if (alreadyInsertedViaRealtime) {
          return prev.filter((m) => m.id !== tempId);
        }
        return prev.map((m) => (m.id === tempId ? confirmed : m));
      });
    } catch (err: any) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(cleanText);
      const msg = err?.message || 'Gagal mengirim pesan.';
      if (msg.toLowerCase().includes('booking_messages') || msg.toLowerCase().includes('does not exist')) {
        setMigrationMissing(true);
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen || !booking) return null;

  const scheduleText = new Date(booking.start_time).toLocaleString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-950/65 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Chat booking ${booking.booking_code}`}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-xl h-[100dvh] sm:h-[640px] sm:max-h-[88dvh] sm:rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
      >
        {/* Top Chat Header */}
        <div className="px-4 py-3.5 bg-gradient-to-r from-purple-950 via-purple-900 to-[#2D1052] text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-10 h-10 rounded-full bg-white/15 border border-white/20 flex items-center justify-center overflow-hidden shrink-0">
              {partnerAvatar ? (
                <img
                  src={partnerAvatar}
                  alt={partnerName}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <User className="w-5 h-5 text-purple-200" />
              )}
              {isPartnerOnline && (
                <span
                  title="Sedang aktif di chat"
                  className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-purple-950"
                />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white truncate">{partnerName}</h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white/15 text-purple-100 shrink-0">
                  {partnerRoleLabel}
                </span>
              </div>
              <div className="text-[11px] text-purple-200/90 flex items-center gap-1.5">
                {isPartnerTyping ? (
                  <span className="text-amber-300 font-semibold">Sedang mengetik...</span>
                ) : isPartnerOnline ? (
                  <span className="text-emerald-300 font-medium">Online di ruang chat</span>
                ) : connectionState === 'connected' ? (
                  <span>Chat Real-Time Aktif</span>
                ) : (
                  <span>Menghubungkan...</span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup jendela chat"
            className="p-2 rounded-xl text-purple-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Booking Context Bar */}
        <div className="px-4 py-2.5 bg-purple-50/80 border-b border-purple-100 text-[11px] text-slate-700 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
            <span className="font-mono font-extrabold text-purple-900 bg-white border border-purple-200 px-2 py-0.5 rounded">
              {booking.booking_code}
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-slate-700">
              <Calendar className="w-3.5 h-3.5 text-purple-700 shrink-0" />
              <span>{scheduleText} ({booking.duration_hours}j)</span>
            </span>
            <span className="inline-flex items-center gap-1 text-slate-600 truncate max-w-[240px]">
              <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="truncate">{booking.meeting_location_name}</span>
            </span>
          </div>
        </div>

        {/* Safety Strip */}
        <div className="px-4 py-1.5 bg-amber-50/70 border-b border-amber-100 text-[11px] text-amber-900 flex items-center gap-1.5 shrink-0">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-700 shrink-0" />
          <span className="truncate">
            Bahas detail sesi &amp; titik temu di ruang publik. Hindari transaksi di luar platform YUKU.
          </span>
        </div>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FAF8FC]">
          {migrationMissing ? (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Tabel Chat Belum Diaktifkan di Supabase</span>
              </div>
              <p className="text-amber-800 leading-relaxed">
                Jalankan file migrasi{' '}
                <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded">
                  supabase/migrations/17_booking_chat_messages.sql
                </code>{' '}
                di Supabase SQL Editor untuk mengaktifkan chat real-time per booking.
              </p>
            </div>
          ) : isLoadingMessages ? (
            <div className="h-full flex flex-col items-center justify-center text-xs text-slate-500 gap-2 py-12">
              <Loader2 className="w-6 h-6 animate-spin text-purple-700" />
              <span>Memuat percakapan...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-xs">
                <p className="text-sm font-bold text-slate-800">
                  Mulai Diskusi Detail Booking
                </p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Kirim pesan pertama ke {partnerName} untuk menyepakati titik temu, aktivitas, atau pertanyaan seputar jadwal.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setDraft(prompt)}
                    className="px-3 py-1.5 bg-white hover:bg-purple-50 text-purple-900 border border-purple-200 rounded-xl text-[11px] font-semibold transition-colors cursor-pointer"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.sender_id === currentUserId;
              const timeStr = new Date(msg.created_at).toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={msg.id}
                  className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[82%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 text-xs shadow-2xs space-y-1 ${
                      isMine
                        ? 'bg-purple-700 text-white rounded-br-sm'
                        : 'bg-white text-slate-800 border border-slate-200/80 rounded-bl-sm'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words leading-relaxed">
                      {msg.message}
                    </p>
                    <div
                      className={`flex items-center justify-end gap-1 text-[10px] tabular-nums ${
                        isMine ? 'text-purple-200' : 'text-slate-400'
                      }`}
                    >
                      <span>{msg.pending ? 'Mengirim...' : timeStr}</span>
                      {isMine && !msg.pending && (
                        msg.is_read ? (
                          <CheckCheck className="w-3.5 h-3.5 text-amber-300" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-purple-200" />
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Inline Error */}
        {errorMsg && (
          <div className="px-4 py-2 bg-rose-50 border-t border-rose-200 text-[11px] text-rose-800 flex items-center justify-between gap-2 shrink-0">
            <span className="truncate">{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="font-bold text-rose-700 hover:underline shrink-0 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Message Input Bar */}
        <form
          onSubmit={handleSendMessage}
          className="p-3 bg-white border-t border-slate-200 flex items-end gap-2 shrink-0"
        >
          <textarea
            rows={1}
            maxLength={1000}
            value={draft}
            disabled={migrationMissing}
            onChange={(e) => {
              setDraft(e.target.value);
              emitTypingStatus(Boolean(e.target.value.trim()));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(e);
              }
            }}
            placeholder={`Tulis pesan ke ${partnerName}...`}
            className="flex-1 px-3.5 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600 focus:bg-white resize-none max-h-28 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isSending || !draft.trim() || migrationMissing}
            aria-label="Kirim pesan"
            className="h-10 px-4 bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-40"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Kirim</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
