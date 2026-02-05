# Family Inc. OS - 实施指南

## 1. 开发环境设置

### 1.1 前置要求

**系统要求**:
- Node.js 18.x 或更高版本
- npm 9.x 或 yarn 1.22+
- Git 2.x+
- VS Code (推荐) 或其他代码编辑器

**开发工具**:
- Docker Desktop (可选，用于本地数据库)
- TablePlus 或 pgAdmin (数据库管理)
- Postman 或 Insomnia (API测试)
- Chrome DevTools (前端调试)

### 1.2 项目初始化

```bash
# 克隆项目仓库
git clone https://github.com/your-org/family-inc-os.git
cd family-inc-os

# 安装依赖
npm install
# 或
yarn install

# 安装开发依赖
npm install -D @types/node @types/react

# 设置环境变量
cp .env.example .env.local

# 启动开发服务器
npm run dev
```

### 1.3 环境变量配置

```bash
# 数据库配置
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI服务配置
OPENAI_API_KEY=your_openai_api_key
VERCEL_AI_SDK_KEY=your_vercel_ai_key

# 外部API配置
BANK_API_KEY=your_bank_api_key
INSURANCE_API_KEY=your_insurance_api_key

# 应用配置
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME="Family Inc. OS"
JWT_SECRET=your_jwt_secret
```

## 2. 开发流程规范

### 2.1 Git工作流

**分支策略**:
```
main (生产环境)
├── develop (开发环境)
├── feature/finance-module (功能分支)
├── feature/ai-advisor (功能分支)
└── hotfix/security-patch (热修复分支)
```

**提交规范**:
```
feat: 添加新功能
fix: 修复bug
docs: 文档更新
style: 代码格式调整
refactor: 代码重构
test: 测试相关
chore: 构建过程或辅助工具的变动
```

**示例提交**:
```bash
git commit -m "feat: 添加智能记账功能，支持AI自动分类"
git commit -m "fix: 修复预算计算中的精度问题"
git commit -m "docs: 更新API文档，添加新的端点说明"
```

### 2.2 代码规范

**TypeScript规范**:
```typescript
// ✅ 推荐：使用接口定义数据结构
interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'parent' | 'child'
}

// ✅ 推荐：使用类型推断
const users: User[] = await getUsers()

// ❌ 避免：使用any类型
const data: any = await fetchData()

// ✅ 推荐：使用枚举定义常量
enum TransactionType {
  INCOME = 'income',
  EXPENSE = 'expense',
  TRANSFER = 'transfer'
}
```

**React组件规范**:
```typescript
// ✅ 推荐：使用函数组件和Hooks
export function DashboardCard({ title, value, trend }: DashboardCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  return (
    <Card className="p-6">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {trend && <TrendIndicator trend={trend} />}
      </CardContent>
    </Card>
  )
}

// ✅ 推荐：使用自定义Hooks封装逻辑
export function useFinancialData(familyId: string) {
  const { data, error, isLoading } = useQuery({
    queryKey: ['finance', familyId],
    queryFn: () => fetchFinancialData(familyId)
  })
  
  return { data, error, isLoading }
}
```

**API设计规范**:
```typescript
// ✅ 推荐：统一的响应格式
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: any
  }
  metadata?: {
    timestamp: string
    version: string
  }
}

// ✅ 推荐：使用Zod进行数据验证
const createTransactionSchema = z.object({
  amount: z.number().positive(),
  category: z.string().min(1),
  description: z.string().optional(),
  date: z.string().datetime(),
  type: z.enum(['income', 'expense', 'transfer'])
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const data = createTransactionSchema.parse(body)
    
    const transaction = await createTransaction(data)
    
    return NextResponse.json({
      success: true,
      data: transaction
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '数据验证失败',
          details: error.errors
        }
      }, { status: 400 })
    }
    
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误'
      }
    }, { status: 500 })
  }
}
```

### 2.3 测试策略

**单元测试示例**:
```typescript
// utils/currency.test.ts
import { formatCurrency, calculateTotal } from './currency'

describe('Currency Utils', () => {
  describe('formatCurrency', () => {
    it('应该正确格式化人民币', () => {
      expect(formatCurrency(1234.56, 'CNY')).toBe('¥1,234.56')
    })
    
    it('应该正确格式化美元', () => {
      expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56')
    })
  })
  
  describe('calculateTotal', () => {
    it('应该正确计算交易总额', () => {
      const transactions = [
        { amount: 100, type: 'income' },
        { amount: 50, type: 'expense' },
        { amount: 200, type: 'income' }
      ]
      
      expect(calculateTotal(transactions)).toBe(250)
    })
  })
})
```

