import { useState } from 'react';
import { ArrowDown, ArrowUp, Bot, Loader2, Pencil, Plus, ShieldAlert, Trash2, Zap } from 'lucide-react';
import { useAiProviders } from '@/hooks/useAiProviders';
import { ApiError, type ProviderDraft, type PublicProvider } from '@/lib/aiProviders';
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
  { label: '阿里云百炼 Qwen（免费）', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', capability: 'text', cost_tier: 'free' },
  { label: 'Kimi（免费）', base_url: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', capability: 'text', cost_tier: 'free' },
  { label: '火山方舟 豆包（免费）', base_url: 'https://ark.cn-beijing.volces.com/api/v3', model: '', capability: 'text', cost_tier: 'free' },
  { label: 'DeepSeek（付费）', base_url: 'https://api.deepseek.com', model: 'deepseek-chat', capability: 'text', cost_tier: 'paid' },
  { label: 'OpenAI（付费 · 视觉）', base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini', capability: 'vision', cost_tier: 'paid' },
] as const;

type FormState = {
  name: string; base_url: string; model: string; api_key: string;
  capability: 'text' | 'vision'; cost_tier: 'free' | 'paid'; enabled: boolean;
};

const EMPTY_FORM: FormState = { name: '', base_url: '', model: '', api_key: '', capability: 'text', cost_tier: 'free', enabled: true };

function errText(err: unknown): { message: string; traceId?: string } {
  if (err instanceof ApiError) return { message: err.message, traceId: err.traceId };
  return { message: err instanceof Error ? err.message : '操作失败' };
}

export default function SettingsAiProviders() {
  const { providers, isLoading, isAdmin, create, update, remove, reorder, test } = useAiProviders();
  const pushToast = useToastStore((s) => s.push);
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState<PublicProvider | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const fail = (title: string) => (err: unknown) => {
    const { message, traceId } = errText(err);
    pushToast({ variant: 'danger', title, message: message + (traceId ? `（${traceId}）` : '') });
  };

  if (!isAdmin) {
    return (
      <Page>
        <PageHeader>
          <PageTitle>AI 模型管理</PageTitle>
        </PageHeader>
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
            <ShieldAlert className="h-5 w-5" />
            仅平台管理员可访问此页面。
          </CardContent>
        </Card>
      </Page>
    );
  }

  const openNew = () => { setForm(EMPTY_FORM); setEditing('new'); };
  const openEdit = (row: PublicProvider) => {
    setForm({ name: row.name, base_url: row.base_url, model: row.model, api_key: '', capability: row.capability, cost_tier: row.cost_tier, enabled: row.enabled });
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
        await create.mutateAsync({ name, base_url: baseUrl, model, api_key: form.api_key.trim(), capability: form.capability, cost_tier: form.cost_tier, enabled: form.enabled });
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

  const move = (index: number, dir: -1 | 1) => {
    const ids = providers.map((x) => x.id);
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

  return (
    <Page>
      {dialog}
      <PageHeader>
        <div>
          <PageTitle>AI 模型管理</PageTitle>
          <PageDescription>集中管理文本与视觉模型清单，按优先级自动降级；列表为空时回落 .env 兜底配置。</PageDescription>
        </div>
        <div className="flex justify-end sm:justify-start">
          <Button variant="secondary" size="sm" onClick={openNew}>
            <Plus className="h-4 w-4" />
            新增模型
          </Button>
        </div>
      </PageHeader>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>模型清单</CardTitle>
          <CardDescription>顺序即优先级，最上方的可用模型优先命中。共 {providers.length} 个。</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>
          ) : providers.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-10 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Bot className="h-6 w-6" /></div>
              <div className="text-sm text-muted-foreground">尚未配置任何模型，当前使用 .env 兜底配置。</div>
              <Button size="sm" onClick={openNew}><Plus className="h-4 w-4" />新增第一个模型</Button>
            </div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {providers.map((row, index) => (
                <ListRow key={row.id}>
                  <ListRowLeading>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{row.name}</span>
                        <Badge variant={row.enabled ? 'default' : 'warning'}>{row.enabled ? '启用' : '停用'}</Badge>
                        <Badge variant={row.cost_tier === 'free' ? 'success' : 'warning'}>{row.cost_tier === 'free' ? '免费' : '收费'}</Badge>
                        <Badge>{row.capability === 'vision' ? '视觉' : '文本'}</Badge>
                        {row.test_status ? <Badge variant={row.test_status === 'ok' ? 'success' : 'danger'}>{row.test_status === 'ok' ? '连通 ✓' : '连通 ✗'}</Badge> : null}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{row.model} · {row.base_url} · {row.api_key_mask}</div>
                      {row.test_detail ? <div className="truncate text-xs text-muted-foreground/80">{row.test_detail}</div> : null}
                    </div>
                  </ListRowLeading>
                  <ListRowTrailing className="sm:justify-end">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => move(index, -1)} disabled={index === 0 || reorder.isPending} aria-label="上移"><ArrowUp className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => move(index, 1)} disabled={index === providers.length - 1 || reorder.isPending} aria-label="下移"><ArrowDown className="h-4 w-4" /></Button>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => toggleEnabled(row)} disabled={update.isPending}>{row.enabled ? '停用' : '启用'}</Button>
                    <Button variant="ghost" size="sm" onClick={() => runTest(row)} disabled={test.isPending}>
                      {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                      测试
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(row)} aria-label="编辑"><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => runDelete(row)} aria-label="删除"><Trash2 className="h-4 w-4" /></Button>
                  </ListRowTrailing>
                </ListRow>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editing ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>{editing === 'new' ? '新增模型' : '编辑模型'}</CardTitle>
            <CardDescription>{editing === 'new' ? '选择模板可快速填入常用国内免费额度端点。' : `密钥留空则保持原值不变（当前 ${editing.api_key_mask}）。`}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {editing === 'new' ? (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">模板</label>
                <Select defaultValue="" onChange={(e) => applyTemplate(e.target.value)}>
                  <option value="">手动填写</option>
                  {PROVIDER_TEMPLATES.map((t) => <option key={t.label} value={t.label}>{t.label}</option>)}
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
      ) : null}
    </Page>
  );
}
