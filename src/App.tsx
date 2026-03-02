import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { onAuthStateChange } from '@/lib/firebase-auth';
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

function App() {
  useEffect(() => {
    const unsubscribe = onAuthStateChange((user) => {
      if (user) {
        console.log('User logged in:', user.email);
      } else {
        console.log('User logged out');
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          
          <Route path="/elderly" element={
            <ProtectedRoute allowedRoles={['elderly']}>
              <ElderlyApp />
            </ProtectedRoute>
          } />
          
          <Route path="/caregiver" element={
            <ProtectedRoute allowedRoles={['caregiver']}>
              <CaregiverApp />
            </ProtectedRoute>
          } />
          
          <Route path="/doctor" element={
            <ProtectedRoute allowedRoles={['doctor']}>
              <DoctorApp />
            </ProtectedRoute>
          } />
          
          <Route path="/admin" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminApp />
            </ProtectedRoute>
          } />

          <Route path="/schedule" element={
            <ProtectedRoute allowedRoles={['elderly', 'caregiver', 'doctor']}>
              <Schedule />
            </ProtectedRoute>
          } />
          
          <Route path="/medicines" element={
            <ProtectedRoute allowedRoles={['elderly', 'caregiver', 'doctor']}>
              <Medicines />
            </ProtectedRoute>
          } />
          
          <Route path="/medicines/add" element={
            <ProtectedRoute allowedRoles={['elderly', 'caregiver', 'doctor']}>
              <AddMedicine />
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;