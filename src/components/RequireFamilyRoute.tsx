import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useProfile } from '@/hooks/useProfile';

export default function RequireFamilyRoute() {
  const { data: profile, isLoading } = useProfile();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!profile?.family_id) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/family/setup?returnUrl=${next}`} replace />;
  }

  return <Outlet />;
}
