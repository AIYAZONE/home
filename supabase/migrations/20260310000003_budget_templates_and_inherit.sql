create table if not exists public.budget_templates (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) not null,
  category_id uuid references public.categories(id),
  category_name text not null,
  method text check (method in ('fixed')) not null default 'fixed',
  amount decimal(12, 2) not null default 0,
  start_month date,
  end_month date,
  priority int not null default 100,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_budget_templates_family_active_priority
  on public.budget_templates(family_id, active, priority, created_at);

create unique index if not exists idx_budget_templates_family_category
  on public.budget_templates(family_id, category_name);

alter table public.budget_templates enable row level security;

drop policy if exists "Family members can view budget templates" on public.budget_templates;
drop policy if exists "Family members can create budget templates" on public.budget_templates;
drop policy if exists "Family members can update budget templates" on public.budget_templates;
drop policy if exists "Family members can delete budget templates" on public.budget_templates;

create policy "Family members can view budget templates"
  on public.budget_templates for select
  using (public.is_family_member(family_id));

create policy "Family members can create budget templates"
  on public.budget_templates for insert
  with check (public.is_family_member(family_id));

create policy "Family members can update budget templates"
  on public.budget_templates for update
  using (public.is_family_member(family_id));

create policy "Family members can delete budget templates"
  on public.budget_templates for delete
  using (public.is_family_member(family_id));

alter table public.budgets add column if not exists category_id uuid references public.categories(id);
alter table public.budgets add column if not exists source text not null default 'manual';

drop trigger if exists set_updated_at_on_budget_templates on public.budget_templates;
create trigger set_updated_at_on_budget_templates
before update on public.budget_templates
for each row execute procedure public.set_updated_at();

create or replace function public.ensure_month_budgets(p_month_start date)
returns table (
  inserted_from_templates int,
  inserted_from_previous_month int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_month_start date;
  v_prev_month_start date;
  v_inserted_templates int := 0;
  v_inserted_inherited int := 0;
begin
  v_family_id := public.get_my_family_id();
  if v_family_id is null then
    raise exception '缺少家庭信息';
  end if;

  v_month_start := date_trunc('month', p_month_start)::date;
  v_prev_month_start := (v_month_start - interval '1 month')::date;

  with inserted as (
    insert into public.budgets (family_id, month_start, category_id, category_name, amount, source)
    select
      v_family_id,
      v_month_start,
      bt.category_id,
      bt.category_name,
      bt.amount,
      'template'
    from public.budget_templates bt
    where bt.family_id = v_family_id
      and bt.active = true
      and (bt.start_month is null or bt.start_month <= v_month_start)
      and (bt.end_month is null or bt.end_month >= v_month_start)
    order by bt.priority asc, bt.created_at asc
    on conflict (family_id, month_start, category_name) do nothing
    returning 1
  )
  select count(*) into v_inserted_templates from inserted;

  with inserted as (
    insert into public.budgets (family_id, month_start, category_id, category_name, amount, source)
    select
      v_family_id,
      v_month_start,
      b.category_id,
      b.category_name,
      b.amount,
      'inherited'
    from public.budgets b
    where b.family_id = v_family_id
      and b.month_start = v_prev_month_start
    on conflict (family_id, month_start, category_name) do nothing
    returning 1
  )
  select count(*) into v_inserted_inherited from inserted;

  return query select v_inserted_templates, v_inserted_inherited;
end;
$$;

revoke all on function public.ensure_month_budgets(date) from public;
grant execute on function public.ensure_month_budgets(date) to authenticated;
