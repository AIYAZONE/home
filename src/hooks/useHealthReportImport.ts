import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';
import { HealthReportFile } from '@/types';
import { NormalizedHealthReportItem } from '@/lib/health/reportNormalizer';

export function useHealthReportImport(subjectUserId: string | null) {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const mutation = useMutation({
    mutationFn: async (payload: { reportFile: HealthReportFile; items: NormalizedHealthReportItem[]; recordedAt?: string | null }) => {
      if (!profile?.family_id || !subjectUserId) throw new Error('缺少家庭信息');
      const recordedAt = payload.recordedAt || payload.reportFile.captured_at || new Date().toISOString().slice(0, 10);
      const items = payload.items.filter((it) => !!it.metric_code && !!it.metric_name);
      if (items.length === 0) throw new Error('没有可导入的指标项');

      const reportRows = items.map((it) => ({
        report_file_id: payload.reportFile.id,
        metric_code: it.metric_code,
        metric_name: it.metric_name,
        value_text: it.value_text,
        value_num: it.value_num,
        unit: it.unit,
        reference_low: it.reference_low,
        reference_high: it.reference_high,
        reference_text: it.reference_text,
        abnormal_flag: it.abnormal_flag,
        confidence: it.confidence,
        source_page: it.source_page,
        raw_line: it.raw_line,
      }));
      const reportInsert = await supabase.from('health_report_items').insert(reportRows);
      if (reportInsert.error) throw reportInsert.error;

      const metricRows = items
        .filter((it) => typeof it.value_num === 'number')
        .map((it) => ({
          family_id: profile.family_id,
          subject_user_id: subjectUserId,
          report_file_id: payload.reportFile.id,
          metric_code: it.metric_code,
          metric_name: it.metric_name,
          value_num: it.value_num as number,
          unit: it.unit,
          recorded_at: recordedAt,
          reference_low: it.reference_low,
          reference_high: it.reference_high,
          reference_text: it.reference_text,
          abnormal_flag: it.abnormal_flag,
          note: null,
          created_by_user_id: profile.id,
        }));
      if (metricRows.length > 0) {
        const metricInsert = await supabase.from('health_metric_records').insert(metricRows);
        if (metricInsert.error) throw metricInsert.error;
      }

      const followups = items
        .filter((it) => it.abnormal_flag === 'high' || it.abnormal_flag === 'low')
        .map((it) => ({
          family_id: profile.family_id,
          subject_user_id: subjectUserId,
          report_file_id: payload.reportFile.id,
          source_type: 'report_abnormal',
          priority: 'medium',
          status: 'todo',
          title: `${it.metric_name}${it.abnormal_flag === 'high' ? '偏高' : '偏低'}，建议复测`,
          description: it.reference_text ?? null,
          suggested_action: '建议 1-2 周内复测并记录变化，如持续异常请安排复诊。',
          due_date: null,
          created_by_user_id: profile.id,
        }));
      if (followups.length > 0) {
        const followInsert = await supabase.from('health_followups').insert(followups);
        if (followInsert.error) throw followInsert.error;
      }

      const updateFile = await supabase
        .from('health_report_files')
        .update({ parse_status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', payload.reportFile.id);
      if (updateFile.error) throw updateFile.error;

      return {
        importedItems: items.length,
        importedMetrics: metricRows.length,
        createdFollowups: followups.length,
      };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['health_report_files'] });
      queryClient.invalidateQueries({ queryKey: ['health_metric_records'] });
      queryClient.invalidateQueries({ queryKey: ['health_followups'] });
      pushToast({
        variant: 'success',
        title: '导入成功',
        message: `已导入 ${res.importedItems} 项，生成 ${res.createdFollowups} 条随访建议。`,
      });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '导入失败', message: toUserMessage(err) });
    },
  });

  return {
    importReportItemsAsync: mutation.mutateAsync,
    isImporting: mutation.isPending,
  };
}
