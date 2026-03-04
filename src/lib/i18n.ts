export type Locale = 'zh-CN' | 'en-US';

export const DEFAULT_LOCALE: Locale = 'zh-CN';

export const zhCN = {
  'error.generic': '发生错误，请稍后重试。',
  'error.authRequired': '请先登录后再继续。',
  'error.permissionDenied': '权限不足或数据不属于你的家庭范围。',
  'error.inviteInvalid': '邀请链接无效或已过期。',
  'error.inviteEmailMismatch': '该邀请链接绑定了邮箱，请使用对应邮箱登录。',
  'error.alreadyInFamily': '你已加入家庭，无法重复加入。',
  'error.duplicate': '已存在相同记录，请勿重复创建。',
  'error.network': '网络异常，请检查网络后重试。',
  'error.missingFamily': '缺少家庭信息，请先完成家庭设置。',
  'error.missingSupabaseConfig': '系统配置缺失，请联系管理员或检查环境变量设置。',
  'error.invalidLogin': '账号或密码错误，请重试。',
  'error.emailNotConfirmed': '邮箱尚未验证，请先完成邮箱验证。',
  'error.userAlreadyRegistered': '该邮箱已注册，请直接登录。',
} as const;

export type MessageKey = keyof typeof zhCN;

export function getDefaultLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  try {
    const stored = window.localStorage.getItem('locale');
    if (stored === 'zh-CN' || stored === 'en-US') return stored;
  } catch {
    // ignore
  }

  const lang = window.navigator.language;
  if (lang === 'zh-CN' || lang.startsWith('zh')) return 'zh-CN';
  if (lang === 'en-US' || lang.startsWith('en')) return 'en-US';
  return DEFAULT_LOCALE;
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template = zhCN[key];
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name];
    return value === undefined ? `{${name}}` : String(value);
  });
}
