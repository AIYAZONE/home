create policy "Users can delete health report files"
  on public.health_report_files for delete
  using (
    public.has_family_role(family_id, array['admin','parent']::text[])
    or subject_user_id = auth.uid()
  );
