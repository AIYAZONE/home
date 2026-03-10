create table if not exists public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete set null,
  actor_id uuid not null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_family_created_at on public.audit_logs(family_id, created_at desc);
create index if not exists idx_audit_logs_actor_created_at on public.audit_logs(actor_id, created_at desc);
create index if not exists idx_audit_logs_action_created_at on public.audit_logs(action, created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists "Users can insert audit logs" on public.audit_logs;
drop policy if exists "Users can view audit logs" on public.audit_logs;

create policy "Users can insert audit logs"
  on public.audit_logs for insert
  with check (
    actor_id = auth.uid()
    and (
      family_id is null
      or public.is_family_member(family_id)
    )
  );

create policy "Users can view audit logs"
  on public.audit_logs for select
  using (
    actor_id = auth.uid()
    or (
      family_id is not null
      and public.has_family_role(family_id, array['admin','parent']::text[])
    )
  );

