create table if not exists public.meal_preferences (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade not null,
  subject_user_id uuid references public.users(id) on delete cascade not null,
  created_by_user_id uuid references public.users(id) on delete set null,
  disliked text,
  liked text,
  spicy_level text check (spicy_level in ('none','mil','med','hot')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists uniq_meal_preferences_family_subject
  on public.meal_preferences(family_id, subject_user_id);
create index if not exists idx_meal_preferences_family on public.meal_preferences(family_id);

alter table public.meal_preferences enable row level security;

create policy "Users can view meal preferences"
  on public.meal_preferences for select
  using (public.has_family_role(family_id, array['admin','parent']::text[]) or subject_user_id = auth.uid());

create policy "Users can insert meal preferences"
  on public.meal_preferences for insert
  with check (
    family_id in (select family_id from public.users where users.id = auth.uid())
    and (public.has_family_role(family_id, array['admin','parent']::text[]) or subject_user_id = auth.uid())
  );

create policy "Users can update meal preferences"
  on public.meal_preferences for update
  using (public.has_family_role(family_id, array['admin','parent']::text[]) or subject_user_id = auth.uid())
  with check (public.has_family_role(family_id, array['admin','parent']::text[]) or subject_user_id = auth.uid());

create policy "Users can delete meal preferences"
  on public.meal_preferences for delete
  using (public.has_family_role(family_id, array['admin','parent']::text[]) or subject_user_id = auth.uid());
