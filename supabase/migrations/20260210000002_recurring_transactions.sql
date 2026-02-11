create table if not exists public.recurring_transactions (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) not null,
  owner_user_id uuid references public.users(id) on delete set null,
  visibility text not null default 'family',
  amount decimal(12, 2) not null,
  category text not null,
  description text,
  type text check (type in ('income', 'expense')) not null,
  cadence text check (cadence in ('weekly', 'monthly')) not null,
  next_run_date date not null,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.recurring_transactions enable row level security;

drop policy if exists "Users can view recurring transactions" on public.recurring_transactions;
drop policy if exists "Users can insert recurring transactions" on public.recurring_transactions;
drop policy if exists "Users can update recurring transactions" on public.recurring_transactions;
drop policy if exists "Users can delete recurring transactions" on public.recurring_transactions;

create policy "Users can view recurring transactions"
  on public.recurring_transactions for select
  using (
    public.is_family_member(family_id)
    and (
      visibility = 'family'
      or owner_user_id = auth.uid()
    )
  );

create policy "Users can insert recurring transactions"
  on public.recurring_transactions for insert
  with check (
    public.is_family_member(family_id)
    and visibility in ('family', 'private')
    and (owner_user_id is null or owner_user_id = auth.uid())
  );

create policy "Users can update recurring transactions"
  on public.recurring_transactions for update
  using (
    public.is_family_member(family_id)
    and (
      visibility = 'family'
      or owner_user_id = auth.uid()
    )
  )
  with check (
    public.is_family_member(family_id)
    and visibility in ('family', 'private')
    and (owner_user_id is null or owner_user_id = auth.uid())
  );

create policy "Users can delete recurring transactions"
  on public.recurring_transactions for delete
  using (
    public.is_family_member(family_id)
    and (
      visibility = 'family'
      or owner_user_id = auth.uid()
    )
  );

create index if not exists idx_recurring_family_next on public.recurring_transactions(family_id, next_run_date asc);

create or replace function public.generate_recurring_transaction(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec public.recurring_transactions%rowtype;
  v_tx_id uuid;
  v_next date;
  v_anchor_day int;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_rec
  from public.recurring_transactions
  where id = p_id
  limit 1;

  if v_rec.id is null then
    raise exception 'Recurring transaction not found';
  end if;

  if not public.is_family_member(v_rec.family_id) then
    raise exception 'Not authorized';
  end if;

  if v_rec.visibility = 'private' and v_rec.owner_user_id is distinct from auth.uid() then
    raise exception 'Not authorized';
  end if;

  if v_rec.active is not true then
    raise exception 'Recurring transaction is inactive';
  end if;

  if v_rec.next_run_date > current_date then
    raise exception 'Recurring transaction not due';
  end if;

  insert into public.transactions (family_id, owner_user_id, visibility, amount, category, description, type, date)
  values (
    v_rec.family_id,
    coalesce(v_rec.owner_user_id, auth.uid()),
    v_rec.visibility,
    v_rec.amount,
    v_rec.category,
    v_rec.description,
    v_rec.type,
    now()
  )
  returning id into v_tx_id;

  if v_rec.cadence = 'weekly' then
    v_next := (v_rec.next_run_date + interval '7 days')::date;
  else
    v_anchor_day := extract(day from v_rec.next_run_date)::int;
    v_next := (v_rec.next_run_date + interval '1 month')::date;
    v_next := make_date(extract(year from v_next)::int, extract(month from v_next)::int, 1)
      + (least(v_anchor_day, extract(day from (date_trunc('month', v_next)::date + interval '1 month - 1 day'))::int) - 1);
  end if;

  update public.recurring_transactions
  set next_run_date = v_next,
      updated_at = now()
  where id = v_rec.id;

  return v_tx_id;
end;
$$;

revoke all on function public.generate_recurring_transaction(uuid) from public;
grant execute on function public.generate_recurring_transaction(uuid) to authenticated;
