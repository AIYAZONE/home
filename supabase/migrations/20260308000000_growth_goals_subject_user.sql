alter table public.growth_goals
  add column if not exists subject_user_id uuid references public.users(id) on delete set null;

alter table public.growth_goals
  add column if not exists created_by_user_id uuid references public.users(id) on delete set null;

update public.growth_goals
set subject_user_id = coalesce(subject_user_id, owner_user_id);

update public.growth_goals
set created_by_user_id = coalesce(created_by_user_id, owner_user_id);

create index if not exists idx_growth_goals_subject on public.growth_goals(subject_user_id);

drop policy if exists "Users can view family growth goals" on public.growth_goals;
drop policy if exists "Users can insert family growth goals" on public.growth_goals;
drop policy if exists "Users can update family growth goals" on public.growth_goals;
drop policy if exists "Users can delete family growth goals" on public.growth_goals;

create policy "Users can view growth goals"
  on public.growth_goals for select
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create policy "Users can insert growth goals"
  on public.growth_goals for insert
  with check (
    family_id in (select family_id from public.users where users.id = auth.uid())
    and (
      public.has_family_role(family_id, array['admin','parent']::text[])
      or subject_user_id = auth.uid()
    )
  );

create policy "Users can update growth goals"
  on public.growth_goals for update
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  )
  with check (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create policy "Users can delete growth goals"
  on public.growth_goals for delete
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

drop policy if exists "Users can view goal key results" on public.growth_key_results;
drop policy if exists "Users can insert goal key results" on public.growth_key_results;
drop policy if exists "Users can update goal key results" on public.growth_key_results;
drop policy if exists "Users can delete goal key results" on public.growth_key_results;

create policy "Users can view goal key results"
  on public.growth_key_results for select
  using (
    goal_id in (
      select g.id
      from public.growth_goals g
      where public.has_family_role(g.family_id, array['admin','parent']::text[])
         or g.subject_user_id = auth.uid()
    )
  );

create policy "Users can insert goal key results"
  on public.growth_key_results for insert
  with check (
    goal_id in (
      select g.id
      from public.growth_goals g
      where public.has_family_role(g.family_id, array['admin','parent']::text[])
         or g.subject_user_id = auth.uid()
    )
  );

create policy "Users can update goal key results"
  on public.growth_key_results for update
  using (
    goal_id in (
      select g.id
      from public.growth_goals g
      where public.has_family_role(g.family_id, array['admin','parent']::text[])
         or g.subject_user_id = auth.uid()
    )
  )
  with check (
    goal_id in (
      select g.id
      from public.growth_goals g
      where public.has_family_role(g.family_id, array['admin','parent']::text[])
         or g.subject_user_id = auth.uid()
    )
  );

create policy "Users can delete goal key results"
  on public.growth_key_results for delete
  using (
    goal_id in (
      select g.id
      from public.growth_goals g
      where public.has_family_role(g.family_id, array['admin','parent']::text[])
         or g.subject_user_id = auth.uid()
    )
  );

