import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getUserProfile } from '@/lib/firebase-auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: string[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Fix: Changed from getCurrentUserAsync to getCurrentUser
        const user = await getCurrentUser();
        
        if (!user) {
          console.log('No user found, redirecting to login');
          navigate('/login', { replace: true });
          return;
        }

        const profile = await getUserProfile(user.uid);
        
        if (!profile) {
          console.log('No profile found, redirecting to login');
          navigate('/login', { replace: true });
          return;
        }

        if (!allowedRoles.includes(profile.role)) {
          console.log(`Role ${profile.role} not allowed`);
          // Redirect to appropriate dashboard based on role
          if (profile.role === 'elderly') navigate('/elderly', { replace: true });
          else if (profile.role === 'caregiver') navigate('/caregiver', { replace: true });
          else if (profile.role === 'doctor') navigate('/doctor', { replace: true });
          else if (profile.role === 'admin') navigate('/admin', { replace: true });
          else navigate('/login', { replace: true });
          return;
        }

        setAuthorized(true);
      } catch (error) {
        console.error('Auth check error:', error);
        navigate('/login', { replace: true });
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [navigate, allowedRoles]);

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