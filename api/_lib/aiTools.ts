import { z } from 'zod';
import { CopilotResponseSchema, type CopilotResponse } from './aiSchemas';
import { callOpenAiCompatChatJson } from './aiOpenAiCompat';

export type ToolContext = {
  traceId: string;
  userId: string;
  familyId: string;
  role: 'admin' | 'parent' | 'child';
  userClient: any;
  now: Date;
};

type Tool = {
  id: string;
  name: string;
  inputSchema: z.ZodTypeAny;
  run: (ctx: ToolContext, input: any) => Promise<CopilotResponse>;
};

function normalizeText(s: string): string {
  return s.trim().toLowerCase();
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

function parseAmount(text: string): number | null {
  const m = text.match(/([+-]?\s*\d+(?:\.\d+)?)/);
  if (!m) return null;
  const raw = m[1] ?? '';
  const num = Number(String(raw).replace(/\s+/g, ''));
  if (!Number.isFinite(num)) return null;
  return Math.abs(num);
}

function detectIncome(text: string): boolean {
  if (text.includes('+')) return true;
  return containsAny(text, ['收入', '工资', '奖金', '报销', '转入', '收款']);
}

function guessCategory(text: string, type: 'income' | 'expense'): string {
  const t = normalizeText(text);
  const rules: Array<{ keys: string[]; cat: string; type?: 'income' | 'expense' }> = [
    { keys: ['地铁', '公交', '打车', '滴滴', '出租'], cat: '交通', type: 'expense' },
    { keys: ['午饭', '晚饭', '早餐', '外卖', '餐', '咖啡', '奶茶'], cat: '餐饮', type: 'expense' },
    { keys: ['房租', '租金', '物业'], cat: '住房', type: 'expense' },
    { keys: ['电费', '水费', '燃气', '宽带', '话费'], cat: '生活缴费', type: 'expense' },
    { keys: ['超市', '便利店', '买菜'], cat: '日用', type: 'expense' },
    { keys: ['工资', '奖金', '报销'], cat: '工资', type: 'income' },
  ];
  const hit = rules.find((r) => (r.type ? r.type === type : true) && containsAny(t, r.keys));
  return hit?.cat ?? (type === 'income' ? '收入' : '其他');
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function pickMonthStart(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

async function getRecentTransactions(ctx: ToolContext, monthsBack: number) {
  const from = new Date(ctx.now.getFullYear(), ctx.now.getMonth() - monthsBack, 1);
  const { data, error } = await ctx.userClient
    .from('transactions')
    .select('*')
    .eq('family_id', ctx.familyId)
    .gte('date', from.toISOString())
    .order('date', { ascending: false })
    .limit(4000);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function getThisMonthBudgets(ctx: ToolContext) {
  const monthStart = pickMonthStart(ctx.now);
  const { data, error } = await ctx.userClient
    .from('budgets')
    .select('*')
    .eq('family_id', ctx.familyId)
    .eq('month_start', monthStart);
  if (error) throw error;
  return { monthStart, budgets: Array.isArray(data) ? data : [] };
}

function computeBudgetAdvice(args: { monthStart: string; budgets: any[]; transactions: any[] }) {
  const monthStart = new Date(`${args.monthStart}T00:00:00Z`);
  const spentByCat = new Map<string, number>();
  for (const t of args.transactions) {
    if (t?.type !== 'expense') continue;
    const date = new Date(String(t?.date ?? ''));
    if (Number.isNaN(date.getTime()) || date < monthStart) continue;
    const key = String(t?.category ?? '').trim() || '其他';
    const amt = Number(t?.amount);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    spentByCat.set(key, (spentByCat.get(key) ?? 0) + amt);
  }
  const budgetByCat = new Map<string, number>();
  for (const b of args.budgets) {
    const key = String(b?.category_name ?? '').trim() || String(b?.category ?? '').trim() || '其他';
    const amt = Number(b?.amount);
    if (!Number.isFinite(amt) || amt < 0) continue;
    budgetByCat.set(key, (budgetByCat.get(key) ?? 0) + amt);
  }
  const rows = Array.from(new Set([...spentByCat.keys(), ...budgetByCat.keys()])).map((cat) => {
    const spent = spentByCat.get(cat) ?? 0;
    const budget = budgetByCat.get(cat) ?? 0;
    return { cat, spent, budget, ratio: budget > 0 ? spent / budget : null };
  });
  const overspent = rows.filter((r) => (r.ratio ?? 0) >= 1).sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0));
  const unbudgeted = rows.filter((r) => r.budget <= 0 && r.spent > 0).sort((a, b) => b.spent - a.spent);
  return { overspent: overspent.slice(0, 3), unbudgeted: unbudgeted.slice(0, 3) };
}

function buildActionItemDraft(args: {
  draftId: string;
  module: 'finance' | 'health' | 'relationships' | 'growth' | 'settings';
  title: string;
  next_step?: string | null;
  due_date?: string | null;
  visibility?: 'family' | 'private';
  owner_user_id?: string | null;
  description?: string | null;
  source_meta?: Record<string, unknown>;
}) {
  return {
    draftId: args.draftId,
    kind: 'action_item' as const,
    title: args.title,
    requiresConfirm: true as const,
    data: {
      module: args.module,
      title: args.title,
      description: args.description ?? null,
      next_step: args.next_step ?? null,
      due_date: args.due_date ?? null,
      visibility: args.visibility ?? 'family',
      owner_user_id: args.owner_user_id ?? null,
      source: 'ai',
      source_meta: args.source_meta ?? {},
    },
  };
}

const tools: Tool[] = [
  {
    id: 'finance.quickbook.nl',
    name: '一句话记账（草稿）',
    inputSchema: z.object({ message: z.string().min(1) }),
    run: async (ctx, input) => {
      const raw = String(input?.message ?? '').trim();
      const amount = parseAmount(raw);
      if (!amount || !(amount > 0)) {
        return CopilotResponseSchema.parse({
          summary: '我没识别到金额。你可以这样写：午饭 38 / 地铁 4.5 / 工资 +20000',
          cards: [
            { type: 'copy_text', label: '复制示例：午饭 38', payload: { text: '午饭 38' } },
            { type: 'open_modal', label: '打开“记一笔”', payload: { modal: 'transaction.add' } },
          ],
          warnings: ['金额是必填项。'],
          meta: { traceId: ctx.traceId, toolId: 'finance.quickbook.nl', confidence: 0.6 },
        });
      }

      const isIncome = detectIncome(raw);
      const type: 'income' | 'expense' = isIncome ? 'income' : 'expense';
      const title = '交易草稿';
      const draftId = `${ctx.traceId}:draft:tx:1`;
      const today = ymd(ctx.now);
      const category = guessCategory(raw, type);

      return CopilotResponseSchema.parse({
        summary: `已为你生成一笔${type === 'income' ? '收入' : '支出'}草稿，确认即可入账。`,
        cards: [
          { type: 'open_modal', label: '打开草稿并确认', payload: { modal: 'transaction.add', draftId } },
          { type: 'navigate', label: '去财务中心', payload: { href: '/finance' } },
        ],
        drafts: [
          {
            draftId,
            kind: 'transaction',
            title,
            requiresConfirm: true,
            data: {
              amount,
              type,
              category,
              description: raw.replace(String(amount), '').trim() || null,
              date: new Date(`${today}T12:00:00`).toISOString(),
              visibility: 'family',
            },
          },
        ],
        meta: { traceId: ctx.traceId, toolId: 'finance.quickbook.nl', confidence: 0.85 },
      });
    },
  },
  {
    id: 'finance.import.assistant',
    name: '导入助手（入口）',
    inputSchema: z.object({ message: z.string().min(1) }),
    run: async (ctx) => {
      return CopilotResponseSchema.parse({
        summary: '我可以带你去“导入账单”，并在导入页帮你做去重与分类建议。',
        cards: [
          { type: 'navigate', label: '打开导入账单', payload: { href: '/finance/transactions?action=import' } },
          { type: 'copy_text', label: '复制提示：可直接粘贴截图', payload: { text: '你可以直接在导入弹窗里按 ⌘+V 粘贴截图。' } },
        ],
        warnings: ['截图请尽量清晰，避免遮挡金额与日期。'],
        meta: { traceId: ctx.traceId, toolId: 'finance.import.assistant', confidence: 0.7 },
      });
    },
  },
  {
    id: 'finance.budget.coach',
    name: '预算教练（草稿）',
    inputSchema: z.object({ message: z.string().min(1) }),
    run: async (ctx) => {
      const [txs, { monthStart, budgets }] = await Promise.all([getRecentTransactions(ctx, 2), getThisMonthBudgets(ctx)]);
      const advice = computeBudgetAdvice({ monthStart, budgets, transactions: txs });
      const warnings: string[] = [];
      const parts: string[] = [];
      if (budgets.length === 0) warnings.push('本月还没有预算配置，建议先从常用支出分类开始。');
      if (advice.unbudgeted.length > 0) {
        parts.push(`未预算但已有支出：${advice.unbudgeted.map((r) => `${r.cat}`).join('、')}`);
      }
      if (advice.overspent.length > 0) {
        parts.push(`可能超支：${advice.overspent.map((r) => `${r.cat}`).join('、')}`);
      }
      const summary = parts.length > 0 ? parts.join('；') : '当前没有明显的预算异常点。';
      return CopilotResponseSchema.parse({
        summary: `本月预算教练：${summary}`,
        cards: [
          { type: 'navigate', label: '打开预算管理', payload: { href: '/finance/budgets' } },
          { type: 'navigate', label: '查看交易记录', payload: { href: '/finance/transactions' } },
        ],
        warnings: warnings.length > 0 ? warnings : undefined,
        meta: { traceId: ctx.traceId, toolId: 'finance.budget.coach', confidence: 0.65 },
      });
    },
  },
  {
    id: 'health.week.plan',
    name: '本周行动清单（草稿）',
    inputSchema: z.object({ message: z.string().min(1) }),
    run: async (ctx) => {
      const base = new Date(ctx.now.getTime());
      const day = base.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const weekStart = new Date(base.getFullYear(), base.getMonth(), base.getDate() + diff);
      const due = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
      const dueDate = ymd(due);
      const drafts = [
        buildActionItemDraft({
          draftId: `${ctx.traceId}:draft:ai:health:1`,
          module: 'health',
          title: '本周：保证 7 小时睡眠',
          next_step: '今晚提前 30 分钟上床，并把起床时间固定下来。',
          due_date: dueDate,
          owner_user_id: ctx.userId,
          visibility: 'private',
          source_meta: { toolId: 'health.week.plan' },
        }),
        buildActionItemDraft({
          draftId: `${ctx.traceId}:draft:ai:health:2`,
          module: 'health',
          title: '本周：完成 2 次运动',
          next_step: '安排 2 次 30 分钟快走/跑步，先把时间写进日程。',
          due_date: dueDate,
          owner_user_id: ctx.userId,
          visibility: 'private',
          source_meta: { toolId: 'health.week.plan' },
        }),
        buildActionItemDraft({
          draftId: `${ctx.traceId}:draft:ai:health:3`,
          module: 'health',
          title: '本周：每天 7000 步',
          next_step: '每天午饭后散步 15 分钟作为固定触发。',
          due_date: dueDate,
          owner_user_id: ctx.userId,
          visibility: 'private',
          source_meta: { toolId: 'health.week.plan' },
        }),
      ];
      return CopilotResponseSchema.parse({
        summary: '已为你生成本周健康行动草稿，确认后会进入行动收件箱。',
        cards: [
          { type: 'open_inbox', label: '去行动收件箱', payload: { href: '/dashboard' } },
          { type: 'navigate', label: '打开健康中心', payload: { href: '/health' } },
        ],
        drafts,
        meta: { traceId: ctx.traceId, toolId: 'health.week.plan', confidence: 0.7 },
      });
    },
  },
  {
    id: 'health.metrics.explain',
    name: '指标解释（只读+建议）',
    inputSchema: z.object({ message: z.string().min(1) }),
    run: async (ctx) => {
      const from = new Date(ctx.now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const { data, error } = await ctx.userClient
        .from('health_metrics')
        .select('*')
        .eq('subject_user_id', ctx.userId)
        .gte('recorded_at', ymd(from))
        .order('recorded_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      const byKey = new Map<string, number>();
      rows.forEach((r) => {
        const k = String(r?.metric_key ?? '');
        const v = Number(r?.value);
        if (!k || !Number.isFinite(v)) return;
        byKey.set(k, (byKey.get(k) ?? 0) + 1);
      });
      const have = Array.from(byKey.entries()).sort((a, b) => b[1] - a[1]).map(([k]) => k);
      const summary =
        have.length === 0
          ? '你最近 90 天还没有指标记录。建议先从“睡眠/步数/体重”任选一个开始，每天只记 1 个。'
          : `你最近 90 天记录最多的指标：${have.slice(0, 2).join('、')}。建议把注意力放在一个指标上先稳定 7 天。`;
      return CopilotResponseSchema.parse({
        summary,
        cards: [
          { type: 'navigate', label: '打开健康中心', payload: { href: '/health' } },
          { type: 'copy_text', label: '复制提示：每天只记 1 个', payload: { text: '每天只记 1 个指标（睡眠/步数/体重任选），连续 7 天先稳定下来。' } },
        ],
        meta: { traceId: ctx.traceId, toolId: 'health.metrics.explain', confidence: 0.6 },
      });
    },
  },
  {
    id: 'health.checkin.coach',
    name: '打卡纠偏（草稿）',
    inputSchema: z.object({ message: z.string().min(1) }),
    run: async (ctx, input) => {
      const raw = String(input?.message ?? '').trim();
      const due = new Date(ctx.now.getTime() + 3 * 24 * 60 * 60 * 1000);
      const dueDate = ymd(due);
      const drafts = [
        buildActionItemDraft({
          draftId: `${ctx.traceId}:draft:ai:health:fix:1`,
          module: 'health',
          title: '纠偏：把今天的目标缩小一半',
          next_step: '只做一个最小动作：散步 10 分钟或早点睡 15 分钟。',
          due_date: dueDate,
          owner_user_id: ctx.userId,
          visibility: 'private',
          description: raw || null,
          source_meta: { toolId: 'health.checkin.coach' },
        }),
      ];
      return CopilotResponseSchema.parse({
        summary: '我已根据你的状态生成一条“最小下一步”草稿，确认后会进入行动收件箱。',
        cards: [
          { type: 'open_inbox', label: '去行动收件箱', payload: { href: '/dashboard' } },
          { type: 'navigate', label: '打开健康中心', payload: { href: '/health' } },
        ],
        drafts,
        meta: { traceId: ctx.traceId, toolId: 'health.checkin.coach', confidence: 0.6 },
      });
    },
  },
];

export function listToolIds(): string[] {
  return tools.map((t) => t.id);
}

export async function pickToolId(args: {
  message: string;
  module?: string;
  provider: 'deepseek' | 'openai';
  deepseek?: { apiKey: string; baseUrl: string; model: string };
  openai?: { apiKey: string; model: string };
  traceId: string;
}): Promise<{ toolId: string; confidence: number }> {
  const text = normalizeText(args.message);
  if (containsAny(text, ['导入', '账单', 'csv', '截图', '粘贴'])) return { toolId: 'finance.import.assistant', confidence: 0.85 };
  if (containsAny(text, ['预算', '超支', '缺口', '执行率'])) return { toolId: 'finance.budget.coach', confidence: 0.8 };
  if (containsAny(text, ['本周', '下周', '行动清单', '计划']) && containsAny(text, ['健康', '睡眠', '运动', '步数'])) {
    return { toolId: 'health.week.plan', confidence: 0.75 };
  }
  if (containsAny(text, ['健康', '体重', '睡眠', '步数', '指标'])) return { toolId: 'health.metrics.explain', confidence: 0.75 };
  if (containsAny(text, ['打卡', '纠偏', '状态', '坚持不下去', '很差', '崩了'])) return { toolId: 'health.checkin.coach', confidence: 0.7 };
  if (parseAmount(text)) return { toolId: 'finance.quickbook.nl', confidence: 0.7 };

  const candidates = listToolIds();
  const system =
    '你是一个工具选择器。你只能输出严格 JSON：{ "toolId": string, "confidence": number }。toolId 必须从候选列表中选择。confidence 范围 0~1。不要输出多余文本。';
  const user =
    `用户输入：${args.message}\n\n` +
    `当前模块：${args.module ?? ''}\n\n` +
    `候选 toolId：\n${candidates.map((x) => `- ${x}`).join('\n')}\n\n` +
    '请根据“最少打断、生成草稿、推动完成”的原则选择最合适的工具。';

  const llm = async () => {
    if (args.provider === 'deepseek') {
      const ds = args.deepseek;
      if (!ds?.apiKey) throw new Error('识别服务未配置，请联系管理员。');
      const { jsonText } = await callOpenAiCompatChatJson({
        baseUrl: ds.baseUrl,
        apiKey: ds.apiKey,
        model: ds.model,
        system,
        user,
        temperature: 0,
      });
      return jsonText;
    }
    const oa = args.openai;
    if (!oa?.apiKey) throw new Error('识别服务未配置，请联系管理员。');
    const { jsonText } = await callOpenAiCompatChatJson({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: oa.apiKey,
      model: oa.model,
      system,
      user,
      temperature: 0,
    });
    return jsonText;
  };

  try {
    const raw = await llm();
    const parsed = JSON.parse(raw);
    const toolId = typeof parsed?.toolId === 'string' && candidates.includes(parsed.toolId) ? parsed.toolId : 'health.metrics.explain';
    const confidence = Math.max(0, Math.min(1, Number(parsed?.confidence) || 0.5));
    return { toolId, confidence };
  } catch {
    return { toolId: 'health.metrics.explain', confidence: 0.4 };
  }
}

export async function runTool(args: { toolId: string; ctx: ToolContext; input: any }): Promise<CopilotResponse> {
  const tool = tools.find((t) => t.id === args.toolId) ?? tools[0];
  const parsed = tool.inputSchema.safeParse(args.input);
  const input = parsed.success ? parsed.data : { message: String(args.input?.message ?? '') };
  const res = await tool.run(args.ctx, input);
  return CopilotResponseSchema.parse({
    ...res,
    meta: { ...(res.meta ?? {}), traceId: args.ctx.traceId, toolId: tool.id, confidence: res.meta?.confidence },
  });
}
