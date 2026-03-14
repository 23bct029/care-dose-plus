// src/pages/Connections.tsx - Uses ConnectionsPanel for consistency
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getUserProfile } from '@/lib/firebase-auth';
import { Button } from '@/components/ui/button';
import ConnectionsPanel from '@/components/ConnectionsPanel';
import { ArrowLeft, Users } from 'lucide-react';

const Connections = () => {
  const [userRole, setUserRole] = useState<'elderly' | 'caregiver' | 'doctor'>('elderly');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const init = async () => {
      try {
        const user = await getCurrentUser();
        if (!user) { navigate('/login'); return; }
        const profile = await getUserProfile(user.uid);
        if (profile?.role) {
          const role = profile.role as string;
          if (role === 'caregiver' || role === 'doctor' || role === 'elderly') {
            setUserRole(role as 'elderly' | 'caregiver' | 'doctor');
          }
        }
      } catch (err) {
        console.error('Error loading user for connections:', err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const handleBack = () => {
    navigate(-1);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              className="hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Users className="h-6 w-6 text-blue-600" />
              <h1 className="text-xl font-bold text-gray-800">My Connections</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <ConnectionsPanel userRole={userRole} />
      </main>
    </div>
  );
};

export default Connections;
