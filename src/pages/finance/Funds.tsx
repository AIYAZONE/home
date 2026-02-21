import FundManager from '@/components/FundManager';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';

export default function FinanceFunds() {
  return (
    <Page>
      <PageHeader>
        <PageTitle>3层基金</PageTitle>
        <PageDescription>安全垫 → 目标基金 → 梦想基金，按优先级积累家庭财富。</PageDescription>
      </PageHeader>
      <FundManager />
    </Page>
  );
}
