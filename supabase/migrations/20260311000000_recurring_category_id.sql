alter table public.recurring_transactions
  add column if not exists category_id uuid references public.categories(id);

create index if not exists idx_recurring_family_category_id
  on public.recurring_transactions(family_id, category_id);

update public.recurring_transactions r
set category_id = c.id
from public.categories c
where r.category_id is null
  and r.family_id = c.family_id
  and btrim(r.category) = btrim(c.name);

