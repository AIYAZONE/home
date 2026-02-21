import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { Category, Transaction } from '@/types';
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toUserMessage } from '@/lib/error';
import { useToastStore } from '@/stores/toast';

interface TransactionFilterProps {
  keyword: string;
  setKeyword: (v: string) => void;
  filterType: 'all' | 'income' | 'expense';
  setFilterType: (v: 'all' | 'income' | 'expense') => void;
  filterCategory: string;
  setFilterCategory: (v: string) => void;
  filterPreset: '30d' | 'thisMonth' | 'all';
  setFilterPreset: (v: '30d' | 'thisMonth' | 'all') => void;
}

export default function TransactionFilter({
  keyword,
  setKeyword,
  filterType,
  setFilterType,
  filterCategory,
  setFilterCategory,
  filterPreset,
  setFilterPreset,
}: TransactionFilterProps) {
  const { data: profile } = useProfile();

  const { data: categories } = useQuery({
    queryKey: ['categories', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('family_id', profile.family_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Category[];
    },
    enabled: !!profile?.family_id,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>筛选</CardTitle>
        <CardDescription>按时间、类型、分类与关键词快速定位。</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium text-foreground">关键词</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="金额、分类、备注…" className="pl-9" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">时间</label>
            <select
              value={filterPreset}
              onChange={(e) => setFilterPreset(e.target.value as any)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <option value="30d">近 30 天</option>
              <option value="thisMonth">本月</option>
              <option value="all">全部</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">类型</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <option value="all">全部</option>
              <option value="expense">支出</option>
              <option value="income">收入</option>
            </select>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium text-foreground">分类包含</label>
            <Input
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              placeholder="例如：餐饮"
              list="filter-category-options"
            />
            <datalist id="filter-category-options">
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </div>

          <div className="flex items-end md:col-span-2">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                setKeyword('');
                setFilterType('all');
                setFilterCategory('');
                setFilterPreset('30d');
              }}
            >
              重置筛选
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
