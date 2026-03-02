create table public.balance_sheet_items (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade not null,
  owner_user_id uuid,
  visibility text not null default 'family',
  kind text check (kind in ('asset', 'liability')) not null,
  category text not null,
  name text not null,
  amount decimal(14, 2) not null default 0,
  as_of_date date not null default current_date,
  note text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_balance_sheet_items_family on public.balance_sheet_items(family_id);
create index idx_balance_sheet_items_kind on public.balance_sheet_items(family_id, kind);

alter table public.balance_sheet_items
  drop constraint if exists balance_sheet_items_visibility_check;

alter table public.balance_sheet_items
  add constraint balance_sheet_items_visibility_check
  check (visibility in ('family', 'private'));

alter table public.balance_sheet_items
  drop constraint if exists balance_sheet_items_owner_user_id_fkey;

alter table public.balance_sheet_items
  add constraint balance_sheet_items_owner_user_id_fkey
  foreign key (owner_user_id) references public.users(id) on delete set null;

create or replace function public.set_balance_sheet_item_owner_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_user_id is null then
    new.owner_user_id := auth.uid();
  end if;

  if new.visibility is null then
    new.visibility := 'family';
  end if;

  return new;
end;
$$;

drop trigger if exists balance_sheet_items_set_owner_defaults on public.balance_sheet_items;
create trigger balance_sheet_items_set_owner_defaults
before insert on public.balance_sheet_items
for each row execute procedure public.set_balance_sheet_item_owner_defaults();

alter table public.balance_sheet_items enable row level security;

drop policy if exists "Users can view balance sheet items" on public.balance_sheet_items;
drop policy if exists "Users can insert balance sheet items" on public.balance_sheet_items;
drop policy if exists "Users can update balance sheet items" on public.balance_sheet_items;
drop policy if exists "Users can delete balance sheet items" on public.balance_sheet_items;

create policy "Users can view balance sheet items"
  on public.balance_sheet_items for select
  using (
    public.is_family_member(family_id)
    and (
      visibility = 'family'
      or owner_user_id = auth.uid()
    )
  );

create policy "Users can insert balance sheet items"
  on public.balance_sheet_items for insert
  with check (
    public.is_family_member(family_id)
    and visibility in ('family', 'private')
    and (owner_user_id is null or owner_user_id = auth.uid())
  );

create policy "Users can update balance sheet items"
  on public.balance_sheet_items for update
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

create policy "Users can delete balance sheet items"
  on public.balance_sheet_items for delete
  using (
    public.is_family_member(family_id)
    and (
      visibility = 'family'
      or owner_user_id = auth.uid()
    )
  );
