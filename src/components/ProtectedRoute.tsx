import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { onAuthStateChange, getUserProfile } from '@/lib/firebase-auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: string[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const [state, setState] = useState<'loading' | 'authorized' | 'redirect'>('loading');
  const [redirectTo, setRedirectTo] = useState('/login');

  useEffect(() => {
    const unsub = onAuthStateChange(async (user) => {
      unsub(); // unsubscribe immediately — we only need first emission
      if (!user) { setRedirectTo('/login'); setState('redirect'); return; }
      try {
        const profile = await getUserProfile(user.uid);
        if (!profile) { setRedirectTo('/login'); setState('redirect'); return; }
        if (allowedRoles.includes(profile.role)) {
          setState('authorized');
        } else {
          // Redirect to correct dashboard
          const routes: Record<string, string> = {
            elderly:'/elderly', caregiver:'/caregiver', doctor:'/doctor', admin:'/admin'
          };
          setRedirectTo(routes[profile.role] || '/login');
          setState('redirect');
        }
      } catch {
        setRedirectTo('/login');
        setState('redirect');
      }
    });
    return () => unsub();
  }, []);

  if (state === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
        <p className="text-gray-500 text-sm">Loading your dashboard…</p>
      </div>
    </div>
  );

  if (state === 'redirect') return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
};

export default ProtectedRoute;
