import { t, type MessageKey } from '@/lib/i18n';

export type AppErrorCode =
  | 'AUTH_REQUIRED'
  | 'RLS_DENIED'
  | 'INVITE_INVALID'
  | 'INVITE_EMAIL_MISMATCH'
  | 'ALREADY_IN_FAMILY'
  | 'DUPLICATE'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'MISSING_FAMILY'
  | 'MISSING_SUPABASE_CONFIG'
  | 'INVALID_LOGIN'
  | 'EMAIL_NOT_CONFIRMED'
  | 'USER_ALREADY_REGISTERED'
  | 'UNKNOWN';

type NormalizedError = {
  message: string;
  code?: string;
  status?: number;
};

const codeToMessageKey: Record<AppErrorCode, MessageKey> = {
  AUTH_REQUIRED: 'error.authRequired',
  RLS_DENIED: 'error.permissionDenied',
  INVITE_INVALID: 'error.inviteInvalid',
  INVITE_EMAIL_MISMATCH: 'error.inviteEmailMismatch',
  ALREADY_IN_FAMILY: 'error.alreadyInFamily',
  DUPLICATE: 'error.duplicate',
  NETWORK: 'error.network',
  TIMEOUT: 'error.network',
  MISSING_FAMILY: 'error.missingFamily',
  MISSING_SUPABASE_CONFIG: 'error.missingSupabaseConfig',
  INVALID_LOGIN: 'error.invalidLogin',
  EMAIL_NOT_CONFIRMED: 'error.emailNotConfirmed',
  USER_ALREADY_REGISTERED: 'error.userAlreadyRegistered',
  UNKNOWN: 'error.generic',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function pickFirstString(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate;
  }
}

const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;

export function normalizeError(input: unknown): NormalizedError {
  if (typeof input === 'string') return { message: input };

  if (isRecord(input)) {
    const maybeMessage = pickFirstString(
      input.message,
      isRecord(input.error) ? input.error.message : undefined
    );

    const code = pickFirstString(
      (input as any).code,
      isRecord(input.error) ? (input.error as any).code : undefined
    );

    const statusCandidate = (input as any).status ?? (input as any).statusCode;
    const status = typeof statusCandidate === 'number' ? statusCandidate : undefined;

    if (maybeMessage) return { message: maybeMessage, code, status };
  }

  return { message: t('error.generic') };
}

export function toAppErrorCode(input: unknown): AppErrorCode {
  const { message, code, status } = normalizeError(input);

  if (status === 401 || message.includes('Authentication required')) return 'AUTH_REQUIRED';

  if (code === '42501' || message.includes('row-level security policy') || message.includes('permission denied')) {
    return 'RLS_DENIED';
  }

  if (code === '23505' || message.includes('duplicate key value violates unique constraint')) return 'DUPLICATE';

  if (message.includes('Invitation invalid or expired')) return 'INVITE_INVALID';
  if (message.includes('Invitation email mismatch')) return 'INVITE_EMAIL_MISMATCH';
  if (message.includes('User already belongs to a family')) return 'ALREADY_IN_FAMILY';

  if (message === 'No family ID') return 'MISSING_FAMILY';
  if (message.startsWith('Supabase configuration is missing:')) return 'MISSING_SUPABASE_CONFIG';

  if (message.includes('Failed to fetch') || message.includes('NetworkError')) return 'NETWORK';
  if (message.includes('超时') || message.toLowerCase().includes('timeout')) return 'TIMEOUT';

  if (message.includes('Invalid login credentials')) return 'INVALID_LOGIN';
  if (message.includes('Email not confirmed')) return 'EMAIL_NOT_CONFIRMED';
  if (message.includes('User already registered')) return 'USER_ALREADY_REGISTERED';

  return 'UNKNOWN';
}

export function toUserMessage(input: unknown): string {
  const normalized = normalizeError(input);
  const code = toAppErrorCode(input);

  if (code === 'UNKNOWN' && CJK_RE.test(normalized.message)) return normalized.message;

  return t(codeToMessageKey[code]);
}
