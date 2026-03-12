# 当前架构（Core Components）

## 目标
- 帮助开发者快速定位：路由守卫/鉴权、Profile 加载、数据访问 Hook、以及 DB 侧的 RLS/RPC

## Component Diagram（C4-like）

```mermaid
flowchart TB
  subgraph ui[UI 层（React Router Pages）]
    login[Login 页面]
    join[JoinFamily 页面]
    main[MainLayout + 子路由（dashboard/finance/...）]
    settingsAccount[Settings/Account 页面]
  end

  subgraph routing[路由与守卫]
    app[App.tsx（路由定义）]
    protected[ProtectedRoute（是否登录）]
    requireFamily[RequireFamilyRoute（是否已加入家庭）]
  end

  subgraph auth[鉴权状态]
    authProvider[AuthProvider（订阅 session/user）]
    supaAuth[supabase.auth（getSession/onAuthStateChange）]
  end

  subgraph data[数据访问（React Query Hooks）]
    useProfile[useProfile（users by user.id）]
    useFinanceHooks[finance hooks（transactions/budgets/...）]
    supaClient[supabase client（from/rpc）]
  end

  subgraph backend[Vercel Serverless]
    deleteApi[/api/account/delete]
  end

  subgraph db[Supabase DB（RLS/RPC）]
    rls[RLS Policies（family/member/visibility）]
    rpcInvite[RPC：get_invitation_info / accept_invitation]
    rpcDelete[RPC：delete_my_account]
    tables[(核心表：users / families / transactions / invitations / ...)]
  end

  app --> protected --> main
  main --> requireFamily
  app --> login
  app --> join
  app --> settingsAccount

  authProvider --> supaAuth
  protected --> authProvider
  login --> supaAuth

  requireFamily --> useProfile
  useProfile --> supaClient --> tables
  useFinanceHooks --> supaClient
  join --> supaClient --> rpcInvite
  settingsAccount --> deleteApi --> rpcDelete

  rls --> tables
  rpcInvite --> tables
  rpcDelete --> tables
```

## 关键约束（决定组件怎么切）
- 业务读写主要走 `supabase.from(...)/rpc(...)`：所以 Hook 层是“轻服务层”，核心边界在 DB 的 RLS/RPC
- 前端路由守卫分两级：
  - 是否登录（Auth）
  - 是否已加入家庭（Profile.family_id）

