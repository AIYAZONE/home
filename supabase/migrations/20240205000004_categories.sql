create table if not exists public.categories (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) not null,
  name text not null,
  kind text check (kind in ('income', 'expense', 'both')) not null default 'expense',
  created_at timestamptz default now()
);

create unique index if not exists idx_categories_family_name_kind
  on public.categories(family_id, lower(name), kind);

alter table public.categories enable row level security;

drop policy if exists "Family members can view categories" on public.categories;
drop policy if exists "Family members can create categories" on public.categories;
drop policy if exists "Family members can update categories" on public.categories;
drop policy if exists "Family members can delete categories" on public.categories;

create policy "Family members can view categories"
  on public.categories for select
  using (public.is_family_member(family_id));

create policy "Family members can create categories"
  on public.categories for insert
  with check (public.is_family_member(family_id));

create policy "Family members can update categories"
  on public.categories for update
  using (public.is_family_member(family_id));

create policy "Family members can delete categories"
  on public.categories for delete
  using (public.is_family_member(family_id));
