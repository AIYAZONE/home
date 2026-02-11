drop policy if exists "Users can view family transactions" on public.transactions;
drop policy if exists "Users can insert family transactions" on public.transactions;
drop policy if exists "Users can update family transactions" on public.transactions;
drop policy if exists "Users can delete family transactions" on public.transactions;

create policy "Users can view visible transactions"
  on public.transactions for select
  using (
    public.is_family_member(family_id)
    and (
      visibility = 'family'
      or owner_user_id = auth.uid()
    )
  );

create policy "Users can insert visible transactions"
  on public.transactions for insert
  with check (
    public.is_family_member(family_id)
    and visibility in ('family', 'private')
    and (owner_user_id is null or owner_user_id = auth.uid())
  );

create policy "Users can update visible transactions"
  on public.transactions for update
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

create policy "Users can delete visible transactions"
  on public.transactions for delete
  using (
    public.is_family_member(family_id)
    and (
      visibility = 'family'
      or owner_user_id = auth.uid()
    )
  );
