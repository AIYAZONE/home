-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- Create families table
create table public.families (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Create users table (extending auth.users)
create table public.users (
    id uuid primary key references auth.users(id) on delete cascade,
    family_id uuid references public.families(id),
    role text check (role in ('admin', 'parent', 'child')),
    name text,
    email text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Create transactions table
create table public.transactions (
    id uuid primary key default uuid_generate_v4(),
    family_id uuid references public.families(id) not null,
    amount decimal(12, 2) not null,
    category text not null,
    description text,
    date timestamptz not null default now(),
    type text check (type in ('income', 'expense', 'transfer')) not null,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Enable RLS
alter table public.families enable row level security;
alter table public.users enable row level security;
alter table public.transactions enable row level security;

-- Create policies
-- Users can view their own family
create policy "Users can view their own family"
    on public.families for select
    using (id in (select family_id from public.users where users.id = auth.uid()));

-- Users can view members of their family
create policy "Users can view family members"
    on public.users for select
    using (family_id in (select family_id from public.users where users.id = auth.uid()));

-- Users can view their own profile
create policy "Users can view own profile"
    on public.users for select
    using (auth.uid() = id);

-- Users can update their own profile
create policy "Users can update own profile"
    on public.users for update
    using (auth.uid() = id);

-- Transactions policies
create policy "Users can view family transactions"
    on public.transactions for select
    using (family_id in (select family_id from public.users where users.id = auth.uid()));

create policy "Users can insert family transactions"
    on public.transactions for insert
    with check (family_id in (select family_id from public.users where users.id = auth.uid()));

create policy "Users can update family transactions"
    on public.transactions for update
    using (family_id in (select family_id from public.users where users.id = auth.uid()));

create policy "Users can delete family transactions"
    on public.transactions for delete
    using (family_id in (select family_id from public.users where users.id = auth.uid()));

-- Function to handle new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, name, role)
  values (new.id, new.email, new.raw_user_meta_data->>'name', 'parent');
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for new user signup
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Create indexes for performance
create index idx_transactions_family_date on public.transactions(family_id, date desc);
create index idx_users_family on public.users(family_id);