**集成测试示例**:
```typescript
// api/transactions.test.ts
import { POST } from './route'
import { createTestRequest } from '@/test-utils'

describe('Transaction API', () => {
  it('应该创建新的交易记录', async () => {
    const request = createTestRequest({
      method: 'POST',
      body: {
        amount: 100,
        category: '工资',
        type: 'income',
        date: '2024-01-01'
      }
    })
    
    const response = await POST(request)
    const data = await response.json()
    
    expect(response.status).toBe(201)
    expect(data.success).toBe(true)
    expect(data.data.amount).toBe(100)
  })
  
  it('应该验证必填字段', async () => {
    const request = createTestRequest({
      method: 'POST',
      body: {
        amount: -100,
        type: 'invalid'
      }
    })
    
    const response = await POST(request)
    const data = await response.json()
    
    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.error.code).toBe('VALIDATION_ERROR')
  })
})
```

**端到端测试示例**:
```typescript
// e2e/finance.spec.ts
import { test, expect } from '@playwright/test'

test.describe('财务管理功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[name="email"]', 'test@example.com')
    await page.fill('input[name="password"]', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/dashboard')
  })
  
  test('应该能够添加新的交易记录', async ({ page }) => {
    await page.click('nav a[href="/finance"]')
    await page.click('button:has-text("添加交易")')
    
    await page.fill('input[name="amount"]', '1000')
    await page.selectOption('select[name="category"]', '工资')
    await page.fill('input[name="description"]', '月度工资')
    await page.fill('input[name="date"]', '2024-01-01')
    
    await page.click('button:has-text("保存")')
    
    await expect(page.locator('text=交易已创建')).toBeVisible()
    await expect(page.locator('text=¥1,000.00')).toBeVisible()
  })
  
  test('应该正确计算余额', async ({ page }) => {
    await page.click('nav a[href="/finance"]')
    
    const balanceText = await page.textContent('[data-testid="total-balance"]')
    const balance = parseFloat(balanceText.replace(/[^0-9.-]+/g, ''))
    
    expect(balance).toBeGreaterThan(0)
  })
})
```

## 3. 部署指南

### 3.1 环境配置

**开发环境**:
```bash
# 本地开发环境
npm run dev
# 访问 http://localhost:3000
```

**测试环境**:
```bash
# 构建测试版本
npm run build:test
npm run start:test
```

**生产环境**:
```bash
# 构建生产版本
npm run build
npm run start
```

### 3.2 Vercel部署

**自动部署配置**:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "regions": ["hkg1", "sin1"],
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 30
    }
  }
}
```

**部署步骤**:
```bash
# 1. 连接GitHub仓库到Vercel
# 2. 配置环境变量
# 3. 设置自定义域名
# 4. 启用自动部署
# 5. 配置性能监控
```

### 3.3 Supabase配置

**数据库迁移**:
```bash
# 安装Supabase CLI
npm install -g supabase

# 初始化项目
supabase init

# 创建迁移文件
supabase migration new create_tables

# 应用迁移
supabase db push

# 生成类型定义
supabase gen types typescript --local > types/supabase.ts
```

**RLS策略配置**:
```sql
-- 启用RLS
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- 创建策略
CREATE POLICY "Users can view family members" ON users
    FOR SELECT USING (
        family_id = auth.jwt() ->> 'family_id'
    );

CREATE POLICY "Users can manage family transactions" ON transactions
    FOR ALL USING (
        family_id = auth.jwt() ->> 'family_id'
    );
```

### 3.4 监控和日志

**性能监控**:
```typescript
// lib/monitoring.ts
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'

export function MonitoringProvider() {
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  )
}
```

**错误监控**:
```typescript
// lib/sentry.ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
  ],
})
```

**日志记录**:
```typescript
// lib/logger.ts
import pino from 'pino'

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
})

export default logger

// 使用示例
logger.info('用户登录成功', { userId, email })
logger.error('数据库连接失败', { error: error.message })
logger.warn('API限流警告', { endpoint, count })
```

## 4. 性能优化

### 4.1 数据库优化

**索引优化**:
```sql
-- 复合索引优化
CREATE INDEX idx_transactions_family_date ON transactions(family_id, transaction_date DESC);
CREATE INDEX idx_transactions_category_amount ON transactions(category, amount) WHERE amount > 1000;

-- 部分索引优化
CREATE INDEX idx_users_active_adults ON users(family_id) WHERE role IN ('admin', 'parent') AND is_active = true;

-- 表达式索引
CREATE INDEX idx_transactions_amount_abs ON transactions(ABS(amount));
```

**查询优化**:
```typescript
// 使用Prisma优化查询
const transactions = await prisma.transaction.findMany({
  where: {
    familyId,
    transactionDate: {
      gte: startDate,
      lte: endDate
    }
  },
  include: {
    account: true,
    category: true
  },
  orderBy: {
    transactionDate: 'desc'
  },
  take: 50
})

// 使用原始SQL优化复杂查询
const result = await prisma.$queryRaw`
  SELECT 
    category,
    SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
    SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense,
    COUNT(*) as count
  FROM transactions
  WHERE family_id = ${familyId}
    AND transaction_date >= ${startDate}
  GROUP BY category
  ORDER BY expense DESC
  LIMIT 10
`
```

### 4.2 前端性能优化

**代码分割**:
```typescript
// 动态导入组件
const ChartComponent = dynamic(() => import('@/components/ChartComponent'), {
  loading: () => <Skeleton className="h-[400px]" />,
  ssr: false
})

