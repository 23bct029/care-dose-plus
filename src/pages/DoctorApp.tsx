import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getUserProfile, logOut } from '@/lib/firebase-auth';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc, orderBy, limit } from 'firebase/firestore';
import { logger } from '@/lib/logger';
import { sendBrowserNotification } from '@/lib/notifications';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Stethoscope, Users, Calendar, Pill, 
  AlertCircle, Heart, FileText, Clock,
  Phone, Mail, CheckCircle, XCircle,
  Plus, Search, UserPlus, Activity, 
  TrendingUp, Download, Filter, MessageSquare,
  LogOut, ChevronRight, Send, Clipboard,
  Syringe, Thermometer, UserCheck, Bell
} from 'lucide-react';

const DoctorApp = () => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [emergencies, setEmergencies] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [selectedEmergency, setSelectedEmergency] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalPatients: 0,
    todayAppointments: 0,
    pendingPrescriptions: 0,
    emergencyAlerts: 0,
    completedToday: 0
  });

  // Prescription form state
  const [prescriptionData, setPrescriptionData] = useState({
    medicine: '',
    dosage: '',
    frequency: 'daily',
    duration: '',
    instructions: '',
    refills: 0
  });

  // Appointment form state
  const [appointmentData, setAppointmentData] = useState({
    patientId: '',
    title: '',
    date: new Date().toISOString().split('T')[0],
    time: '09:00',
    type: 'checkup',
    notes: ''
  });

  const navigate = useNavigate();

  // Logger function
  const logUserAction = async (action: string, details?: any) => {
    if (user) {
      await logger.logWithUser(user.uid, user.email, 'info', action, details);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Log page view when user is loaded
  useEffect(() => {
    if (user) {
      logUserAction('Page viewed', { page: 'DoctorDashboard' });
    }
  }, [user]);

  const loadData = async () => {
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        navigate('/login');
        return;
      }
      setUser(currentUser);

      const userProfile = await getUserProfile(currentUser.uid);
      setProfile(userProfile);

      await logger.logWithUser(currentUser.uid, currentUser.email, 'info', 'Data loading started', { page: 'DoctorDashboard' });

      // Get all patients under this doctor
      const doctorPatientsRef = collection(db, 'doctor_patients');
      const patientsQuery = query(doctorPatientsRef, where('doctorId', '==', currentUser.uid));
      const patientsSnap = await getDocs(patientsQuery);
      
      const patientsData = await Promise.all(
        patientsSnap.docs.map(async (relDoc) => {
          const relData = relDoc.data();
          
          // Get patient profile
          const patientRef = doc(db, 'users', relData.patientId);
          const patientSnap = await getDoc(patientRef);
          const patientData = patientSnap.data();
          
          if (!patientData) return null;

          // Get latest prescription
          const prescriptionsRef = collection(db, 'prescriptions');
          const prescriptionsQuery = query(
            prescriptionsRef, 
            where('patientId', '==', relData.patientId),
            where('doctorId', '==', currentUser.uid),
            orderBy('createdAt', 'desc'),
            limit(1)
          );
          const prescriptionsSnap = await getDocs(prescriptionsQuery);
          
          const latestPrescription: any[] = [];
          prescriptionsSnap.forEach((doc) => {
            latestPrescription.push({ id: doc.id, ...doc.data() });
          });

          // Get upcoming appointments
          const today = new Date().toISOString().split('T')[0];
          const appointmentsRef = collection(db, 'appointments');
          const appointmentsQuery = query(
            appointmentsRef,
            where('patientId', '==', relData.patientId),
            where('doctorId', '==', currentUser.uid),
            where('date', '>=', today),
            orderBy('date', 'asc'),
            orderBy('time', 'asc')
          );
          const appointmentsSnap = await getDocs(appointmentsQuery);
          
          const patientAppointments: any[] = [];
          appointmentsSnap.forEach((doc) => {
            patientAppointments.push({ id: doc.id, ...doc.data() });
          });

          return {
            id: relData.patientId,
            ...patientData,
            latestPrescription: latestPrescription[0],
            appointments: patientAppointments
          };
        })
      );

      const validPatients = patientsData.filter(p => p !== null);
      setPatients(validPatients);

      // Get today's appointments
      const today = new Date().toISOString().split('T')[0];
      const allAppointmentsRef = collection(db, 'appointments');
      const todayAppointmentsQuery = query(
        allAppointmentsRef,
        where('doctorId', '==', currentUser.uid),
        where('date', '==', today),
        orderBy('time', 'asc')
      );
      const todayAppointmentsSnap = await getDocs(todayAppointmentsQuery);
      
      const todayApps: any[] = [];
      todayAppointmentsSnap.forEach((doc) => {
        todayApps.push({ id: doc.id, ...doc.data() });
      });
      setAppointments(todayApps);

      // Get emergency alerts
      const emergenciesRef = collection(db, 'emergencies');
      const emergenciesQuery = query(
        emergenciesRef, 
        where('status', '==', 'active'),
        orderBy('createdAt', 'desc')
      );
      const emergenciesSnap = await getDocs(emergenciesQuery);
      
      const alerts: any[] = [];
      emergenciesSnap.forEach((doc) => {
        alerts.push({ id: doc.id, ...doc.data() });
      });
      setEmergencies(alerts);

      // Get all prescriptions
      const allPrescriptionsRef = collection(db, 'prescriptions');
      const prescriptionsQuery = query(
        allPrescriptionsRef, 
        where('doctorId', '==', currentUser.uid),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const prescriptionsSnap = await getDocs(prescriptionsQuery);
      
      const prescrips: any[] = [];
      prescriptionsSnap.forEach((doc) => {
        prescrips.push({ id: doc.id, ...doc.data() });
      });
      setPrescriptions(prescrips);

      // Calculate stats
      setStats({
        totalPatients: validPatients.length,
        todayAppointments: todayApps.length,
        pendingPrescriptions: prescrips.filter(p => p.status === 'active').length,
        emergencyAlerts: alerts.length,
        completedToday: todayApps.filter(a => a.status === 'completed').length
      });

      await logger.logWithUser(currentUser.uid, currentUser.email, 'info', 'Data loaded successfully', { 
        patientsCount: validPatients.length,
        appointmentsCount: todayApps.length,
        emergenciesCount: alerts.length
      });

    } catch (error: any) {
      console.error('Error loading data:', error);
      if (user) {
        await logger.error('Failed to load doctor data', { 
          userId: user.uid,
          error: error.message 
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddPrescription = async () => {
    if (!selectedPatient) return;
    
    try {
      const prescriptionsRef = collection(db, 'prescriptions');
      await addDoc(prescriptionsRef, {
        patientId: selectedPatient.id,
        doctorId: user.uid,
        doctorName: profile?.name,
        ...prescriptionData,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      await logUserAction('Prescription added', { 
        patientId: selectedPatient.id,
        medicine: prescriptionData.medicine 
      });

      // Create notification for patient
      const notificationsRef = collection(db, 'notifications');
      await addDoc(notificationsRef, {
        userId: selectedPatient.id,
        type: 'prescription',
        title: 'New Prescription',
        message: `Dr. ${profile?.name} prescribed ${prescriptionData.medicine} ${prescriptionData.dosage}`,
        read: false,
        createdAt: new Date().toISOString()
      });

      setShowPrescriptionModal(false);
      setPrescriptionData({
        medicine: '',
        dosage: '',
        frequency: 'daily',
        duration: '',
        instructions: '',
        refills: 0
      });
      loadData();

    } catch (error: any) {
      console.error('Error adding prescription:', error);
      await logger.error('Failed to add prescription', { 
        userId: user.uid,
        patientId: selectedPatient?.id,
        error: error.message 
      });
    }
  };

  const handleScheduleAppointment = async () => {
    if (!appointmentData.patientId) {
      alert('Please select a patient');
      return;
    }

    try {
      const appointmentsRef = collection(db, 'appointments');
      await addDoc(appointmentsRef, {
        patientId: appointmentData.patientId,
        doctorId: user.uid,
        doctorName: profile?.name,
        ...appointmentData,
        status: 'scheduled',
        createdAt: new Date().toISOString()
      });

      await logUserAction('Appointment scheduled', { 
        patientId: appointmentData.patientId,
        date: appointmentData.date,
        time: appointmentData.time
      });

      // Create notification for patient
      const patient = patients.find(p => p.id === appointmentData.patientId);
      const notificationsRef = collection(db, 'notifications');
      await addDoc(notificationsRef, {
        userId: appointmentData.patientId,
        type: 'appointment',
        title: 'New Appointment Scheduled',
        message: `Appointment with Dr. ${profile?.name} on ${appointmentData.date} at ${appointmentData.time}`,
        read: false,
        createdAt: new Date().toISOString()
      });

      setShowAppointmentModal(false);
      setAppointmentData({
        patientId: '',
        title: '',
        date: new Date().toISOString().split('T')[0],
        time: '09:00',
        type: 'checkup',
        notes: ''
      });
      loadData();

    } catch (error: any) {
      console.error('Error scheduling appointment:', error);
      await logger.error('Failed to schedule appointment', { 
        userId: user.uid,
        error: error.message 
      });
    }
  };

  const handleEmergencyResponse = async (emergencyId: string) => {
    try {
      const emergencyRef = doc(db, 'emergencies', emergencyId);
      await updateDoc(emergencyRef, {
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
        resolvedBy: user.uid,
        resolvedByName: profile?.name
      });
      
      await logUserAction('Emergency resolved', { emergencyId });
      loadData();
    } catch (error: any) {
      console.error('Error resolving emergency:', error);
      await logger.error('Failed to resolve emergency', { 
        userId: user.uid,
        emergencyId,
        error: error.message 
      });
    }
  };

  const handleViewEmergency = (emergency: any) => {
    setSelectedEmergency(emergency);
    setShowEmergencyModal(true);
  };

  const handleCompleteAppointment = async (appointmentId: string) => {
    try {
      const appointmentRef = doc(db, 'appointments', appointmentId);
      await updateDoc(appointmentRef, {
        status: 'completed',
        completedAt: new Date().toISOString()
      });
      
      await logUserAction('Appointment completed', { appointmentId });
      loadData();
    } catch (error: any) {
      console.error('Error completing appointment:', error);
    }
  };

  const handleCancelAppointment = async (appointmentId: string) => {
    if (!confirm('Are you sure you want to cancel this appointment?')) return;
    
    try {
      const appointmentRef = doc(db, 'appointments', appointmentId);
      await updateDoc(appointmentRef, {
        status: 'cancelled',
        cancelledAt: new Date().toISOString()
      });
      
      await logUserAction('Appointment cancelled', { appointmentId });
      loadData();
    } catch (error: any) {
      console.error('Error cancelling appointment:', error);
    }
  };

  const handleNewPatient = () => {
    alert('Add new patient feature - would open patient registration form');
  };

  const handleViewRecords = (patientId: string) => {
    navigate(`/patient-records/${patientId}`);
  };

  const handleContactPatient = (patient: any, method: 'call' | 'email') => {
    if (method === 'call' && patient.phone) {
      window.location.href = `tel:${patient.phone}`;
    } else if (method === 'email' && patient.email) {
      window.location.href = `mailto:${patient.email}`;
    } else {
      alert(`No ${method} available for this patient`);
    }
  };

  const handleExportReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      doctor: profile?.name,
      stats,
      patients: patients.map(p => ({
        name: p.name,
        email: p.email,
        latestPrescription: p.latestPrescription,
        appointments: p.appointments
      })),
      emergencies: emergencies
    };

    const dataStr = JSON.stringify(report, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `doctor-report-${new Date().toISOString().split('T')[0]}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();

    logUserAction('Report exported');
  };

  const handleLogout = async () => {
    try {
      await logUserAction('User logged out');
      await logOut();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const filteredPatients = patients.filter(p => 
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4">Loading doctor dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12 border-2 border-purple-500">
                <AvatarImage src={profile?.avatar} />
                <AvatarFallback className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
                  {profile?.name?.charAt(0) || 'D'}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Dr. {profile?.name}</h1>
                <p className="text-sm text-gray-600">Doctor Dashboard • {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2"
                onClick={handleExportReport}
              >
                <Download className="h-4 w-4" />
                Report
              </Button>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Emergency Alerts */}
        {emergencies.length > 0 && (
          <Card className="border-red-500 bg-red-50 cursor-pointer hover:bg-red-100 transition-colors" onClick={() => setShowEmergencyModal(true)}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-red-600 animate-pulse" />
                <p className="text-red-700 font-medium">
                  🚨 {emergencies.length} Emergency Alert(s) - Immediate attention required!
                </p>
                <ChevronRight className="h-5 w-5 text-red-600 ml-auto" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card 
            className="bg-gradient-to-br from-purple-600 to-pink-600 text-white cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => setSelectedPatient(null)}
          >
            <CardContent className="p-4">
              <Users className="h-5 w-5 text-purple-200 mb-2" />
              <p className="text-2xl font-bold">{stats.totalPatients}</p>
              <p className="text-xs opacity-90">Total Patients</p>
            </CardContent>
          </Card>

          <Card 
            className="bg-gradient-to-br from-blue-600 to-cyan-600 text-white cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => document.querySelector('[value="appointments"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))}
          >
            <CardContent className="p-4">
              <Calendar className="h-5 w-5 text-blue-200 mb-2" />
              <p className="text-2xl font-bold">{stats.todayAppointments}</p>
              <p className="text-xs opacity-90">Today's Apps</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-600 to-emerald-600 text-white">
            <CardContent className="p-4">
              <CheckCircle className="h-5 w-5 text-green-200 mb-2" />
              <p className="text-2xl font-bold">{stats.completedToday}</p>
              <p className="text-xs opacity-90">Completed</p>
            </CardContent>
          </Card>

          <Card 
            className="bg-gradient-to-br from-orange-600 to-amber-600 text-white cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => setShowPrescriptionModal(true)}
          >
            <CardContent className="p-4">
              <Pill className="h-5 w-5 text-orange-200 mb-2" />
              <p className="text-2xl font-bold">{stats.pendingPrescriptions}</p>
              <p className="text-xs opacity-90">Active Rx</p>
            </CardContent>
          </Card>

          <Card 
            className="bg-gradient-to-br from-red-600 to-rose-600 text-white cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => setShowEmergencyModal(true)}
          >
            <CardContent className="p-4">
              <Bell className="h-5 w-5 text-red-200 mb-2" />
              <p className="text-2xl font-bold">{stats.emergencyAlerts}</p>
              <p className="text-xs opacity-90">Emergencies</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-3">
          <Button 
            className="h-16 flex flex-col items-center justify-center hover:bg-purple-100 transition-colors" 
            variant="outline"
            onClick={handleNewPatient}
          >
            <UserPlus className="h-5 w-5 mb-1" />
            <span className="text-xs">New Patient</span>
          </Button>

          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate('/connections')}
            className="relative"
            title="Manage Connections"
          >
            <UserPlus className="h-5 w-5" />
          </Button>

          <Button 
            className="h-16 flex flex-col items-center justify-center hover:bg-blue-100 transition-colors" 
            variant="outline"
            onClick={() => setShowAppointmentModal(true)}
          >
            <Calendar className="h-5 w-5 mb-1" />
            <span className="text-xs">Schedule</span>
          </Button>
          <Button 
            className="h-16 flex flex-col items-center justify-center hover:bg-orange-100 transition-colors" 
            variant="outline"
            onClick={() => setShowPrescriptionModal(true)}
          >
            <Pill className="h-5 w-5 mb-1" />
            <span className="text-xs">Prescribe</span>
          </Button>
          <Button 
            className="h-16 flex flex-col items-center justify-center hover:bg-green-100 transition-colors" 
            variant="outline"
            onClick={() => navigate('/records')}
          >
            <FileText className="h-5 w-5 mb-1" />
            <span className="text-xs">Records</span>
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="appointments" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="appointments">Today's Appointments</TabsTrigger>
            <TabsTrigger value="patients">Patients</TabsTrigger>
            <TabsTrigger value="prescriptions">Recent Prescriptions</TabsTrigger>
          </TabsList>

          {/* Appointments Tab */}
          <TabsContent value="appointments">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-purple-600" />
                  Today's Appointments
                </CardTitle>
              </CardHeader>
              <CardContent>
                {appointments.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No appointments scheduled for today</p>
                    <Button variant="link" onClick={() => setShowAppointmentModal(true)} className="mt-2">
                      Schedule an appointment
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {appointments.map((apt) => {
                      const patient = patients.find(p => p.id === apt.patientId);
                      return (
                        <div key={apt.id} className="flex items-center justify-between p-4 border rounded-lg hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback className="bg-purple-100 text-purple-800">
                                {patient?.name?.charAt(0) || 'P'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold">{patient?.name || 'Unknown'}</p>
                              <p className="text-sm text-gray-600">{apt.title}</p>
                              {apt.type && (
                                <Badge variant="outline" className="mt-1 text-xs">
                                  {apt.type}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge className="mb-1">{apt.time}</Badge>
                            <div className="flex gap-2 mt-2">
                              {apt.status === 'scheduled' && (
                                <>
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="text-green-600"
                                    onClick={() => handleCompleteAppointment(apt.id)}
                                  >
                                    <CheckCircle className="h-4 w-4 mr-1" />
                                    Complete
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="text-red-600"
                                    onClick={() => handleCancelAppointment(apt.id)}
                                  >
                                    <XCircle className="h-4 w-4 mr-1" />
                                    Cancel
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Patients Tab */}
          <TabsContent value="patients">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-purple-600" />
                  My Patients
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Search */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search patients by name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Patients List */}
                {filteredPatients.length === 0 ? (
                  <div className="text-center py-8">
                    <Heart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No patients found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredPatients.map((patient) => (
                      <Card key={patient.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setSelectedPatient(patient)}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-12 w-12">
                                <AvatarFallback className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                                  {patient.name?.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <h3 className="font-semibold">{patient.name}</h3>
                                <p className="text-sm text-gray-600">{patient.email}</p>
                                {patient.phone && (
                                  <p className="text-xs text-gray-500 mt-1">{patient.phone}</p>
                                )}
                              </div>
                            </div>
                            <Badge variant={patient.latestPrescription ? 'default' : 'secondary'}>
                              {patient.latestPrescription ? 'Active Rx' : 'No Rx'}
                            </Badge>
                          </div>

                          {patient.latestPrescription && (
                            <div className="mt-3 p-2 bg-purple-50 rounded-lg">
                              <p className="text-xs text-purple-700 font-medium">Latest Prescription</p>
                              <p className="text-sm font-medium">{patient.latestPrescription.medicine} {patient.latestPrescription.dosage}</p>
                            </div>
                          )}

                          <div className="flex gap-2 mt-3">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="bg-blue-600 hover:bg-blue-700 text-white border-blue-500"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPatient(patient);
                                setShowPrescriptionModal(true);
                              }}
                            >
                              <Pill className="h-4 w-4 mr-1" />
                              Prescribe
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="bg-green-600 hover:bg-green-700 text-white border-green-500"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleContactPatient(patient, 'call');
                              }}
                            >
                              <Phone className="h-4 w-4 mr-1" />
                              Call
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Prescriptions Tab */}
          <TabsContent value="prescriptions">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Pill className="h-5 w-5 text-purple-600" />
                  Recent Prescriptions
                </CardTitle>
              </CardHeader>
              <CardContent>
                {prescriptions.length === 0 ? (
                  <div className="text-center py-8">
                    <Pill className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No prescriptions yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {prescriptions.slice(0, 5).map((rx) => {
                      const patient = patients.find(p => p.id === rx.patientId);
                      return (
                        <div key={rx.id} className="p-3 border rounded-lg">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-semibold">{rx.medicine} {rx.dosage}</p>
                              <p className="text-sm text-gray-600">for {patient?.name || 'Unknown'}</p>
                              <p className="text-xs text-gray-500">{rx.frequency} • {rx.duration}</p>
                            </div>
                            <Badge>{new Date(rx.createdAt).toLocaleDateString()}</Badge>
                          </div>
                          {rx.instructions && (
                            <p className="text-xs text-gray-500 mt-2 italic">"{rx.instructions}"</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Prescription Modal */}
      <Dialog open={showPrescriptionModal} onOpenChange={setShowPrescriptionModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl">New Prescription</DialogTitle>
            {selectedPatient && (
              <p className="text-sm text-gray-600">for {selectedPatient.name}</p>
            )}
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Medicine Name *</Label>
              <Input
                value={prescriptionData.medicine}
                onChange={(e) => setPrescriptionData({ ...prescriptionData, medicine: e.target.value })}
                placeholder="e.g., Amlodipine"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Dosage *</Label>
                <Input
                  value={prescriptionData.dosage}
                  onChange={(e) => setPrescriptionData({ ...prescriptionData, dosage: e.target.value })}
                  placeholder="e.g., 5mg"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <select
                  value={prescriptionData.frequency}
                  onChange={(e) => setPrescriptionData({ ...prescriptionData, frequency: e.target.value })}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="daily">Once Daily</option>
                  <option value="twice_daily">Twice Daily</option>
                  <option value="thrice_daily">Thrice Daily</option>
                  <option value="weekly">Once Weekly</option>
                  <option value="as_needed">As Needed</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Duration</Label>
                <Input
                  value={prescriptionData.duration}
                  onChange={(e) => setPrescriptionData({ ...prescriptionData, duration: e.target.value })}
                  placeholder="e.g., 30 days"
                />
              </div>
              <div className="space-y-2">
                <Label>Refills</Label>
                <Input
                  type="number"
                  value={prescriptionData.refills}
                  onChange={(e) => setPrescriptionData({ ...prescriptionData, refills: parseInt(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Instructions</Label>
              <Textarea
                value={prescriptionData.instructions}
                onChange={(e) => setPrescriptionData({ ...prescriptionData, instructions: e.target.value })}
                placeholder="e.g., Take with food"
                rows={3}
              />
            </div>

            <div className="flex gap-4 mt-6">
              <Button variant="outline" onClick={() => setShowPrescriptionModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button 
                onClick={handleAddPrescription} 
                className="flex-1"
                disabled={!prescriptionData.medicine || !prescriptionData.dosage}
              >
                Add Prescription
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Appointment Modal */}
      <Dialog open={showAppointmentModal} onOpenChange={setShowAppointmentModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl">Schedule Appointment</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Patient *</Label>
              <select
                value={appointmentData.patientId}
                onChange={(e) => setAppointmentData({ ...appointmentData, patientId: e.target.value })}
                className="w-full p-2 border rounded-md"
                required
              >
                <option value="">Select Patient</option>
                {patients.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={appointmentData.title}
                onChange={(e) => setAppointmentData({ ...appointmentData, title: e.target.value })}
                placeholder="e.g., Regular Checkup"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={appointmentData.date}
                  onChange={(e) => setAppointmentData({ ...appointmentData, date: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Time *</Label>
                <Input
                  type="time"
                  value={appointmentData.time}
                  onChange={(e) => setAppointmentData({ ...appointmentData, time: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <select
                value={appointmentData.type}
                onChange={(e) => setAppointmentData({ ...appointmentData, type: e.target.value })}
                className="w-full p-2 border rounded-md"
              >
                <option value="checkup">Regular Checkup</option>
                <option value="followup">Follow-up</option>
                <option value="emergency">Emergency</option>
                <option value="consultation">Consultation</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={appointmentData.notes}
                onChange={(e) => setAppointmentData({ ...appointmentData, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={3}
              />
            </div>

            <div className="flex gap-4 mt-6">
              <Button variant="outline" onClick={() => setShowAppointmentModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button 
                onClick={handleScheduleAppointment} 
                className="flex-1"
                disabled={!appointmentData.patientId || !appointmentData.title}
              >
                Schedule
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Emergency Modal */}
      <Dialog open={showEmergencyModal} onOpenChange={setShowEmergencyModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl text-red-600 flex items-center gap-2">
              <Bell className="h-6 w-6" />
              Emergency Alerts
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4 max-h-96 overflow-y-auto">
            {emergencies.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No active emergencies</p>
            ) : (
              emergencies.map((emergency) => {
                const patient = patients.find(p => p.id === emergency.userId);
                return (
                  <Card key={emergency.id} className="border-red-200">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-bold text-lg">{patient?.name || 'Unknown Patient'}</h3>
                          <p className="text-red-600 font-medium mt-1">{emergency.message || 'Emergency assistance needed'}</p>
                          <div className="flex gap-4 mt-2 text-sm text-gray-600">
                            <span>Time: {new Date(emergency.createdAt).toLocaleString()}</span>
                            {emergency.location && (
                              <span>📍 Location shared</span>
                            )}
                          </div>
                        </div>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => handleEmergencyResponse(emergency.id)}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Resolve
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DoctorApp;