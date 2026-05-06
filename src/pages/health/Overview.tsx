import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useProfile } from '@/hooks/useProfile';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import { useMemberRemarks } from '@/hooks/useMemberRemarks';
import { useHealthProfile } from '@/hooks/useHealthProfile';
import { useHealthMetrics } from '@/hooks/useHealthMetrics';
import { useInsurancePolicies } from '@/hooks/useInsurancePolicies';
import { HealthMetric, InsurancePolicy } from '@/types';
import { formatMemberSelectLabel } from '@/lib/member';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { Select } from '@/components/ui/select';
import { useConfirm } from '@/hooks/useConfirm';
import { useSearchParams } from 'react-router-dom';
import { HealthReportImportModal } from '@/components/health/HealthReportImportModal';
import { HealthAlertsCard } from '@/components/health/HealthAlertsCard';
import { HealthMedicationCard } from '@/components/health/HealthMedicationCard';
import { HealthRevisitCard } from '@/components/health/HealthRevisitCard';
import { HealthCheckPlanCard } from '@/components/health/HealthCheckPlanCard';
import { HealthRecordCenterCard } from '@/components/health/HealthRecordCenterCard';

const metricConfig: Record<HealthMetric['metric_key'], { label: string; unit: string }> = {
  weight_kg: { label: '体重', unit: 'kg' },
  sleep_hours: { label: '睡眠', unit: 'h' },
  steps: { label: '步数', unit: '步' },
};

const insuranceKindLabel: Record<InsurancePolicy['kind'], string> = {
  health: '医疗险',
  life: '寿险',
  accident: '意外险',
  critical_illness: '重疾险',
  dental: '齿科/牙科',
  other: '其他',
};

