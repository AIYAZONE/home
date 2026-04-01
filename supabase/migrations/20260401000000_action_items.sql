create table if not exists public.action_items (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade not null,
  owner_user_id uuid references public.users(id) on delete set null,
  visibility text not null check (visibility in ('family','private')),
  module text not null check (module in ('finance','health','relationships','growth','settings')),
  title text not null,
  description text,
  next_step text,
  due_date date,
  status text not null check (status in ('todo','doing','done','dismissed')) default 'todo',
  source text not null check (source in ('ai','user')),
  source_meta jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_action_items_family_status_due
  on public.action_items(family_id, status, due_date);

create index if not exists idx_action_items_owner_status_due
  on public.action_items(owner_user_id, status, due_date);

create index if not exists idx_action_items_family_module_status
  on public.action_items(family_id, module, status);

alter table public.action_items enable row level security;

create policy "Users can view action items"
  on public.action_items for select
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or (
      family_id in (select family_id from public.users where users.id = auth.uid())
      and (
        visibility = 'family'
        or (visibility = 'private' and owner_user_id = auth.uid())
      )
    )
  );

create policy "Users can insert action items"
  on public.action_items for insert
  with check (
    family_id in (select family_id from public.users where users.id = auth.uid())
    and (
      owner_user_id is null
      or owner_user_id = auth.uid()
      or public.has_family_role(family_id, array['admin','parent']::text[])
    )
  );

create policy "Users can update action items"
  on public.action_items for update
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or owner_user_id = auth.uid()
  )
  with check (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or owner_user_id = auth.uid()
  );

create policy "Users can delete action items"
  on public.action_items for delete
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or owner_user_id = auth.uid()
  );

drop trigger if exists set_updated_at_on_action_items on public.action_items;
create trigger set_updated_at_on_action_items
before update on public.action_items
for each row execute procedure public.set_updated_at();

