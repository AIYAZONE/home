
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import Dashboard from "@/pages/dashboard/Dashboard";
import FinanceOverview from "@/pages/finance/Overview";
import GrowthOverview from "@/pages/growth/Overview";
import HealthOverview from "@/pages/health/Overview";
import RelationshipsOverview from "@/pages/relationships/Overview";
import AdvisorOverview from "@/pages/advisor/Overview";
import SettingsOverview from "@/pages/settings/Overview";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="finance" element={<FinanceOverview />} />
          <Route path="growth" element={<GrowthOverview />} />
          <Route path="health" element={<HealthOverview />} />
          <Route path="relationships" element={<RelationshipsOverview />} />
          <Route path="advisor" element={<AdvisorOverview />} />
          <Route path="settings" element={<SettingsOverview />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}
