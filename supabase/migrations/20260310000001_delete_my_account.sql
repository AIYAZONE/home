alter table public.families
  drop constraint if exists families_created_by_fkey;

alter table public.families
  add constraint families_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.invitations
  drop constraint if exists invitations_created_by_fkey;

alter table public.invitations
  add constraint invitations_created_by_fkey
  foreign key (created_by) references public.users(id) on delete set null;

create or replace function public.delete_my_account(p_ip inet default null, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_family_id uuid;
  v_role text;
  v_member_count int;
  v_admin_count int;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select u.family_id, u.role
    into v_family_id, v_role
  from public.users u
  where u.id = v_user_id
  limit 1;

  insert into public.audit_logs (family_id, actor_id, action, metadata, ip, user_agent)
  values (
    v_family_id,
    v_user_id,
    'account.delete_requested',
    jsonb_build_object('user_id', v_user_id),
    p_ip,
    p_user_agent
  );

  update public.families
    set created_by = null
  where created_by = v_user_id;

  update public.invitations
    set created_by = null
  where created_by = v_user_id;

  if v_family_id is not null then
    select count(*) into v_member_count
    from public.users
    where family_id = v_family_id;

    if v_role = 'admin' then
      select count(*) into v_admin_count
      from public.users
      where family_id = v_family_id
        and role = 'admin';

      if v_admin_count = 1 and v_member_count > 1 then
        raise exception '你是家庭唯一管理员，请先转移管理员权限后再注销。';
      end if;
    end if;

    delete from public.transactions
    where family_id = v_family_id
      and owner_user_id = v_user_id
      and visibility = 'private';

    delete from public.recurring_transactions
    where family_id = v_family_id
      and owner_user_id = v_user_id
      and visibility = 'private';

    delete from public.balance_sheet_items
    where family_id = v_family_id
      and owner_user_id = v_user_id
      and visibility = 'private';

    delete from public.external_contacts
    where family_id = v_family_id
      and owner_user_id = v_user_id;

    delete from public.growth_goals
    where family_id = v_family_id
      and (
        subject_user_id = v_user_id
        or created_by_user_id = v_user_id
      );

    delete from public.health_profiles
    where family_id = v_family_id
      and subject_user_id = v_user_id;

    delete from public.health_metrics
    where family_id = v_family_id
      and subject_user_id = v_user_id;

    delete from public.insurance_policies
    where family_id = v_family_id
      and subject_user_id = v_user_id;

    update public.relationship_events
    set participant_user_ids = array_remove(participant_user_ids, v_user_id)
    where family_id = v_family_id
      and v_user_id = any(participant_user_ids);

    delete from public.family_member_remarks
    where family_id = v_family_id
      and (
        owner_user_id = v_user_id
        or member_user_id = v_user_id
      );

    insert into public.audit_logs (family_id, actor_id, action, metadata, ip, user_agent)
    values (
      v_family_id,
      v_user_id,
      'account.deleted',
      jsonb_build_object('user_id', v_user_id, 'family_deleted', (v_member_count = 1)),
      p_ip,
      p_user_agent
    );

    if v_member_count = 1 then
      delete from public.invitations where family_id = v_family_id;
      delete from public.transactions where family_id = v_family_id;
      delete from public.recurring_transactions where family_id = v_family_id;
      delete from public.categories where family_id = v_family_id;
      delete from public.budgets where family_id = v_family_id;

      delete from public.users where id = v_user_id;
      delete from public.families where id = v_family_id;
      return;
    end if;

    update public.users
      set family_id = null,
          role = null
    where id = v_user_id;
  else
    insert into public.audit_logs (family_id, actor_id, action, metadata, ip, user_agent)
    values (
      null,
      v_user_id,
      'account.deleted',
      jsonb_build_object('user_id', v_user_id, 'family_deleted', false),
      p_ip,
      p_user_agent
    );
  end if;
end;
$$;

revoke all on function public.delete_my_account(inet, text) from public;
grant execute on function public.delete_my_account(inet, text) to authenticated;

