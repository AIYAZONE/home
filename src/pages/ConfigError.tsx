import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { supabaseConfig } from '@/lib/supabase';

export default function ConfigError() {
  const missingKeys = supabaseConfig.ok ? [] : supabaseConfig.missingKeys;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-10">
        <Page>
          <PageHeader>
            <div>
              <PageTitle>配置错误</PageTitle>
              <PageDescription>当前环境缺少 Supabase 必需的环境变量，应用已停止启动。</PageDescription>
            </div>
          </PageHeader>

          <Alert variant="danger">
            {!supabaseConfig.ok ? supabaseConfig.message : 'Supabase 配置错误'}
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>需要配置的变量</CardTitle>
              <CardDescription>在本地使用 .env，在 Vercel 需要在 Project Settings → Environment Variables 配置并重新部署。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border bg-muted px-4 py-3 text-sm">
                <pre className="whitespace-pre-wrap">
{`VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...`}
                </pre>
              </div>

              {missingKeys.length > 0 ? (
                <div className="text-sm text-muted-foreground">
                  缺失：{missingKeys.join(', ')}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => window.location.reload()}>重新加载</Button>
              </div>
            </CardContent>
          </Card>
        </Page>
      </div>
    </div>
  );
}
