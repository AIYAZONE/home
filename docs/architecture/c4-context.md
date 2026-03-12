# 当前架构（Context）

## 范围
- 以仓库当前实现为准：Vite + React SPA 直连 Supabase（PostgREST/RPC + RLS），少量 Vercel Serverless API

## System Context（C4-like）

```mermaid
flowchart TB
  user[用户]

  subgraph device[用户设备]
    browser[浏览器 / PWA 容器]
    spa[Family OS 前端应用<br/>Vite + React + TS + React Router]
    sw[Service Worker<br/>Workbox / vite-plugin-pwa]
    browser --> spa
    browser --> sw
  end

  subgraph vercel[Vercel]
    hosting[静态资源托管<br/>index.html + assets]
    api[Serverless Functions<br/>/api/*]
  end

  subgraph supabase[Supabase]
    auth[Auth]
    postgrest[PostgREST / RPC]
    db[(Postgres<br/>RLS + Functions + Triggers)]
    auth --> postgrest
    postgrest --> db
  end

  user -->|使用| browser
  spa -->|加载/更新| hosting
  spa -->|登录/注册/会话| auth
  spa -->|读写业务数据| postgrest
  spa -->|账号注销| api
  api -->|校验 Token| auth
  api -->|调用 RPC: delete_my_account| postgrest
  api -->|Service Role 删除 Auth 用户| auth
```

## 关键约束（决定了架构形态）
- 前端直连数据库能力由 Supabase RLS 决定：鉴权在客户端，授权在数据库（policy/function）
- Serverless API 仅承担“必须使用 service role 的动作”（例如删除 Auth 用户）

