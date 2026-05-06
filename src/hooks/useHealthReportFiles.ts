import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { HealthReportFile } from '@/types';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';

export function useHealthReportFiles(subjectUserId: string | null) {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const query = useQuery({
    queryKey: ['health_report_files', profile?.family_id, subjectUserId],
    queryFn: async () => {
      if (!profile?.family_id || !subjectUserId) return [];
      const { data, error } = await supabase
        .from('health_report_files')
        .select('*')
        .eq('family_id', profile.family_id)
        .eq('subject_user_id', subjectUserId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as HealthReportFile[];
    },
    enabled: !!profile?.family_id && !!subjectUserId,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: {
      file: File;
      reportType: HealthReportFile['report_type'];
      sourceType: HealthReportFile['source_type'];
      capturedAt?: string | null;
    }) => {
      if (!profile?.family_id || !subjectUserId) throw new Error('缺少家庭信息');
      const ext = payload.file.name.split('.').pop()?.toLowerCase() || 'bin';
      const objectPath = `${profile.family_id}/${subjectUserId}/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;

      const upload = await supabase.storage
        .from('health-reports')
        .upload(objectPath, payload.file, { cacheControl: '3600', upsert: false, contentType: payload.file.type || 'application/octet-stream' });
      if (upload.error) throw upload.error;

      const { data, error } = await supabase
        .from('health_report_files')
        .insert({
          family_id: profile.family_id,
          subject_user_id: subjectUserId,
          created_by_user_id: profile.id,
          report_type: payload.reportType,
          source_type: payload.sourceType,
          file_path: objectPath,
          file_name: payload.file.name,
          mime_type: payload.file.type || 'application/octet-stream',
          file_size: payload.file.size,
          checksum: null,
          captured_at: payload.capturedAt || null,
          parse_status: 'pending',
        })
        .select()
        .single();
      if (error) throw error;
      return data as HealthReportFile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health_report_files'] });
      pushToast({ variant: 'success', title: '上传成功', message: '报告文件已保存。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '上传失败', message: toUserMessage(err) });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (payload: { id: string; parse_status: HealthReportFile['parse_status']; parse_error?: string | null; confidence_summary?: Record<string, unknown> }) => {
      const { error } = await supabase
        .from('health_report_files')
        .update({
          parse_status: payload.parse_status,
          parse_error: payload.parse_error ?? null,
          confidence_summary: payload.confidence_summary ?? {},
          updated_at: new Date().toISOString(),
        })
        .eq('id', payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health_report_files'] });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '状态更新失败', message: toUserMessage(err) });
    },
  });

  const renameMutation = useMutation({
    mutationFn: async (payload: { id: string; file_name: string }) => {
      const { error } = await supabase
        .from('health_report_files')
        .update({ file_name: payload.file_name, updated_at: new Date().toISOString() })
        .eq('id', payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health_report_files'] });
      pushToast({ variant: 'success', title: '已重命名', message: '文件名已更新。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '重命名失败', message: toUserMessage(err) });
    },
  });

  const getPreviewUrlMutation = useMutation({
    mutationFn: async (payload: { filePath: string; expiresIn?: number }) => {
      const { data, error } = await supabase.storage
        .from('health-reports')
        .createSignedUrl(payload.filePath, payload.expiresIn ?? 300);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (payload: { id: string; filePath: string }) => {
      const { data, error } = await supabase
        .from('health_report_files')
        .delete()
        .eq('id', payload.id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data?.id) {
        throw new Error('删除未生效：可能缺少权限或记录不存在。');
      }

      const remove = await supabase.storage.from('health-reports').remove([payload.filePath]);
      if (remove.error) throw remove.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health_report_files'] });
      pushToast({ variant: 'success', title: '已删除', message: '报告文件已删除。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '删除失败', message: toUserMessage(err) });
    },
  });

  return {
    files: query.data,
    isLoading: query.isLoading,
    error: query.error,
    createReportFileAsync: createMutation.mutateAsync,
    updateReportStatusAsync: updateStatusMutation.mutateAsync,
    renameReportFileAsync: renameMutation.mutateAsync,
    getPreviewUrlAsync: getPreviewUrlMutation.mutateAsync,
    deleteReportFileAsync: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdatingStatus: updateStatusMutation.isPending,
    isRenaming: renameMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
