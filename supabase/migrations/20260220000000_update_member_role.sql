create or replace function public.update_member_role(p_user_id uuid, p_new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_family_id uuid;
  v_target_family_id uuid;
  v_actor_role text;
begin
  if p_new_role not in ('admin', 'parent', 'child') then
    raise exception 'Invalid role. Must be admin, parent, or child.';
  end if;

  select family_id, role into v_actor_family_id, v_actor_role
  from public.users where id = auth.uid();

  if v_actor_family_id is null then
    raise exception 'You are not in a family.';
  end if;

  if v_actor_role != 'admin' then
    raise exception 'Only admin can change member roles.';
  end if;

  select family_id into v_target_family_id
  from public.users where id = p_user_id;

  if v_target_family_id is null then
    raise exception 'Target user not found.';
  end if;

  if v_target_family_id != v_actor_family_id then
    raise exception 'Target user is not in your family.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Cannot change your own role.';
  end if;

  update public.users
  set role = p_new_role, updated_at = now()
  where id = p_user_id;
end;
$$;
