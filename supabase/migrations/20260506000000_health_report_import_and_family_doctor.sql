create table if not exists public.health_report_files (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade not null,
  subject_user_id uuid references public.users(id) on delete cascade not null,
  created_by_user_id uuid references public.users(id) on delete set null,
  report_type text not null check (report_type in ('checkup', 'lab', 'prescription')),
  source_type text not null check (source_type in ('pdf', 'image')),
  file_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size bigint,
  checksum text,
  captured_at date,
  parse_status text not null default 'pending' check (parse_status in ('pending', 'parsed', 'failed', 'confirmed')),
  parse_error text,
  confidence_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_health_report_files_family on public.health_report_files(family_id, created_at desc);
create index if not exists idx_health_report_files_subject on public.health_report_files(subject_user_id, created_at desc);

create table if not exists public.health_report_items (
  id uuid primary key default uuid_generate_v4(),
  report_file_id uuid references public.health_report_files(id) on delete cascade not null,
  metric_code text not null,
  metric_name text not null,
  value_text text,
  value_num decimal(14, 4),
  unit text,
  reference_low decimal(14, 4),
  reference_high decimal(14, 4),
  reference_text text,
  abnormal_flag text not null default 'unknown' check (abnormal_flag in ('high', 'low', 'normal', 'unknown')),
  confidence decimal(5, 2),
  source_page integer,
  raw_line text,
  created_at timestamptz default now()
);

create index if not exists idx_health_report_items_report on public.health_report_items(report_file_id);
create index if not exists idx_health_report_items_metric on public.health_report_items(metric_code);

create table if not exists public.health_metric_records (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade not null,
  subject_user_id uuid references public.users(id) on delete cascade not null,
  report_file_id uuid references public.health_report_files(id) on delete set null,
  metric_code text not null,
  metric_name text not null,
  value_num decimal(14, 4) not null,
  unit text,
  recorded_at date not null,
  reference_low decimal(14, 4),
  reference_high decimal(14, 4),
  reference_text text,
  abnormal_flag text not null default 'unknown' check (abnormal_flag in ('high', 'low', 'normal', 'unknown')),
  note text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_health_metric_records_family_subject on public.health_metric_records(family_id, subject_user_id, recorded_at desc);
create index if not exists idx_health_metric_records_metric on public.health_metric_records(subject_user_id, metric_code, recorded_at desc);

create table if not exists public.health_followups (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade not null,
  subject_user_id uuid references public.users(id) on delete cascade not null,
  report_file_id uuid references public.health_report_files(id) on delete set null,
  source_type text not null default 'manual' check (source_type in ('report_abnormal', 'manual', 'ai')),
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  status text not null default 'todo' check (status in ('todo', 'doing', 'done', 'dismissed')),
  title text not null,
  description text,
  suggested_action text,
  due_date date,
  resolved_at timestamptz,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_health_followups_family_status on public.health_followups(family_id, status, due_date);
create index if not exists idx_health_followups_subject on public.health_followups(subject_user_id, created_at desc);

create table if not exists public.health_medications (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade not null,
  subject_user_id uuid references public.users(id) on delete cascade not null,
  medication_name text not null,
  dosage text,
  frequency text,
  start_date date,
  end_date date,
  reminder_rule jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'paused', 'stopped')),
  notes text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_health_medications_family_subject on public.health_medications(family_id, subject_user_id, status);

create table if not exists public.health_revisits (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade not null,
  subject_user_id uuid references public.users(id) on delete cascade not null,
  related_report_file_id uuid references public.health_report_files(id) on delete set null,
  department text,
  hospital text,
  revisit_reason text,
  revisit_date date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled', 'missed')),
  notes text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_health_revisits_family_date on public.health_revisits(family_id, revisit_date);
create index if not exists idx_health_revisits_subject on public.health_revisits(subject_user_id, revisit_date);

create table if not exists public.health_check_plans (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade not null,
  subject_user_id uuid references public.users(id) on delete cascade not null,
  plan_type text not null check (plan_type in ('checkup', 'lab', 'vaccination', 'other')),
  title text not null,
  cadence text not null default 'yearly' check (cadence in ('monthly', 'quarterly', 'yearly', 'custom')),
  next_due_date date not null,
  last_completed_date date,
  status text not null default 'active' check (status in ('active', 'paused', 'completed')),
  notes text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_health_check_plans_family_due on public.health_check_plans(family_id, next_due_date, status);
create index if not exists idx_health_check_plans_subject on public.health_check_plans(subject_user_id, next_due_date);

alter table public.health_report_files enable row level security;
alter table public.health_report_items enable row level security;
alter table public.health_metric_records enable row level security;
alter table public.health_followups enable row level security;
alter table public.health_medications enable row level security;
alter table public.health_revisits enable row level security;
alter table public.health_check_plans enable row level security;

create policy "Users can view health report files"
  on public.health_report_files for select
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create policy "Users can insert health report files"
  on public.health_report_files for insert
  with check (
    family_id in (select family_id from public.users where users.id = auth.uid())
    and (
      public.has_family_role(family_id, array['admin','parent']::text[])
      or subject_user_id = auth.uid()
    )
  );

create policy "Users can update health report files"
  on public.health_report_files for update
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  )
  with check (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create policy "Users can view health report items"
  on public.health_report_items for select
  using (
    exists (
      select 1
      from public.health_report_files f
      where f.id = report_file_id
        and (
          public.has_family_role(f.family_id, array['admin','parent']::text[])
          or f.subject_user_id = auth.uid()
        )
    )
  );

create policy "Users can insert health report items"
  on public.health_report_items for insert
  with check (
    exists (
      select 1
      from public.health_report_files f
      where f.id = report_file_id
        and (
          public.has_family_role(f.family_id, array['admin','parent']::text[])
          or f.subject_user_id = auth.uid()
        )
    )
  );

create policy "Users can update health report items"
  on public.health_report_items for update
  using (
    exists (
      select 1
      from public.health_report_files f
      where f.id = report_file_id
        and (
          public.has_family_role(f.family_id, array['admin','parent']::text[])
          or f.subject_user_id = auth.uid()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.health_report_files f
      where f.id = report_file_id
        and (
          public.has_family_role(f.family_id, array['admin','parent']::text[])
          or f.subject_user_id = auth.uid()
        )
    )
  );

create policy "Users can view health metric records"
  on public.health_metric_records for select
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create policy "Users can insert health metric records"
  on public.health_metric_records for insert
  with check (
    family_id in (select family_id from public.users where users.id = auth.uid())
    and (
      public.has_family_role(family_id, array['admin','parent']::text[])
      or subject_user_id = auth.uid()
    )
  );

create policy "Users can update health metric records"
  on public.health_metric_records for update
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  )
  with check (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create policy "Users can delete health metric records"
  on public.health_metric_records for delete
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create policy "Users can view health followups"
  on public.health_followups for select
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create policy "Users can insert health followups"
  on public.health_followups for insert
  with check (
    family_id in (select family_id from public.users where users.id = auth.uid())
    and (
      public.has_family_role(family_id, array['admin','parent']::text[])
      or subject_user_id = auth.uid()
    )
  );

create policy "Users can update health followups"
  on public.health_followups for update
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  )
  with check (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create policy "Users can delete health followups"
  on public.health_followups for delete
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create policy "Users can view health medications"
  on public.health_medications for select
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create policy "Users can insert health medications"
  on public.health_medications for insert
  with check (
    family_id in (select family_id from public.users where users.id = auth.uid())
    and (
      public.has_family_role(family_id, array['admin','parent']::text[])
      or subject_user_id = auth.uid()
    )
  );

create policy "Users can update health medications"
  on public.health_medications for update
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  )
  with check (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create policy "Users can delete health medications"
  on public.health_medications for delete
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create policy "Users can view health revisits"
  on public.health_revisits for select
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create policy "Users can insert health revisits"
  on public.health_revisits for insert
  with check (
    family_id in (select family_id from public.users where users.id = auth.uid())
    and (
      public.has_family_role(family_id, array['admin','parent']::text[])
      or subject_user_id = auth.uid()
    )
  );

create policy "Users can update health revisits"
  on public.health_revisits for update
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  )
  with check (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create policy "Users can delete health revisits"
  on public.health_revisits for delete
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create policy "Users can view health check plans"
  on public.health_check_plans for select
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create policy "Users can insert health check plans"
  on public.health_check_plans for insert
  with check (
    family_id in (select family_id from public.users where users.id = auth.uid())
    and (
      public.has_family_role(family_id, array['admin','parent']::text[])
      or subject_user_id = auth.uid()
    )
  );

create policy "Users can update health check plans"
  on public.health_check_plans for update
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  )
  with check (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

create policy "Users can delete health check plans"
  on public.health_check_plans for delete
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );

drop trigger if exists set_updated_at_on_health_report_files on public.health_report_files;
create trigger set_updated_at_on_health_report_files
before update on public.health_report_files
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_on_health_metric_records on public.health_metric_records;
create trigger set_updated_at_on_health_metric_records
before update on public.health_metric_records
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_on_health_followups on public.health_followups;
create trigger set_updated_at_on_health_followups
before update on public.health_followups
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_on_health_medications on public.health_medications;
create trigger set_updated_at_on_health_medications
before update on public.health_medications
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_on_health_revisits on public.health_revisits;
create trigger set_updated_at_on_health_revisits
before update on public.health_revisits
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_on_health_check_plans on public.health_check_plans;
create trigger set_updated_at_on_health_check_plans
before update on public.health_check_plans
for each row execute procedure public.set_updated_at();

insert into storage.buckets (id, name, public)
values ('health-reports', 'health-reports', false)
on conflict (id) do nothing;

create policy "Users can view health report objects"
  on storage.objects for select
  using (
    bucket_id = 'health-reports'
    and split_part(name, '/', 1) in (
      select family_id::text from public.users where users.id = auth.uid()
    )
  );

create policy "Users can upload health report objects"
  on storage.objects for insert
  with check (
    bucket_id = 'health-reports'
    and split_part(name, '/', 1) in (
      select family_id::text from public.users where users.id = auth.uid()
    )
  );

create policy "Users can update health report objects"
  on storage.objects for update
  using (
    bucket_id = 'health-reports'
    and split_part(name, '/', 1) in (
      select family_id::text from public.users where users.id = auth.uid()
    )
  )
  with check (
    bucket_id = 'health-reports'
    and split_part(name, '/', 1) in (
      select family_id::text from public.users where users.id = auth.uid()
    )
  );

create policy "Admins/Parents can delete health report objects"
  on storage.objects for delete
  using (
    bucket_id = 'health-reports'
    and split_part(name, '/', 1) in (
      select family_id::text
      from public.users
      where users.id = auth.uid()
        and users.role in ('admin', 'parent')
    )
  );
