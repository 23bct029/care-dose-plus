// src/components/ProtectedRoute.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getCurrentUserAsync, getUserProfile } from '@/lib/firebase-auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: string[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      try {
        const user = await getCurrentUserAsync();
        
        if (!isMounted) return;

        if (!user) {
          console.log('No user found, redirecting to login');
          navigate('/login', { replace: true, state: { from: location.pathname } });
          return;
        }

        const profile = await getUserProfile(user.uid);
        
        if (!isMounted) return;

        if (!profile) {
          console.log('No profile found, redirecting to login');
          navigate('/login', { replace: true });
          return;
        }

        // Check if user's role is allowed for this route
        if (!allowedRoles.includes(profile.role)) {
          console.log(`Role ${profile.role} not allowed for page ${location.pathname}`);
          
          // Redirect to appropriate dashboard based on role
          const redirectPath = getDashboardForRole(profile.role);
          navigate(redirectPath, { replace: true });
          return;
        }

        setAuthorized(true);
      } catch (error) {
        console.error('Auth check error:', error);
        if (isMounted) {
          navigate('/login', { replace: true });
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [navigate, location.pathname, allowedRoles]);

  const getDashboardForRole = (role: string): string => {
    switch(role) {
      case 'elderly': return '/elderly';
      case 'caregiver': return '/caregiver';
      case 'doctor': return '/doctor';
      case 'admin': return '/admin';
      default: return '/login';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-lg text-gray-700">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return authorized ? <>{children}</> : null;
};

export default ProtectedRoute;