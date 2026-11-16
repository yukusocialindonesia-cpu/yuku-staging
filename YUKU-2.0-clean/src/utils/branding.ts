import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export const DEFAULT_LOGO = '/yuku-logo-transparent.png';
export const DEFAULT_ICON = '/yuku-app-icon-transparent.png';

export interface Branding {
  logoUrl: string;
  iconUrl: string;
}

let current: Branding = { logoUrl: DEFAULT_LOGO, iconUrl: DEFAULT_ICON };
let loaded = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<(b: Branding) => void>();

const toUrl = (path: string | null | undefined, fallback: string) =>
  path ? supabase.storage.from('branding').getPublicUrl(path).data.publicUrl : fallback;

export async function refreshBranding(): Promise<void> {
  try {
    const { data, error } = await (supabase as any)
      .from('site_branding')
      .select('logo_path, icon_path')
      .eq('id', true)
      .maybeSingle();
    if (error || !data) return;
    current = {
      logoUrl: toUrl(data.logo_path, DEFAULT_LOGO),
      iconUrl: toUrl(data.icon_path, DEFAULT_ICON),
    };
    listeners.forEach((l) => l(current));
  } catch {
    // Gagal memuat: tetap pakai logo bawaan.
  } finally {
    loaded = true;
  }
}

export function useBranding(): Branding {
  const [branding, setBranding] = useState<Branding>(current);
  useEffect(() => {
    listeners.add(setBranding);
    setBranding(current);
    if (!loaded && !inflight) inflight = refreshBranding();
    return () => {
      listeners.delete(setBranding);
    };
  }, []);
  return branding;
}
