create table if not exists public.relationship_events (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade not null,
  title text not null,
  occurred_at date not null default (now() at time zone 'utc')::date,
  participant_user_ids uuid[] not null default '{}'::uuid[],
  notes text,
  action_items text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_relationship_events_family_date on public.relationship_events(family_id, occurred_at desc);
create index if not exists idx_relationship_events_participants on public.relationship_events using gin(participant_user_ids);

alter table public.relationship_events enable row level security;

create policy "Users can view relationship events"
  on public.relationship_events for select
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or auth.uid() = any(participant_user_ids)
    or created_by_user_id = auth.uid()
  );

create policy "Users can insert relationship events"
  on public.relationship_events for insert
  with check (
    family_id in (select family_id from public.users where users.id = auth.uid())
    and (
      public.has_family_role(family_id, array['admin','parent']::text[])
      or auth.uid() = any(participant_user_ids)
      or created_by_user_id = auth.uid()
    )
  );

create policy "Users can update relationship events"
  on public.relationship_events for update
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or auth.uid() = any(participant_user_ids)
    or created_by_user_id = auth.uid()
  )
  with check (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or auth.uid() = any(participant_user_ids)
    or created_by_user_id = auth.uid()
  );

create policy "Users can delete relationship events"
  on public.relationship_events for delete
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or auth.uid() = any(participant_user_ids)
    or created_by_user_id = auth.uid()
  );

create table if not exists public.external_contacts (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade not null,
  owner_user_id uuid references public.users(id) on delete cascade not null,
  visibility text not null default 'family' check (visibility in ('family','private')),
  name text not null,
  relation text,
  tags text[] not null default '{}'::text[],
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_external_contacts_family on public.external_contacts(family_id);
create index if not exists idx_external_contacts_owner on public.external_contacts(owner_user_id);
create index if not exists idx_external_contacts_tags on public.external_contacts using gin(tags);

alter table public.external_contacts enable row level security;

create policy "Users can view external contacts"
  on public.external_contacts for select
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or visibility = 'family'
    or owner_user_id = auth.uid()
  );

create policy "Users can insert external contacts"
  on public.external_contacts for insert
  with check (
    family_id in (select family_id from public.users where users.id = auth.uid())
    and owner_user_id = auth.uid()
  );

create policy "Users can update external contacts"
  on public.external_contacts for update
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or owner_user_id = auth.uid()
  )
  with check (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or owner_user_id = auth.uid()
  );

create policy "Users can delete external contacts"
  on public.external_contacts for delete
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or owner_user_id = auth.uid()
  );

create table if not exists public.contact_interactions (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade not null,
  contact_id uuid references public.external_contacts(id) on delete cascade not null,
  interaction_date date not null default (now() at time zone 'utc')::date,
  summary text,
  next_follow_up_date date,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_contact_interactions_family_date on public.contact_interactions(family_id, interaction_date desc);
create index if not exists idx_contact_interactions_contact on public.contact_interactions(contact_id, interaction_date desc);

alter table public.contact_interactions enable row level security;

create policy "Users can view contact interactions"
  on public.contact_interactions for select
  using (
    exists (
      select 1
      from public.external_contacts c
      where c.id = contact_id
        and (
          public.has_family_role(c.family_id, array['admin','parent']::text[])
          or c.visibility = 'family'
          or c.owner_user_id = auth.uid()
        )
    )
  );

create policy "Users can insert contact interactions"
  on public.contact_interactions for insert
  with check (
    family_id in (select family_id from public.users where users.id = auth.uid())
    and exists (
      select 1
      from public.external_contacts c
      where c.id = contact_id
        and c.family_id = family_id
        and (
          public.has_family_role(c.family_id, array['admin','parent']::text[])
          or c.visibility = 'family'
          or c.owner_user_id = auth.uid()
        )
    )
  );

create policy "Users can update contact interactions"
  on public.contact_interactions for update
  using (
    exists (
      select 1
      from public.external_contacts c
      where c.id = contact_id
        and (
          public.has_family_role(c.family_id, array['admin','parent']::text[])
          or c.visibility = 'family'
          or c.owner_user_id = auth.uid()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.external_contacts c
      where c.id = contact_id
        and (
          public.has_family_role(c.family_id, array['admin','parent']::text[])
          or c.visibility = 'family'
          or c.owner_user_id = auth.uid()
        )
    )
  );

create policy "Users can delete contact interactions"
  on public.contact_interactions for delete
  using (
    exists (
      select 1
      from public.external_contacts c
      where c.id = contact_id
        and (
          public.has_family_role(c.family_id, array['admin','parent']::text[])
          or c.visibility = 'family'
          or c.owner_user_id = auth.uid()
        )
    )
  );

