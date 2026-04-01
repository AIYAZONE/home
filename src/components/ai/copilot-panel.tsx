import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { Bot, CornerUpLeft, Pin, PinOff, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type Role = 'user' | 'assistant';

type Message = {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
};

export type CopilotQuickAction = {
  id: string;
  name: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  onSelect: () => void;
};

const STORAGE_KEY = 'ui.copilot.messages.v1';

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function loadMessages(): Message[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m: any) => typeof m?.id === 'string' && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m: any) => ({ id: m.id, role: m.role, content: m.content, createdAt: Number(m.createdAt) || Date.now() })) as Message[];
  } catch {
    return [];
  }
}

function saveMessages(messages: Message[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50)));
}

export function CopilotPanel(props: {
  open: boolean;
  pinned: boolean;
  title?: string;
  contextLabel?: string;
  quickPrompts?: Array<{ id: string; label: string; prompt: string }>;
  actions?: CopilotQuickAction[];
  initialDraft?: string | null;
  onClose: () => void;
  onPinnedChange: (next: boolean) => void;
  onSubmitPrompt?: (prompt: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>(() => loadMessages());
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!props.open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    if (!props.initialDraft) return;
    setDraft(props.initialDraft);
  }, [props.initialDraft, props.open]);

  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  useEffect(() => {
    if (!props.open) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, props.open]);

  const canSend = useMemo(() => draft.trim().length > 0, [draft]);

  const send = (text: string) => {
    const content = text.trim();
    if (!content) return;
    const now = Date.now();
    const userMsg: Message = { id: uid('u'), role: 'user', content, createdAt: now };
    const assistantMsg: Message = {
      id: uid('a'),
      role: 'assistant',
      content: `我已收到：${content}\n\n当前 AI 能力正在建设中。我可以先帮你把需求拆成“下一步动作”，并提供入口跳转。`,
      createdAt: now + 1,
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg].slice(-50));
    setDraft('');
    props.onSubmitPrompt?.(content);
  };

  if (!props.open) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-border/60 px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <div className="truncate text-sm font-semibold text-foreground">{props.title ?? 'AI Copilot'}</div>
          </div>
          {props.contextLabel ? <div className="truncate text-xs text-muted-foreground">{props.contextLabel}</div> : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => props.onPinnedChange(!props.pinned)}
            aria-label={props.pinned ? '取消固定' : '固定面板'}
          >
            {props.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={props.onClose} aria-label="关闭">
            <CornerUpLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <Card className="bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">从一句话开始</CardTitle>
              </div>
              <CardDescription>我可以帮你生成预算建议、解释支出结构、把目标拆成行动清单。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="grid grid-cols-1 gap-2">
                {(props.quickPrompts ?? []).map((p) => (
                  <Button
                    key={p.id}
                    type="button"
                    variant="secondary"
                    className="justify-start"
                    onClick={() => send(p.prompt)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              {(props.actions ?? []).length > 0 ? (
                <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                  <div className="text-xs font-medium text-foreground">快捷动作</div>
                  <div className="mt-2 grid grid-cols-1 gap-2">
                    {(props.actions ?? []).map((a) => {
                      const Icon = a.icon;
                      return (
                        <Button key={a.id} type="button" variant="ghost" className="justify-start" onClick={a.onSelect}>
                          {Icon ? <Icon className="h-4 w-4" /> : null}
                          <span className="min-w-0 truncate">{a.name}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'max-w-[92%] whitespace-pre-wrap rounded-2xl border px-3 py-2 text-sm leading-relaxed',
                  m.role === 'user'
                    ? 'ml-auto border-primary/25 bg-primary/10 text-foreground'
                    : 'mr-auto border-border/60 bg-card text-foreground',
                )}
              >
                {m.content}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border/60 p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
          className="flex items-center gap-2"
        >
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="问一句：例如“给我本月预算建议”"
          />
          <Button type="submit" disabled={!canSend}>
            发送
          </Button>
        </form>
      </div>
    </div>
  );
}

