create or replace function public.has_family_role(p_family_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.family_id = p_family_id
      and u.role = any(p_roles)
  );
$$;

drop policy if exists "Family members can create invitations" on public.invitations;
drop policy if exists "Family members can update invitations" on public.invitations;
drop policy if exists "Family members can delete invitations" on public.invitations;

create policy "Admins/Parents can create invitations"
  on public.invitations for insert
  with check (public.has_family_role(family_id, array['admin','parent']::text[]));

create policy "Admins/Parents can update invitations"
  on public.invitations for update
  using (public.has_family_role(family_id, array['admin','parent']::text[]))
  with check (public.has_family_role(family_id, array['admin','parent']::text[]));

create policy "Admins/Parents can delete invitations"
  on public.invitations for delete
  using (public.has_family_role(family_id, array['admin','parent']::text[]));