// 按需加载库
const loadHeavyLibrary = async () => {
  const { default: HeavyLibrary } = await import('heavy-library')
  return HeavyLibrary
}
```

**图片优化**:
```typescript
// 使用Next.js Image组件
import Image from 'next/image'

<Image
  src="/assets/family-illustration.png"
  alt="家庭插图"
  width={600}
  height={400}
  placeholder="blur"
  blurDataURL={blurDataURL}
  loading="lazy"
/>

// 使用响应式图片
<picture>
  <source media="(min-width: 768px)" srcSet="hero-desktop.webp" />
  <source media="(min-width: 480px)" srcSet="hero-tablet.webp" />
  <img src="hero-mobile.webp" alt="Hero" loading="lazy" />
</picture>
```

**缓存策略**:
```typescript
// TanStack Query缓存配置
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5分钟
      cacheTime: 10 * 60 * 1000, // 10分钟
      refetchOnWindowFocus: false,
      retry: 3,
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000)
    }
  }
})

// 服务端缓存
export async function GET(request: Request) {
  const cacheKey = `finance:summary:${familyId}:${date}`
  
  // 尝试从缓存获取
  const cached = await redis.get(cacheKey)
  if (cached) {
    return NextResponse.json(cached)
  }
  
  // 计算数据
  const data = await calculateFinanceSummary(familyId, date)
  
  // 缓存结果
  await redis.setex(cacheKey, 300, JSON.stringify(data)) // 5分钟缓存
  
  return NextResponse.json(data)
}
```

## 5. 安全最佳实践

### 5.1 输入验证

```typescript
// 使用Zod进行严格验证
const userInputSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(2).max(100).regex(/^[a-zA-Z\s]+$/),
  amount: z.number().positive().max(1000000),
  date: z.string().datetime()
})

// SQL注入防护
export async function searchTransactions(searchTerm: string) {
  // ✅ 使用参数化查询
  const results = await prisma.$queryRaw`
    SELECT * FROM transactions 
    WHERE description ILIKE ${`%${searchTerm}%`}
    AND family_id = ${familyId}
  `
  
  return results
}
```

### 5.2 认证和授权

```typescript
// JWT Token验证
import { jwtVerify } from 'jose'

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(
      token, 
      new TextEncoder().encode(process.env.JWT_SECRET)
    )
    
    return payload
  } catch (error) {
    throw new Error('Invalid token')
  }
}

// 权限检查中间件
export function requireRole(allowedRoles: string[]) {
  return async function middleware(request: Request) {
    const token = request.headers.get('Authorization')?.split(' ')[1]
    
    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 })
    }
    
    const payload = await verifyToken(token)
    
    if (!allowedRoles.includes(payload.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    
    // 添加用户信息到请求头
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('X-User-Id', payload.userId)
    requestHeaders.set('X-Family-Id', payload.familyId)
    
    return NextResponse.next({
      request: {
        headers: requestHeaders
      }
    })
  }
}
```

### 5.3 数据加密

```typescript
// 敏感数据加密
import crypto from 'crypto'

const algorithm = 'aes-256-gcm'
const key = crypto.scryptSync(process.env.ENCRYPTION_KEY!, 'salt', 32)

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(algorithm, key, iv)
  
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  
  const authTag = cipher.getAuthTag()
  
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted
}

export function decrypt(encryptedData: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  
  const decipher = crypto.createDecipheriv(algorithm, key, iv)
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  
  return decrypted
}
```

## 6. 故障排除

### 6.1 常见问题

**数据库连接问题**:
```bash
# 检查数据库状态
supabase status

# 重置数据库
supabase db reset

# 查看连接池
supabase pool
```

**构建失败问题**:
```bash
# 清理缓存
npm run clean
rm -rf .next node_modules
npm install

# 检查TypeScript错误
npm run type-check

# 检查Lint错误
npm run lint
```

**性能问题**:
```bash
# 分析构建包大小
npm run analyze

# 检查性能指标
npm run lighthouse

# 内存使用分析
node --inspect node_modules/.bin/next dev
```

### 6.2 调试技巧

**前端调试**:
```typescript
// 使用React DevTools
// 安装浏览器扩展

// 使用Redux DevTools
import { composeWithDevTools } from 'redux-devtools-extension'

// 调试Hooks
const useDebugValue = (value: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('Debug Value:', value)
  }
}
```

**后端调试**:
```typescript
// 使用VS Code调试器
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js: debug server-side",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/next",
      "args": ["dev"],
      "console": "integratedTerminal"
    }
  ]
}

// 日志调试
logger.debug('Debug info', { 
  userId, 
  requestId, 
  timestamp: new Date().toISOString() 
})
```

这个实施指南为Family Inc. OS项目提供了完整的开发、部署和运维指导，涵盖了从环境搭建到生产部署的全流程，确保项目能够高效、安全地开发和运行。