import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Bot, ChevronDown, ChevronRight, Loader2, Pencil, Plus, Sparkles, Star, Trash2, X, Zap } from 'lucide-react';
import { useAiProviders } from '@/hooks/useAiProviders';
import { useDiscoverFreeModels } from '@/hooks/useDiscoverFreeModels';
import { ApiError, type DiscoveredSuggestion, type ProviderDraft, type PublicProvider } from '@/lib/aiProviders';
import { useToastStore } from '@/stores/toast';
import { useConfirm } from '@/hooks/useConfirm';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ListRow, ListRowLeading, ListRowTrailing } from '@/components/ui/list-row';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { Select } from '@/components/ui/select';

const PROVIDER_TEMPLATES = [
  { label: '智谱 GLM（免费）', base_url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.5-air', capability: 'text', cost_tier: 'free' },
  { label: '阿里云百炼 Qwen（免费）', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3.8-flash', capability: 'text', cost_tier: 'free' },
  { label: 'Kimi（免费）', base_url: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', capability: 'text', cost_tier: 'free' },
  { label: '火山方舟 豆包（免费）', base_url: 'https://ark.cn-beijing.volces.com/api/v3', model: '', capability: 'text', cost_tier: 'free' },
  { label: 'DeepSeek（付费）', base_url: 'https://api.deepseek.com', model: 'deepseek-chat', capability: 'text', cost_tier: 'paid' },
  { label: 'OpenAI（付费 · 视觉）', base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini', capability: 'vision', cost_tier: 'paid' },
] as const;

type FormState = {
  name: string; base_url: string; model: string; api_key: string;
  capability: 'text' | 'vision'; cost_tier: 'free' | 'paid'; enabled: boolean;
  scope: 'personal' | 'shared';
};

const EMPTY_FORM: FormState = { name: '', base_url: '', model: '', api_key: '', capability: 'text', cost_tier: 'free', enabled: true, scope: 'personal' };

function errText(err: unknown): { message: string; traceId?: string } {
  if (err instanceof ApiError) return { message: err.message, traceId: err.traceId };
  return { message: err instanceof Error ? err.message : '操作失败' };
}

function RowBadges({ row, isTextDefault, isVisionDefault }: { row: PublicProvider; isTextDefault: boolean; isVisionDefault: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="truncate text-sm font-medium">{row.name}</span>
      {isTextDefault ? <Badge variant="success"><Star className="mr-1 h-3 w-3" />文本默认</Badge> : null}
      {isVisionDefault ? <Badge variant="success"><Star className="mr-1 h-3 w-3" />视觉默认</Badge> : null}
      <Badge variant={row.enabled ? 'default' : 'warning'}>{row.enabled ? '启用' : '停用'}</Badge>
      <Badge variant={row.cost_tier === 'free' ? 'success' : 'warning'}>{row.cost_tier === 'free' ? '免费' : '收费'}</Badge>
      <Badge>{row.capability === 'vision' ? '视觉' : '文本'}</Badge>
      {row.test_status ? <Badge variant={row.test_status === 'ok' ? 'success' : 'danger'}>{row.test_status === 'ok' ? '连通 ✓' : '连通 ✗'}</Badge> : null}
    </div>
  );
}

export default function SettingsAiProviders() {
  const {
    providers, defaults, canManageShared, isLoading, isError, refetch,
    create, update, remove, reorder, test, setDefault,
  } = useAiProviders();
  const pushToast = useToastStore((s) => s.push);
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState<PublicProvider | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const fail = (title: string) => (err: unknown) => {
    const { message, traceId } = errText(err);
    pushToast({ variant: 'danger', title, message: message + (traceId ? `（${traceId}）` : '') });
  };

  const mine = providers.filter((p) => p.owner_user_id !== null);
  const shared = providers.filter((p) => p.owner_user_id === null);

  const openNew = (scope: 'personal' | 'shared') => { setForm({ ...EMPTY_FORM, scope }); setEditing('new'); };
  const openEdit = (row: PublicProvider) => {
    setForm({
      name: row.name, base_url: row.base_url, model: row.model, api_key: '',
      capability: row.capability, cost_tier: row.cost_tier, enabled: row.enabled,
      scope: row.owner_user_id === null ? 'shared' : 'personal',
    });
    setEditing(row);
  };
  const closeForm = () => { setEditing(null); setForm(EMPTY_FORM); };

  const applyTemplate = (label: string) => {
    const t = PROVIDER_TEMPLATES.find((x) => x.label === label);
    if (!t) return;
    setForm((f) => ({ ...f, name: f.name || t.label.split('（')[0], base_url: t.base_url, model: t.model, capability: t.capability, cost_tier: t.cost_tier }));
  };

  const submit = async () => {
    const name = form.name.trim();
    const baseUrl = form.base_url.trim();
    const model = form.model.trim();
    if (!name) return pushToast({ variant: 'danger', title: '请填写名称', message: '给这个模型起个名字，例如「智谱免费」。' });
    if (!baseUrl) return pushToast({ variant: 'danger', title: '请填写 Base URL', message: 'OpenAI 兼容接口地址，例如 https://api.deepseek.com。' });
    if (!model) return pushToast({ variant: 'danger', title: '请填写模型标识', message: '例如 deepseek-chat、glm-4.5-air。' });
    if (editing === 'new' && !form.api_key.trim()) return pushToast({ variant: 'danger', title: '请填写 API Key', message: '新增模型必须提供密钥。' });
    try {
      if (editing === 'new') {
        await create.mutateAsync({ name, base_url: baseUrl, model, api_key: form.api_key.trim(), capability: form.capability, cost_tier: form.cost_tier, enabled: form.enabled, scope: form.scope });
        pushToast({ variant: 'success', title: '已新增模型', message: name });
      } else if (editing) {
        const patch: Partial<ProviderDraft> = { name, base_url: baseUrl, model, capability: form.capability, cost_tier: form.cost_tier, enabled: form.enabled };
        if (form.api_key.trim()) patch.api_key = form.api_key.trim();
        await update.mutateAsync({ id: editing.id, patch });
        pushToast({ variant: 'success', title: '已保存', message: name });
      }
      closeForm();
    } catch (err) {
      fail('保存失败')(err);
    }
  };

  // 排序仅在同一分区内（后端 reorder 有同域约束，跨区会被 400 拒绝）
  const move = (list: PublicProvider[], index: number, dir: -1 | 1) => {
    const ids = list.map((x) => x.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    reorder.mutate(ids, { onError: fail('排序失败') });
  };

  const toggleEnabled = (row: PublicProvider) => {
    update.mutate({ id: row.id, patch: { enabled: !row.enabled } }, { onError: fail('更新失败') });
  };

  const runTest = async (row: PublicProvider) => {
    const r = await test.mutateAsync(row.id).catch(() => null);
    if (!r) return pushToast({ variant: 'danger', title: '测试失败', message: '请检查网络或密钥。' });
    pushToast({ variant: r.status === 'ok' ? 'success' : 'danger', title: r.status === 'ok' ? `连通 ✓ ${r.latencyMs}ms` : '连通 ✗', message: r.detail ?? '' });
  };

  const runDelete = async (row: PublicProvider) => {
    const ok = await confirm({ title: '删除模型', message: `确定删除「${row.name}」？此操作不可撤销。`, confirmText: '删除', tone: 'danger' });
    if (!ok) return;
    remove.mutate(row.id, {
      onError: fail('删除失败'),
      onSuccess: () => pushToast({ variant: 'success', title: '已删除', message: row.name }),
    });
  };

  const runSetDefault = (row: PublicProvider) => {
    setDefault.mutate(
      { capability: row.capability, providerId: row.id },
      {
        onError: fail('设置默认失败'),
        onSuccess: () => pushToast({ variant: 'success', title: '已设为默认', message: `${row.name}（${row.capability === 'vision' ? '视觉' : '文本'}）` }),
      },
    );
  };

  // 徽标比对加 capability 一致性 + enabled 防御（批3评审 M-1 / 终审 #4）：
  // 停用行不参与路由，不得挂「当前默认」徽标；共享行被改能力后也不挂错槽位徽标
  const defaultBadgeFlags = (row: PublicProvider) => ({
    isTextDefault: row.enabled && row.capability === 'text' && defaults.text === row.id,
    isVisionDefault: row.enabled && row.capability === 'vision' && defaults.vision === row.id,
  });

  const renderRow = (row: PublicProvider, index: number, list: PublicProvider[], manageable: boolean) => {
    const isDefault = row.enabled && defaults[row.capability] === row.id;
    return (
      <ListRow key={row.id}>
        <ListRowLeading>
          <div className="min-w-0">
            <RowBadges row={row} {...defaultBadgeFlags(row)} />
            <div className="truncate text-xs text-muted-foreground">{row.model} · {row.base_url} · {row.api_key_mask}</div>
            {row.test_detail ? <div className="truncate text-xs text-muted-foreground/80">{row.test_detail}</div> : null}
          </div>
        </ListRowLeading>
        <ListRowTrailing className="sm:justify-end">
          {manageable ? (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => move(list, index, -1)} disabled={index === 0 || reorder.isPending} aria-label="上移"><ArrowUp className="h-4 w-4" /></Button>
              <Button variant="ghost" size="sm" onClick={() => move(list, index, 1)} disabled={index === list.length - 1 || reorder.isPending} aria-label="下移"><ArrowDown className="h-4 w-4" /></Button>
            </div>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => runSetDefault(row)} disabled={isDefault || setDefault.isPending || !row.enabled}>
            <Star className={cn('h-4 w-4', isDefault && 'fill-current text-primary')} />
            {isDefault ? '当前默认' : `设为${row.capability === 'vision' ? '视觉' : '文本'}默认`}
          </Button>
          {manageable ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => toggleEnabled(row)} disabled={update.isPending}>{row.enabled ? '停用' : '启用'}</Button>
              <Button variant="ghost" size="sm" onClick={() => openEdit(row)} aria-label="编辑"><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="sm" onClick={() => runDelete(row)} aria-label="删除"><Trash2 className="h-4 w-4" /></Button>
            </>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => runTest(row)} disabled={test.isPending}>
            {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            测试
          </Button>
        </ListRowTrailing>
      </ListRow>
    );
  };

  // 免费模型发现（spec 2026-09-21 §5）：折叠区展开才请求；启用走 create 的 reuse_key_from 服务端复制密文
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const discover = useDiscoverFreeModels(discoverOpen);
  const [enabling, setEnabling] = useState<DiscoveredSuggestion | null>(null);
  const [enableName, setEnableName] = useState('');
  const [enableScope, setEnableScope] = useState<'personal' | 'shared'>('personal');

  const openEnable = (s: DiscoveredSuggestion) => { setEnabling(s); setEnableName(s.name); setEnableScope('personal'); };
  const closeEnable = () => setEnabling(null);
  const submitEnable = async () => {
    if (!enabling) return;
    try {
      await create.mutateAsync({
        name: enableName.trim() || enabling.name, base_url: enabling.base_url, model: enabling.model_id,
        reuse_key_from: enabling.reuse_provider_id ?? undefined,
        capability: enabling.capability, cost_tier: 'free', scope: enableScope,
      });
      pushToast({ variant: 'success', title: '已启用', message: `${enableName || enabling.name}（复用了同厂商密钥）` });
      closeEnable();
    } catch (err) { fail('启用失败')(err); }
  };
  const openPrefillAdd = (s: DiscoveredSuggestion) => {
    setForm({ ...EMPTY_FORM, name: s.name, base_url: s.base_url, model: s.model_id, capability: s.capability, cost_tier: 'free', scope: 'personal' });
    setEditing('new');
  };

  return (
    <Page>
      {dialog}
      <PageHeader>
        <div>
          <PageTitle>我的 AI 模型</PageTitle>
          <PageDescription>选择你喜欢的模型作为默认；也可以绑定自己的私有 API Key。未配置时自动使用平台默认模型。</PageDescription>
        </div>
      </PageHeader>

      {isLoading ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">加载中…</CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="text-sm text-muted-foreground">加载失败，请检查网络或登录状态后重试。</div>
            <Button size="sm" variant="secondary" onClick={() => refetch()}>重试</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>我的模型</CardTitle>
                  <CardDescription>你绑定的私有模型，密钥仅你可见；顺序即降级优先级。</CardDescription>
                </div>
                <Button variant="secondary" size="sm" onClick={() => openNew('personal')}>
                  <Plus className="h-4 w-4" />
                  新增
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {mine.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-10 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Bot className="h-6 w-6" /></div>
                  <div className="text-sm text-muted-foreground">还没有私有模型。可直接选用下方平台默认模型，或新增自己的模型。</div>
                  <Button size="sm" onClick={() => openNew('personal')}><Plus className="h-4 w-4" />新增第一个模型</Button>
                </div>
              ) : (
                <div className="divide-y divide-border rounded-xl border border-border">
                  {mine.map((row, index) => renderRow(row, index, mine, true))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>平台默认模型</CardTitle>
                  <CardDescription>平台预置的免填即用模型，人人可选为默认。</CardDescription>
                </div>
                {canManageShared ? (
                  <Button variant="secondary" size="sm" onClick={() => openNew('shared')}>
                    <Plus className="h-4 w-4" />
                    新增共享模型
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {shared.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                  平台尚未预置模型；AI 功能将使用系统兜底配置。
                </div>
              ) : (
                <div className="divide-y divide-border rounded-xl border border-border">
                  {shared.map((row, index) => renderRow(row, index, shared, canManageShared))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left"
              onClick={() => setDiscoverOpen((v) => !v)}
              aria-expanded={discoverOpen}
            >
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">发现免费模型</span>
                <span className="text-xs text-muted-foreground">来自 models.dev 开放目录，零单价模型</span>
              </span>
              {discoverOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
            {discoverOpen ? (
              <CardContent className="pt-0">
                {discover.isLoading ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">正在拉取目录…</div>
                ) : discover.isError ? (
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <div className="text-sm text-muted-foreground">{errText(discover.error).message}（{errText(discover.error).traceId ?? '无 traceId'}）</div>
                    <Button size="sm" variant="secondary" onClick={() => discover.refetch()}>重试</Button>
                  </div>
                ) : (discover.data?.models.length ?? 0) === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">暂无可发现的免费模型。</div>
                ) : (
                  <div className="divide-y divide-border rounded-xl border border-border">
                    {discover.data!.models.map((s) => (
                      <ListRow key={`${s.provider_id}/${s.model_id}`}>
                        <ListRowLeading>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">{s.name}</span>
                              <Badge>{s.capability === 'vision' ? '视觉' : '文本'}</Badge>
                              {s.key_reusable ? <Badge variant="success">可复用密钥：{s.reuse_provider_name}</Badge> : null}
                              {s.supports_reasoning ? <Badge>推理</Badge> : null}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {s.provider_label} · {s.model_id}
                              {s.context_window ? ` · 上下文 ${(s.context_window / 1000).toFixed(0)}k` : ''}
                            </div>
                          </div>
                        </ListRowLeading>
                        <ListRowTrailing className="sm:justify-end">
                          {s.key_reusable ? (
                            <Button variant="secondary" size="sm" onClick={() => openEnable(s)} disabled={create.isPending}>启用</Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => openPrefillAdd(s)}>添加</Button>
                          )}
                        </ListRowTrailing>
                      </ListRow>
                    ))}
                  </div>
                )}
              </CardContent>
            ) : null}
          </Card>
        </>
      )}

      {editing
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
              onClick={closeForm}
              role="dialog"
              aria-modal="true"
            >
              <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
                <Card className="border border-border/60 bg-popover shadow-lg">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle>{editing === 'new' ? (form.scope === 'shared' ? '新增共享模型' : '新增模型') : '编辑模型'}</CardTitle>
                        <CardDescription>
                          {editing === 'new'
                            ? (form.scope === 'shared' ? '共享模型对全部用户可见可选，请确认密钥合规。' : '选择模板可快速填入常用国内免费额度端点。')
                            : `密钥留空则保持原值不变（当前 ${editing.api_key_mask}）。`}
                        </CardDescription>
                      </div>
                      <Button variant="ghost" size="sm" onClick={closeForm} aria-label="关闭">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="max-h-[70vh] space-y-4 overflow-y-auto">
            {editing === 'new' ? (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">模板</label>
                <Select defaultValue="" onChange={(e) => { applyTemplate(e.target.value); e.currentTarget.value = ''; }}>
                  <option value="">手动填写</option>
                  {PROVIDER_TEMPLATES.map((t) => <option key={t.label} value={t.label}>{t.label}</option>)}
                </Select>
              </div>
            ) : null}
            {editing === 'new' && canManageShared ? (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">归属</label>
                <Select value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as 'personal' | 'shared' }))}>
                  <option value="personal">我的私有模型（仅我可见）</option>
                  <option value="shared">平台共享模型（所有人可见）</option>
                </Select>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">名称</label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="例如：智谱免费" maxLength={40} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">模型标识</label>
                <Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} placeholder="例如：glm-4.5-air" maxLength={80} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Base URL</label>
              <Input value={form.base_url} onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))} placeholder="https://... " />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">API Key</label>
              <Input
                type="password"
                value={form.api_key}
                onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                placeholder={editing === 'new' ? '必填，仅存储为密文' : editing.api_key_mask + '（留空则不修改）'}
                autoComplete="new-password"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">能力</label>
                <Select value={form.capability} onChange={(e) => setForm((f) => ({ ...f, capability: e.target.value as 'text' | 'vision' }))}>
                  <option value="text">文本（text）</option>
                  <option value="vision">视觉（vision）</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">计费</label>
                <Select value={form.cost_tier} onChange={(e) => setForm((f) => ({ ...f, cost_tier: e.target.value as 'free' | 'paid' }))}>
                  <option value="free">免费</option>
                  <option value="paid">收费</option>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
              启用（参与路由）
            </label>
            <div className={cn('flex justify-end gap-2')}>
              <Button variant="secondary" onClick={closeForm}>取消</Button>
              <Button disabled={create.isPending || update.isPending} onClick={submit}>
                {(create.isPending || update.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                保存
              </Button>
            </div>
                  </CardContent>
                </Card>
              </div>
            </div>,
            document.body,
          )
        : null}

      {enabling
        ? createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm" onClick={closeEnable} role="dialog" aria-modal="true">
              <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <Card className="border border-border/60 bg-popover shadow-lg">
                  <CardHeader className="pb-3">
                    <CardTitle>启用「{enabling.name}」</CardTitle>
                    <CardDescription>将复用「{enabling.reuse_provider_name}」的密钥（服务端复制密文，不展示明文）。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">名称</label>
                      <Input value={enableName} onChange={(e) => setEnableName(e.target.value)} maxLength={40} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">归属</label>
                      <Select value={enableScope} onChange={(e) => setEnableScope(e.target.value as 'personal' | 'shared')}>
                        <option value="personal">我的私有模型（仅我可见）</option>
                        {canManageShared ? <option value="shared">平台共享模型（所有人可见）</option> : null}
                      </Select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={closeEnable}>取消</Button>
                      <Button disabled={create.isPending} onClick={submitEnable}>
                        {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        确认启用
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>,
            document.body,
          )
        : null}
    </Page>
  );
}
