import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUserAsync, getUserProfile } from '@/lib/firebase-auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: string[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      try {
        // Wait for auth state to resolve with timeout
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Auth timeout')), 5000)
        );

        const user = await Promise.race([
          getCurrentUserAsync(),
          timeoutPromise
        ]) as any;
        
        if (!isMounted) return;

        if (!user) {
          console.log('No user found, redirecting to login');
          navigate('/login', { replace: true });
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
          console.log(`Role ${profile.role} not allowed for this page`);
          
          // Redirect to appropriate dashboard based on role
          if (profile.role === 'elderly') {
            navigate('/elderly', { replace: true });
          } else if (profile.role === 'caregiver') {
            navigate('/caregiver', { replace: true });
          } else if (profile.role === 'doctor') {
            navigate('/doctor', { replace: true });
          } else if (profile.role === 'admin') {
            navigate('/admin', { replace: true });
          } else {
            navigate('/login', { replace: true });
          }
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
  }, [navigate, allowedRoles]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-lg text-gray-700">Loading your dashboard...</p>
          <p className="text-sm text-gray-500 mt-2">Please wait</p>
        </div>
      </div>
    );
  }

  return authorized ? <>{children}</> : null;
};

export default ProtectedRoute;