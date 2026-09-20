-- AI 模型清单（平台级）+ 平台管理员表。
-- 两张表均仅 service role 访问：RLS 开启且不建任何用户策略，家庭成员（含家庭 admin）不可直查。

create table if not exists public.ai_providers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  base_url text not null,
  model text not null,
  api_key_encrypted text not null,
  api_key_mask text not null,
  capability text not null default 'text' check (capability in ('text','vision')),
  cost_tier text not null default 'free' check (cost_tier in ('free','paid')),
  priority int not null,
  enabled boolean not null default true,
  test_status text check (test_status in ('ok','error')),
  test_detail text,
  tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_providers_enabled_priority on public.ai_providers(enabled, priority asc);

create table if not exists public.platform_admins (
  user_id uuid primary key references public.users(id) on delete cascade,
  added_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.ai_providers enable row level security;
alter table public.platform_admins enable row level security;

drop trigger if exists trg_ai_providers_updated_at on public.ai_providers;
create trigger trg_ai_providers_updated_at before update on public.ai_providers
  for each row execute function public.set_updated_at();

-- 首位平台管理员入驻（部署后在 Supabase SQL 编辑器手动执行一次，取消注释并替换 id）：
-- insert into public.platform_admins (user_id) values ('<你的 users.id>');
