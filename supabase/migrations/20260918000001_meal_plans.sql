create table if not exists public.meal_plans (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade not null,
  plan_date date not null,
  plan_json jsonb not null,
  constraints_snapshot jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists uniq_meal_plans_family_date
  on public.meal_plans(family_id, plan_date);
create index if not exists idx_meal_plans_family on public.meal_plans(family_id);

alter table public.meal_plans enable row level security;

create policy "Users can view meal plans"
  on public.meal_plans for select
  using (family_id in (select family_id from public.users where users.id = auth.uid()));

create policy "Users can insert meal plans"
  on public.meal_plans for insert
  with check (family_id in (select family_id from public.users where users.id = auth.uid()));

create policy "Users can update meal plans"
  on public.meal_plans for update
  using (family_id in (select family_id from public.users where users.id = auth.uid()))
  with check (family_id in (select family_id from public.users where users.id = auth.uid()));

create policy "Users can delete meal plans"
  on public.meal_plans for delete
  using (family_id in (select family_id from public.users where users.id = auth.uid()));
