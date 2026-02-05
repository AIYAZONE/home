import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Lock, Mail, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { toUserMessage } from '@/lib/error';
import { useToastStore } from '@/stores/toast';

const schema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  password: z.string().min(6, '密码至少需要6位'),
});

type FormData = z.infer<typeof schema>;

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const navigate = useNavigate();
  const pushToast = useToastStore((s) => s.push);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    setError(null);
    setNotice(null);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email: data.email,
          password: data.password,
          options: {
            data: {
              name: data.email.split('@')[0], // Default name
            },
          },
        });
        if (error) throw error;
        
        // If returnUrl exists (e.g. from join page), navigate there directly if session established
        // Note: For email confirmation enabled projects, this might need handling.
        // For this demo, we assume auto-confirm or direct login.
        if (returnUrl) {
           // We need to wait for session to be established? 
           // Usually signUp returns session if auto-confirm is on.
           // Let's just alert and let them login or check email.
        }
        
        setIsSignUp(false);
        setNotice('注册成功，请登录后继续。');
        pushToast({ variant: 'success', title: '注册成功', message: '请登录后继续。' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });
        if (error) throw error;
        navigate(returnUrl || '/dashboard');
      }
    } catch (err: any) {
      setError(toUserMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="relative mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 py-10">
        <div className="absolute inset-0 -z-10">
          <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
        </div>

        <div className="w-full max-w-md">
          <Card className="bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary font-semibold">
                FI
              </div>
              <CardTitle className="text-xl sm:text-2xl">Family Inc. OS</CardTitle>
              <CardDescription>像经营公司一样经营家庭</CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              {notice && <Alert variant="success">{notice}</Alert>}

              {error && (
                <Alert variant="danger" className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4" />
                  <span className="min-w-0 flex-1">{error}</span>
                </Alert>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">邮箱</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      {...register('email')}
                      type="email"
                      placeholder="your@email.com"
                      className="pl-9"
                      autoComplete="email"
                    />
                  </div>
                  {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">密码</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      {...register('password')}
                      type="password"
                      placeholder="••••••••"
                      className="pl-9"
                      autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    />
                  </div>
                  {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
                </div>

                <Button type="submit" disabled={isLoading} className="w-full">
                  {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isSignUp ? '注册账号' : '登录'}
                </Button>
              </form>

              <div className="text-center text-sm text-muted-foreground">
                <button
                  onClick={() => {
                    setError(null);
                    setNotice(null);
                    setIsSignUp((v) => !v);
                  }}
                  className="font-medium text-primary hover:underline"
                >
                  {isSignUp ? '已有账号？去登录' : '没有账号？去注册'}
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
