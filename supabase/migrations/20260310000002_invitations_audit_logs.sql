create or replace function public.tg_audit_invitations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'invitation.created';
    v_actor := coalesce(new.created_by, auth.uid());

    insert into public.audit_logs (family_id, actor_id, action, entity_type, entity_id, metadata)
    values (
      new.family_id,
      v_actor,
      v_action,
      'invitation',
      new.id,
      jsonb_build_object(
        'role', new.role,
        'status', new.status,
        'expires_at', new.expires_at,
        'email_bound', (new.email is not null)
      )
    );

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      if new.status = 'accepted' then
        v_action := 'invitation.accepted';
      elsif new.status = 'expired' then
        v_action := 'invitation.revoked';
      else
        return new;
      end if;

      v_actor := auth.uid();

      insert into public.audit_logs (family_id, actor_id, action, entity_type, entity_id, metadata)
      values (
        new.family_id,
        coalesce(v_actor, new.created_by),
        v_action,
        'invitation',
        new.id,
        jsonb_build_object(
          'from', old.status,
          'to', new.status
        )
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists audit_invitations_insert on public.invitations;
create trigger audit_invitations_insert
after insert on public.invitations
for each row execute procedure public.tg_audit_invitations();

drop trigger if exists audit_invitations_status_update on public.invitations;
create trigger audit_invitations_status_update
after update of status on public.invitations
for each row execute procedure public.tg_audit_invitations();

