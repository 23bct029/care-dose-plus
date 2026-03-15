import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { onAuthStateChange, getUserProfile } from '@/lib/firebase-auth';
import ProtectedRoute from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import ElderlyApp from '@/pages/ElderlyApp';
import CaregiverApp from '@/pages/CaregiverApp';
import DoctorApp from '@/pages/DoctorApp';
import AdminApp from '@/pages/AdminApp';
import Schedule from '@/pages/Schedule';
import Medicines from '@/pages/Medicines';
import AddMedicine from '@/pages/AddMedicine';
import AcceptInvite from '@/pages/AcceptInvite';
import Connections from '@/pages/Connections';
import AccessibilityToolbar from '@/components/AccessibilityToolbar';
import GoogleFitCallback from '@/pages/GoogleFitCallback';
import FitbitCallback from '@/pages/FitbitCallback';

// Smart root redirect — checks Firebase auth state then sends to correct dashboard
const RootRedirect = () => {
  const [dest, setDest] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChange(async (user) => {
      unsub();
      if (!user) { setDest('/login'); return; }
      const profile = await getUserProfile(user.uid);
      if (!profile) { setDest('/login'); return; }
      const routes: Record<string, string> = {
        elderly: '/elderly', caregiver: '/caregiver', doctor: '/doctor', admin: '/admin'
      };
      setDest(routes[profile.role] || '/elderly');
    });
  }, []);

  if (dest === null) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-600 to-blue-700">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4"/>
        <p className="text-white font-semibold text-lg">CareDose+</p>
        <p className="text-white/70 text-sm mt-1">Loading your session…</p>
      </div>
    </div>
  );
  return <Navigate to={dest} replace />;
};

// Login page — redirects away if already authenticated
const LoginPage = () => {
  const [checked, setChecked] = useState(false);
  const [dest, setDest] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChange(async (user) => {
      unsub();
      if (!user) { setChecked(true); return; }
      const profile = await getUserProfile(user.uid);
      const routes: Record<string, string> = {
        elderly: '/elderly', caregiver: '/caregiver', doctor: '/doctor', admin: '/admin'
      };
      setDest(routes[profile?.role || 'elderly'] || '/elderly');
      setChecked(true);
    });
  }, []);

  if (!checked) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-600 to-blue-700">
      <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin"/>
    </div>
  );
  if (dest) return <Navigate to={dest} replace />;
  return <Login />;
};

function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/accept-invite" element={<AcceptInvite />} />
          <Route path="/elderly" element={<ProtectedRoute allowedRoles={['elderly']}><ElderlyApp /></ProtectedRoute>} />
          <Route path="/caregiver" element={<ProtectedRoute allowedRoles={['caregiver']}><CaregiverApp /></ProtectedRoute>} />
          <Route path="/doctor" element={<ProtectedRoute allowedRoles={['doctor']}><DoctorApp /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminApp /></ProtectedRoute>} />
          <Route path="/connections" element={<ProtectedRoute allowedRoles={['elderly','caregiver','doctor','admin']}><Connections /></ProtectedRoute>} />
          <Route path="/schedule" element={<ProtectedRoute allowedRoles={['elderly','caregiver','doctor']}><Schedule /></ProtectedRoute>} />
          <Route path="/medicines" element={<ProtectedRoute allowedRoles={['elderly','caregiver','doctor']}><Medicines /></ProtectedRoute>} />
          <Route path="/medicines/add" element={<ProtectedRoute allowedRoles={['elderly','caregiver','doctor']}><AddMedicine /></ProtectedRoute>} />
          <Route path="/google-fit-callback" element={<GoogleFitCallback />} />
          <Route path="/fitbit-callback" element={<FitbitCallback />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
      <AccessibilityToolbar />
    </TooltipProvider>
  );
}

export default App;
