create table public.growth_goals (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade not null,
  owner_user_id uuid references public.users(id) on delete set null,
  title text not null,
  description text,
  category text check (category in ('education', 'career', 'skill', 'health', 'finance', 'other')) default 'other',
  status text check (status in ('active', 'completed', 'paused', 'cancelled')) default 'active',
  priority integer default 0,
  target_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_growth_goals_family on public.growth_goals(family_id);
create index idx_growth_goals_owner on public.growth_goals(owner_user_id);

alter table public.growth_goals enable row level security;

create policy "Users can view family growth goals"
  on public.growth_goals for select
  using (family_id in (select family_id from public.users where users.id = auth.uid()));

create policy "Users can insert family growth goals"
  on public.growth_goals for insert
  with check (family_id in (select family_id from public.users where users.id = auth.uid()));

create policy "Users can update family growth goals"
  on public.growth_goals for update
  using (family_id in (select family_id from public.users where users.id = auth.uid()));

create policy "Users can delete family growth goals"
  on public.growth_goals for delete
  using (family_id in (select family_id from public.users where users.id = auth.uid()));

create table public.growth_key_results (
  id uuid primary key default uuid_generate_v4(),
  goal_id uuid references public.growth_goals(id) on delete cascade not null,
  title text not null,
  target_value decimal(12, 2) default 100,
  current_value decimal(12, 2) default 0,
  unit text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_growth_key_results_goal on public.growth_key_results(goal_id);

alter table public.growth_key_results enable row level security;

create policy "Users can view goal key results"
  on public.growth_key_results for select
  using (goal_id in (select id from public.growth_goals where family_id in (select family_id from public.users where users.id = auth.uid())));

create policy "Users can insert goal key results"
  on public.growth_key_results for insert
  with check (goal_id in (select id from public.growth_goals where family_id in (select family_id from public.users where users.id = auth.uid())));

create policy "Users can update goal key results"
  on public.growth_key_results for update
  using (goal_id in (select id from public.growth_goals where family_id in (select family_id from public.users where users.id = auth.uid())));

create policy "Users can delete goal key results"
  on public.growth_key_results for delete
  using (goal_id in (select id from public.growth_goals where family_id in (select family_id from public.users where users.id = auth.uid())));
