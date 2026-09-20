import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from '@/components/ErrorBoundary';
import ProtectedRoute from '@/components/ProtectedRoute';
import RequireFamilyRoute from '@/components/RequireFamilyRoute';
import { AuthProvider } from '@/contexts/AuthContext';
import MainLayout from '@/layouts/MainLayout';
import FinanceLayout from '@/layouts/FinanceLayout';
import JoinFamily from '@/pages/JoinFamily';
import Login from '@/pages/Login';
import ConfigError from '@/pages/ConfigError';
import Dashboard from '@/pages/dashboard/Dashboard';
import AdvisorOverview from '@/pages/advisor/Overview';
import FamilySetup from '@/pages/family/Setup';
import FinanceOverview from '@/pages/finance/Overview';
import FinanceAssets from '@/pages/finance/Assets';
import FinanceTransactions from '@/pages/finance/Transactions';
import FinanceBudgets from '@/pages/finance/Budgets';
import FinanceCategories from '@/pages/finance/Categories';
import FinanceRecurring from '@/pages/finance/Recurring';
import FinanceFunds from '@/pages/finance/Funds';
import GrowthOverview from '@/pages/growth/Overview';
import GrowthGoals from '@/pages/growth/Goals';
import HealthOverview from '@/pages/health/Overview';
import MealsToday from '@/pages/meals/Today';
import RelationshipsOverview from '@/pages/relationships/Overview';
import SettingsOverview from '@/pages/settings/Overview';
import SettingsMembers from '@/pages/settings/Members';
import SettingsTaste from '@/pages/settings/Taste';
import SettingsAccount from '@/pages/settings/Account';
import SettingsInvitations from '@/pages/settings/Invitations';
import SettingsData from '@/pages/settings/Data';
import SettingsTrustCenter from '@/pages/settings/TrustCenter';
import SettingsAiProviders from '@/pages/settings/AiProviders';
import { supabaseConfig } from '@/lib/supabase';
import { ToastHost } from '@/components/ui/toast';
import PwaNetworkToasts from '@/components/PwaNetworkToasts';
import PwaStatusBanner from '@/components/PwaStatusBanner';

const queryClient = new QueryClient();

export default function App() {
  if (!supabaseConfig.ok && import.meta.env.PROD) return <ConfigError />;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Router>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/join" element={<JoinFamily />} />

              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<MainLayout />}>
                  <Route path="family/setup" element={<FamilySetup />} />

                  <Route element={<RequireFamilyRoute />}>
                    <Route index element={<Navigate to="/advisor" replace />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="finance" element={<FinanceLayout />}>
                      <Route index element={<FinanceOverview />} />
                      <Route path="assets" element={<FinanceAssets />} />
                      <Route path="transactions" element={<FinanceTransactions />} />
                      <Route path="budgets" element={<FinanceBudgets />} />
                      <Route path="categories" element={<FinanceCategories />} />
                      <Route path="recurring" element={<FinanceRecurring />} />
                      <Route path="funds" element={<FinanceFunds />} />
                    </Route>
                    <Route path="growth" element={<GrowthOverview />} />
                    <Route path="growth/goals" element={<GrowthGoals />} />
                    <Route path="health" element={<HealthOverview />} />
                    <Route path="meals" element={<MealsToday />} />
                    <Route path="relationships" element={<RelationshipsOverview />} />
                    <Route path="advisor" element={<AdvisorOverview />} />
                    <Route path="settings" element={<SettingsOverview />} />
                    <Route path="settings/members" element={<SettingsMembers />} />
                    <Route path="settings/taste" element={<SettingsTaste />} />
                    <Route path="settings/invitations" element={<SettingsInvitations />} />
                    <Route path="settings/data" element={<SettingsData />} />
                    <Route path="settings/account" element={<SettingsAccount />} />
                    <Route path="settings/trust" element={<SettingsTrustCenter />} />
                    <Route path="settings/ai-providers" element={<SettingsAiProviders />} />
                  </Route>
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Router>
          <PwaNetworkToasts />
          <ToastHost />
          <PwaStatusBanner />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
