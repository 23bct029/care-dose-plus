import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getUserProfile, logOut } from '@/lib/firebase-auth';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { sendSignInLinkToEmail } from 'firebase/auth';
import { logger } from '@/lib/logger';
import { sendBrowserNotification } from '@/lib/notifications';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Users, Heart, Pill, Calendar, Bell, 
  AlertCircle, CheckCircle, XCircle, Clock,
  Phone, MessageSquare, Search, UserPlus,
  Activity, TrendingUp, Download, LogOut,
  Mail, Send, Info, Eye, MailPlus
} from 'lucide-react';

const CaregiverApp = () => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('elderly');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [showPatientModal, setShowPatientModal] = useState(false);
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

      // Get all connections for this caregiver
      const connectionsRef = collection(db, 'connections');
      const connectionsQuery = query(
        connectionsRef, 
        where('caregiverId', '==', currentUser.uid),
        where('status', '==', 'active')
      );
      const connectionsSnap = await getDocs(connectionsQuery);
      
      const patientsData = await Promise.all(
        connectionsSnap.docs.map(async (connDoc) => {
          const connData = connDoc.data();
          
          // Get patient profile (could be elderly or patient)
          const patientId = connData.elderlyId || connData.patientId;
          if (!patientId) return null;
          
          const patientRef = doc(db, 'users', patientId);
          const patientSnap = await getDoc(patientRef);
          const patientData = patientSnap.data();
          
          if (!patientData) return null;

          // Get today's medicines for this patient
          const medicinesRef = collection(db, 'medicines');
          const medicinesQuery = query(medicinesRef, where('userId', '==', patientId));
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
            where('userId', '==', patientId),
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
            id: patientId,
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

  // Send invitation via Firebase Email Link
  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) {
      setInviteError('Please enter an email address');
      return;
    }

    setInviteError('');
    setInviteSuccess('');
    setLoading(true);

    try {
      // Configure email link
      const actionCodeSettings = {
        url: `${window.location.origin}/accept-invite?email=${encodeURIComponent(inviteEmail)}&role=${inviteRole}`,
        handleCodeInApp: true,
      };

      // Send sign-in link to email
      await sendSignInLinkToEmail(auth, inviteEmail, actionCodeSettings);
      
      // Save the email locally to complete sign-in later
      window.localStorage.setItem('emailForSignIn', inviteEmail);
      
      // Create invite record in Firestore
      const inviteToken = Math.random().toString(36).substring(2, 15);
      const invitesRef = collection(db, 'invites');
      await addDoc(invitesRef, {
        fromId: user.uid,
        fromName: profile?.name,
        fromEmail: profile?.email,
        fromRole: profile?.role,
        toEmail: inviteEmail,
        toRole: inviteRole,
        token: inviteToken,
        status: 'pending',
        message: inviteMessage,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      });

      setInviteSuccess(`
        ✅ Invitation sent to ${inviteEmail}!
        
        They will receive an email with a secure link to create their account.
        When they sign up, they'll be automatically connected to you.
      `);

      // Log the action
      await logUserAction('Sent invitation', { 
        toEmail: inviteEmail, 
        toRole: inviteRole 
      });

      setInviteEmail('');
      setInviteMessage('');

    } catch (error: any) {
      console.error('Error sending invite:', error);
      setInviteError('Failed to send invitation: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Schedule appointment
  const handleSchedule = () => {
    navigate('/schedule');
  };

  // Message all patients
  const handleMessageAll = () => {
    if (patients.length === 0) {
      alert('No patients to message');
      return;
    }
    alert('Messaging feature coming soon!');
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
    alert(`Messaging ${patient.name} - feature coming soon!`);
  };

  const handleViewPatientDetails = (patient: any) => {
    setSelectedPatient(patient);
    setShowPatientModal(true);
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
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-green-600 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-lg text-gray-700">Loading caregiver dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14 border-2 border-green-500">
                <AvatarImage src={profile?.avatar} />
                <AvatarFallback className="bg-gradient-to-r from-green-600 to-emerald-600 text-white text-lg">
                  {profile?.name?.charAt(0) || 'C'}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Caregiver Dashboard</h1>
                <p className="text-sm text-gray-600">Welcome back, {profile?.name?.split(' ')[0] || 'Caregiver'}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="gap-2 border-green-300 text-green-700 hover:bg-green-50"
                onClick={handleExportReport}
              >
                <Download className="h-4 w-4" />
                Report
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleLogout}
                className="text-gray-600 hover:text-gray-800 hover:bg-gray-100"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-8">
        {/* Critical Alerts Banner */}
        {stats.criticalAlerts > 0 && (
          <Card className="border-red-500 bg-red-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 animate-pulse" />
                <p className="text-red-700 font-medium">
                  ⚠️ {stats.criticalAlerts} patient(s) need attention - missed doses detected
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="ml-auto border-red-300 text-red-700 hover:bg-red-100"
                >
                  View Alerts
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg">
            <CardContent className="p-5">
              <Users className="h-6 w-6 text-blue-200 mb-3" />
              <p className="text-3xl font-bold">{stats.totalPatients}</p>
              <p className="text-sm text-blue-200 mt-1">Total Patients</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-600 to-green-700 text-white shadow-lg">
            <CardContent className="p-5">
              <CheckCircle className="h-6 w-6 text-green-200 mb-3" />
              <p className="text-3xl font-bold">{stats.takenToday}</p>
              <p className="text-sm text-green-200 mt-1">Taken Today</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-600 to-red-700 text-white shadow-lg">
            <CardContent className="p-5">
              <XCircle className="h-6 w-6 text-red-200 mb-3" />
              <p className="text-3xl font-bold">{stats.missedToday}</p>
              <p className="text-sm text-red-200 mt-1">Missed Today</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-600 to-purple-700 text-white shadow-lg">
            <CardContent className="p-5">
              <Activity className="h-6 w-6 text-purple-200 mb-3" />
              <p className="text-3xl font-bold">{stats.adherenceRate}%</p>
              <p className="text-sm text-purple-200 mt-1">Adherence</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-600 to-orange-700 text-white shadow-lg">
            <CardContent className="p-5">
              <Bell className="h-6 w-6 text-orange-200 mb-3" />
              <p className="text-3xl font-bold">{stats.criticalAlerts}</p>
              <p className="text-sm text-orange-200 mt-1">Alerts</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-4">
          <Button 
            className="h-20 flex flex-col items-center justify-center bg-green-600 hover:bg-green-700 text-white shadow-md transition-all hover:shadow-lg"
            onClick={() => setShowInviteModal(true)}
          >
            <MailPlus className="h-6 w-6 mb-1" />
            <span className="text-sm font-medium">Invite Patient</span>
          </Button>
          <Button 
            className="h-20 flex flex-col items-center justify-center bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all hover:shadow-lg"
            onClick={handleSchedule}
          >
            <Calendar className="h-6 w-6 mb-1" />
            <span className="text-sm font-medium">Schedule</span>
          </Button>
          <Button 
            className="h-20 flex flex-col items-center justify-center bg-purple-600 hover:bg-purple-700 text-white shadow-md transition-all hover:shadow-lg"
            onClick={handleMessageAll}
            disabled={patients.length === 0}
          >
            <MessageSquare className="h-6 w-6 mb-1" />
            <span className="text-sm font-medium">Message All</span>
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <Input
            placeholder="Search patients by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-12 py-6 text-lg bg-white border-2 border-gray-200 focus:border-green-400 rounded-xl shadow-sm"
          />
        </div>

        {/* Patients Grid */}
        {filteredPatients.length === 0 ? (
          <Card className="bg-white border-2 border-dashed border-gray-300">
            <CardContent className="py-16 text-center">
              <div className="bg-green-50 rounded-full p-6 inline-block mb-6">
                <Heart className="h-16 w-16 text-green-500" />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-3">No Patients Found</h3>
              <p className="text-gray-600 mb-8 text-lg">
                {searchTerm 
                  ? 'No patients match your search criteria' 
                  : 'Get started by inviting your first patient'}
              </p>
              <Button 
                onClick={() => setShowInviteModal(true)}
                className="bg-green-600 hover:bg-green-700 text-white px-8 py-6 text-lg"
              >
                <UserPlus className="h-5 w-5 mr-2" />
                Invite Patient
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPatients.map((patient) => (
              <Card key={patient.id} className="hover:shadow-xl transition-all cursor-pointer border-2 hover:border-green-400" onClick={() => handleViewPatientDetails(patient)}>
                <CardContent className="p-6">
                  {/* Patient Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-14 w-14">
                        <AvatarFallback className="bg-gradient-to-r from-green-600 to-emerald-600 text-white text-lg">
                          {patient.name?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-semibold text-xl text-gray-800">{patient.name}</h3>
                        <p className="text-sm text-gray-600">{patient.email}</p>
                      </div>
                    </div>
                    <Badge variant={patient.stats.missedToday > 0 ? 'destructive' : 'secondary'} className="px-3 py-1">
                      {patient.stats.missedToday > 0 ? '⚠️ Alert' : '✅ Stable'}
                    </Badge>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Today's Progress</span>
                      <span className="font-medium text-gray-800">{patient.stats.takenToday}/{patient.stats.scheduledToday}</span>
                    </div>
                    <Progress 
                      value={(patient.stats.takenToday / (patient.stats.scheduledToday || 1)) * 100} 
                      className="h-2.5 bg-gray-200" 
                    />
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="text-center p-2 bg-blue-50 rounded-lg">
                      <Pill className="h-5 w-5 text-blue-600 mx-auto mb-1" />
                      <p className="text-xs text-gray-600">Meds</p>
                      <p className="font-bold text-gray-800">{patient.medicines?.length || 0}</p>
                    </div>
                    <div className="text-center p-2 bg-green-50 rounded-lg">
                      <CheckCircle className="h-5 w-5 text-green-600 mx-auto mb-1" />
                      <p className="text-xs text-gray-600">Taken</p>
                      <p className="font-bold text-gray-800">{patient.stats.takenToday}</p>
                    </div>
                    <div className="text-center p-2 bg-yellow-50 rounded-lg">
                      <Clock className="h-5 w-5 text-yellow-600 mx-auto mb-1" />
                      <p className="text-xs text-gray-600">Next</p>
                      <p className="font-bold text-sm text-gray-800">{patient.stats.nextDose?.time || '--:--'}</p>
                    </div>
                  </div>

                  {/* Today's Schedule Preview */}
                  <div className="space-y-2 mb-4 bg-gray-50 p-3 rounded-lg">
                    {patient.medicines?.slice(0, 2).map((med: any, idx: number) => (
                      med.schedule?.map((time: string, tidx: number) => {
                        const isTaken = patient.tracking?.some(
                          (t: any) => t.medicineId === med.id && t.status === 'taken'
                        );
                        return (
                          <div key={`${idx}-${tidx}`} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700 font-medium">{med.name}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs bg-white">{time}</Badge>
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
                      <p className="text-xs text-gray-500 text-center pt-1">+{patient.medicines.length - 2} more medicines</p>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <Button 
                      variant="outline" 
                      className="border-green-300 text-green-700 hover:bg-green-50 hover:border-green-500 py-5"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCallPatient(patient.phone, patient.name);
                      }}
                      disabled={!patient.phone}
                    >
                      <Phone className="h-4 w-4 mr-2" />
                      Call
                    </Button>
                    <Button 
                      variant="outline" 
                      className="border-blue-300 text-blue-700 hover:bg-blue-50 hover:border-blue-500 py-5"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMessagePatient(patient);
                      }}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Message
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Invite Patient Modal */}
      <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl text-gray-800 flex items-center gap-2">
              <MailPlus className="h-6 w-6 text-green-600" />
              Invite New Patient
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-4">
            <div className="space-y-2">
              <Label className="text-gray-700 text-sm font-medium">Email Address *</Label>
              <Input
                type="email"
                placeholder="patient@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="border-2 focus:border-green-500 py-5"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 text-sm font-medium">Role</Label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="w-full border-2 rounded-md px-3 py-3 text-gray-700 focus:border-green-500"
              >
                <option value="elderly">Elderly Patient</option>
                <option value="caregiver">Caregiver</option>
                <option value="doctor">Doctor</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 text-sm font-medium">Personal Message (Optional)</Label>
              <textarea
                placeholder="Add a personal message to your invitation..."
                value={inviteMessage}
                onChange={(e) => setInviteMessage(e.target.value)}
                rows={3}
                className="w-full border-2 rounded-md px-3 py-2 text-gray-700 focus:border-green-500"
              />
            </div>

            {inviteError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {inviteError}
              </div>
            )}

            {inviteSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm whitespace-pre-line">
                {inviteSuccess}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowInviteModal(false)}
                className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-50 py-5"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendInvite}
                disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-5"
              >
                {loading ? 'Sending...' : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Invitation
                  </>
                )}
              </Button>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-800 flex items-start gap-2">
                <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  An invitation email will be sent with a secure link. The recipient can click the link to create their account and will be automatically connected to you.
                </span>
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Patient Details Modal */}
      <Dialog open={showPatientModal} onOpenChange={setShowPatientModal}>
        <DialogContent className="max-w-2xl bg-white max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl text-gray-800">Patient Details</DialogTitle>
          </DialogHeader>
          {selectedPatient && (
            <div className="space-y-5 mt-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-gradient-to-r from-green-600 to-emerald-600 text-white text-xl">
                    {selectedPatient.name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">{selectedPatient.name}</h2>
                  <p className="text-gray-600">{selectedPatient.email}</p>
                </div>
              </div>

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
                <h3 className="font-semibold text-gray-800 mb-3 text-lg">Today's Full Schedule</h3>
                <div className="space-y-3">
                  {selectedPatient.medicines?.map((med: any) => (
                    med.schedule?.map((time: string, idx: number) => {
                      const isTaken = selectedPatient.tracking?.some(
                        (t: any) => t.medicineId === med.id && t.status === 'taken'
                      );
                      return (
                        <div key={idx} className={`p-4 rounded-lg border-2 ${
                          isTaken ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
                        }`}>
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-semibold text-gray-800">{med.name}</p>
                              <p className="text-sm text-gray-600">{med.dosage}</p>
                            </div>
                            <div className="text-right">
                              <Badge variant="outline" className="bg-white">{time}</Badge>
                              {isTaken ? (
                                <div className="flex items-center gap-1 text-green-600 mt-1">
                                  <CheckCircle className="h-4 w-4" />
                                  <span className="text-xs">Taken</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 text-yellow-600 mt-1">
                                  <Clock className="h-4 w-4" />
                                  <span className="text-xs">Pending</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ))}
                </div>
              </div>

              {/* Contact Info */}
              <div>
                <h3 className="font-semibold text-gray-800 mb-3 text-lg">Contact Information</h3>
                <div className="space-y-2 bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 text-gray-700">
                    <Phone className="h-4 w-4 text-gray-500" />
                    <span>{selectedPatient.phone || 'No phone number'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-700">
                    <Mail className="h-4 w-4 text-gray-500" />
                    <span>{selectedPatient.email}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-4">
                <Button 
                  className="bg-green-600 hover:bg-green-700 text-white py-6"
                  onClick={() => {
                    handleCallPatient(selectedPatient.phone, selectedPatient.name);
                    setShowPatientModal(false);
                  }}
                  disabled={!selectedPatient.phone}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Call Now
                </Button>
                <Button 
                  variant="outline" 
                  className="border-blue-300 text-blue-700 hover:bg-blue-50 py-6"
                  onClick={() => {
                    handleMessagePatient(selectedPatient);
                    setShowPatientModal(false);
                  }}
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Send Message
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CaregiverApp;