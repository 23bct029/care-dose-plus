// src/pages/DoctorApp.tsx - COMPLETE REWRITE: light theme, patient display, appointments, prescriptions, drug interaction
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getUserProfile, logOut } from '@/lib/firebase-auth';
import { db } from '@/lib/firebase';
import {
  collection, query, where, getDocs, doc, getDoc, addDoc,
  updateDoc, onSnapshot, serverTimestamp
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
import EmergencyPopup from '@/components/EmergencyPopup';
import ProfileTab from '@/components/ProfileTab';
import {
  Stethoscope, Users, Calendar, Pill, Clock,
  Search, UserPlus, Download, LogOut,
  Bell, AlertCircle, CheckCircle, XCircle,
  Heart, Plus, X, RefreshCw, Eye, AlertTriangle,
} from 'lucide-react';

interface Patient {
  id: string; name: string; email: string; phone?: string;
  avatar?: string; age?: number; gender?: string; bloodGroup?: string;
  allergies?: string[]; conditions?: string[];
  riskLevel?: 'low' | 'medium' | 'high';
}

interface Appointment {
  id: string; patientId: string; patientName: string; patientEmail?: string;
  date: string; time: string; type?: string; duration?: number;
  status: 'scheduled' | 'completed' | 'cancelled' | 'pending';
  notes?: string; createdAt: any;
}

interface Prescription {
  id: string; patientId: string; patientName: string;
  medicine: string; dosage: string; frequency: string; duration: string;
  instructions?: string; status: 'active' | 'completed' | 'cancelled';
  createdAt: any; prescribedBy?: string;
}

interface Emergency {
  id: string; userId: string; userName: string; type: string;
  description?: string; status: 'active' | 'resolved'; timestamp: any;
}

interface DrugInteraction {
  drug1: string; drug2: string; severity: 'mild' | 'moderate' | 'severe'; description: string;
}

// Basic drug interaction database (offline, no API needed)
const DRUG_INTERACTIONS: DrugInteraction[] = [
  { drug1: 'warfarin', drug2: 'aspirin', severity: 'severe', description: 'Increased bleeding risk. Monitor INR closely.' },
  { drug1: 'warfarin', drug2: 'ibuprofen', severity: 'severe', description: 'Significantly increased bleeding risk.' },
  { drug1: 'metformin', drug2: 'alcohol', severity: 'moderate', description: 'Risk of lactic acidosis. Avoid alcohol.' },
  { drug1: 'atorvastatin', drug2: 'clarithromycin', severity: 'severe', description: 'Risk of myopathy and rhabdomyolysis.' },
  { drug1: 'simvastatin', drug2: 'amlodipine', severity: 'moderate', description: 'May increase statin levels. Monitor for muscle pain.' },
  { drug1: 'lisinopril', drug2: 'potassium', severity: 'moderate', description: 'Risk of hyperkalemia. Monitor potassium levels.' },
  { drug1: 'digoxin', drug2: 'amiodarone', severity: 'severe', description: 'Digoxin toxicity risk. Reduce digoxin dose.' },
  { drug1: 'metoprolol', drug2: 'verapamil', severity: 'severe', description: 'Risk of bradycardia and heart block.' },
  { drug1: 'clopidogrel', drug2: 'omeprazole', severity: 'moderate', description: 'Reduced clopidogrel efficacy.' },
  { drug1: 'ssri', drug2: 'tramadol', severity: 'severe', description: 'Risk of serotonin syndrome.' },
  { drug1: 'fluoxetine', drug2: 'tramadol', severity: 'severe', description: 'Serotonin syndrome risk.' },
  { drug1: 'ciprofloxacin', drug2: 'antacid', severity: 'moderate', description: 'Antacids reduce ciprofloxacin absorption.' },
];

function checkDrugInteractions(newMed: string, existingMeds: string[]): DrugInteraction[] {
  const newLower = newMed.toLowerCase();
  const found: DrugInteraction[] = [];
  for (const existing of existingMeds) {
    const exLower = existing.toLowerCase();
    for (const interaction of DRUG_INTERACTIONS) {
      const d1 = interaction.drug1.toLowerCase();
      const d2 = interaction.drug2.toLowerCase();
      if (
        (newLower.includes(d1) && exLower.includes(d2)) ||
        (newLower.includes(d2) && exLower.includes(d1))
      ) {
        found.push(interaction);
      }
    }
  }
  return found;
}

const DoctorApp = () => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [activeTab, setActiveTab] = useState('patients');
  const [patientMeds, setPatientMeds] = useState<any[]>([]);
  const [patientPrescriptions, setPatientPrescriptions] = useState<Prescription[]>([]);
  const [drugInteractions, setDrugInteractions] = useState<DrugInteraction[]>([]);
  const [showInteractionWarning, setShowInteractionWarning] = useState(false);

  const [prescriptionForm, setPrescriptionForm] = useState({
    medicine: '', dosage: '', frequency: 'daily', duration: '', instructions: '', refills: 0
  });
  const [appointmentForm, setAppointmentForm] = useState({
    patientId: '', patientName: '', date: '', time: '', type: 'checkup', notes: '', duration: 30
  });

  const [connections, setConnections] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<{ received: any[]; sent: any[] }>({ received: [], sent: [] });
  const [notifications, setNotifications] = useState<any[]>([]);

  const [stats, setStats] = useState({
    totalPatients: 0, todayAppointments: 0, activePrescriptions: 0,
    emergencyAlerts: 0, completedToday: 0, highRiskPatients: 0
  });

  const navigate = useNavigate();

  const logUserAction = async (action: string, details?: any) => {
    if (user?.uid && user?.email) {
      await logger.logWithUser(user.uid, user.email, 'info', action, details || {});
    }
  };

  useEffect(() => { loadData(); }, []);

  // Real-time connections listener — populates patients
  useEffect(() => {
    if (!user) return;

    const connectionsQuery = query(
      collection(db, 'connections'),
      where('users', 'array-contains', user.uid),
      where('status', '==', 'active')
    );

    const unsubscribeConnections = onSnapshot(connectionsQuery, async (snapshot) => {
      const connectionsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      setConnections(connectionsData);

      const patientsList: Patient[] = [];
      for (const conn of connectionsData) {
        if (!conn.relationship?.includes('doctor') && !conn.relationship?.includes('patient')) continue;
        const patientId = conn.users.find((id: string) => id !== user.uid);
        if (!patientId) continue;
        try {
          const snap = await getDoc(doc(db, 'users', patientId));
          const data = snap.data();
          if (data && (data.role === 'elderly' || data.role === 'patient')) {
            patientsList.push({
              id: patientId,
              name: data.name || data.email?.split('@')[0],
              email: data.email || '',
              phone: data.phone,
              avatar: data.avatar,
              age: data.age,
              gender: data.gender,
              bloodGroup: data.bloodGroup,
              allergies: data.allergies || [],
              conditions: data.conditions || [],
              riskLevel: data.riskLevel || 'low'
            });
          }
        } catch (e) { console.error('Error fetching patient:', e); }
      }
      setPatients(patientsList);
      setFilteredPatients(patientsList);
      setStats(prev => ({ ...prev, totalPatients: patientsList.length }));
    });

    const receivedQuery = query(collection(db, 'invitations'), where('toUserId', '==', user.uid), where('status', '==', 'pending'));
    const unsubscribeReceived = onSnapshot(receivedQuery, (snap) => {
      setInvitations(prev => ({ ...prev, received: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
    });

    const sentQuery = query(collection(db, 'invitations'), where('fromUserId', '==', user.uid), where('status', '==', 'pending'));
    const unsubscribeSent = onSnapshot(sentQuery, (snap) => {
      setInvitations(prev => ({ ...prev, sent: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
    });

    const notifQuery = query(collection(db, 'notifications'), where('userId', '==', user.uid), where('read', '==', false));
    const unsubscribeNotif = onSnapshot(notifQuery, (snap) => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Real-time emergencies
    const emergencyQuery = query(collection(db, 'emergencies'), where('status', '==', 'active'));
    const unsubscribeEmergencies = onSnapshot(emergencyQuery, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Emergency[];
      setEmergencies(data);
      setStats(prev => ({ ...prev, emergencyAlerts: data.length }));
    });

    return () => {
      unsubscribeConnections(); unsubscribeReceived(); unsubscribeSent();
      unsubscribeNotif(); unsubscribeEmergencies();
    };
  }, [user]);

  const loadData = async () => {
    setRefreshing(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) { navigate('/login'); return; }
      setUser(currentUser);
      const userProfile = await getUserProfile(currentUser.uid);
      setProfile(userProfile);

      const today = new Date().toISOString().split('T')[0];

      // Appointments (all, not just today)
      const apptSnap = await getDocs(query(
        collection(db, 'appointments'),
        where('doctorId', '==', currentUser.uid)
      ));
      const apptData = (apptSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Appointment[])
        .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
      setAllAppointments(apptData);
      const todayAppts = apptData.filter(a => a.date === today);
      setAppointments(todayAppts);

      // Active prescriptions
      const rxSnap = await getDocs(query(
        collection(db, 'prescriptions'),
        where('doctorId', '==', currentUser.uid),
        where('status', '==', 'active')
      ));
      const rxData = rxSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Prescription[];
      setPrescriptions(rxData);

      setStats(prev => ({
        ...prev,
        todayAppointments: todayAppts.length,
        activePrescriptions: rxData.length,
        completedToday: todayAppts.filter(a => a.status === 'completed').length
      }));
    } catch (error: any) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await logUserAction('User logged out');
    await logOut();
    navigate('/login');
  };

  const handleViewPatient = async (patient: Patient) => {
    setSelectedPatient(patient);
    // Fetch patient's medicines and prescriptions
    try {
      const [medsSnap, rxSnap] = await Promise.all([
        getDocs(query(collection(db, 'medicines'), where('userId', '==', patient.id))),
        getDocs(query(collection(db, 'prescriptions'), where('patientId', '==', patient.id), where('status', '==', 'active')))
      ]);
      setPatientMeds(medsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      const allRx = (rxSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Prescription[])
        .filter(rx => rx.prescribedBy === `Dr. ${profile?.name}` || true); // show all for now
      setPatientPrescriptions(allRx);
    } catch (e) { console.error('Error fetching patient details:', e); }
    setShowPatientModal(true);
  };

  const handleNewPrescription = (patient: Patient) => {
    setSelectedPatient(patient);
    setPrescriptionForm({ medicine: '', dosage: '', frequency: 'daily', duration: '', instructions: '', refills: 0 });
    setDrugInteractions([]);
    setShowInteractionWarning(false);
    setShowPrescriptionModal(true);
  };

  // Check interactions when medicine name changes
  const handleMedicineChange = async (medicineName: string) => {
    setPrescriptionForm(f => ({ ...f, medicine: medicineName }));
    if (!medicineName || !selectedPatient || medicineName.length < 3) {
      setDrugInteractions([]);
      return;
    }
    try {
      const medsSnap = await getDocs(query(collection(db, 'medicines'), where('userId', '==', selectedPatient.id)));
      const existingMeds = medsSnap.docs.map(d => (d.data() as any).name || '');
      const rxSnap = await getDocs(query(collection(db, 'prescriptions'), where('patientId', '==', selectedPatient.id), where('status', '==', 'active')));
      const rxMeds = rxSnap.docs.map(d => (d.data() as any).medicine || '');
      const allMeds = [...existingMeds, ...rxMeds];
      const interactions = checkDrugInteractions(medicineName, allMeds);
      setDrugInteractions(interactions);
    } catch (e) { console.error('Interaction check error:', e); }
  };

  const handleSubmitPrescription = async (force = false) => {
    if (!selectedPatient || !prescriptionForm.medicine || !prescriptionForm.dosage) {
      alert('Please fill in Medicine Name and Dosage.');
      return;
    }
    if (drugInteractions.length > 0 && !force) {
      setShowInteractionWarning(true);
      return;
    }
    try {
      const rxRef = await addDoc(collection(db, 'prescriptions'), {
        patientId: selectedPatient.id,
        patientName: selectedPatient.name,
        doctorId: user.uid,
        doctorName: `Dr. ${profile?.name}`,
        ...prescriptionForm,
        status: 'active',
        createdAt: serverTimestamp()
      });
      // Notify patient
      await addDoc(collection(db, 'notifications'), {
        userId: selectedPatient.id,
        type: 'prescription',
        fromUserId: user.uid,
        fromUserName: `Dr. ${profile?.name}`,
        message: `New prescription: ${prescriptionForm.medicine} ${prescriptionForm.dosage} – from Dr. ${profile?.name}`,
        read: false, createdAt: serverTimestamp()
      });
      // Notify connected caregivers
      for (const conn of connections) {
        const otherId = conn.users.find((id: string) => id !== user.uid);
        if (!otherId) continue;
        try {
          const uSnap = await getDoc(doc(db, 'users', otherId));
          const uData = uSnap.data();
          if (uData?.role === 'caregiver') {
            await addDoc(collection(db, 'notifications'), {
              userId: otherId,
              type: 'prescription',
              fromUserId: user.uid,
              fromUserName: `Dr. ${profile?.name}`,
              message: `New prescription for ${selectedPatient.name}: ${prescriptionForm.medicine} ${prescriptionForm.dosage}`,
              read: false, createdAt: serverTimestamp()
            });
          }
        } catch {}
      }
      setShowPrescriptionModal(false);
      setShowInteractionWarning(false);
      await loadData();
    } catch (error) { console.error('Error creating prescription:', error); }
  };

  const handleCreateAppointment = async () => {
    if (!appointmentForm.patientId || !appointmentForm.date || !appointmentForm.time) {
      alert('Please fill in all required fields.');
      return;
    }
    try {
      await addDoc(collection(db, 'appointments'), {
        doctorId: user.uid,
        doctorName: `Dr. ${profile?.name}`,
        ...appointmentForm,
        status: 'scheduled',
        createdAt: serverTimestamp()
      });
      // Notify patient
      await addDoc(collection(db, 'notifications'), {
        userId: appointmentForm.patientId,
        type: 'appointment',
        fromUserId: user.uid,
        fromUserName: `Dr. ${profile?.name}`,
        message: `Appointment scheduled: ${appointmentForm.date} at ${appointmentForm.time} – Dr. ${profile?.name}`,
        read: false, createdAt: serverTimestamp()
      });
      setShowAppointmentModal(false);
      setAppointmentForm({ patientId: '', patientName: '', date: '', time: '', type: 'checkup', notes: '', duration: 30 });
      await loadData();
    } catch (error) { console.error('Error creating appointment:', error); }
  };

  const handleUpdateAppointment = async (id: string, status: string) => {
    try {
      await updateDoc(doc(db, 'appointments', id), { status, updatedAt: serverTimestamp() });
      setAllAppointments(prev => prev.map(a => a.id === id ? { ...a, status: status as any } : a));
      setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: status as any } : a));
    } catch (e) { console.error(e); }
  };

  const handleResolveEmergency = async (id: string) => {
    await updateDoc(doc(db, 'emergencies', id), { status: 'resolved', resolvedAt: serverTimestamp(), resolvedBy: user?.uid });
  };

  const handleExportReport = () => {
    const report = { generatedAt: new Date().toISOString(), doctor: profile?.name, stats, patients, appointments: allAppointments };
    const a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2));
    a.download = `doctor-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  useEffect(() => {
    if (!searchTerm.trim()) { setFilteredPatients(patients); return; }
    const t = searchTerm.toLowerCase();
    setFilteredPatients(patients.filter(p => p.name?.toLowerCase().includes(t) || p.email?.toLowerCase().includes(t)));
  }, [searchTerm, patients]);

  const getRiskBadge = (riskLevel?: string) => {
    switch (riskLevel) {
      case 'high': return <Badge className="bg-red-100 text-red-700 border border-red-300">High Risk</Badge>;
      case 'medium': return <Badge className="bg-yellow-100 text-yellow-700 border border-yellow-300">Medium Risk</Badge>;
      default: return <Badge className="bg-green-100 text-green-700 border border-green-300">Stable</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-lg text-gray-700">Loading doctor dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Emergency Banner */}
      {emergencies.length > 0 && (
        <div className="bg-red-600 text-white py-3 px-4 fixed top-0 left-0 right-0 z-50 animate-pulse">
          <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5" />
              <span className="font-bold">{emergencies.length} ACTIVE EMERGENCY ALERT{emergencies.length > 1 ? 'S' : ''}</span>
            </div>
            <Button size="sm" variant="outline" className="border-white text-white hover:bg-red-700 bg-transparent" onClick={() => setActiveTab('emergencies')}>
              View Alerts
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={`bg-white/90 backdrop-blur-md border-b border-gray-200 sticky top-0 z-40 shadow-sm ${emergencies.length > 0 ? 'mt-12' : ''}`}>
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-600 rounded-xl">
                <Stethoscope className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Dr. {profile?.name || 'Doctor'}</h1>
                <p className="text-sm text-gray-500">Doctor Dashboard • {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" onClick={loadData} disabled={refreshing} className="text-gray-500 hover:text-gray-800 hover:bg-gray-100" title="Refresh">
                <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setShowConnections(!showConnections)} className="relative text-gray-500 hover:text-gray-800 hover:bg-gray-100" title="Manage Connections">
                <Users className="h-5 w-5" />
                {(invitations.received.length + notifications.length) > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">
                    {invitations.received.length + notifications.length}
                  </span>
                )}
              </Button>
              <Button onClick={handleExportReport} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                <Download className="h-4 w-4" />
                Report
              </Button>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="text-gray-500 hover:text-red-600 hover:bg-red-50">
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { icon: Users, label: 'Total Patients', value: stats.totalPatients, color: 'blue' },
            { icon: Calendar, label: "Today's Appointments", value: stats.todayAppointments, color: 'green' },
            { icon: CheckCircle, label: 'Completed Today', value: stats.completedToday, color: 'teal' },
            { icon: Pill, label: 'Active Prescriptions', value: stats.activePrescriptions, color: 'purple' },
            { icon: AlertCircle, label: 'High Risk', value: stats.highRiskPatients, color: 'orange' },
            { icon: Bell, label: 'Emergencies', value: stats.emergencyAlerts, color: 'red' },
          ].map(({ icon: Icon, label, value, color }) => (
            <Card key={label} className={`bg-white border border-${color}-100 shadow-sm hover:shadow-md transition-shadow`}>
              <CardContent className="p-4 text-center">
                <div className={`w-10 h-10 bg-${color}-100 rounded-full flex items-center justify-center mx-auto mb-2`}>
                  <Icon className={`h-5 w-5 text-${color}-600`} />
                </div>
                <p className="text-3xl font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500 mt-1 leading-tight">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto pb-1">
            <TabsList className="bg-white border border-gray-200 shadow-sm h-auto p-1 flex gap-1 min-w-max rounded-xl">
              {[
                { value: 'patients', label: `Patients (${patients.length})`, icon: Users },
                { value: 'appointments', label: `Appointments (${allAppointments.length})`, icon: Calendar },
                { value: 'prescriptions', label: `Prescriptions (${prescriptions.length})`, icon: Pill },
                { value: 'emergencies', label: 'Emergencies', icon: Bell, badge: emergencies.length },
                { value: 'profile', label: 'Profile', icon: Users },
              ].map(({ value, label, icon: Icon, badge }) => (
                <TabsTrigger key={value} value={value}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-500 data-[state=active]:bg-blue-600 data-[state=active]:text-white flex items-center gap-2 whitespace-nowrap">
                  <Icon className="h-4 w-4" />
                  {label}
                  {badge && badge > 0 && <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{badge}</span>}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Patients Tab */}
          <TabsContent value="patients">
            <Card className="bg-white border border-gray-200 shadow-sm">
              <CardHeader className="pb-4 border-b border-gray-100">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <CardTitle className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-600" />
                    My Patients
                  </CardTitle>
                  <div className="flex gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-initial">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input placeholder="Search patients..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                        className="pl-9 border-gray-200 w-full sm:w-64" />
                    </div>
                    <Button onClick={() => setShowConnections(true)} className="bg-blue-600 hover:bg-blue-700 text-white gap-2 whitespace-nowrap">
                      <UserPlus className="h-4 w-4" />
                      Add Patient
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {filteredPatients.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="bg-blue-50 rounded-full p-6 inline-block mb-4">
                      <Heart className="h-12 w-12 text-blue-400" />
                    </div>
                    <p className="text-lg font-semibold text-gray-600 mb-2">No patients yet</p>
                    <p className="text-gray-400 mb-4">Connect with patients to see them here</p>
                    <Button onClick={() => setShowConnections(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Patient
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredPatients.map(patient => (
                      <Card key={patient.id} className="border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-12 w-12">
                                <AvatarImage src={patient.avatar} />
                                <AvatarFallback className={`text-white text-lg ${
                                  patient.riskLevel === 'high' ? 'bg-red-500' :
                                  patient.riskLevel === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                                }`}>{patient.name?.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <div>
                                <h3 className="font-semibold text-gray-900">{patient.name}</h3>
                                <p className="text-sm text-gray-500 truncate max-w-[140px]">{patient.email}</p>
                              </div>
                            </div>
                            {getRiskBadge(patient.riskLevel)}
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-3">
                            <Button size="sm" variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50 h-10"
                              onClick={() => handleViewPatient(patient)}>
                              <Eye className="h-4 w-4 mr-1" /> View
                            </Button>
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-10"
                              onClick={e => { e.stopPropagation(); handleNewPrescription(patient); }}>
                              <Pill className="h-4 w-4 mr-1" /> Prescribe
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
            <Card className="bg-white border border-gray-200 shadow-sm">
              <CardHeader className="border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-blue-600" />
                    Appointments
                  </CardTitle>
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                    onClick={() => { setAppointmentForm({ patientId: '', patientName: '', date: '', time: '', type: 'checkup', notes: '', duration: 30 }); setShowAppointmentModal(true); }}>
                    <Plus className="h-4 w-4" />
                    Schedule Appointment
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {allAppointments.length === 0 ? (
                  <div className="text-center py-12">
                    <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No appointments scheduled</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {allAppointments.map(apt => (
                      <div key={apt.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 hover:bg-blue-50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-blue-100 rounded-lg">
                            <Clock className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{apt.patientName}</p>
                            <p className="text-sm text-gray-500">{apt.date} at {apt.time} • {apt.type || 'Checkup'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={
                            apt.status === 'completed' ? 'bg-green-100 text-green-700' :
                            apt.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                            apt.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-blue-100 text-blue-700'
                          }>{apt.status}</Badge>
                          {apt.status === 'scheduled' && (
                            <>
                              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-8" onClick={() => handleUpdateAppointment(apt.id, 'completed')}>
                                <CheckCircle className="h-3 w-3 mr-1" /> Done
                              </Button>
                              <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 h-8" onClick={() => handleUpdateAppointment(apt.id, 'cancelled')}>
                                <XCircle className="h-3 w-3 mr-1" /> Cancel
                              </Button>
                            </>
                          )}
                          {apt.status === 'pending' && (
                            <>
                              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-8" onClick={() => handleUpdateAppointment(apt.id, 'scheduled')}>
                                <CheckCircle className="h-3 w-3 mr-1" /> Approve
                              </Button>
                              <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 h-8" onClick={() => handleUpdateAppointment(apt.id, 'cancelled')}>
                                <XCircle className="h-3 w-3 mr-1" /> Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Prescriptions Tab */}
          <TabsContent value="prescriptions">
            <Card className="bg-white border border-gray-200 shadow-sm">
              <CardHeader className="border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Pill className="h-5 w-5 text-blue-600" />
                    Active Prescriptions
                  </CardTitle>
                  {patients.length > 0 && (
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2" onClick={() => { setSelectedPatient(patients[0]); setShowPrescriptionModal(true); }}>
                      <Plus className="h-4 w-4" />
                      New Prescription
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {prescriptions.length === 0 ? (
                  <div className="text-center py-12">
                    <Pill className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No active prescriptions</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {prescriptions.map(rx => (
                      <div key={rx.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100 hover:bg-blue-50 transition-colors">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold text-gray-900">{rx.medicine} <span className="text-blue-600">{rx.dosage}</span></p>
                            <p className="text-sm text-gray-600">Patient: {rx.patientName}</p>
                            <p className="text-xs text-gray-400 mt-1">{rx.frequency} • {rx.duration}</p>
                          </div>
                          <Badge className="bg-green-100 text-green-700">Active</Badge>
                        </div>
                        {rx.instructions && <p className="text-xs text-gray-500 mt-2 italic">"{rx.instructions}"</p>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Emergencies Tab */}
          <TabsContent value="emergencies">
            <Card className="bg-white border border-gray-200 shadow-sm">
              <CardHeader className="border-b border-gray-100">
                <CardTitle className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Bell className="h-5 w-5 text-red-600" />
                  Emergency Alerts
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {emergencies.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <p className="text-gray-500">No active emergencies</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {emergencies.map(em => (
                      <div key={em.id} className="p-4 bg-red-50 rounded-xl border border-red-200">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                            <div>
                              <p className="font-semibold text-gray-900">{em.userName}</p>
                              <p className="text-sm text-red-600">Type: {em.type}</p>
                              {em.description && <p className="text-xs text-gray-500 mt-1">{em.description}</p>}
                            </div>
                          </div>
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleResolveEmergency(em.id)}>
                            <CheckCircle className="h-4 w-4 mr-1" />
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

          {/* Profile Tab */}
          <TabsContent value="profile" className="mt-4">
            <ProfileTab
              user={user}
              profile={profile}
              onProfileUpdated={(updated) => setProfile(updated)}
              roleColor="blue"
            />
          </TabsContent>
        </Tabs>
      </main>

      {/* Emergency Popup — real-time alerts */}
      {user && <EmergencyPopup userId={user.uid} />}

      {/* Connections Panel */}
      {showConnections && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl">
            <Button variant="ghost" size="icon" className="absolute top-2 right-2 z-10 bg-white hover:bg-gray-100 rounded-full shadow"
              onClick={() => setShowConnections(false)}>
              <X className="h-4 w-4" />
            </Button>
            <ConnectionsPanel userRole="doctor" />
          </div>
        </div>
      )}

      {/* Patient Details Modal */}
      <Dialog open={showPatientModal} onOpenChange={setShowPatientModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" aria-describedby="patient-modal-desc">
          <DialogHeader>
            <DialogTitle className="text-xl">Patient Details</DialogTitle>
          </DialogHeader>
          <p id="patient-modal-desc" className="sr-only">Patient details</p>
          {selectedPatient && (
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-blue-500 text-white text-xl">{selectedPatient.name?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedPatient.name}</h2>
                  <p className="text-gray-500">{selectedPatient.email}</p>
                  {getRiskBadge(selectedPatient.riskLevel)}
                </div>
              </div>

              {/* Patient's Medicines */}
              {patientMeds.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Current Medicines</h3>
                  <div className="space-y-2">
                    {patientMeds.map(med => (
                      <div key={med.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                        <div>
                          <p className="font-medium text-gray-800">{med.name} <span className="text-blue-600">{med.dosage}</span></p>
                          <p className="text-xs text-gray-500">{med.schedule?.join(', ')}</p>
                        </div>
                        <Badge className={med.taken ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}>
                          {med.taken ? 'Taken' : 'Pending'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Doctor's Prescriptions for This Patient */}
              {patientPrescriptions.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Your Prescriptions</h3>
                  <div className="space-y-2">
                    {patientPrescriptions.map(rx => (
                      <div key={rx.id} className="p-3 bg-green-50 rounded-lg border border-green-100">
                        <p className="font-medium text-gray-800">{rx.medicine} {rx.dosage}</p>
                        <p className="text-xs text-gray-500">{rx.frequency} • {rx.duration}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => { setShowPatientModal(false); handleNewPrescription(selectedPatient); }}>
                  <Pill className="h-4 w-4 mr-2" /> New Prescription
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setShowPatientModal(false)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Prescription Modal */}
      <Dialog open={showPrescriptionModal} onOpenChange={setShowPrescriptionModal}>
        <DialogContent className="max-w-md" aria-describedby="rx-desc">
          <DialogHeader>
            <DialogTitle>New Prescription {selectedPatient ? `for ${selectedPatient.name}` : ''}</DialogTitle>
          </DialogHeader>
          <p id="rx-desc" className="sr-only">Create a new prescription</p>
          <div className="space-y-4">
            {/* Patient selector if opened from Prescriptions tab */}
            {!selectedPatient?.id && (
              <div className="space-y-1">
                <Label>Select Patient</Label>
                <select className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  onChange={e => {
                    const p = patients.find(p => p.id === e.target.value);
                    if (p) setSelectedPatient(p);
                  }}>
                  <option value="">Choose patient...</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}

            <div className="space-y-1">
              <Label>Medicine Name *</Label>
              <Input value={prescriptionForm.medicine} onChange={e => handleMedicineChange(e.target.value)} placeholder="e.g., Amlodipine" />
            </div>

            {/* Drug Interaction Warning */}
            {drugInteractions.length > 0 && (
              <div className={`p-3 rounded-lg border ${
                drugInteractions.some(i => i.severity === 'severe') ? 'bg-red-50 border-red-300' : 'bg-yellow-50 border-yellow-300'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className={`h-4 w-4 ${drugInteractions.some(i => i.severity === 'severe') ? 'text-red-600' : 'text-yellow-600'}`} />
                  <span className="font-semibold text-sm">Drug Interaction Warning</span>
                </div>
                {drugInteractions.map((inter, idx) => (
                  <div key={idx} className="text-xs text-gray-700 mb-1">
                    <span className={`font-medium ${inter.severity === 'severe' ? 'text-red-700' : inter.severity === 'moderate' ? 'text-yellow-700' : 'text-gray-600'}`}>
                      [{inter.severity.toUpperCase()}]
                    </span> {inter.drug1} + {inter.drug2}: {inter.description}
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Dosage *</Label>
                <Input value={prescriptionForm.dosage} onChange={e => setPrescriptionForm(f => ({ ...f, dosage: e.target.value }))} placeholder="e.g., 5mg" />
              </div>
              <div className="space-y-1">
                <Label>Frequency</Label>
                <select className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  value={prescriptionForm.frequency} onChange={e => setPrescriptionForm(f => ({ ...f, frequency: e.target.value }))}>
                  <option value="daily">Once Daily</option>
                  <option value="twice_daily">Twice Daily</option>
                  <option value="thrice_daily">Three Times Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="as_needed">As Needed</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Duration</Label>
                <Input value={prescriptionForm.duration} onChange={e => setPrescriptionForm(f => ({ ...f, duration: e.target.value }))} placeholder="e.g., 30 days" />
              </div>
              <div className="space-y-1">
                <Label>Refills</Label>
                <Input type="number" value={prescriptionForm.refills} onChange={e => setPrescriptionForm(f => ({ ...f, refills: parseInt(e.target.value) || 0 }))} placeholder="0" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Instructions</Label>
              <Textarea value={prescriptionForm.instructions} onChange={e => setPrescriptionForm(f => ({ ...f, instructions: e.target.value }))} placeholder="e.g., Take with food" rows={2} />
            </div>

            {showInteractionWarning && (
              <div className="p-3 bg-orange-50 border border-orange-300 rounded-lg">
                <p className="text-sm font-semibold text-orange-800">⚠️ Are you sure you want to proceed despite the drug interaction warning?</p>
                <div className="flex gap-2 mt-2">
                  <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => handleSubmitPrescription(true)}>Proceed Anyway</Button>
                  <Button size="sm" variant="outline" onClick={() => setShowInteractionWarning(false)}>Review</Button>
                </div>
              </div>
            )}

            {!showInteractionWarning && (
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowPrescriptionModal(false)}>Cancel</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => handleSubmitPrescription(false)}
                  disabled={!prescriptionForm.medicine || !prescriptionForm.dosage}>
                  Create Prescription
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Appointment Modal */}
      <Dialog open={showAppointmentModal} onOpenChange={setShowAppointmentModal}>
        <DialogContent className="max-w-md" aria-describedby="appt-desc">
          <DialogHeader>
            <DialogTitle>Schedule Appointment</DialogTitle>
          </DialogHeader>
          <p id="appt-desc" className="sr-only">Schedule a new appointment</p>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Patient *</Label>
              <select className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                value={appointmentForm.patientId}
                onChange={e => {
                  const p = patients.find(p => p.id === e.target.value);
                  setAppointmentForm(f => ({ ...f, patientId: e.target.value, patientName: p?.name || '' }));
                }}>
                <option value="">Select patient...</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Date *</Label>
                <Input type="date" value={appointmentForm.date} min={new Date().toISOString().split('T')[0]}
                  onChange={e => setAppointmentForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Time *</Label>
                <Input type="time" value={appointmentForm.time}
                  onChange={e => setAppointmentForm(f => ({ ...f, time: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Type</Label>
                <select className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  value={appointmentForm.type} onChange={e => setAppointmentForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="checkup">Checkup</option>
                  <option value="followup">Follow-up</option>
                  <option value="consultation">Consultation</option>
                  <option value="emergency">Emergency</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Duration (min)</Label>
                <Input type="number" value={appointmentForm.duration}
                  onChange={e => setAppointmentForm(f => ({ ...f, duration: parseInt(e.target.value) || 30 }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea value={appointmentForm.notes} onChange={e => setAppointmentForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Optional notes..." />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowAppointmentModal(false)}>Cancel</Button>
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={handleCreateAppointment}
                disabled={!appointmentForm.patientId || !appointmentForm.date || !appointmentForm.time}>
                Schedule Appointment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DoctorApp;
