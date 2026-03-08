create table if not exists public.health_profiles (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade not null,
  subject_user_id uuid references public.users(id) on delete cascade not null,
  created_by_user_id uuid references public.users(id) on delete set null,
  display_name text,
  birth_date date,
  height_cm decimal(8, 2),
  allergies text,
  conditions text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists uniq_health_profiles_family_subject
  on public.health_profiles(family_id, subject_user_id);

create index if not exists idx_health_profiles_family on public.health_profiles(family_id);
create index if not exists idx_health_profiles_subject on public.health_profiles(subject_user_id);

alter table public.health_profiles enable row level security;

create policy "Users can view health profiles"
  on public.health_profiles for select
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create policy "Users can upsert health profiles"
  on public.health_profiles for insert
  with check (
    family_id in (select family_id from public.users where users.id = auth.uid())
    and (
      public.has_family_role(family_id, array['admin','parent']::text[])
      or subject_user_id = auth.uid()
    )
  );

create policy "Users can update health profiles"
  on public.health_profiles for update
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  )
  with check (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create table if not exists public.health_metrics (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade not null,
  subject_user_id uuid references public.users(id) on delete cascade not null,
  metric_key text not null check (metric_key in ('weight_kg','sleep_hours','steps')),
  value decimal(12, 2) not null,
  unit text,
  recorded_at date not null default (now() at time zone 'utc')::date,
  note text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_health_metrics_family on public.health_metrics(family_id);
create index if not exists idx_health_metrics_subject_key_date on public.health_metrics(subject_user_id, metric_key, recorded_at desc);

alter table public.health_metrics enable row level security;

create policy "Users can view health metrics"
  on public.health_metrics for select
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create policy "Users can insert health metrics"
  on public.health_metrics for insert
  with check (
    family_id in (select family_id from public.users where users.id = auth.uid())
    and (
      public.has_family_role(family_id, array['admin','parent']::text[])
      or subject_user_id = auth.uid()
    )
  );

create policy "Users can update health metrics"
  on public.health_metrics for update
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  )
  with check (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create policy "Users can delete health metrics"
  on public.health_metrics for delete
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create table if not exists public.insurance_policies (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade not null,
  subject_user_id uuid references public.users(id) on delete cascade not null,
  kind text not null check (kind in ('health','life','accident','critical_illness','dental','other')),
  provider text,
  product_name text,
  coverage_amount decimal(14, 2),
  premium_amount decimal(14, 2),
  premium_cadence text check (premium_cadence in ('monthly','yearly','one_time')),
  start_date date,
  end_date date,
  note text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_insurance_policies_family on public.insurance_policies(family_id);
create index if not exists idx_insurance_policies_subject on public.insurance_policies(subject_user_id);

alter table public.insurance_policies enable row level security;

create policy "Users can view insurance policies"
  on public.insurance_policies for select
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create policy "Users can insert insurance policies"
  on public.insurance_policies for insert
  with check (
    family_id in (select family_id from public.users where users.id = auth.uid())
    and (
      public.has_family_role(family_id, array['admin','parent']::text[])
      or subject_user_id = auth.uid()
    )
  );

create policy "Users can update insurance policies"
  on public.insurance_policies for update
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  )
  with check (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create policy "Users can delete insurance policies"
  on public.insurance_policies for delete
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

