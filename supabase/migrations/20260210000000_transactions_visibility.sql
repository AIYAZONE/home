alter table public.transactions
  add column if not exists owner_user_id uuid,
  add column if not exists visibility text not null default 'family';

alter table public.transactions
  drop constraint if exists transactions_visibility_check;

alter table public.transactions
  add constraint transactions_visibility_check
  check (visibility in ('family', 'private'));

alter table public.transactions
  drop constraint if exists transactions_owner_user_id_fkey;

alter table public.transactions
  add constraint transactions_owner_user_id_fkey
  foreign key (owner_user_id) references public.users(id) on delete set null;

create or replace function public.set_transaction_owner_defaults()
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

drop trigger if exists transactions_set_owner_defaults on public.transactions;
create trigger transactions_set_owner_defaults
before insert on public.transactions
for each row execute procedure public.set_transaction_owner_defaults();
