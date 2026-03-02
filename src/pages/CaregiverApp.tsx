import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getUserProfile, logOut } from '@/lib/firebase-auth';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, addDoc, updateDoc } from 'firebase/firestore';
import { logger } from '@/lib/logger';
import { sendBrowserNotification } from '@/lib/notifications';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Users, Heart, Pill, Calendar, Bell, 
  AlertCircle, CheckCircle, XCircle, Clock,
  Phone, MessageSquare, Plus, Search, UserPlus,
  Activity, TrendingUp, Filter, Download, LogOut,
  ChevronRight, Send, UserCheck
} from 'lucide-react';

const CaregiverApp = () => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [showAddPatientModal, setShowAddPatientModal] = useState(false);
  const [newPatientEmail, setNewPatientEmail] = useState('');
  const [stats, setStats] = useState({
    totalPatients: 0,
    totalMeds: 0,
    missedToday: 0,
    takenToday: 0,
    adherenceRate: 0,
    criticalAlerts: 0
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
      logUserAction('Page viewed', { page: 'CaregiverDashboard' });
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

      await logger.logWithUser(currentUser.uid, currentUser.email, 'info', 'Data loading started', { page: 'CaregiverDashboard' });

      // Get all elderly patients for this caregiver from Firestore
      const relationshipsRef = collection(db, 'caregiver_relationships');
      const relationshipsQuery = query(relationshipsRef, where('caregiverId', '==', currentUser.uid));
      const relationshipsSnap = await getDocs(relationshipsQuery);
      
      const patientsData = await Promise.all(
        relationshipsSnap.docs.map(async (relDoc) => {
          const relData = relDoc.data();
          
          // Get patient profile
          const patientRef = doc(db, 'users', relData.elderlyId);
          const patientSnap = await getDoc(patientRef);
          const patientData = patientSnap.data();
          
          if (!patientData) return null;

          // Get today's medicines for this patient
          const medicinesRef = collection(db, 'medicines');
          const medicinesQuery = query(medicinesRef, where('userId', '==', relData.elderlyId));
          const medicinesSnap = await getDocs(medicinesQuery);
          
          const medicines: any[] = [];
          medicinesSnap.forEach((doc) => {
            medicines.push({ id: doc.id, ...doc.data() });
          });

          // Get today's tracking
          const today = new Date().toISOString().split('T')[0];
          const trackingRef = collection(db, 'tracking');
          const trackingQuery = query(
            trackingRef, 
            where('userId', '==', relData.elderlyId),
            where('date', '==', today)
          );
          const trackingSnap = await getDocs(trackingQuery);
          
          const tracking: any[] = [];
          trackingSnap.forEach((doc) => {
            tracking.push(doc.data());
          });

          // Calculate today's stats
          const scheduledToday = medicines.reduce((acc, med) => 
            acc + (med.schedule?.length || 0), 0);
          
          const takenToday = tracking.filter(t => t.status === 'taken').length;
          const missedToday = tracking.filter(t => t.status === 'missed').length;

          // Get next dose
          const now = new Date();
          const nextDose = medicines
            .flatMap(med => 
              (med.schedule || []).map((time: string) => ({
                ...med,
                time
              }))
            )
            .filter(item => {
              const [hours, minutes] = item.time.split(':');
              const doseTime = new Date();
              doseTime.setHours(parseInt(hours), parseInt(minutes), 0);
              return doseTime > now;
            })
            .sort((a, b) => a.time.localeCompare(b.time))[0];

          return {
            id: relData.elderlyId,
            ...patientData,
            medicines,
            tracking,
            stats: {
              scheduledToday,
              takenToday,
              missedToday,
              nextDose,
              adherenceRate: scheduledToday > 0 
                ? Math.round((takenToday / scheduledToday) * 100) 
                : 0
            }
          };
        })
      );

      const validPatients = patientsData.filter(p => p !== null);
      setPatients(validPatients);

      // Calculate overall stats
      const total = validPatients.reduce((acc, p) => acc + (p.stats.scheduledToday || 0), 0);
      const taken = validPatients.reduce((acc, p) => acc + (p.stats.takenToday || 0), 0);
      const missed = validPatients.reduce((acc, p) => acc + (p.stats.missedToday || 0), 0);
      const critical = validPatients.filter(p => p.stats.missedToday > 0).length;
      
      setStats({
        totalPatients: validPatients.length,
        totalMeds: validPatients.reduce((acc, p) => acc + (p.medicines?.length || 0), 0),
        missedToday: missed,
        takenToday: taken,
        adherenceRate: total > 0 ? Math.round((taken / total) * 100) : 0,
        criticalAlerts: critical
      });

      await logger.logWithUser(currentUser.uid, currentUser.email, 'info', 'Data loaded successfully', { 
        patientsCount: validPatients.length,
        criticalAlerts: critical
      });

    } catch (error: any) {
      console.error('Error loading data:', error);
      if (user) {
        await logger.error('Failed to load caregiver data', { 
          userId: user.uid,
          error: error.message 
        });
      }
    } finally {
      setLoading(false);
    }
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

  const handleAddPatient = () => {
    setShowAddPatientModal(true);
  };

  const handleAddPatientSubmit = async () => {
    if (!newPatientEmail.trim()) {
      alert('Please enter an email');
      return;
    }

    try {
      // Find user by email (this would need a Cloud Function in production)
      alert('Add patient feature - would search for user with email: ' + newPatientEmail);
      setShowAddPatientModal(false);
      setNewPatientEmail('');
    } catch (error) {
      console.error('Error adding patient:', error);
    }
  };

  const handleMessageAll = () => {
    if (patients.length === 0) {
      alert('No patients to message');
      return;
    }
    setShowMessageModal(true);
  };

  const handleSendMessage = async () => {
    if (!messageText.trim()) return;

    try {
      // Send message to all patients
      for (const patient of patients) {
        const notificationsRef = collection(db, 'notifications');
        await addDoc(notificationsRef, {
          userId: patient.id,
          type: 'message',
          title: 'Message from Caregiver',
          message: messageText,
          read: false,
          createdAt: new Date().toISOString()
        });

        // Also send SMS if phone number available (would need Twilio integration)
        if (patient.phone) {
          console.log(`Sending SMS to ${patient.phone}: ${messageText}`);
        }
      }

      await logUserAction('Message sent to all patients', { 
        message: messageText,
        patientCount: patients.length 
      });

      setShowMessageModal(false);
      setMessageText('');
      alert(`Message sent to ${patients.length} patient(s)`);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleSchedule = () => {
    navigate('/schedule');
  };

  const handleViewAlerts = () => {
    const alertPatients = patients.filter(p => p.stats.missedToday > 0);
    if (alertPatients.length > 0) {
      setSelectedPatient(alertPatients[0]);
    } else {
      alert('No patients with alerts');
    }
  };

  const handleCallPatient = (phone: string, name: string) => {
    if (phone) {
      window.location.href = `tel:${phone}`;
      logUserAction('Called patient', { patientName: name });
    } else {
      alert('No phone number available');
    }
  };

  const handleMessagePatient = (patient: any) => {
    setSelectedPatient(patient);
    setMessageText('');
    setShowMessageModal(true);
  };

  const handleSendPatientMessage = async () => {
    if (!messageText.trim() || !selectedPatient) return;

    try {
      const notificationsRef = collection(db, 'notifications');
      await addDoc(notificationsRef, {
        userId: selectedPatient.id,
        type: 'message',
        title: 'Message from Caregiver',
        message: messageText,
        read: false,
        createdAt: new Date().toISOString()
      });

      await logUserAction('Message sent to patient', { 
        patientId: selectedPatient.id,
        message: messageText 
      });

      setShowMessageModal(false);
      setMessageText('');
      alert(`Message sent to ${selectedPatient.name}`);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleMarkAsTaken = async (patientId: string, medicineId: string) => {
    try {
      const trackingRef = collection(db, 'tracking');
      await addDoc(trackingRef, {
        userId: patientId,
        medicineId,
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().split(' ')[0],
        status: 'taken',
        timestamp: new Date().toISOString(),
        markedBy: user.uid,
        markedByName: profile?.name
      });

      await logUserAction('Marked medicine as taken for patient', { 
        patientId, 
        medicineId 
      });

      loadData();
      setSelectedPatient(null);
    } catch (error) {
      console.error('Error marking as taken:', error);
    }
  };

  const handleExportReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      caregiver: profile?.name,
      stats,
      patients: patients.map(p => ({
        name: p.name,
        email: p.email,
        stats: p.stats,
        medicines: p.medicines?.length
      }))
    };

    const dataStr = JSON.stringify(report, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `caregiver-report-${new Date().toISOString().split('T')[0]}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();

    logUserAction('Report exported');
  };

  const filteredPatients = patients.filter(p => 
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'taken': return 'bg-green-100 text-green-800 border-green-200';
      case 'missed': return 'bg-red-100 text-red-800 border-red-200';
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'taken': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'missed': return <XCircle className="h-4 w-4 text-red-600" />;
      case 'pending': return <Clock className="h-4 w-4 text-yellow-600" />;
      default: return <AlertCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4">Loading caregiver dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12 border-2 border-green-500">
                <AvatarImage src={profile?.avatar} />
                <AvatarFallback className="bg-gradient-to-r from-green-600 to-emerald-600 text-white">
                  {profile?.name?.charAt(0) || 'C'}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Caregiver Dashboard</h1>
                <p className="text-sm text-gray-600">Welcome back, {profile?.name?.split(' ')[0]}</p>
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
        {/* Critical Alerts Banner */}
        {stats.criticalAlerts > 0 && (
          <Card className="border-red-500 bg-red-50 cursor-pointer hover:bg-red-100 transition-colors" onClick={handleViewAlerts}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 animate-pulse" />
                <p className="text-red-700 font-medium">
                  ⚠️ {stats.criticalAlerts} patient(s) need attention - missed doses detected
                </p>
                <ChevronRight className="h-5 w-5 text-red-600 ml-auto" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="bg-gradient-to-br from-blue-600 to-blue-700 text-white cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setSelectedPatient(null)}>
            <CardContent className="p-4">
              <Users className="h-5 w-5 text-blue-200 mb-2" />
              <p className="text-2xl font-bold">{stats.totalPatients}</p>
              <p className="text-xs opacity-90">Total Patients</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-600 to-green-700 text-white">
            <CardContent className="p-4">
              <CheckCircle className="h-5 w-5 text-green-200 mb-2" />
              <p className="text-2xl font-bold">{stats.takenToday}</p>
              <p className="text-xs opacity-90">Taken Today</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-600 to-red-700 text-white cursor-pointer hover:shadow-lg transition-shadow" onClick={handleViewAlerts}>
            <CardContent className="p-4">
              <XCircle className="h-5 w-5 text-red-200 mb-2" />
              <p className="text-2xl font-bold">{stats.missedToday}</p>
              <p className="text-xs opacity-90">Missed Today</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-600 to-purple-700 text-white">
            <CardContent className="p-4">
              <Activity className="h-5 w-5 text-purple-200 mb-2" />
              <p className="text-2xl font-bold">{stats.adherenceRate}%</p>
              <p className="text-xs opacity-90">Adherence</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-600 to-orange-700 text-white cursor-pointer hover:shadow-lg transition-shadow" onClick={handleViewAlerts}>
            <CardContent className="p-4">
              <Bell className="h-5 w-5 text-orange-200 mb-2" />
              <p className="text-2xl font-bold">{stats.criticalAlerts}</p>
              <p className="text-xs opacity-90">Alerts</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-3">
          <Button 
            className="h-16 flex flex-col items-center justify-center hover:bg-green-100 transition-colors" 
            variant="outline"
            onClick={handleAddPatient}
          >
            <UserPlus className="h-5 w-5 mb-1" />
            <span className="text-xs">Add Patient</span>
          </Button>
          <Button 
            className="h-16 flex flex-col items-center justify-center hover:bg-blue-100 transition-colors" 
            variant="outline"
            onClick={handleMessageAll}
          >
            <MessageSquare className="h-5 w-5 mb-1" />
            <span className="text-xs">Message All</span>
          </Button>
          <Button 
            className="h-16 flex flex-col items-center justify-center hover:bg-purple-100 transition-colors" 
            variant="outline"
            onClick={handleSchedule}
          >
            <Calendar className="h-5 w-5 mb-1" />
            <span className="text-xs">Schedule</span>
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search patients by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Patients Grid */}
        {filteredPatients.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Heart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">No Patients Found</h3>
              <p className="text-gray-600 mb-4">
                {searchTerm ? 'Try a different search term' : 'Add your first patient to get started'}
              </p>
              <Button onClick={handleAddPatient}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add Patient
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPatients.map((patient) => (
              <Card 
                key={patient.id} 
                className="hover:shadow-lg transition-shadow cursor-pointer" 
                onClick={() => setSelectedPatient(patient)}
              >
                <CardContent className="p-5">
                  {/* Patient Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white">
                          {patient.name?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-semibold text-lg">{patient.name}</h3>
                        <p className="text-sm text-gray-600">{patient.email}</p>
                      </div>
                    </div>
                    <Badge variant={patient.stats.missedToday > 0 ? 'destructive' : 'secondary'}>
                      {patient.stats.missedToday > 0 ? '⚠️ Alert' : '✅ Stable'}
                    </Badge>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Today's Progress</span>
                      <span className="font-medium">{patient.stats.takenToday}/{patient.stats.scheduledToday}</span>
                    </div>
                    <Progress value={(patient.stats.takenToday / (patient.stats.scheduledToday || 1)) * 100} className="h-2" />
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="text-center p-2 bg-blue-50 rounded-lg">
                      <Pill className="h-4 w-4 text-blue-600 mx-auto mb-1" />
                      <p className="text-xs text-gray-600">Meds</p>
                      <p className="font-bold">{patient.medicines?.length || 0}</p>
                    </div>
                    <div className="text-center p-2 bg-green-50 rounded-lg">
                      <CheckCircle className="h-4 w-4 text-green-600 mx-auto mb-1" />
                      <p className="text-xs text-gray-600">Taken</p>
                      <p className="font-bold">{patient.stats.takenToday}</p>
                    </div>
                    <div className="text-center p-2 bg-yellow-50 rounded-lg">
                      <Clock className="h-4 w-4 text-yellow-600 mx-auto mb-1" />
                      <p className="text-xs text-gray-600">Next</p>
                      <p className="font-bold text-sm">{patient.stats.nextDose?.time || '--:--'}</p>
                    </div>
                  </div>

                  {/* Today's Schedule Preview */}
                  <div className="space-y-2 mb-4">
                    {patient.medicines?.slice(0, 2).map((med: any, idx: number) => (
                      med.schedule?.map((time: string, tidx: number) => {
                        const isTaken = patient.tracking?.some(
                          (t: any) => t.medicineId === med.id && t.status === 'taken'
                        );
                        return (
                          <div key={`${idx}-${tidx}`} className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">{med.name}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{time}</Badge>
                              {isTaken ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <Clock className="h-4 w-4 text-yellow-500" />
                              )}
                            </div>
                          </div>
                        );
                      })
                    ))}
                    {patient.medicines?.length > 2 && (
                      <p className="text-xs text-gray-500 text-center">+{patient.medicines.length - 2} more</p>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full hover:bg-green-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCallPatient(patient.phone, patient.name);
                      }}
                    >
                      <Phone className="h-4 w-4 mr-1" />
                      Call
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full hover:bg-blue-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMessagePatient(patient);
                      }}
                    >
                      <MessageSquare className="h-4 w-4 mr-1" />
                      Message
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Patient Details Modal */}
        {selectedPatient && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <Card className="max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white">
                      {selectedPatient.name?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-2xl font-bold">{selectedPatient.name}</h2>
                    <p className="text-sm text-gray-600">{selectedPatient.email}</p>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Quick Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <p className="text-2xl font-bold text-blue-600">{selectedPatient.medicines?.length}</p>
                    <p className="text-xs text-gray-600">Medicines</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <p className="text-2xl font-bold text-green-600">{selectedPatient.stats.adherenceRate}%</p>
                    <p className="text-xs text-gray-600">Adherence</p>
                  </div>
                  <div className="text-center p-3 bg-yellow-50 rounded-lg">
                    <p className="text-2xl font-bold text-yellow-600">{selectedPatient.stats.missedToday}</p>
                    <p className="text-xs text-gray-600">Missed</p>
                  </div>
                </div>

                {/* Full Schedule */}
                <div>
                  <h3 className="font-semibold mb-2">Today's Full Schedule</h3>
                  <div className="space-y-2">
                    {selectedPatient.medicines?.map((med: any) => (
                      med.schedule?.map((time: string, idx: number) => {
                        const isTaken = selectedPatient.tracking?.some(
                          (t: any) => t.medicineId === med.id && t.status === 'taken'
                        );
                        return (
                          <div key={idx} className={`p-3 rounded-lg border ${
                            isTaken ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
                          }`}>
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="font-medium">{med.name}</p>
                                <p className="text-sm text-gray-600">{med.dosage}</p>
                              </div>
                              <div className="text-right">
                                <Badge variant="outline">{time}</Badge>
                                {isTaken ? (
                                  <CheckCircle className="h-4 w-4 text-green-600 mt-1" />
                                ) : (
                                  <Clock className="h-4 w-4 text-yellow-600 mt-1" />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ))}
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-2 gap-3 pt-4">
                  <Button 
                    className="w-full"
                    onClick={() => handleCallPatient(selectedPatient.phone, selectedPatient.name)}
                    disabled={!selectedPatient.phone}
                  >
                    <Phone className="mr-2 h-4 w-4" />
                    Call Now
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => handleMessagePatient(selectedPatient)}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Send Message
                  </Button>
                </div>

                <Button onClick={() => setSelectedPatient(null)} className="w-full mt-2">
                  Close
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Message Modal */}
        <Dialog open={showMessageModal} onOpenChange={setShowMessageModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {selectedPatient ? `Message to ${selectedPatient.name}` : 'Message to All Patients'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                placeholder="Type your message here..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                rows={4}
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowMessageModal(false)} className="flex-1">
                  Cancel
                </Button>
                <Button 
                  onClick={selectedPatient ? handleSendPatientMessage : handleSendMessage} 
                  className="flex-1"
                  disabled={!messageText.trim()}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Patient Modal */}
        <Dialog open={showAddPatientModal} onOpenChange={setShowAddPatientModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Patient</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Enter the email of the elderly person you want to care for.
              </p>
              <Input
                placeholder="patient@example.com"
                value={newPatientEmail}
                onChange={(e) => setNewPatientEmail(e.target.value)}
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowAddPatientModal(false)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleAddPatientSubmit} className="flex-1">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Patient
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default CaregiverApp;