---
name: family-inc-os-商业化可行性诊断
overview: 为 Family Inc. OS 产出一份「项目现状 + 面向中国大陆市场的商业化可行性诊断」报告（Markdown 文档），从 PM 视角论证变现模式、识别关键可行性风险，并给出分阶段路径。起点：当前仅自己家庭在用。
todos:
  - id: verify-current-state
    content: Use [subagent:code-explorer] 核实注册模型、Supabase 区域、AI baseUrl 与用量计量现状
    status: completed
  - id: assess-readiness
    content: Use [skill:feature-spec] 评估模块完成度与多租户就绪度，产出现状与就绪度章节
    status: completed
    dependencies:
      - verify-current-state
  - id: cn-feasibility
    content: Use [skill:competitive-analysis] 论证中国大陆可行性：AI本土化、基础设施、PIPL合规、支付
    status: completed
    dependencies:
      - verify-current-state
  - id: monetization
    content: Use [skill:metrics-tracking] 与 [skill:product-brainstorming] 论证变现模式并给推荐与权衡
    status: completed
    dependencies:
      - cn-feasibility
  - id: write-report
    content: 整合输出 docs/commercialization-diagnosis.md（现状+可行性+路径+风险+结论）
    status: completed
    dependencies:
      - assess-readiness
      - cn-feasibility
      - monetization
---

## 用户需求

用户希望先把自研项目 **Family Inc. OS**（家庭经营操作系统，React+Vite+Supabase 全栈 SaaS）做一份「项目现状 + 商业化可行性」深度诊断，目前该产品仅作者自己家庭在用，尚未对外放开；本期只产出诊断报告，不改动代码、不拍板商业决策。

## 产品概述

Family Inc. OS 定位为「把家庭当无限公司经营」的综合管理平台，覆盖财务、成长、健康、关系、AI 顾问等模块，技术栈已具多租户基础（RLS + family_id 隔离）。本报告聚焦**中国大陆市场**，从 PM 视角给出证据驱动的可行性判断。

## 核心交付物

- 一份 Markdown 诊断报告，落于 `docs/commercialization-diagnosis.md`，包含：

1. 项目现状盘点（架构、模块完成度矩阵、技术健康度）
2. 多租户就绪度评估（隔离结论 + 放开多家庭还需补什么）
3. 中国大陆可行性专项（AI 本土化、基础设施/数据驻留、PIPL 合规与备案、微信/支付宝支付）
4. 变现模式论证（Freemium 订阅 / 纯付费 / 买断，给推荐与权衡但不替用户拍板）
5. GTM 与分阶段路径（自用 → 可售卖）
6. 关键风险与应对、结论与下一步建议

- 报告须诚实标注置信度（High/Medium/Low），引用已核实代码/文档事实。

## 待核实前提（写报告前必须确认）

- 注册模型：开放注册 vs 邀请制（`AuthContext.tsx`/`Login.tsx`/`Setup.tsx`）
- Supabase 区域配置与数据驻留现状
- AI 当前 baseUrl 环境变量指向（是否 OpenAI）
- 是否已有用量计量/配额机制

## Agent Extensions

### Skill

- **product-management-workflows**
- Purpose: 调用产品管理插件的一体化工作流，统御诊断报告的结构、范围与证据链，确保覆盖现状、市场、指标、风险等维度。
- Expected outcome: 生成结构严谨、符合 PM 最佳实践的诊断报告框架与内容。
- **competitive-analysis**
- Purpose: 分析国内家庭管理/记账/财富类竞品（如随手记、鲨鱼记账、钱迹、家庭账本等）与差异化定位，支撑中国大陆可行性论证。
- Expected outcome: 输出竞品对比与定位分析，明确切入机会与壁垒。
- **metrics-tracking**
- Purpose: 建立可行性评估的成功指标层级（激活率、付费转化、留存、单位经济模型），用于论证变现模式与增长路径。
- Expected outcome: 给出可量化的评估指标与北极星指标建议。
- **product-brainstorming**
- Purpose: 围绕「变现模式选择」与「从自用走向可售卖」做结构化思辨，挑战默认假设，权衡 Freemium/纯付费/买断。
- Expected outcome: 形成有证据、有取舍的变现模式推荐与理由。