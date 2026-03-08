// src/pages/CaregiverApp.tsx - UPDATED with role filtering
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getUserProfile, logOut } from '@/lib/firebase-auth';
import { db, auth } from '@/lib/firebase';
import { 
  collection, query, where, getDocs, doc, getDoc, addDoc, 
  updateDoc, onSnapshot, serverTimestamp, orderBy 
} from 'firebase/firestore';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ConnectionsPanel from '@/components/ConnectionsPanel';
import { 
  Users, Heart, Pill, Calendar, Bell, AlertCircle, 
  CheckCircle, XCircle, Clock, Phone, MessageSquare, 
  Search, UserPlus, Activity, Download, LogOut, Mail,
  UserCheck, UserX, X, RefreshCw
} from 'lucide-react';

interface Connection {
  id: string;
  users: string[];
  userEmails: string[];
  relationship: string;
  status: 'active' | 'inactive';
  createdAt: any;
}

interface Invitation {
  id: string;
  fromUserId: string;
  fromUserEmail: string;
  fromUserName: string;
  toUserId: string;
  toEmail: string;
  toUserName: string;
  relationship: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: any;
}

interface Notification {
  id: string;
  userId: string;
  type: string;
  fromUserId: string;
  fromUserName: string;
  message: string;
  read: boolean;
  createdAt: any;
}

interface Medicine {
  id: string;
  name: string;
  dosage: string;
  schedule: string[];
  instructions?: string;
  foodTiming?: string;
}

interface Tracking {
  medicineId: string;
  status: 'taken' | 'missed' | 'skipped';
  scheduledTime: string;
  date: string;
}

interface Patient {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  medicines?: Medicine[];
  tracking?: Tracking[];
  stats: {
    scheduledToday: number;
    takenToday: number;
    missedToday: number;
    nextDose?: {
      name: string;
      dosage: string;
      time: string;
    };
    adherenceRate: number;
  };
  lastActive?: string;
  riskLevel?: 'low' | 'medium' | 'high';
}

