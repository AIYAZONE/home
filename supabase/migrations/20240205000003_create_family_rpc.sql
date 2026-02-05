alter table public.families
  add column if not exists created_by uuid references auth.users(id);

create index if not exists idx_families_created_by on public.families(created_by);

create or replace function public.create_family(p_name text)
returns public.families
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family public.families%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if exists(select 1 from public.users where id = auth.uid() and family_id is not null) then
    raise exception 'User already belongs to a family';
  end if;

  insert into public.families (name, created_by)
  values (p_name, auth.uid())
  returning * into v_family;

  update public.users
    set family_id = v_family.id,
        role = 'admin'
  where id = auth.uid();

  return v_family;
end;
$$;

revoke all on function public.create_family(text) from public;
grant execute on function public.create_family(text) to authenticated;
