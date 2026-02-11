create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_on_families on public.families;
create trigger set_updated_at_on_families
before update on public.families
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_on_users on public.users;
create trigger set_updated_at_on_users
before update on public.users
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_on_transactions on public.transactions;
create trigger set_updated_at_on_transactions
before update on public.transactions
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_on_budgets on public.budgets;
create trigger set_updated_at_on_budgets
before update on public.budgets
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_on_categories on public.categories;
create trigger set_updated_at_on_categories
before update on public.categories
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_on_invitations on public.invitations;
create trigger set_updated_at_on_invitations
before update on public.invitations
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_on_recurring_transactions on public.recurring_transactions;
create trigger set_updated_at_on_recurring_transactions
before update on public.recurring_transactions
for each row execute procedure public.set_updated_at();
