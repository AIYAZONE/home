create table public.fund_accounts (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade not null,
  name text not null,
  kind text check (kind in ('safety', 'goal', 'dream')) not null,
  target_amount decimal(12, 2) default 0,
  current_amount decimal(12, 2) default 0,
  target_date date,
  description text,
  priority integer default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_fund_accounts_family on public.fund_accounts(family_id);

alter table public.fund_accounts enable row level security;

create policy "Users can view family fund accounts"
  on public.fund_accounts for select
  using (family_id in (select family_id from public.users where users.id = auth.uid()));

create policy "Users can insert family fund accounts"
  on public.fund_accounts for insert
  with check (family_id in (select family_id from public.users where users.id = auth.uid()));

create policy "Users can update family fund accounts"
  on public.fund_accounts for update
  using (family_id in (select family_id from public.users where users.id = auth.uid()));

create policy "Users can delete family fund accounts"
  on public.fund_accounts for delete
  using (family_id in (select family_id from public.users where users.id = auth.uid()));

create table public.fund_allocations (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade not null,
  fund_account_id uuid references public.fund_accounts(id) on delete cascade not null,
  transaction_id uuid references public.transactions(id) on delete set null,
  amount decimal(12, 2) not null,
  kind text check (kind in ('deposit', 'withdrawal', 'adjustment')) not null,
  note text,
  created_at timestamptz default now()
);

create index idx_fund_allocations_family on public.fund_allocations(family_id);
create index idx_fund_allocations_fund on public.fund_allocations(fund_account_id);

alter table public.fund_allocations enable row level security;

create policy "Users can view family fund allocations"
  on public.fund_allocations for select
  using (family_id in (select family_id from public.users where users.id = auth.uid()));

create policy "Users can insert family fund allocations"
  on public.fund_allocations for insert
  with check (family_id in (select family_id from public.users where users.id = auth.uid()));

create policy "Users can delete family fund allocations"
  on public.fund_allocations for delete
  using (family_id in (select family_id from public.users where users.id = auth.uid()));

create table public.allocation_rules (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade not null,
  fund_account_id uuid references public.fund_accounts(id) on delete cascade not null,
  percentage decimal(5, 2) not null check (percentage >= 0 and percentage <= 100),
  priority integer default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_allocation_rules_family on public.allocation_rules(family_id);

alter table public.allocation_rules enable row level security;

create policy "Users can view family allocation rules"
  on public.allocation_rules for select
  using (family_id in (select family_id from public.users where users.id = auth.uid()));

create policy "Users can insert family allocation rules"
  on public.allocation_rules for insert
  with check (family_id in (select family_id from public.users where users.id = auth.uid()));

create policy "Users can update family allocation rules"
  on public.allocation_rules for update
  using (family_id in (select family_id from public.users where users.id = auth.uid()));

create policy "Users can delete family allocation rules"
  on public.allocation_rules for delete
  using (family_id in (select family_id from public.users where users.id = auth.uid()));

create or replace function public.update_fund_account_amount(p_fund_id uuid, p_delta decimal(12, 2))
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.fund_accounts
  set current_amount = current_amount + p_delta, updated_at = now()
  where id = p_fund_id;
end;
$$;
