import { useMemo, useState } from 'react';
import { Bot, Sparkles, Wallet, Target, Users, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCopilot } from '@/contexts/CopilotContext';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';

export default function AdvisorOverview() {
  const { openWithDraft, open } = useCopilot();
  const [draft, setDraft] = useState('');

  const quickCards = useMemo(
    () => [
      {
        title: '预算建议',
        desc: '从哪几类开始最有效？怎么定额度？',
        prompt: '给我本月预算建议：先从哪几类开始？每类给一个可执行的下一步。',
      },
      {
        title: '支出结构解释',
        desc: '把数据翻译成“风险点 + 怎么做”。',
        prompt: '请用一句话解释我本月支出结构的风险点，并给 3 条可执行建议。',
      },
      {
        title: '下周行动清单',
        desc: '把目标拆成具体到日的动作。',
        prompt: '帮我生成一份下周行动清单：财务、健康、关系各 2 条，尽量具体。',
      },
    ],
    [],
  );

  const moduleLinks = useMemo(
    () => [
      { name: '财务中心', href: '/finance', icon: Wallet, desc: '记账、预算、资产与基金' },
      { name: '成长规划', href: '/growth', icon: Target, desc: '目标与关键结果' },
      { name: '健康中心', href: '/health', icon: Heart, desc: '健康指标与档案' },
      { name: '关系管理', href: '/relationships', icon: Users, desc: '关系事件与记录' },
    ],
    [],
  );

  return (
    <Page className="mx-auto max-w-6xl">
      <PageHeader>
        <div className="space-y-1">
          <PageTitle>AI 工作台</PageTitle>
          <PageDescription>从一句话开始：让 AI 帮你找到下一步动作，并把入口带你过去。</PageDescription>
        </div>
      </PageHeader>

      <Card className="bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">问 AI 一句话</CardTitle>
          </div>
          <CardDescription>例如：预算建议、支出结构解释、下周行动清单。</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const text = draft.trim();
              if (!text) return;
              openWithDraft(text);
              setDraft('');
            }}
            className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3"
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="描述你的目标或问题…"
              className="min-w-0 sm:w-auto sm:flex-1"
            />
            <div className="flex gap-2 sm:shrink-0">
              <Button type="submit" className="whitespace-nowrap sm:w-auto">
                <Sparkles className="h-4 w-4" />
                开始
              </Button>
              <Button type="button" variant="secondary" onClick={open} className="whitespace-nowrap sm:w-auto">
                打开 AI 面板
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {quickCards.map((c) => (
          <button
            key={c.title}
            type="button"
            onClick={() => openWithDraft(c.prompt)}
            className="text-left"
          >
            <Card className="h-full transition-colors hover:border-primary/30 hover:bg-surface-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{c.title}</CardTitle>
                <CardDescription>{c.desc}</CardDescription>
              </CardHeader>
            </Card>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {moduleLinks.map((m) => {
          const Icon = m.icon;
          return (
            <Link key={m.href} to={m.href}>
              <Card className="h-full transition-colors hover:border-primary/30 hover:bg-surface-2">
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">{m.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{m.desc}</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </Page>
  );
}