export default function HealthOverview() {
  const { data: profile } = useProfile();
  const { members } = useFamilyMembers();
  const { remarkByMemberId } = useMemberRemarks();
  const { openConfirm, dialog } = useConfirm();

  const isParentLike = profile?.role === 'admin' || profile?.role === 'parent';
  const [subjectUserId, setSubjectUserId] = useState<string>('');
  const [metricKey, setMetricKey] = useState<HealthMetric['metric_key']>('weight_kg');

  useEffect(() => {
    if (!profile) return;
    if (profile.role === 'child') {
      setSubjectUserId(profile.id);
      return;
    }
    setSubjectUserId(profile.id);
  }, [profile]);

  const memberName = useMemo(() => {
    const m = (members ?? []).find((x) => x.id === subjectUserId);
    if (!m) return subjectUserId ? subjectUserId.slice(0, 6) : '';
    return formatMemberSelectLabel(m, remarkByMemberId);
  }, [members, remarkByMemberId, subjectUserId]);

  const { profile: healthProfile, isLoading: isHealthProfileLoading, saveProfile, isSaving: isSavingProfile } = useHealthProfile(
    subjectUserId || null,
  );

  const { metrics, isLoading: isMetricsLoading, addMetric, deleteMetric, isAdding: isAddingMetric, isDeleting: isDeletingMetric } =
    useHealthMetrics({
      subjectUserId: subjectUserId || null,
      metricKey,
      daysBack: 90,
    });

  const { policies, isLoading: isPoliciesLoading, addPolicy, deletePolicy, isAdding: isAddingPolicy, isDeleting: isDeletingPolicy } =
    useInsurancePolicies(subjectUserId || null);

  const [formDisplayName, setFormDisplayName] = useState('');
  const [formBirthDate, setFormBirthDate] = useState('');
  const [formHeightCm, setFormHeightCm] = useState('');
  const [formAllergies, setFormAllergies] = useState('');
  const [formConditions, setFormConditions] = useState('');
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    setFormDisplayName(healthProfile?.display_name ?? '');
    setFormBirthDate(healthProfile?.birth_date ?? '');
    setFormHeightCm(healthProfile?.height_cm != null ? String(healthProfile.height_cm) : '');
    setFormAllergies(healthProfile?.allergies ?? '');
    setFormConditions(healthProfile?.conditions ?? '');
    setFormNotes(healthProfile?.notes ?? '');
  }, [healthProfile, subjectUserId]);

  const [metricDate, setMetricDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [metricValue, setMetricValue] = useState('');
  const [metricNote, setMetricNote] = useState('');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const action = searchParams.get('action');
    if (action !== 'import') return;
    setIsImportOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('action');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    setMetricValue('');
    setMetricNote('');
    setMetricDate(new Date().toISOString().slice(0, 10));
  }, [metricKey, subjectUserId]);

  const chartData = useMemo(() => {
    return (metrics ?? []).map((m) => ({
      date: (m.recorded_at || '').slice(5),
      value: Number(m.value),
      fullDate: m.recorded_at,
    }));
  }, [metrics]);

  const insuranceAdvice = useMemo(() => {
    const kinds = new Set((policies ?? []).map((p) => p.kind));
    const rows: { title: string; reason: string }[] = [];

    if (!kinds.has('accident')) rows.push({ title: '补齐意外险', reason: '覆盖突发意外导致的医疗费用与伤残风险。' });
    if (!kinds.has('health')) rows.push({ title: '补齐医疗险', reason: '覆盖住院与大额医疗支出，减少家庭现金流冲击。' });
    if (!kinds.has('critical_illness')) rows.push({ title: '评估重疾险', reason: '用于弥补长期治疗与收入中断风险。' });

    return rows;
  }, [policies]);

  if (!profile?.family_id) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>健康中心</CardTitle>
            <CardDescription>需要先加入家庭后才能管理健康档案与指标。</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <Page>
      <PageHeader>
        <div className="space-y-1">
          <PageTitle>健康中心</PageTitle>
          <PageDescription>为家庭成员建立档案、记录指标，并用可解释规则给出保险建议。</PageDescription>
        </div>
        <PageActions>
          <Button variant="secondary" disabled={!subjectUserId} onClick={() => setIsImportOpen(true)}>
            导入体检报告
          </Button>
          {isParentLike ? (
            <Select
              className="w-full sm:w-56"
              aria-label="选择成员"
              value={subjectUserId}
              onChange={(e) => setSubjectUserId(e.target.value)}
            >
              {(members ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {formatMemberSelectLabel(m, remarkByMemberId)}
                </option>
              ))}
            </Select>
          ) : subjectUserId ? (
            <Badge variant="default">{memberName}</Badge>
          ) : null}
        </PageActions>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>健康档案</CardTitle>
          <CardDescription>先做“够用”的基础档案，后续再逐步扩展字段。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isHealthProfileLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">称呼（可选）</label>
                <Input value={formDisplayName} onChange={(e) => setFormDisplayName(e.target.value)} placeholder="例如：小宝、妈妈" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">出生日期（可选）</label>
                <Input type="date" value={formBirthDate} onChange={(e) => setFormBirthDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">身高 cm（可选）</label>
                <Input
                  type="number"
                  value={formHeightCm}
                  onChange={(e) => setFormHeightCm(e.target.value)}
                  placeholder="例如：170"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-medium">过敏史（可选）</label>
                <Input value={formAllergies} onChange={(e) => setFormAllergies(e.target.value)} placeholder="例如：青霉素、花粉" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-medium">既往/慢病（可选）</label>
                <Input value={formConditions} onChange={(e) => setFormConditions(e.target.value)} placeholder="例如：哮喘、高血压" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-medium">备注（可选）</label>
                <Input value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="就医偏好、注意事项等" />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button
                  disabled={isSavingProfile || !subjectUserId}
                  onClick={() =>
                    saveProfile({
                      display_name: formDisplayName.trim() || null,
                      birth_date: formBirthDate || null,
                      height_cm: formHeightCm ? Number(formHeightCm) : null,
                      allergies: formAllergies.trim() || null,
                      conditions: formConditions.trim() || null,
                      notes: formNotes.trim() || null,
                    })
                  }
                >
                  保存档案
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>指标监控</CardTitle>
          <CardDescription>先从 3 个高频指标开始：体重、睡眠、步数。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">指标</label>
              <Select value={metricKey} onChange={(e) => setMetricKey(e.target.value as HealthMetric['metric_key'])}>
                {Object.entries(metricConfig).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">日期</label>
              <Input type="date" value={metricDate} onChange={(e) => setMetricDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">数值（{metricConfig[metricKey].unit}）</label>
              <Input type="number" value={metricValue} onChange={(e) => setMetricValue(e.target.value)} placeholder="例如：65" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-sm font-medium">备注（可选）</label>
              <Input value={metricNote} onChange={(e) => setMetricNote(e.target.value)} placeholder="例如：发烧、加班、长途步行" />
            </div>
            <div className="flex items-end justify-end">
              <Button
                disabled={isAddingMetric || !metricValue || !subjectUserId}
                onClick={() => {
                  const v = Number(metricValue);
                  if (!Number.isFinite(v)) return;
                  addMetric({
                    metric_key: metricKey,
                    value: v,
                    unit: metricConfig[metricKey].unit,
                    recorded_at: metricDate,
                    note: metricNote.trim() || null,
                  });
                }}
              >
                记录
              </Button>
            </div>
          </div>

          <div className="h-56 rounded-xl border border-border bg-card">
            {isMetricsLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">加载中…</div>
            ) : (metrics?.length ?? 0) === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">暂无记录</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid hsl(var(--border))',
                      background: 'hsl(var(--card))',
                    }}
                    formatter={(v: any) => [`${v} ${metricConfig[metricKey].unit}`, metricConfig[metricKey].label]}
                    labelFormatter={(label: any, payload: any[]) => {
                      const row = payload?.[0]?.payload;
                      return row?.fullDate ? `日期 ${row.fullDate}` : `日期 ${label}`;
                    }}
                  />
                  <Line type="monotone" dataKey="value" stroke="#2563EB" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {(metrics ?? []).length > 0 ? (
            <div className="divide-y divide-border rounded-xl border border-border">
              {(metrics ?? []).slice().reverse().slice(0, 8).map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {m.recorded_at} · {Number(m.value)} {m.unit || metricConfig[m.metric_key].unit}
                    </div>
                    {m.note ? <div className="mt-1 text-xs text-muted-foreground">{m.note}</div> : null}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isDeletingMetric}
                    onClick={async () => {
                      const ok = await openConfirm({ title: '确认删除', message: '确认删除这条指标记录吗？', confirmText: '删除', tone: 'danger' });
                      if (!ok) return;
                      deleteMetric(m.id);
                    }}
                  >
                    删除
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>保险清单与建议</CardTitle>
          <CardDescription>先把“已买什么”记录清楚，再用规则输出可解释建议。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <InsuranceAddForm disabled={isAddingPolicy || !subjectUserId} onAdd={addPolicy} />

          {isPoliciesLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>
          ) : (policies?.length ?? 0) === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              暂无保险记录
            </div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {(policies ?? []).map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium">{insuranceKindLabel[p.kind]}</div>
                      {p.end_date ? <Badge variant="default">到期 {p.end_date}</Badge> : null}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {(p.provider || '—') + (p.product_name ? ` · ${p.product_name}` : '')}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isDeletingPolicy}
                    onClick={async () => {
                      const ok = await openConfirm({ title: '确认删除', message: '确认删除这条保险记录吗？', confirmText: '删除', tone: 'danger' });
                      if (!ok) return;
                      deletePolicy(p.id);
                    }}
                  >
                    删除
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-border p-4">
            <div className="text-sm font-medium">可解释建议</div>
            <div className="mt-2 space-y-2 text-sm text-muted-foreground">
              {insuranceAdvice.length === 0 ? (
                <div>当前清单已覆盖常见基础险种，可进一步检查保额与续保条件。</div>
              ) : (
                insuranceAdvice.map((r) => (
                  <div key={r.title} className="flex items-start justify-between gap-3">
                    <div className="font-medium text-foreground">{r.title}</div>
                    <div className="flex-1 text-right">{r.reason}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <HealthAlertsCard subjectUserId={subjectUserId || null} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <HealthMedicationCard subjectUserId={subjectUserId || null} />
        <HealthRevisitCard subjectUserId={subjectUserId || null} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <HealthCheckPlanCard subjectUserId={subjectUserId || null} />
        <HealthRecordCenterCard subjectUserId={subjectUserId || null} />
      </div>
      <HealthReportImportModal open={isImportOpen} onClose={() => setIsImportOpen(false)} subjectUserId={subjectUserId || null} />
      {dialog}
    </Page>
  );
}

function InsuranceAddForm({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (payload: Omit<InsurancePolicy, 'id' | 'created_at' | 'updated_at' | 'family_id' | 'subject_user_id' | 'created_by_user_id'>) => void;
}) {
  const [kind, setKind] = useState<InsurancePolicy['kind']>('health');
  const [provider, setProvider] = useState('');
  const [productName, setProductName] = useState('');
  const [premiumAmount, setPremiumAmount] = useState('');
  const [premiumCadence, setPremiumCadence] = useState<InsurancePolicy['premium_cadence']>('yearly');
  const [endDate, setEndDate] = useState('');

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="text-sm font-medium">新增保险</div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">险种</label>
          <Select value={kind} onChange={(e) => setKind(e.target.value as InsurancePolicy['kind'])}>
            <option value="health">医疗险</option>
            <option value="accident">意外险</option>
            <option value="critical_illness">重疾险</option>
            <option value="life">寿险</option>
            <option value="dental">齿科/牙科</option>
            <option value="other">其他</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">保险公司（可选）</label>
          <Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="例如：平安、人保" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">产品名（可选）</label>
          <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="例如：百万医疗" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">保费（可选）</label>
          <Input type="number" value={premiumAmount} onChange={(e) => setPremiumAmount(e.target.value)} placeholder="例如：1999" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">缴费周期（可选）</label>
          <Select value={premiumCadence ?? ''} onChange={(e) => setPremiumCadence((e.target.value as any) || null)}>
            <option value="yearly">按年</option>
            <option value="monthly">按月</option>
            <option value="one_time">一次性</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">到期日（可选）</label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="md:col-span-3 flex justify-end">
          <Button
            disabled={disabled}
            onClick={() => {
              onAdd({
                kind,
                provider: provider.trim() || null,
                product_name: productName.trim() || null,
                coverage_amount: null,
                premium_amount: premiumAmount ? Number(premiumAmount) : null,
                premium_cadence: premiumCadence,
                start_date: null,
                end_date: endDate || null,
                note: null,
              });
              setProvider('');
              setProductName('');
              setPremiumAmount('');
              setPremiumCadence('yearly');
              setEndDate('');
            }}
          >
            添加
          </Button>
        </div>
      </div>
    </div>
  );
}
