create table if not exists public.family_member_remarks (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families(id) on delete cascade,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  member_user_id uuid not null references public.users(id) on delete cascade,
  remark_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, member_user_id)
);

create index if not exists idx_family_member_remarks_family on public.family_member_remarks(family_id);
create index if not exists idx_family_member_remarks_owner on public.family_member_remarks(owner_user_id);

alter table public.family_member_remarks enable row level security;

create policy "Owner can read own member remarks"
on public.family_member_remarks
for select
using (owner_user_id = auth.uid());

create policy "Owner can insert own member remarks"
on public.family_member_remarks
for insert
with check (owner_user_id = auth.uid());

create policy "Owner can update own member remarks"
on public.family_member_remarks
for update
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy "Owner can delete own member remarks"
on public.family_member_remarks
for delete
using (owner_user_id = auth.uid());

drop trigger if exists set_updated_at_on_family_member_remarks on public.family_member_remarks;
create trigger set_updated_at_on_family_member_remarks
before update on public.family_member_remarks
for each row execute procedure public.set_updated_at();

