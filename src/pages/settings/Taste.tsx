import { useEffect, useState } from 'react';
import { Loader2, User } from 'lucide-react';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import { useMealPreferences } from '@/hooks/useMealPreferences';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import type { UserProfile } from '@/types';

const SPICY_OPTIONS: { value: 'none' | 'mil' | 'med' | 'hot'; label: string }[] = [
  { value: 'none', label: '不吃辣' },
  { value: 'mil', label: '微辣' },
  { value: 'med', label: '中辣' },
  { value: 'hot', label: '重辣' },
];

function TasteRow({ member }: { member: UserProfile }) {
  const { pref, isLoading, savePref, isSaving } = useMealPreferences(member.id);
  const [disliked, setDisliked] = useState('');
  const [liked, setLiked] = useState('');
  const [spicy, setSpicy] = useState<'none' | 'mil' | 'med' | 'hot'>('hot');

  useEffect(() => {
    if (!pref) return;
    setDisliked(pref.disliked ?? '');
    setLiked(pref.liked ?? '');
    setSpicy(pref.spicy_level ?? 'hot');
  }, [pref]);

  const displayName = member.name || member.email?.split('@')[0] || '成员';

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载 {displayName} 的口味…
      </div>
    );
  }

  return (
    <div className="space-y-3 px-4 py-4">
      <div className="flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-muted/60">
          <User className="h-4 w-4" />
        </div>
        <span className="text-sm font-medium text-foreground">{displayName}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">忌口 / 不吃的</span>
          <Input value={disliked} onChange={(e) => setDisliked(e.target.value)} placeholder="例如：香菜、羊肉" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">偏好 / 爱吃的</span>
          <Input value={liked} onChange={(e) => setLiked(e.target.value)} placeholder="例如：海鲜、面食" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">能吃辣的极限</span>
          <Select value={spicy} onChange={(e) => setSpicy(e.target.value as typeof spicy)}>
            {SPICY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div className="text-xs text-muted-foreground">多个词用逗号、顿号或空格分隔。</div>
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={isSaving}
          onClick={() => savePref({ disliked, liked, spicy_level: spicy })}
        >
          保存
        </Button>
      </div>
    </div>
  );
}

export default function SettingsTaste() {
  const { members, isLoading } = useFamilyMembers();

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <Page className="mx-auto max-w-4xl">
      <PageHeader>
        <PageTitle>家庭口味偏好</PageTitle>
        <PageDescription>为每位家庭成员设置口味偏好，推荐三餐时会一并参考。</PageDescription>
      </PageHeader>

      <Alert variant="info">
        口味与忌口在这里设；过敏等健康限制请在健康档案维护。
      </Alert>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>成员口味</CardTitle>
          <CardDescription>共 {(members ?? []).length} 人</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {(members?.length ?? 0) === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">暂无成员</div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {members?.map((member) => (
                <TasteRow key={member.id} member={member} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}
