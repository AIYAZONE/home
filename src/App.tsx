import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from '@/components/ErrorBoundary';
import ProtectedRoute from '@/components/ProtectedRoute';
import RequireFamilyRoute from '@/components/RequireFamilyRoute';
import { AuthProvider } from '@/contexts/AuthContext';
import MainLayout from '@/layouts/MainLayout';
import JoinFamily from '@/pages/JoinFamily';
import Login from '@/pages/Login';
import ConfigError from '@/pages/ConfigError';
import Dashboard from '@/pages/dashboard/Dashboard';
import AdvisorOverview from '@/pages/advisor/Overview';
import FamilySetup from '@/pages/family/Setup';
import FinanceOverview from '@/pages/finance/Overview';
import GrowthOverview from '@/pages/growth/Overview';
import HealthOverview from '@/pages/health/Overview';
import RelationshipsOverview from '@/pages/relationships/Overview';
import SettingsOverview from '@/pages/settings/Overview';
import { supabaseConfig } from '@/lib/supabase';
import { ToastHost } from '@/components/ui/toast';

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
                    <Route index element={<Navigate to="/dashboard" replace />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="finance" element={<FinanceOverview />} />
                    <Route path="growth" element={<GrowthOverview />} />
                    <Route path="health" element={<HealthOverview />} />
                    <Route path="relationships" element={<RelationshipsOverview />} />
                    <Route path="advisor" element={<AdvisorOverview />} />
                    <Route path="settings" element={<SettingsOverview />} />
                  </Route>
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Router>
          <ToastHost />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
