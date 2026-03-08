// src/pages/DoctorApp.tsx - COMPLETE FIXED with connections
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getUserProfile, logOut } from '@/lib/firebase-auth';
import { db, auth } from '@/lib/firebase';
import { 
  collection, query, where, getDocs, doc, getDoc, addDoc, 
  updateDoc, onSnapshot, serverTimestamp, orderBy, deleteDoc, 
  limit
} from 'firebase/firestore';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ConnectionsPanel from '@/components/ConnectionsPanel';
import { 
  Stethoscope, Users, Calendar, Pill, Clock, Phone, Mail,
  MessageSquare, Search, UserPlus, Activity, Download, LogOut,
  Bell, AlertCircle, CheckCircle, XCircle, UserCheck, UserX,
  FileText, Heart, Plus, X, RefreshCw, Filter, ChevronRight,
  Info, Edit, Trash2, Eye
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

interface Patient {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  age?: number;
  gender?: string;
  bloodGroup?: string;
  allergies?: string[];
  conditions?: string[];
  latestPrescription?: any;
  lastVisit?: string;
  riskLevel?: 'low' | 'medium' | 'high';
}

interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  patientEmail?: string;
  date: string;
  time: string;
  duration?: number;
  type?: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
  notes?: string;
  createdAt: any;
}

interface Prescription {
  id: string;
  patientId: string;
  patientName: string;
  medicine: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
  refills?: number;
  status: 'active' | 'completed' | 'cancelled';
  createdAt: any;
  prescribedBy: string;
}

interface Emergency {
  id: string;
  userId: string;
  userName: string;
  type: string;
  description?: string;
  status: 'active' | 'resolved' | 'false_alarm';
  timestamp: any;
  resolvedAt?: any;
  resolvedBy?: string;
}

