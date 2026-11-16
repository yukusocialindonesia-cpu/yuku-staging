import { createClient } from '@supabase/supabase-js';

// Never connect to a baked-in project. Configure these values in the deployment
// environment (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).
const rawEnvUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const rawEnvKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
)?.trim();

const normalizedEnvUrl = (() => {
  if (!rawEnvUrl) return null;
  try {
    const parsed = new URL(rawEnvUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
})();

export const isSupabaseConfigured = Boolean(normalizedEnvUrl && rawEnvKey);

// Supabase JS requires a syntactically valid URL/key at construction time.
// These inert placeholders deliberately point to the reserved .invalid domain;
// they cannot silently connect this build to a real YUKU or third-party project.
const supabaseUrl = normalizedEnvUrl || 'https://supabase-configuration-required.invalid';
const supabaseKey = rawEnvKey || 'configuration-required-placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export async function checkSupabaseConnection(): Promise<{
  connected: boolean;
  status: 'CONNECTED' | 'PERMISSION_DENIED' | 'CONFIG_ERROR' | 'NETWORK_ERROR';
  message: string;
  code?: string;
  hint?: string;
  table?: string;
  rowCount?: number;
}> {
  if (!isSupabaseConfigured) {
    return {
      connected: false,
      status: 'CONFIG_ERROR',
      message: 'Konfigurasi Supabase belum lengkap. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY pada environment deployment.',
    };
  }

  try {
    const { data, error } = await supabase
      .from('activity_categories')
      .select('id')
      .limit(1);

    if (error) {
      if (error.code === '42501' || error.message.toLowerCase().includes('permission denied')) {
        return {
          connected: true,
          status: 'PERMISSION_DENIED',
          code: error.code,
          hint: error.hint || 'Periksa GRANT SELECT dan RLS pada public.activity_categories.',
          message: 'Server Supabase terhubung, tetapi akses tabel activity_categories ditolak oleh privilege atau RLS.',
          table: 'activity_categories',
        };
      }

      return {
        connected: false,
        status: 'NETWORK_ERROR',
        code: error.code,
        message: `Koneksi Supabase error: ${error.message} (${error.code || 'UNKNOWN'})`,
      };
    }

    return {
      connected: true,
      status: 'CONNECTED',
      message: 'Koneksi ke Supabase berhasil.',
      table: 'activity_categories',
      rowCount: data?.length ?? 0,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      connected: false,
      status: 'NETWORK_ERROR',
      message: `Terjadi kesalahan jaringan saat menguji Supabase: ${message}`,
    };
  }
}

if (!isSupabaseConfigured) {
  console.error('YUKU: Supabase belum dikonfigurasi. Aplikasi tidak akan terhubung ke proyek bawaan.');
}
