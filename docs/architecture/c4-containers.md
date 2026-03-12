# 当前架构（Containers）

## Container Diagram（C4-like）

```mermaid
flowchart TB
  user[用户]

  subgraph client[客户端]
    spa[SPA 前端<br/>React 18 + TS + React Router + Tailwind]
    rq[数据缓存层<br/>TanStack Query]
    zustand[本地状态<br/>Zustand]
    pwa[PWA<br/>SW + Cache]
    spa --> rq
    spa --> zustand
    spa --> pwa
  end

  subgraph edge[Vercel]
    cdn[静态托管/CDN]
    fn[Serverless Functions<br/>api/*]
  end

  subgraph sb[Supabase]
    sbjs[Supabase JS Client<br/>@supabase/supabase-js]
    auth[Auth]
    postgrest[PostgREST / RPC]
    db[(Postgres<br/>RLS/Functions)]
    sbjs --> auth
    sbjs --> postgrest
    postgrest --> db
  end

  user -->|使用| spa
  spa -->|加载静态资源| cdn
  spa -->|数据访问| sbjs
  spa -->|账号注销| fn
  fn -->|Anon key 校验 bearer token| auth
  fn -->|RPC: delete_my_account| postgrest
  fn -->|Service Role 删除 Auth 用户| auth
```

## 运行时边界与职责
- SPA：路由/页面渲染、表单与交互、调用 Supabase（from/rpc/auth）、本地缓存与状态
- Supabase：认证会话、数据存储、行级授权（RLS policies）、复杂写入/清理（RPC/trigger）
- Vercel Functions：少量“需要 service role”的后端动作；其余业务尽量由 Supabase RLS/RPC 承担

## 环境变量边界
- 客户端（Vite）：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`
- Serverless（Vercel）：`SUPABASE_SERVICE_ROLE_KEY`（以及 URL/ANON_KEY 的 server-side 读法）

