import { Transaction } from '@/types';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Pencil, Trash2, TrendingDown, TrendingUp } from 'lucide-react';

interface TransactionListProps {
  transactions: Transaction[];
  isLoading: boolean;
  onEdit: (t: Transaction) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

export default function TransactionList({ transactions, isLoading, onEdit, onDelete, isDeleting }: TransactionListProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle>最近交易</CardTitle>
        <CardDescription>当前显示 {transactions.length} 条记录。</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">加载中…</div>
        ) : transactions.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">暂无交易记录</div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {transactions.map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-accent/40">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={cn(
                      'grid h-9 w-9 place-items-center rounded-xl',
                      transaction.type === 'income' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
                    )}
                  >
                    {transaction.type === 'income' ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="truncate text-sm font-medium">{transaction.category}</div>
                      {transaction.visibility === 'private' ? <Badge variant="warning">私密</Badge> : null}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{format(new Date(transaction.date), 'PPP', { locale: zhCN })}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div
                      className={cn(
                        'text-sm font-semibold',
                        transaction.type === 'income' ? 'text-emerald-600' : 'text-foreground',
                      )}
                    >
                      {transaction.type === 'income' ? '+' : '-'}¥{transaction.amount.toFixed(2)}
                    </div>
                    {transaction.description ? (
                      <div className="text-xs text-muted-foreground">{transaction.description}</div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onEdit(transaction)} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const ok = window.confirm('确认删除这条交易吗？此操作不可撤销。');
                        if (!ok) return;
                        onDelete(transaction.id);
                      }}
                      disabled={isDeleting}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
