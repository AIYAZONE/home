-- AI 模型清单（v2：个人级 + 平台共享池）。
-- 两张表均仅 service role 访问：RLS 开启且不建任何用户策略，家庭成员不可直查；
-- 所有读写经服务端管理端点，按调用者 userId 做归属隔离、按 email 白名单控制共享池写权限。

-- 若曾按 v1 建过超管表，清理（v2 用 AI_SHARED_POOL_EMAILS 环境变量取代，不再有 platform_admins）。
drop table if exists public.platform_admins;

create table if not exists public.ai_providers (
  id uuid primary key default uuid_generate_v4(),
  owner_user_id uuid references public.users(id) on delete cascade,
    -- NULL = 平台共享默认（人人免填可用）；非空 = 该用户私有模型
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

-- v1→v2 升级路径：若库曾按 v1 建过 ai_providers（无 owner_user_id 列），此处补列；全新安装时上面 create 已含该列，本句 no-op。
-- 升级时存量行 owner_user_id 为 NULL → 自然归为平台共享行（v1 语义本就是平台级清单），无需数据迁移。
alter table public.ai_providers
  add column if not exists owner_user_id uuid references public.users(id) on delete cascade;

-- 归属 + 能力 + 启用 + 优先级：路由链解析与「我的/共享」列表都走它。
create index if not exists idx_ai_providers_owner_cap on public.ai_providers(owner_user_id, capability, enabled, priority asc);
create index if not exists idx_ai_providers_shared on public.ai_providers(capability, enabled, priority asc) where owner_user_id is null;
-- v1 残留清理：旧 (enabled, priority) 索引已被上面两个 v2 索引取代（终审 #7；全新库 no-op，粘 dashboard 可重跑）
drop index if exists public.idx_ai_providers_enabled_priority;

-- 每个用户每能力的默认模型选择（可指向共享行或自己私有行）。
create table if not exists public.user_model_prefs (
  user_id uuid not null references public.users(id) on delete cascade,
  capability text not null check (capability in ('text','vision')),
  provider_id uuid not null references public.ai_providers(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, capability)
);

alter table public.ai_providers enable row level security;
alter table public.user_model_prefs enable row level security;

drop trigger if exists trg_ai_providers_updated_at on public.ai_providers;
create trigger trg_ai_providers_updated_at before update on public.ai_providers
  for each row execute function public.set_updated_at();

drop trigger if exists trg_user_model_prefs_updated_at on public.user_model_prefs;
create trigger trg_user_model_prefs_updated_at before update on public.user_model_prefs
  for each row execute function public.set_updated_at();

-- v2：无 platform_admins 入驻 SQL。共享池写权限改由环境变量 AI_SHARED_POOL_EMAILS 授予（见 .env.example）。