const CaregiverApp = () => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Connections state
  const [connections, setConnections] = useState<Connection[]>([]);
  const [invitations, setInvitations] = useState<{ received: Invitation[]; sent: Invitation[] }>({
    received: [],
    sent: []
  });
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const [stats, setStats] = useState({
    totalPatients: 0,
    totalMeds: 0,
    missedToday: 0,
    takenToday: 0,
    adherenceRate: 0,
    criticalAlerts: 0,
    highRiskPatients: 0
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

  // Real-time listeners for connections
  useEffect(() => {
    if (!user) return;

    const receivedQuery = query(
      collection(db, 'invitations'),
      where('toUserId', '==', user.uid),
      where('status', '==', 'pending')
    );
    
    const unsubscribeReceived = onSnapshot(receivedQuery, (snapshot) => {
      const received = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Invitation[];
      setInvitations(prev => ({ ...prev, received }));
    });

    const sentQuery = query(
      collection(db, 'invitations'),
      where('fromUserId', '==', user.uid),
      where('status', '==', 'pending')
    );
    
    const unsubscribeSent = onSnapshot(sentQuery, (snapshot) => {
      const sent = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Invitation[];
      setInvitations(prev => ({ ...prev, sent }));
    });

    const connectionsQuery = query(
      collection(db, 'connections'),
      where('users', 'array-contains', user.uid),
      where('status', '==', 'active')
    );
    
    const unsubscribeConnections = onSnapshot(connectionsQuery, (snapshot) => {
      const connectionsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Connection[];
      setConnections(connectionsData);
    });

    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      where('read', '==', false),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribeNotifications = onSnapshot(notificationsQuery, (snapshot) => {
      const notificationsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Notification[];
      setNotifications(notificationsData);
    });

    return () => {
      unsubscribeReceived();
      unsubscribeSent();
      unsubscribeConnections();
      unsubscribeNotifications();
    };
  }, [user]);

  useEffect(() => {
    if (user) {
      logUserAction('Page viewed', { page: 'CaregiverDashboard' });
    }
  }, [user]);

  const loadData = async () => {
    setRefreshing(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        navigate('/login');
        return;
      }
      setUser(currentUser);

      const userProfile = await getUserProfile(currentUser.uid);
      setProfile(userProfile);

      await logUserAction('Data loading started', { page: 'CaregiverDashboard' });

      // Get active connections where user is caregiver
      const connectionsRef = collection(db, 'connections');
      const connectionsQuery = query(
        connectionsRef,
        where('users', 'array-contains', currentUser.uid),
        where('status', '==', 'active')
      );
      const connectionsSnap = await getDocs(connectionsQuery);
      
      const patientsList: Patient[] = [];
      let totalScheduled = 0;
      let totalTaken = 0;
      let totalMissed = 0;
      let criticalCount = 0;
      let highRiskCount = 0;

      for (const connDoc of connectionsSnap.docs) {
        const connData = connDoc.data();
        const otherUserId = connData.users.find((id: string) => id !== currentUser.uid);
        if (!otherUserId) continue;

        // Get the other user's profile
        const otherUserRef = doc(db, 'users', otherUserId);
        const otherUserSnap = await getDoc(otherUserRef);
        const otherUserData = otherUserSnap.data();
        
        if (!otherUserData) continue;

        // 🔥 CRITICAL FIX: Only show elderly patients in caregiver dashboard
        if (otherUserData.role !== 'elderly') {
          console.log('Skipping non-elderly user:', otherUserData.email, 'role:', otherUserData.role);
          continue;
        }

        // Get patient's medicines
        const medicinesRef = collection(db, 'medicines');
        const medicinesQuery = query(medicinesRef, where('userId', '==', otherUserId));
        const medicinesSnap = await getDocs(medicinesQuery);
        const medicines: Medicine[] = [];
        medicinesSnap.forEach((doc) => {
          medicines.push({ id: doc.id, ...doc.data() } as Medicine);
        });

        // Get today's tracking
        const today = new Date().toISOString().split('T')[0];
        const trackingRef = collection(db, 'tracking');
        const trackingQuery = query(
          trackingRef,
          where('userId', '==', otherUserId),
          where('date', '==', today)
        );
        const trackingSnap = await getDocs(trackingQuery);
        const tracking: Tracking[] = [];
        trackingSnap.forEach((doc) => {
          tracking.push(doc.data() as Tracking);
        });

        // Calculate today's stats
        const scheduledToday = medicines.reduce((acc, med) => 
          acc + (med.schedule?.length || 0), 0);
        const takenToday = tracking.filter(t => t.status === 'taken').length;
        const missedToday = tracking.filter(t => t.status === 'missed').length;

        // Get next dose
        const now = new Date();
        const nextDose = medicines
          .flatMap(med => (med.schedule || []).map((time: string) => ({
            name: med.name,
            dosage: med.dosage,
            time
          })))
          .filter(item => {
            const [hours, minutes] = item.time.split(':');
            const doseTime = new Date();
            doseTime.setHours(parseInt(hours), parseInt(minutes), 0);
            return doseTime > now;
          })
          .sort((a, b) => a.time.localeCompare(b.time))[0];

        // Calculate 7-day adherence
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const weekTrackingQuery = query(
          trackingRef,
          where('userId', '==', otherUserId),
          where('timestamp', '>=', sevenDaysAgo.toISOString())
        );
        const weekTrackingSnap = await getDocs(weekTrackingQuery);
        
        let weekTotal = 0;
        let weekTaken = 0;
        weekTrackingSnap.forEach((doc) => {
          weekTotal++;
          if (doc.data().status === 'taken') weekTaken++;
        });
        
        const weekAdherence = weekTotal > 0 ? (weekTaken / weekTotal) * 100 : 100;
        
        // Determine risk level
        let riskLevel: 'low' | 'medium' | 'high' = 'low';
        if (missedToday > 2 || weekAdherence < 70) {
          riskLevel = 'high';
          highRiskCount++;
        } else if (missedToday > 0 || weekAdherence < 85) {
          riskLevel = 'medium';
        }

        patientsList.push({
          id: otherUserId,
          name: otherUserData.name,
          email: otherUserData.email,
          phone: otherUserData.phone,
          avatar: otherUserData.avatar,
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
          },
          lastActive: otherUserData.lastActive,
          riskLevel
        });

        totalScheduled += scheduledToday;
        totalTaken += takenToday;
        totalMissed += missedToday;
        if (missedToday > 0) criticalCount++;
      }

      setPatients(patientsList);
      setStats({
        totalPatients: patientsList.length,
        totalMeds: patientsList.reduce((acc, p) => acc + (p.medicines?.length || 0), 0),
        missedToday: totalMissed,
        takenToday: totalTaken,
        adherenceRate: totalScheduled > 0 ? Math.round((totalTaken / totalScheduled) * 100) : 0,
        criticalAlerts: criticalCount,
        highRiskPatients: highRiskCount
      });

      await logUserAction('Data loaded successfully', { 
        patientsCount: patientsList.length,
        criticalAlerts: criticalCount
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
      setRefreshing(false);
    }
  };

  const refreshData = () => {
    loadData();
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

  const handleViewPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setShowPatientModal(true);
    logUserAction('Viewed patient details', { patientId: patient.id });
  };

  const handleCallPatient = (phone?: string, name?: string) => {
    if (phone) {
      window.location.href = `tel:${phone}`;
      logUserAction('Called patient', { patientName: name });
    }
  };

  const getRiskBadge = (riskLevel?: string) => {
    switch(riskLevel) {
      case 'high':
        return <Badge className="bg-red-600">High Risk</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-600">Medium Risk</Badge>;
      default:
        return <Badge className="bg-green-600">Stable</Badge>;
    }
  };

  const filteredPatients = patients.filter(p => 
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
              {/* Refresh Button */}
              <Button 
                variant="ghost" 
                size="icon"
                onClick={refreshData}
                disabled={refreshing}
                className="text-gray-600 hover:text-gray-800 hover:bg-gray-100"
                title="Refresh data"
              >
                <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>

              {/* Connections Button */}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowConnections(!showConnections)}
                className="relative text-gray-600 hover:text-gray-800 hover:bg-gray-100"
                title="Manage Connections"
              >
                <Users className="h-5 w-5" />
                {(invitations.received.length > 0 || notifications.length > 0) && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">
                    {invitations.received.length + notifications.length}
                  </span>
                )}
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
              </div>
            </CardContent>
          </Card>
        )}

        {/* High Risk Banner */}
        {stats.highRiskPatients > 0 && (
          <Card className="border-orange-500 bg-orange-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-orange-600 animate-pulse" />
                <p className="text-orange-700 font-medium">
                  ⚠️ {stats.highRiskPatients} high-risk patient(s) require attention
                </p>
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
              <p className="text-sm text-blue-200 mt-1">Elderly Patients</p>
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

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <Input
            placeholder="Search elderly patients by name or email..."
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
              <h3 className="text-2xl font-bold text-gray-800 mb-3">No Elderly Patients Found</h3>
              <p className="text-gray-600 mb-8 text-lg">
                {searchTerm 
                  ? 'No patients match your search criteria' 
                  : 'You have no elderly patients connected yet'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPatients.map((patient) => (
              <Card 
                key={patient.id} 
                className={`hover:shadow-xl transition-all cursor-pointer border-2 hover:border-green-400 ${
                  patient.riskLevel === 'high' ? 'border-red-300 bg-red-50/30' :
                  patient.riskLevel === 'medium' ? 'border-yellow-300 bg-yellow-50/30' : ''
                }`}
                onClick={() => handleViewPatient(patient)}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-14 w-14">
                        <AvatarImage src={patient.avatar} />
                        <AvatarFallback className={`bg-gradient-to-r ${
                          patient.riskLevel === 'high' ? 'from-red-600 to-red-600' :
                          patient.riskLevel === 'medium' ? 'from-yellow-600 to-yellow-600' :
                          'from-green-600 to-emerald-600'
                        } text-white text-lg`}>
                          {patient.name?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-semibold text-xl text-gray-800">{patient.name}</h3>
                        <p className="text-sm text-gray-600">{patient.email}</p>
                        <Badge className="mt-1 bg-blue-600 text-xs">Elderly</Badge>
                      </div>
                    </div>
                    {getRiskBadge(patient.riskLevel)}
                  </div>

                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Today's Progress</span>
                      <span className="font-medium text-gray-800">
                        {patient.stats.takenToday}/{patient.stats.scheduledToday}
                      </span>
                    </div>
                    <Progress 
                      value={(patient.stats.takenToday / (patient.stats.scheduledToday || 1)) * 100} 
                      className={`h-2.5 ${
                        patient.stats.missedToday > 0 ? 'bg-red-200' : 'bg-gray-200'
                      }`} 
                    />
                  </div>

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
                      <p className="font-bold text-sm text-gray-800">
                        {patient.stats.nextDose?.time || '--:--'}
                      </p>
                    </div>
                  </div>

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
                        // Message functionality
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

      {/* Connections Panel Modal */}
      {showConnections && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10 bg-white hover:bg-gray-100 rounded-full"
              onClick={() => setShowConnections(false)}
            >
              <X className="h-4 w-4" />
            </Button>
            <ConnectionsPanel userRole="caregiver" />
          </div>
        </div>
      )}

      {/* Patient Details Modal */}
      <Dialog open={showPatientModal} onOpenChange={setShowPatientModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Elderly Patient Details</DialogTitle>
          </DialogHeader>
          {selectedPatient && (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-gradient-to-r from-green-600 to-emerald-600 text-white text-xl">
                    {selectedPatient.name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="text-2xl font-bold">{selectedPatient.name}</h2>
                  <p className="text-gray-600">{selectedPatient.email}</p>
                  <Badge className="mt-1 bg-blue-600">Elderly</Badge>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-blue-600">{selectedPatient.medicines?.length || 0}</p>
                    <p className="text-sm text-gray-600">Medicines</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-green-600">{selectedPatient.stats.adherenceRate}%</p>
                    <p className="text-sm text-gray-600">Adherence</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-yellow-600">{selectedPatient.stats.missedToday}</p>
                    <p className="text-sm text-gray-600">Missed Today</p>
                  </CardContent>
                </Card>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Contact Information</h3>
                <div className="space-y-2 bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-gray-500" />
                    <span>{selectedPatient.phone || 'No phone number'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-gray-500" />
                    <span>{selectedPatient.email}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button 
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={() => handleCallPatient(selectedPatient.phone, selectedPatient.name)}
                  disabled={!selectedPatient.phone}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Call
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setShowPatientModal(false)}
                >
                  Close
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