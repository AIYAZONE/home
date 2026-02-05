import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-background p-6">
        <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="text-lg font-semibold text-foreground">页面出错了</div>
            <div className="mt-2 text-sm text-muted-foreground">发生了意外错误，请刷新页面重试。</div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  window.location.reload();
                }}
              >
                刷新页面
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  window.location.assign('/');
                }}
              >
                返回首页
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
