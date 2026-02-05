create table if not exists public.budgets (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) not null,
  month_start date not null,
  category_name text not null,
  amount decimal(12, 2) not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_budgets_family_month_category
  on public.budgets(family_id, month_start, category_name);

alter table public.budgets enable row level security;

drop policy if exists "Family members can view budgets" on public.budgets;
drop policy if exists "Family members can create budgets" on public.budgets;
drop policy if exists "Family members can update budgets" on public.budgets;
drop policy if exists "Family members can delete budgets" on public.budgets;

create policy "Family members can view budgets"
  on public.budgets for select
  using (public.is_family_member(family_id));

create policy "Family members can create budgets"
  on public.budgets for insert
  with check (public.is_family_member(family_id));

create policy "Family members can update budgets"
  on public.budgets for update
  using (public.is_family_member(family_id));

create policy "Family members can delete budgets"
  on public.budgets for delete
  using (public.is_family_member(family_id));
