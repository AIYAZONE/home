import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Lock, Mail, Loader2, AlertCircle, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { memberAccountToEmail, normalizeMemberAccount, validateMemberAccount } from '@/lib/member';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { toUserMessage } from '@/lib/error';
import { useToastStore } from '@/stores/toast';

type FormData = { email: string; password: string };

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [mode, setMode] = useState<'email' | 'account'>('email');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const navigate = useNavigate();
  const pushToast = useToastStore((s) => s.push);

  const isAccountMode = mode === 'account' && !isSignUp;

  // 账号模式：家长手动创建的短账号（如 son），提交时映射为占位邮箱后走同一套密码登录
  const accountPattern = /^[a-z0-9][a-z0-9_-]{1,19}$/;
  const schema = isAccountMode
    ? z.object({
        email: z.string().regex(accountPattern, '账号需为 2-20 位小写字母、数字、- 或 _'),
        password: z.string().min(6, '密码至少需要6位'),
      })
    : z.object({
        email: z.string().email('请输入有效的邮箱地址'),
        password: z.string().min(6, '密码至少需要6位'),
      });

  const { register, handleSubmit, clearErrors, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    setError(null);
    setNotice(null);

    let email = data.email;
    if (isAccountMode) {
      const account = normalizeMemberAccount(data.email);
      const accountError = validateMemberAccount(account);
      if (accountError) {
        setError(accountError);
        setIsLoading(false);
        return;
      }
      email = memberAccountToEmail(account);
    }

    try {
      if (isSignUp) {
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password: data.password,
          options: {
            data: {
              name: data.email.split('@')[0], // Default name
            },
          },
        });
        if (error) throw error;

        if (signUpData?.session && returnUrl) {
          pushToast({ variant: 'success', title: '注册成功', message: '正在继续加入流程…' });
          navigate(returnUrl);
          return;
        }

        setIsSignUp(false);
        setNotice('注册成功，请登录后继续。');
        pushToast({ variant: 'success', title: '注册成功', message: '请登录后继续。' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
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
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary">
                <img src="/brand-mark.svg" alt="Family Inc. OS" className="h-7 w-7" />
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
                {!isSignUp && (
                  <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1" role="tablist" aria-label="登录方式">
                    {([['email', '邮箱登录'], ['account', '账号登录']] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={mode === value}
                        onClick={() => {
                          setMode(value);
                          setError(null);
                          clearErrors('email');
                        }}
                        className={cn(
                          'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                          mode === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">{isAccountMode ? '登录账号' : '邮箱'}</label>
                  <div className="relative">
                    {isAccountMode ? (
                      <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    ) : (
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    )}
                    <Input
                      {...register('email')}
                      type={isAccountMode ? 'text' : 'email'}
                      placeholder={isAccountMode ? '例如：son' : 'your@email.com'}
                      className="pl-9"
                      autoComplete={isAccountMode ? 'username' : 'email'}
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
