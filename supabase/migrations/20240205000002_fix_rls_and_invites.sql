create or replace function public.get_my_family_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select family_id from public.users where id = auth.uid();
$$;

create or replace function public.is_family_member(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.users
    where id = auth.uid()
      and family_id = p_family_id
  );
$$;

drop policy if exists "Users can view their own family" on public.families;
drop policy if exists "Users can view family members" on public.users;
drop policy if exists "Users can view own profile" on public.users;
drop policy if exists "Users can update own profile" on public.users;
drop policy if exists "Users can view family transactions" on public.transactions;
drop policy if exists "Users can insert family transactions" on public.transactions;
drop policy if exists "Users can update family transactions" on public.transactions;
drop policy if exists "Users can delete family transactions" on public.transactions;

create policy "Users can view their own family"
  on public.families for select
  using (public.is_family_member(id));

create policy "Users can view family users"
  on public.users for select
  using (id = auth.uid() or public.is_family_member(family_id));

create policy "Users can update own profile"
  on public.users for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Users can view family transactions"
  on public.transactions for select
  using (public.is_family_member(family_id));

create policy "Users can insert family transactions"
  on public.transactions for insert
  with check (public.is_family_member(family_id));

create policy "Users can update family transactions"
  on public.transactions for update
  using (public.is_family_member(family_id));

create policy "Users can delete family transactions"
  on public.transactions for delete
  using (public.is_family_member(family_id));

drop policy if exists "Family admins can view invitations" on public.invitations;
drop policy if exists "Family admins can create invitations" on public.invitations;
drop policy if exists "Anyone can view invitation by token" on public.invitations;
drop policy if exists "Family members can view invitations" on public.invitations;
drop policy if exists "Family members can create invitations" on public.invitations;
drop policy if exists "Family members can update invitations" on public.invitations;
drop policy if exists "Family members can delete invitations" on public.invitations;

create policy "Family members can view invitations"
  on public.invitations for select
  using (public.is_family_member(family_id));

create policy "Family members can create invitations"
  on public.invitations for insert
  with check (public.is_family_member(family_id));

create policy "Family members can update invitations"
  on public.invitations for update
  using (public.is_family_member(family_id));

create policy "Family members can delete invitations"
  on public.invitations for delete
  using (public.is_family_member(family_id));

create or replace function public.get_invitation_info(p_token text)
returns table (
  id uuid,
  family_id uuid,
  role text,
  status text,
  expires_at timestamptz,
  family_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select i.id, i.family_id, i.role, i.status, i.expires_at, f.name
  from public.invitations i
  join public.families f on f.id = i.family_id
  where i.token = p_token
    and i.status = 'pending'
    and i.expires_at > now()
  limit 1;
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.invitations%rowtype;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_inv
  from public.invitations
  where token = p_token
    and status = 'pending'
    and expires_at > now()
  limit 1;

  if v_inv.id is null then
    raise exception 'Invitation invalid or expired';
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_inv.email is not null and lower(v_inv.email) <> v_email then
    raise exception 'Invitation email mismatch';
  end if;

  if exists(select 1 from public.users where id = auth.uid() and family_id is not null) then
    raise exception 'User already belongs to a family';
  end if;

  update public.users
    set family_id = v_inv.family_id,
        role = v_inv.role
  where id = auth.uid();

  update public.invitations
    set status = 'accepted'
  where id = v_inv.id;
end;
$$;

revoke all on function public.get_invitation_info(text) from public;
revoke all on function public.accept_invitation(text) from public;

grant execute on function public.get_invitation_info(text) to anon, authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
