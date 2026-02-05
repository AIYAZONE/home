-- Create invitations table
create table public.invitations (
    id uuid primary key default uuid_generate_v4(),
    family_id uuid references public.families(id) not null,
    email text, -- Optional, if we want to restrict to specific email
    token text not null unique,
    role text check (role in ('admin', 'parent', 'child')) not null default 'parent',
    status text check (status in ('pending', 'accepted', 'expired')) not null default 'pending',
    expires_at timestamptz not null default (now() + interval '7 days'),
    created_at timestamptz default now(),
    created_by uuid references public.users(id)
);

-- Enable RLS
alter table public.invitations enable row level security;

-- Policies for invitations
-- Admins/Parents can view and create invitations for their family
create policy "Family admins can view invitations"
    on public.invitations for select
    using (family_id in (select family_id from public.users where users.id = auth.uid()));

create policy "Family admins can create invitations"
    on public.invitations for insert
    with check (family_id in (select family_id from public.users where users.id = auth.uid()));

-- Anyone can view an invitation by token (needed for the join page)
create policy "Anyone can view invitation by token"
    on public.invitations for select
    using (true); 

-- Indexes
create index idx_invitations_token on public.invitations(token);
create index idx_invitations_family on public.invitations(family_id);
