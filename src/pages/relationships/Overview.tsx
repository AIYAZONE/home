import { useEffect, useMemo, useState } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import { useRelationshipEvents } from '@/hooks/useRelationshipEvents';
import { useExternalContacts } from '@/hooks/useExternalContacts';
import { useContactInteractions } from '@/hooks/useContactInteractions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { Select } from '@/components/ui/select';

export default function RelationshipsOverview() {
  const { data: profile } = useProfile();
  const { members } = useFamilyMembers();

  const isParentLike = profile?.role === 'admin' || profile?.role === 'parent';
  const [participantFilter, setParticipantFilter] = useState<'all' | string>('all');
  const [eventParticipantsMode, setEventParticipantsMode] = useState<'all' | string>('all');

  useEffect(() => {
    if (!profile) return;
    if (profile.role === 'child') {
      setParticipantFilter(profile.id);
      setEventParticipantsMode(profile.id);
      return;
    }
    setParticipantFilter('all');
    setEventParticipantsMode('all');
  }, [profile]);

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    (members ?? []).forEach((m) => map.set(m.id, m.name || m.email || m.id.slice(0, 6)));
    return map;
  }, [members]);

  const { events, isLoading: isEventsLoading, addEvent, deleteEvent, isAdding: isAddingEvent, isDeleting: isDeletingEvent } =
    useRelationshipEvents();

  const { contacts, isLoading: isContactsLoading, addContact, deleteContact, isAdding: isAddingContact, isDeleting: isDeletingContact } =
    useExternalContacts();

  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const {
    interactions,
    isLoading: isInteractionsLoading,
    addInteraction,
    deleteInteraction,
    isAdding: isAddingInteraction,
    isDeleting: isDeletingInteraction,
  } = useContactInteractions(selectedContactId || null);

  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [eventNotes, setEventNotes] = useState('');
  const [eventActionItems, setEventActionItems] = useState('');

  const filteredEvents = useMemo(() => {
    const list = events ?? [];
    if (participantFilter === 'all') return list;
    return list.filter((e) => (e.participant_user_ids ?? []).includes(participantFilter));
  }, [events, participantFilter]);

  const [contactName, setContactName] = useState('');
  const [contactRelation, setContactRelation] = useState('');
  const [contactVisibility, setContactVisibility] = useState<'family' | 'private'>('family');

  const contactNameById = useMemo(() => {
    const map = new Map<string, string>();
    (contacts ?? []).forEach((c) => map.set(c.id, c.name));
    return map;
  }, [contacts]);

  const [interactionDate, setInteractionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [interactionNextDate, setInteractionNextDate] = useState('');
  const [interactionSummary, setInteractionSummary] = useState('');

  if (!profile?.family_id) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>关系管理</CardTitle>
            <CardDescription>需要先加入家庭后才能记录家庭事件与联系人互动。</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <Page>
      <PageHeader>
        <div className="space-y-1">
          <PageTitle>关系管理</PageTitle>
          <PageDescription>记录事件、维护联系人、设置跟进提醒，把关系经营变成可执行的计划。</PageDescription>
        </div>
        <PageActions>
          {isParentLike ? (
            <div className="w-44">
              <Select value={participantFilter} onChange={(e) => setParticipantFilter(e.target.value)}>
                <option value="all">全家</option>
                {(members ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.email || m.id.slice(0, 6)}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </PageActions>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>家庭事件与沟通记录</CardTitle>
          <CardDescription>用于复盘、对齐与行动项跟踪。先做轻量记录，后续再扩展结构化模板。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-border p-4">
            <div className="text-sm font-medium">新增事件</div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-medium">标题</label>
                <Input value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="例如：每周家庭会议 / 亲子沟通" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">日期</label>
                <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">参与者</label>
                <Select value={eventParticipantsMode} onChange={(e) => setEventParticipantsMode(e.target.value)}>
                  <option value="all">全家</option>
                  {(members ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.email || m.id.slice(0, 6)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-medium">记录（可选）</label>
                <Input value={eventNotes} onChange={(e) => setEventNotes(e.target.value)} placeholder="重点内容、情绪点、结论…" />
              </div>
              <div className="space-y-1.5 md:col-span-3">
                <label className="text-sm font-medium">行动项（可选）</label>
                <Input value={eventActionItems} onChange={(e) => setEventActionItems(e.target.value)} placeholder="例如：下周一起运动 2 次；每晚 9 点读书" />
              </div>
              <div className="md:col-span-3 flex justify-end">
                <Button
                  disabled={isAddingEvent || !eventTitle.trim()}
                  onClick={() => {
                    const ids =
                      eventParticipantsMode === 'all'
                        ? (members ?? []).map((m) => m.id)
                        : eventParticipantsMode
                          ? [eventParticipantsMode]
                          : [];
                    addEvent({
                      title: eventTitle.trim(),
                      occurred_at: eventDate,
                      participant_user_ids: ids,
                      notes: eventNotes.trim() || null,
                      action_items: eventActionItems.trim() || null,
                    });
                    setEventTitle('');
                    setEventNotes('');
                    setEventActionItems('');
                    setEventDate(new Date().toISOString().slice(0, 10));
                  }}
                >
                  记录
                </Button>
              </div>
            </div>
          </div>

          {isEventsLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>
          ) : (filteredEvents?.length ?? 0) === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              暂无事件记录
            </div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {(filteredEvents ?? []).map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium">{e.title}</div>
                      <Badge variant="default">{e.occurred_at}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(e.participant_user_ids ?? []).slice(0, 6).map((id) => (
                        <Badge key={id} variant="default" className="text-xs">
                          {memberNameById.get(id) || id.slice(0, 6)}
                        </Badge>
                      ))}
                      {(e.participant_user_ids ?? []).length > 6 ? <Badge variant="default" className="text-xs">…</Badge> : null}
                    </div>
                    {e.notes ? <div className="mt-2 text-xs text-muted-foreground">{e.notes}</div> : null}
                    {e.action_items ? <div className="mt-1 text-xs text-muted-foreground">行动项：{e.action_items}</div> : null}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isDeletingEvent}
                    onClick={() => {
                      const ok = window.confirm('确认删除这条事件记录吗？');
                      if (!ok) return;
                      deleteEvent(e.id);
                    }}
                  >
                    删除
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>外部联系人</CardTitle>
          <CardDescription>老师、医生、亲友、合作方等。支持家庭共享或仅自己可见。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-border p-4">
            <div className="text-sm font-medium">新增联系人</div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">姓名</label>
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="例如：王老师" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">关系（可选）</label>
                <Input value={contactRelation} onChange={(e) => setContactRelation(e.target.value)} placeholder="例如：班主任 / 亲戚" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">可见性</label>
                <Select value={contactVisibility} onChange={(e) => setContactVisibility(e.target.value as any)}>
                  <option value="family">全家可见</option>
                  <option value="private">仅自己可见</option>
                </Select>
              </div>
              <div className="md:col-span-3 flex justify-end">
                <Button
                  disabled={isAddingContact || !contactName.trim()}
                  onClick={() => {
                    addContact({
                      visibility: contactVisibility,
                      name: contactName.trim(),
                      relation: contactRelation.trim() || null,
                      tags: [],
                      notes: null,
                    });
                    setContactName('');
                    setContactRelation('');
                    setContactVisibility('family');
                  }}
                >
                  添加
                </Button>
              </div>
            </div>
          </div>

          {isContactsLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>
          ) : (contacts?.length ?? 0) === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              暂无联系人
            </div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {(contacts ?? []).map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium">{c.name}</div>
                      <Badge variant="default">{c.visibility === 'family' ? '共享' : '私密'}</Badge>
                    </div>
                    {c.relation ? <div className="mt-1 text-xs text-muted-foreground">{c.relation}</div> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setSelectedContactId(c.id)}>
                      记录互动
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isDeletingContact}
                      onClick={() => {
                        const ok = window.confirm('确认删除该联系人吗？相关互动记录也会删除。');
                        if (!ok) return;
                        deleteContact(c.id);
                        if (selectedContactId === c.id) setSelectedContactId('');
                      }}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>互动记录与跟进</CardTitle>
          <CardDescription>把“下一次联系”明确下来，避免重要关系被动断联。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-border p-4">
            <div className="text-sm font-medium">新增互动</div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-medium">联系人</label>
                <Select value={selectedContactId} onChange={(e) => setSelectedContactId(e.target.value)}>
                  <option value="">请选择</option>
                  {(contacts ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">互动日期</label>
                <Input type="date" value={interactionDate} onChange={(e) => setInteractionDate(e.target.value)} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-medium">摘要（可选）</label>
                <Input value={interactionSummary} onChange={(e) => setInteractionSummary(e.target.value)} placeholder="聊了什么、结论是什么" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">下次跟进（可选）</label>
                <Input type="date" value={interactionNextDate} onChange={(e) => setInteractionNextDate(e.target.value)} />
              </div>
              <div className="md:col-span-3 flex justify-end">
                <Button
                  disabled={isAddingInteraction || !selectedContactId}
                  onClick={() => {
                    addInteraction({
                      contact_id: selectedContactId,
                      interaction_date: interactionDate,
                      summary: interactionSummary.trim() || null,
                      next_follow_up_date: interactionNextDate || null,
                    });
                    setInteractionSummary('');
                    setInteractionNextDate('');
                    setInteractionDate(new Date().toISOString().slice(0, 10));
                  }}
                >
                  记录
                </Button>
              </div>
            </div>
          </div>

          {isInteractionsLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>
          ) : (interactions?.length ?? 0) === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              暂无互动记录
            </div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {(interactions ?? []).map((it) => (
                <div key={it.id} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium">{contactNameById.get(it.contact_id) || it.contact_id}</div>
                      <Badge variant="default">{it.interaction_date}</Badge>
                      {it.next_follow_up_date ? <Badge variant="warning">跟进 {it.next_follow_up_date}</Badge> : null}
                    </div>
                    {it.summary ? <div className="mt-1 text-xs text-muted-foreground">{it.summary}</div> : null}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isDeletingInteraction}
                    onClick={() => {
                      const ok = window.confirm('确认删除这条互动记录吗？');
                      if (!ok) return;
                      deleteInteraction(it.id);
                    }}
                  >
                    删除
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}