const DoctorApp = () => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [activeTab, setActiveTab] = useState('patients');
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month'>('week');

  // Prescription form state
  const [prescriptionForm, setPrescriptionForm] = useState({
    medicine: '',
    dosage: '',
    frequency: 'daily',
    duration: '',
    instructions: '',
    refills: 0
  });

  // Connections state
  const [connections, setConnections] = useState<Connection[]>([]);
  const [invitations, setInvitations] = useState<{ received: Invitation[]; sent: Invitation[] }>({
    received: [],
    sent: []
  });
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connectionsError, setConnectionsError] = useState('');
  const [connectionsSuccess, setConnectionsSuccess] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('patient');

  const [stats, setStats] = useState({
    totalPatients: 0,
    todayAppointments: 0,
    activePrescriptions: 0,
    emergencyAlerts: 0,
    completedToday: 0,
    highRiskPatients: 0
  });

  const navigate = useNavigate();

  // Logger function with safe handling
  const logUserAction = async (action: string, details?: any) => {
    if (user && user.uid && user.email) {
      await logger.logWithUser(
        user.uid, 
        user.email, 
        'info', 
        action, 
        details || {}
      );
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Real-time listeners for connections
  useEffect(() => {
    if (!user) return;

    console.log('Setting up real-time listeners for doctor:', user.uid);

    // Listen to received invitations
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
      console.log('Received invitations:', received);
      setInvitations(prev => ({ ...prev, received }));
    });

    // Listen to sent invitations
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
      console.log('Sent invitations:', sent);
      setInvitations(prev => ({ ...prev, sent }));
    });

    // Listen to active connections
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
      console.log('Active connections:', connectionsData);
      setConnections(connectionsData);
      
      // Update patients list from connections
      const fetchPatientsFromConnections = async () => {
        const patientsList: Patient[] = [];
        
        for (const conn of connectionsData) {
          // Only get connections where relationship indicates patient
          if (conn.relationship === 'doctor-patient' || conn.relationship.includes('patient')) {
            const patientId = conn.users.find(id => id !== user.uid);
            const patientEmail = conn.userEmails.find(email => email !== user.email);
            
            if (patientId && patientEmail) {
              try {
                const patientRef = doc(db, 'users', patientId);
                const patientSnap = await getDoc(patientRef);
                const patientData = patientSnap.data();
                
                if (patientData) {
                  // Get latest prescription
                  const prescriptionsRef = collection(db, 'prescriptions');
                  const prescriptionsQuery = query(
                    prescriptionsRef,
                    where('patientId', '==', patientId),
                    where('doctorId', '==', user.uid),
                    orderBy('createdAt', 'desc'),
                    limit(1)
                  );
                  const prescriptionsSnap = await getDocs(prescriptionsQuery);
                  const latestPrescription = prescriptionsSnap.docs[0]?.data();

                  patientsList.push({
                    id: patientId,
                    name: patientData.name || patientEmail.split('@')[0],
                    email: patientEmail,
                    phone: patientData.phone,
                    avatar: patientData.avatar,
                    age: patientData.age,
                    gender: patientData.gender,
                    bloodGroup: patientData.bloodGroup,
                    allergies: patientData.allergies || [],
                    conditions: patientData.conditions || [],
                    latestPrescription,
                    lastVisit: patientData.lastVisit,
                    riskLevel: patientData.riskLevel || 'low'
                  });
                }
              } catch (error) {
                console.error('Error fetching patient profile:', error);
              }
            }
          }
        }
        
        setPatients(patientsList);
        setFilteredPatients(patientsList);
        
        // Update stats
        setStats(prev => ({
          ...prev,
          totalPatients: patientsList.length,
          highRiskPatients: patientsList.filter(p => p.riskLevel === 'high').length
        }));
      };
      
      fetchPatientsFromConnections();
    });

    // Listen to notifications
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
      logUserAction('Page viewed', { page: 'DoctorDashboard' });
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

      await logUserAction('Data loading started', { page: 'DoctorDashboard' });

      // Get today's appointments
      const today = new Date().toISOString().split('T')[0];
      const appointmentsRef = collection(db, 'appointments');
      const appointmentsQuery = query(
        appointmentsRef,
        where('doctorId', '==', currentUser.uid),
        where('date', '==', today),
        orderBy('time', 'asc')
      );
      const appointmentsSnap = await getDocs(appointmentsQuery);
      const appointmentsData: Appointment[] = [];
      appointmentsSnap.forEach((doc) => {
        appointmentsData.push({ id: doc.id, ...doc.data() } as Appointment);
      });
      setAppointments(appointmentsData);

      // Get active prescriptions
      const allPrescriptionsRef = collection(db, 'prescriptions');
      const allPrescriptionsQuery = query(
        allPrescriptionsRef,
        where('doctorId', '==', currentUser.uid),
        where('status', '==', 'active'),
        orderBy('createdAt', 'desc')
      );
      const prescriptionsSnap = await getDocs(allPrescriptionsQuery);
      const prescriptionsData: Prescription[] = [];
      prescriptionsSnap.forEach((doc) => {
        prescriptionsData.push({ id: doc.id, ...doc.data() } as Prescription);
      });
      setPrescriptions(prescriptionsData);

      // Get emergencies
      const emergenciesRef = collection(db, 'emergencies');
      const emergenciesQuery = query(
        emergenciesRef,
        where('status', '==', 'active'),
        orderBy('timestamp', 'desc')
      );
      const emergenciesSnap = await getDocs(emergenciesQuery);
      const emergenciesData: Emergency[] = [];
      emergenciesSnap.forEach((doc) => {
        emergenciesData.push({ id: doc.id, ...doc.data() } as Emergency);
      });
      setEmergencies(emergenciesData);

      setStats(prev => ({
        ...prev,
        todayAppointments: appointmentsData.length,
        activePrescriptions: prescriptionsData.length,
        emergencyAlerts: emergenciesData.length,
        completedToday: appointmentsData.filter(a => a.status === 'completed').length
      }));

      await logUserAction('Data loaded successfully', { 
        appointmentsCount: appointmentsData.length,
        emergenciesCount: emergenciesData.length
      });

    } catch (error: any) {
      console.error('Error loading data:', error);
      await logger.error('Failed to load doctor data', { 
        userId: user?.uid,
        error: error.message 
      });
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
      await logUserAction('User logged out', {});
      await logOut();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Connection Handlers
  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnectionsError('');
    setConnectionsSuccess('');
    setConnectionsLoading(true);

    try {
      if (!user) throw new Error('You must be logged in');

      const usersQuery = query(
        collection(db, 'users'),
        where('email', '==', inviteEmail)
      );
      const usersSnapshot = await getDocs(usersQuery);
      
      if (usersSnapshot.empty) {
        throw new Error('User with this email not found');
      }

      const targetUser = usersSnapshot.docs[0];
      const targetUserId = targetUser.id;
      const targetUserData = targetUser.data();

      const existingConnection = connections.find(conn => 
        conn.users.includes(targetUserId)
      );
      
      if (existingConnection) {
        throw new Error('Already connected with this user');
      }

      const existingInvite = invitations.sent.find(inv => 
        inv.toUserId === targetUserId
      );
      
      if (existingInvite) {
        throw new Error('Invitation already sent to this user');
      }

      await addDoc(collection(db, 'invitations'), {
        fromUserId: user.uid,
        fromUserEmail: user.email,
        fromUserName: `Dr. ${profile?.name || user.email}`,
        toUserId: targetUserId,
        toEmail: inviteEmail,
        toUserName: targetUserData.name || inviteEmail,
        relationship: 'doctor-patient',
        status: 'pending',
        createdAt: serverTimestamp()
      });

      await addDoc(collection(db, 'notifications'), {
        userId: targetUserId,
        type: 'invitation',
        fromUserId: user.uid,
        fromUserName: `Dr. ${profile?.name || user.email}`,
        message: `Dr. ${profile?.name || user.email} wants to connect with you`,
        read: false,
        createdAt: serverTimestamp()
      });

      setConnectionsSuccess(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');

      await logUserAction('Sent invitation', { 
        toEmail: inviteEmail || null,
        toRole: inviteRole || 'patient' 
      });

    } catch (err: any) {
      setConnectionsError(err.message);
    } finally {
      setConnectionsLoading(false);
    }
  };

  const handleAcceptInvitation = async (invitationId: string) => {
    try {
      const invitationRef = doc(db, 'invitations', invitationId);
      await updateDoc(invitationRef, {
        status: 'accepted',
        acceptedAt: serverTimestamp()
      });

      const invitation = invitations.received.find(i => i.id === invitationId);
      
      if (invitation) {
        await addDoc(collection(db, 'connections'), {
          users: [invitation.fromUserId, invitation.toUserId],
          userEmails: [invitation.fromUserEmail, invitation.toEmail],
          relationship: invitation.relationship,
          status: 'active',
          createdAt: serverTimestamp(),
          initiatedBy: invitation.fromUserId
        });

        await addDoc(collection(db, 'notifications'), {
          userId: invitation.fromUserId,
          type: 'invitation_accepted',
          fromUserId: user?.uid,
          fromUserName: `Dr. ${profile?.name || user?.email}`,
          message: `Dr. ${profile?.name || user?.email} accepted your connection request`,
          read: false,
          createdAt: serverTimestamp()
        });
      }

      setConnectionsSuccess('Invitation accepted!');
      await logUserAction('Invitation accepted', { invitationId });
    } catch (err: any) {
      setConnectionsError(err.message);
    }
  };

  const handleRejectInvitation = async (invitationId: string) => {
    try {
      const invitationRef = doc(db, 'invitations', invitationId);
      await updateDoc(invitationRef, {
        status: 'rejected',
        rejectedAt: serverTimestamp()
      });
      setConnectionsSuccess('Invitation rejected');
      await logUserAction('Invitation rejected', { invitationId });
    } catch (err: any) {
      setConnectionsError(err.message);
    }
  };

  const handleMarkNotificationRead = async (notificationId: string) => {
    try {
      const notificationRef = doc(db, 'notifications', notificationId);
      await updateDoc(notificationRef, { read: true });
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const handleViewPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setShowPatientModal(true);
    logUserAction('Viewed patient details', { patientId: patient.id });
  };

  const handleNewPrescription = (patient: Patient) => {
    setSelectedPatient(patient);
    setPrescriptionForm({
      medicine: '',
      dosage: '',
      frequency: 'daily',
      duration: '',
      instructions: '',
      refills: 0
    });
    setShowPrescriptionModal(true);
  };

  const handleSubmitPrescription = async () => {
    if (!selectedPatient || !prescriptionForm.medicine || !prescriptionForm.dosage) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const prescriptionRef = collection(db, 'prescriptions');
      await addDoc(prescriptionRef, {
        patientId: selectedPatient.id,
        patientName: selectedPatient.name,
        doctorId: user.uid,
        doctorName: profile?.name,
        ...prescriptionForm,
        status: 'active',
        createdAt: serverTimestamp()
      });

      // Create notification for patient
      const notificationsRef = collection(db, 'notifications');
      await addDoc(notificationsRef, {
        userId: selectedPatient.id,
        type: 'prescription',
        title: 'New Prescription',
        message: `Dr. ${profile?.name} prescribed ${prescriptionForm.medicine} ${prescriptionForm.dosage}`,
        read: false,
        createdAt: serverTimestamp()
      });

      setShowPrescriptionModal(false);
      await logUserAction('Prescription created', { 
        patientId: selectedPatient.id,
        medicine: prescriptionForm.medicine 
      });
      await loadData();
    } catch (error) {
      console.error('Error creating prescription:', error);
    }
  };

  const handleResolveEmergency = async (emergencyId: string) => {
    try {
      const emergencyRef = doc(db, 'emergencies', emergencyId);
      await updateDoc(emergencyRef, {
        status: 'resolved',
        resolvedAt: serverTimestamp(),
        resolvedBy: user?.uid
      });
      
      setEmergencies(emergencies.map(e => 
        e.id === emergencyId ? { ...e, status: 'resolved' } : e
      ));
      
      await logUserAction('Emergency resolved', { emergencyId });
    } catch (error) {
      console.error('Error resolving emergency:', error);
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
        riskLevel: p.riskLevel,
        lastVisit: p.lastVisit
      })),
      appointments: appointments,
      emergencies: emergencies
    };

    const dataStr = JSON.stringify(report, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', `doctor-report-${new Date().toISOString().split('T')[0]}.json`);
    linkElement.click();

    logUserAction('Report exported', {});
  };

  const getOtherUser = (connection: Connection) => {
    const otherUserId = connection.users.find(id => id !== user?.uid);
    const otherEmail = connection.userEmails.find(email => email !== user?.email);
    return { id: otherUserId, email: otherEmail };
  };

  const getRiskBadge = (riskLevel?: string) => {
    switch(riskLevel) {
      case 'high':
        return <Badge className="bg-red-900/80 text-red-100 border border-red-700/50">High Risk</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-900/80 text-yellow-100 border border-yellow-700/50">Medium Risk</Badge>;
      default:
        return <Badge className="bg-green-900/80 text-green-100 border border-green-700/50">Stable</Badge>;
    }
  };

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredPatients(patients);
    } else {
      const term = searchTerm.toLowerCase();
      const filtered = patients.filter(p => 
        p.name?.toLowerCase().includes(term) || 
        p.email?.toLowerCase().includes(term)
      );
      setFilteredPatients(filtered);
    }
  }, [searchTerm, patients]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-500/30 border-t-indigo-400 mx-auto"></div>
          <p className="mt-4 text-lg text-slate-300">Loading doctor dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Emergency Banner */}
      {emergencies.length > 0 && (
        <div className="bg-rose-900/80 text-white py-3 px-4 fixed top-0 left-0 right-0 z-50 animate-pulse backdrop-blur-sm border-b border-rose-700/50">
          <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-rose-200" />
              <span className="font-bold">{emergencies.length} ACTIVE EMERGENCY ALERTS</span>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              className="bg-transparent border-rose-300 text-rose-100 hover:bg-rose-800/50"
              onClick={() => setActiveTab('emergencies')}
            >
              View Alerts
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={`bg-slate-900/80 backdrop-blur-md border-b border-slate-800/50 sticky top-0 z-40 shadow-sm ${emergencies.length > 0 ? 'mt-12' : ''}`}>
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14 border-2 border-indigo-500/30">
                <AvatarImage src={profile?.avatar} />
                <AvatarFallback className="bg-gradient-to-br from-indigo-900/80 to-purple-900/80 text-indigo-100 text-lg">
                  {profile?.name?.charAt(0) || 'D'}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-2xl font-bold text-slate-100">Dr. {profile?.name}</h1>
                <p className="text-sm text-slate-400">Doctor Dashboard</p>
              </div>
            </div>

            <div className="flex gap-3">
              {/* Refresh Button */}
              <Button 
                variant="ghost" 
                size="icon"
                onClick={refreshData}
                disabled={refreshing}
                className="text-slate-400 hover:text-white hover:bg-slate-800"
                title="Refresh data"
              >
                <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>

              {/* Connections Button */}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowConnections(!showConnections)}
                className="relative text-slate-400 hover:text-white hover:bg-slate-800"
                title="Manage Connections"
              >
                <Users className="h-5 w-5" />
                {(invitations.received.length > 0 || notifications.length > 0) && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 bg-rose-600 rounded-full text-[10px] text-white flex items-center justify-center animate-pulse">
                    {invitations.received.length + notifications.length}
                  </span>
                )}
              </Button>

              <Button 
                variant="outline" 
                className="gap-2 border-indigo-700/50 text-indigo-300 hover:bg-indigo-900/60 hover:text-white"
                onClick={handleExportReport}
              >
                <Download className="h-4 w-4" />
                Report
              </Button>

              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleLogout}
                className="text-slate-400 hover:text-rose-300 hover:bg-rose-900/30"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 text-white border-0 shadow-xl backdrop-blur-sm border border-slate-700/30">
            <CardContent className="p-5 text-center">
              <Users className="h-6 w-6 text-blue-400/80 mx-auto mb-3" />
              <p className="text-3xl font-bold text-slate-100">{stats.totalPatients}</p>
              <p className="text-sm text-blue-300/70 mt-1">Total Patients</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 text-white border-0 shadow-xl backdrop-blur-sm border border-slate-700/30">
            <CardContent className="p-5 text-center">
              <Calendar className="h-6 w-6 text-emerald-400/80 mx-auto mb-3" />
              <p className="text-3xl font-bold text-slate-100">{stats.todayAppointments}</p>
              <p className="text-sm text-emerald-300/70 mt-1">Today's Apps</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 text-white border-0 shadow-xl backdrop-blur-sm border border-slate-700/30">
            <CardContent className="p-5 text-center">
              <CheckCircle className="h-6 w-6 text-teal-400/80 mx-auto mb-3" />
              <p className="text-3xl font-bold text-slate-100">{stats.completedToday}</p>
              <p className="text-sm text-teal-300/70 mt-1">Completed</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 text-white border-0 shadow-xl backdrop-blur-sm border border-slate-700/30">
            <CardContent className="p-5 text-center">
              <Pill className="h-6 w-6 text-purple-400/80 mx-auto mb-3" />
              <p className="text-3xl font-bold text-slate-100">{stats.activePrescriptions}</p>
              <p className="text-sm text-purple-300/70 mt-1">Active Rx</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 text-white border-0 shadow-xl backdrop-blur-sm border border-slate-700/30">
            <CardContent className="p-5 text-center">
              <AlertCircle className="h-6 w-6 text-amber-400/80 mx-auto mb-3" />
              <p className="text-3xl font-bold text-slate-100">{stats.highRiskPatients}</p>
              <p className="text-sm text-amber-300/70 mt-1">High Risk</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 text-white border-0 shadow-xl backdrop-blur-sm border border-slate-700/30">
            <CardContent className="p-5 text-center">
              <Bell className="h-6 w-6 text-rose-400/80 mx-auto mb-3" />
              <p className="text-3xl font-bold text-slate-100">{stats.emergencyAlerts}</p>
              <p className="text-sm text-rose-300/70 mt-1">Emergencies</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-slate-800/50 border border-slate-700/50 p-1 rounded-lg w-full flex h-14">
            <TabsTrigger value="patients" className="text-slate-400 data-[state=active]:bg-indigo-900/60 data-[state=active]:text-indigo-100 flex-1 rounded-md text-sm font-medium transition-all h-full flex items-center justify-center">
              <Users className="h-4 w-4 mr-2" />
              Patients ({patients.length})
            </TabsTrigger>
            <TabsTrigger value="appointments" className="text-slate-400 data-[state=active]:bg-indigo-900/60 data-[state=active]:text-indigo-100 flex-1 rounded-md text-sm font-medium transition-all h-full flex items-center justify-center">
              <Calendar className="h-4 w-4 mr-2" />
              Appointments ({appointments.length})
            </TabsTrigger>
            <TabsTrigger value="prescriptions" className="text-slate-400 data-[state=active]:bg-indigo-900/60 data-[state=active]:text-indigo-100 flex-1 rounded-md text-sm font-medium transition-all h-full flex items-center justify-center">
              <Pill className="h-4 w-4 mr-2" />
              Prescriptions ({prescriptions.length})
            </TabsTrigger>
            <TabsTrigger value="emergencies" className="text-slate-400 data-[state=active]:bg-indigo-900/60 data-[state=active]:text-indigo-100 flex-1 rounded-md text-sm font-medium transition-all h-full flex items-center justify-center relative">
              <Bell className="h-4 w-4 mr-2" />
              Emergencies
              {emergencies.length > 0 && (
                <Badge className="ml-2 bg-rose-900/80 text-rose-100 border border-rose-700/50">
                  {emergencies.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Patients Tab */}
          <TabsContent value="patients">
            <Card className="bg-slate-900/50 backdrop-blur-sm border border-slate-800/50 shadow-xl">
              <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <CardTitle className="text-slate-100 text-2xl flex items-center gap-2">
                    <Users className="h-6 w-6 text-indigo-400/80" />
                    My Patients
                  </CardTitle>
                  <div className="flex gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-initial">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input
                        placeholder="Search patients..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 bg-slate-800/50 border-slate-700 text-slate-200 placeholder:text-slate-500 w-full sm:w-64"
                      />
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={() => setShowConnections(true)}
                      className="border-indigo-700/50 text-indigo-300 hover:bg-indigo-900/60 hover:text-white"
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Patient
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredPatients.length === 0 ? (
                  <div className="text-center py-12">
                    <Heart className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">No patients found</p>
                    <Button 
                      variant="link" 
                      onClick={() => setShowConnections(true)}
                      className="mt-2 text-indigo-400"
                    >
                      Add your first patient
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredPatients.map((patient) => (
                      <Card key={patient.id} className="bg-slate-800/30 hover:bg-slate-800/40 transition-all cursor-pointer border border-slate-700/50 hover:border-indigo-700/50">
                        <CardContent className="p-6" onClick={() => handleViewPatient(patient)}>
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-14 w-14">
                                <AvatarImage src={patient.avatar} />
                                <AvatarFallback className={`bg-gradient-to-br ${
                                  patient.riskLevel === 'high' ? 'from-rose-900/80 to-rose-800/80' :
                                  patient.riskLevel === 'medium' ? 'from-amber-900/80 to-amber-800/80' :
                                  'from-emerald-900/80 to-emerald-800/80'
                                } text-white text-lg`}>
                                  {patient.name?.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <h3 className="font-semibold text-xl text-slate-100">{patient.name}</h3>
                                <p className="text-sm text-slate-400">{patient.email}</p>
                              </div>
                            </div>
                            {getRiskBadge(patient.riskLevel)}
                          </div>

                          {patient.latestPrescription && (
                            <div className="mt-3 p-3 bg-indigo-900/30 rounded-lg border border-indigo-700/30">
                              <p className="text-xs text-indigo-300 font-medium">Latest Prescription</p>
                              <p className="text-sm font-medium text-indigo-100">
                                {patient.latestPrescription.medicine} {patient.latestPrescription.dosage}
                              </p>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-3 mt-4">
                            <Button 
                              variant="outline" 
                              className="border-indigo-700/50 text-indigo-300 hover:bg-indigo-900/60 hover:text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewPatient(patient);
                              }}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </Button>
                            <Button 
                              variant="outline" 
                              className="border-emerald-700/50 text-emerald-300 hover:bg-emerald-900/60 hover:text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleNewPrescription(patient);
                              }}
                            >
                              <Pill className="h-4 w-4 mr-2" />
                              Prescribe
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

          {/* Appointments Tab */}
          <TabsContent value="appointments">
            <Card className="bg-slate-900/50 backdrop-blur-sm border border-slate-800/50 shadow-xl">
              <CardHeader>
                <CardTitle className="text-slate-100 text-2xl flex items-center gap-2">
                  <Calendar className="h-6 w-6 text-indigo-400/80" />
                  Today's Appointments
                </CardTitle>
              </CardHeader>
              <CardContent>
                {appointments.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">No appointments scheduled for today</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {appointments.map((apt) => (
                      <div key={apt.id} className="flex items-center justify-between p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 hover:bg-slate-800/40 transition-all">
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-indigo-900/30 rounded-full">
                            <Clock className="h-5 w-5 text-indigo-300" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-100">{apt.patientName}</p>
                            <p className="text-sm text-slate-400">{apt.time} • {apt.type || 'Checkup'}</p>
                          </div>
                        </div>
                        <Badge className={
                          apt.status === 'completed' ? 'bg-emerald-900/80 text-emerald-100 border border-emerald-700/50' :
                          apt.status === 'cancelled' ? 'bg-rose-900/80 text-rose-100 border border-rose-700/50' :
                          'bg-blue-900/80 text-blue-100 border border-blue-700/50'
                        }>
                          {apt.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Prescriptions Tab */}
          <TabsContent value="prescriptions">
            <Card className="bg-slate-900/50 backdrop-blur-sm border border-slate-800/50 shadow-xl">
              <CardHeader>
                <CardTitle className="text-slate-100 text-2xl flex items-center gap-2">
                  <Pill className="h-6 w-6 text-indigo-400/80" />
                  Active Prescriptions
                </CardTitle>
              </CardHeader>
              <CardContent>
                {prescriptions.length === 0 ? (
                  <div className="text-center py-8">
                    <Pill className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">No active prescriptions</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {prescriptions.map((rx) => (
                      <div key={rx.id} className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 hover:bg-slate-800/40 transition-all">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold text-slate-100">{rx.medicine} {rx.dosage}</p>
                            <p className="text-sm text-slate-400">for {rx.patientName}</p>
                            <p className="text-xs text-slate-500 mt-1">{rx.frequency} • {rx.duration}</p>
                          </div>
                          <Badge className="bg-emerald-900/80 text-emerald-100 border border-emerald-700/50">Active</Badge>
                        </div>
                        {rx.instructions && (
                          <p className="text-xs text-slate-400 mt-2 italic">"{rx.instructions}"</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Emergencies Tab */}
          <TabsContent value="emergencies">
            <Card className="bg-slate-900/50 backdrop-blur-sm border border-slate-800/50 shadow-xl">
              <CardHeader>
                <CardTitle className="text-slate-100 text-2xl flex items-center gap-2">
                  <Bell className="h-6 w-6 text-rose-400/80" />
                  Emergency Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                {emergencies.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 text-emerald-600 mx-auto mb-4" />
                    <p className="text-slate-400">No active emergencies</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {emergencies.map((emergency) => (
                      <div key={emergency.id} className="p-4 bg-rose-900/20 rounded-xl border border-rose-700/50">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-rose-300 mt-1" />
                            <div>
                              <p className="font-semibold text-rose-100">{emergency.userName}</p>
                              <p className="text-sm text-rose-200/80">Type: {emergency.type}</p>
                              {emergency.description && (
                                <p className="text-xs text-rose-200/60 mt-1">{emergency.description}</p>
                              )}
                              <p className="text-xs text-slate-400 mt-2">
                                {new Date(emergency.timestamp).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            className="bg-emerald-900/60 hover:bg-emerald-800/60 text-emerald-100 border border-emerald-700/30"
                            onClick={() => handleResolveEmergency(emergency.id)}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Resolve
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Connections Panel Modal */}
      {showConnections && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10 bg-slate-800 hover:bg-slate-700 text-white rounded-full shadow-lg"
              onClick={() => setShowConnections(false)}
            >
              <X className="h-4 w-4" />
            </Button>
            <ConnectionsPanel userRole="doctor" />
          </div>
        </div>
      )}

      {/* Patient Details Modal */}
      <Dialog open={showPatientModal} onOpenChange={setShowPatientModal}>
        <DialogContent className="bg-slate-900 text-white border-slate-800 max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl" aria-describedby="patient-details-description">
          <DialogHeader>
            <DialogTitle className="text-slate-100 text-2xl">Patient Details</DialogTitle>
          </DialogHeader>
          <div id="patient-details-description" className="sr-only">
            Detailed information about the selected patient
          </div>
          {selectedPatient && (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className={`bg-gradient-to-br ${
                    selectedPatient.riskLevel === 'high' ? 'from-rose-900/80 to-rose-800/80' :
                    selectedPatient.riskLevel === 'medium' ? 'from-amber-900/80 to-amber-800/80' :
                    'from-emerald-900/80 to-emerald-800/80'
                  } text-white text-xl`}>
                    {selectedPatient.name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="text-2xl font-bold text-slate-100">{selectedPatient.name}</h2>
                  <p className="text-slate-400">{selectedPatient.email}</p>
                  {getRiskBadge(selectedPatient.riskLevel)}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {selectedPatient.age && (
                  <Card className="bg-slate-800/30 border border-slate-700/50">
                    <CardContent className="p-3 text-center">
                      <p className="text-sm text-slate-400">Age</p>
                      <p className="text-xl font-bold text-slate-100">{selectedPatient.age}</p>
                    </CardContent>
                  </Card>
                )}
                {selectedPatient.gender && (
                  <Card className="bg-slate-800/30 border border-slate-700/50">
                    <CardContent className="p-3 text-center">
                      <p className="text-sm text-slate-400">Gender</p>
                      <p className="text-xl font-bold text-slate-100">{selectedPatient.gender}</p>
                    </CardContent>
                  </Card>
                )}
                {selectedPatient.bloodGroup && (
                  <Card className="bg-slate-800/30 border border-slate-700/50">
                    <CardContent className="p-3 text-center">
                      <p className="text-sm text-slate-400">Blood Group</p>
                      <p className="text-xl font-bold text-slate-100">{selectedPatient.bloodGroup}</p>
                    </CardContent>
                  </Card>
                )}
                {selectedPatient.lastVisit && (
                  <Card className="bg-slate-800/30 border border-slate-700/50">
                    <CardContent className="p-3 text-center">
                      <p className="text-sm text-slate-400">Last Visit</p>
                      <p className="text-xl font-bold text-slate-100">{new Date(selectedPatient.lastVisit).toLocaleDateString()}</p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {selectedPatient.allergies && selectedPatient.allergies.length > 0 && (
                <div>
                  <h3 className="font-semibold text-slate-200 mb-2">Allergies</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedPatient.allergies.map((allergy, idx) => (
                      <Badge key={idx} className="bg-rose-900/60 text-rose-100 border border-rose-700/30">{allergy}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {selectedPatient.conditions && selectedPatient.conditions.length > 0 && (
                <div>
                  <h3 className="font-semibold text-slate-200 mb-2">Medical Conditions</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedPatient.conditions.map((condition, idx) => (
                      <Badge key={idx} className="bg-blue-900/60 text-blue-100 border border-blue-700/30">{condition}</Badge>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-semibold text-slate-200 mb-3">Contact Information</h3>
                <div className="space-y-2 bg-slate-800/30 p-4 rounded-lg border border-slate-700/50">
                  {selectedPatient.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-slate-400" />
                      <span className="text-slate-300">{selectedPatient.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-slate-400" />
                    <span className="text-slate-300">{selectedPatient.email}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  className="flex-1 bg-indigo-900/60 hover:bg-indigo-800/60 text-indigo-100 border border-indigo-700/30"
                  onClick={() => {
                    setShowPatientModal(false);
                    handleNewPrescription(selectedPatient);
                  }}
                >
                  <Pill className="h-4 w-4 mr-2" />
                  New Prescription
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                  onClick={() => setShowPatientModal(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* New Prescription Modal */}
      <Dialog open={showPrescriptionModal} onOpenChange={setShowPrescriptionModal}>
        <DialogContent className="bg-slate-900 text-white border-slate-800 max-w-md rounded-xl" aria-describedby="prescription-description">
          <DialogHeader>
            <DialogTitle className="text-slate-100 text-2xl">New Prescription</DialogTitle>
          </DialogHeader>
          <div id="prescription-description" className="sr-only">
            Create a new prescription for the patient
          </div>
          {selectedPatient && (
            <div className="space-y-4">
              <p className="text-sm text-slate-400">for {selectedPatient.name}</p>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-200">Medicine Name *</Label>
                  <Input
                    value={prescriptionForm.medicine}
                    onChange={(e) => setPrescriptionForm({ ...prescriptionForm, medicine: e.target.value })}
                    placeholder="e.g., Amlodipine"
                    className="bg-slate-800 border-slate-700 text-slate-200"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-200">Dosage *</Label>
                    <Input
                      value={prescriptionForm.dosage}
                      onChange={(e) => setPrescriptionForm({ ...prescriptionForm, dosage: e.target.value })}
                      placeholder="e.g., 5mg"
                      className="bg-slate-800 border-slate-700 text-slate-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-200">Frequency</Label>
                    <select
                      value={prescriptionForm.frequency}
                      onChange={(e) => setPrescriptionForm({ ...prescriptionForm, frequency: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-slate-200"
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
                    <Label className="text-slate-200">Duration</Label>
                    <Input
                      value={prescriptionForm.duration}
                      onChange={(e) => setPrescriptionForm({ ...prescriptionForm, duration: e.target.value })}
                      placeholder="e.g., 30 days"
                      className="bg-slate-800 border-slate-700 text-slate-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-200">Refills</Label>
                    <Input
                      type="number"
                      value={prescriptionForm.refills}
                      onChange={(e) => setPrescriptionForm({ ...prescriptionForm, refills: parseInt(e.target.value) || 0 })}
                      placeholder="0"
                      className="bg-slate-800 border-slate-700 text-slate-200"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-200">Instructions</Label>
                  <Textarea
                    value={prescriptionForm.instructions}
                    onChange={(e) => setPrescriptionForm({ ...prescriptionForm, instructions: e.target.value })}
                    placeholder="e.g., Take with food"
                    rows={3}
                    className="bg-slate-800 border-slate-700 text-slate-200"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                  onClick={() => setShowPrescriptionModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-emerald-900/60 hover:bg-emerald-800/60 text-emerald-100 border border-emerald-700/30"
                  onClick={handleSubmitPrescription}
                  disabled={!prescriptionForm.medicine || !prescriptionForm.dosage}
                >
                  Create Prescription
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DoctorApp;