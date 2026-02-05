
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { t } from '@/lib/i18n';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const isProd = import.meta.env.PROD;

const missingKeys: string[] = [];
if (!supabaseUrl) missingKeys.push('VITE_SUPABASE_URL');
if (!supabaseAnonKey) missingKeys.push('VITE_SUPABASE_ANON_KEY');

export const supabaseConfig =
  missingKeys.length === 0
    ? { ok: true as const, url: supabaseUrl!, anonKey: supabaseAnonKey! }
    : {
        ok: false as const,
        missingKeys,
        message: t('error.missingSupabaseConfig'),
        debugMessage: `Supabase configuration is missing: ${missingKeys.join(', ')}`,
      };

if (!supabaseConfig.ok) {
  console.warn(isProd ? supabaseConfig.message : supabaseConfig.debugMessage);
}

function createMissingConfigClient(message: string) {
  return new Proxy(
    {},
    {
      get() {
        throw new Error(message);
      },
    }
  ) as SupabaseClient;
}

export const supabase: SupabaseClient = supabaseConfig.ok
  ? createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : isProd
    ? createMissingConfigClient(supabaseConfig.message)
    : createClient(supabaseUrl ?? '', supabaseAnonKey ?? '');
