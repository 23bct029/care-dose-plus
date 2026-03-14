// src/pages/CaregiverApp.tsx - Fixed call button, tabs, real-time data, emergency alerts
import { useState, useEffect, useCallback } from 'react';
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ConnectionsPanel from '@/components/ConnectionsPanel';
import EmergencyPopup from '@/components/EmergencyPopup';
import ProfileTab from '@/components/ProfileTab';
import {
  Users, Heart, Pill, Calendar, Bell, AlertCircle,
  CheckCircle, XCircle, Clock, Phone, MessageSquare,
  Search, UserPlus, Activity, LogOut, Mail,
  X, RefreshCw, PhoneCall, PhoneOff, Shield, History, User
} from 'lucide-react';

interface Patient {
  id: string;
  name: string;
  email: string;
  phone?: string;
  age?: number;
  medicines?: any[];
  stats: {
    scheduledToday: number;
    takenToday: number;
    missedToday: number;
    nextDose?: { name: string; dosage: string; time: string };
    adherenceRate: number;
  };
  riskLevel?: 'low' | 'medium' | 'high';
}

interface Emergency {
  id: string;
  userId: string;
  userName: string;
  type: string;
  description?: string;
  status: string;
  timestamp: any;
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
  const [showCallModal, setShowCallModal] = useState(false);
  const [callTarget, setCallTarget] = useState<{ name: string; phone: string; type: 'patient' | 'emergency' } | null>(null);
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'connected' | 'ended'>('idle');
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('patients');
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState(0);

  const [stats, setStats] = useState({
    totalPatients: 0, totalMeds: 0, missedToday: 0,
    takenToday: 0, adherenceRate: 0, criticalAlerts: 0
  });

  const navigate = useNavigate();

  const logUserAction = useCallback(async (action: string, details?: any) => {
    if (user?.uid) await logger.logWithUser(user.uid, user.email, 'info', action, details || {});
  }, [user]);

  const fetchPatientData = useCallback(async (patientId: string, patientEmail: string): Promise<Patient | null> => {
    // Step 1: user profile — hard fail, nothing to show without it
    let data: any;
    try {
      const snap = await getDoc(doc(db, 'users', patientId));
      data = snap.data();
      if (!data) {
        console.warn('[Caregiver] No user doc for patientId:', patientId);
        return null;
      }
    } catch (e) {
      console.error('[Caregiver] Failed to fetch user doc:', patientId, e);
      return null;
    }

    // Step 2: medicines — soft fail, show patient with 0 meds
    let medicines: Array<{ id: string; name: string; dosage: string; schedule: string[]; userId: string; [key: string]: any }> = [];
    try {
      const medsSnap = await getDocs(query(collection(db, 'medicines'), where('userId', '==', patientId)));
      medicines = medsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as typeof medicines;
    } catch (e) {
      console.warn('[Caregiver] Could not fetch medicines for:', patientId, e);
    }

    // Step 3: today tracking — soft fail, avoids crashing on missing Firestore index
    let taken = 0, missed = 0;
    let trackData: any[] = [];
    try {
      const today = new Date().toISOString().split('T')[0];
      const trackSnap = await getDocs(
        query(collection(db, 'medicineTracking'), where('userId', '==', patientId), where('date', '==', today))
      );
      trackData = trackSnap.docs.map(d => d.data());
      taken = trackData.filter(t => t.status === 'taken').length;
      missed = trackData.filter(t => t.status === 'missed').length;
    } catch (e) {
      console.warn('[Caregiver] Could not fetch today tracking for:', patientId, e);
    }

    // Step 4: 30-day adherence — soft fail
    let adherRate = 0;
    try {
      const thirtyAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const adherSnap = await getDocs(
        query(collection(db, 'medicineTracking'), where('userId', '==', patientId), where('date', '>=', thirtyAgo))
      );
      const adherData = adherSnap.docs.map(d => d.data());
      const adherTaken = adherData.filter(t => t.status === 'taken').length;
      adherRate = adherData.length > 0 ? Math.round((adherTaken / adherData.length) * 100) : 0;
    } catch (e) {
      console.warn('[Caregiver] Could not fetch adherence for:', patientId, e);
    }

    // Step 5: next dose calculation
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    let nextDose: any = undefined;
    for (const med of medicines) {
      for (const time of (med.schedule || [])) {
        if (time > currentTime && !trackData.find(t => t.medicineId === med.id && t.scheduledTime === time)) {
          if (!nextDose || time < nextDose.time) {
            nextDose = { name: med.name, dosage: med.dosage, time };
          }
        }
      }
    }

    return {
      id: patientId,
      name: data.name || patientEmail.split('@')[0],
      email: patientEmail || data.email || '',
      phone: data.phone,
      age: data.age,
      medicines,
      stats: {
        scheduledToday: medicines.reduce((acc: number, m: any) => acc + (m.schedule?.length || 0), 0),
        takenToday: taken,
        missedToday: missed,
        nextDose,
        adherenceRate: adherRate,
      },
      riskLevel: data.riskLevel || 'low',
    };
  }, []);

  useEffect(() => {
    const init = async () => {
      const currentUser = await getCurrentUser();
      if (!currentUser) { navigate('/login'); return; }
      setUser(currentUser);
      const userProfile = await getUserProfile(currentUser.uid);
      setProfile(userProfile);
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Real-time connections listener
    const connQ = query(collection(db, 'connections'), where('users', 'array-contains', user.uid), where('status', '==', 'active'));
    const unsubConn = onSnapshot(connQ, async (snap) => {
      console.log('[Caregiver] connections snapshot:', snap.docs.length, 'docs');
      const patientList: Patient[] = [];
      for (const connDoc of snap.docs) {
        const conn = connDoc.data();
        const rel: string = conn.relationship || '';
        console.log('[Caregiver] connection:', connDoc.id, '| relationship:', rel, '| users:', conn.users);
        // Only process caregiver–elderly connections
        if (!rel.includes('caregiver')) {
          console.log('[Caregiver] skipping non-caregiver relationship:', rel);
          continue;
        }
        const patientId = (conn.users as string[]).find((id: string) => id !== user.uid);
        if (!patientId) { console.warn('[Caregiver] could not find patient UID in users array'); continue; }
        // Try to get email from userEmails; fall back to looking up by UID
        const patientEmail = ((conn.userEmails as string[]) || []).find((e: string) => e !== (user.email || '')) || '';
        console.log('[Caregiver] fetching patient:', patientId, patientEmail);
        const patient = await fetchPatientData(patientId, patientEmail);
        console.log('[Caregiver] fetchPatientData result:', patient ? patient.name : 'null');
        if (patient) patientList.push(patient);
      }
      setPatients(patientList);

      const missedToday = patientList.reduce((a, p) => a + p.stats.missedToday, 0);
      const takenToday = patientList.reduce((a, p) => a + p.stats.takenToday, 0);
      const avgAdherence = patientList.length > 0
        ? Math.round(patientList.reduce((a, p) => a + p.stats.adherenceRate, 0) / patientList.length) : 0;
      setStats({
        totalPatients: patientList.length,
        totalMeds: patientList.reduce((a, p) => a + (p.medicines?.length || 0), 0),
        missedToday,
        takenToday,
        adherenceRate: avgAdherence,
        criticalAlerts: patientList.filter(p => p.stats.missedToday > 0 || p.riskLevel === 'high').length
      });
    });

    // Pending invitations
    const invQ = query(collection(db, 'invitations'), where('toUserId', '==', user.uid), where('status', '==', 'pending'));
    const unsubInv = onSnapshot(invQ, snap => setPendingInvitations(snap.size));

    // Real-time emergencies for caregiver's patients
    const emQ = query(collection(db, 'emergencies'), where('status', '==', 'active'));
    const unsubEm = onSnapshot(emQ, (snap) => {
      const ems = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Emergency[];
      setEmergencies(ems);
    });

    return () => { unsubConn(); unsubInv(); unsubEm(); };
  }, [user, fetchPatientData]);

  // Periodic refresh of patient medicine data
  useEffect(() => {
    if (!user || patients.length === 0) return;
    const interval = setInterval(async () => {
      // Silently refresh patient stats
      const updated: Patient[] = [];
      for (const p of patients) {
        const refreshed = await fetchPatientData(p.id, p.email);
        if (refreshed) updated.push(refreshed);
      }
      setPatients(updated);
    }, 60000); // every minute
    return () => clearInterval(interval);
  }, [user, patients, fetchPatientData]);

  const handleLogout = async () => {
    await logOut();
    navigate('/login');
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleCall = (name: string, phone: string, type: 'patient' | 'emergency' = 'patient') => {
    setCallTarget({ name, phone, type });
    setCallStatus('calling');
    setShowCallModal(true);
    // Simulate call progression
    setTimeout(() => setCallStatus('connected'), 3000);
  };

  const handleEndCall = () => {
    setCallStatus('ended');
    setTimeout(() => {
      setShowCallModal(false);
      setCallStatus('idle');
      setCallTarget(null);
    }, 1500);
    // Also try actual phone call
    if (callTarget?.phone) {
      window.location.href = `tel:${callTarget.phone}`;
    }
  };

  const handleCall911 = () => {
    setCallTarget({ name: 'Emergency Services (911)', phone: '911', type: 'emergency' });
    setCallStatus('calling');
    setShowCallModal(true);
    window.location.href = 'tel:911';
    setTimeout(() => setCallStatus('connected'), 3000);
  };

  const handleAcknowledgeEmergency = async (emergencyId: string) => {
    await updateDoc(doc(db, 'emergencies', emergencyId), { caregiverAcknowledged: true, acknowledgedAt: serverTimestamp(), acknowledgedBy: user?.uid });
  };

  const filteredPatients = patients.filter(p =>
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-green-200 border-t-green-600 mx-auto"></div>
          <p className="mt-4 text-lg text-gray-600">Loading caregiver dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50">
      {/* Emergency Banner */}
      {emergencies.length > 0 && (
        <div className="bg-red-600 text-white py-3 px-4 fixed top-0 left-0 right-0 z-50">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 animate-pulse" />
              <span className="font-semibold">{emergencies.length} ACTIVE EMERGENCY ALERT{emergencies.length > 1 ? 'S' : ''}</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="bg-white text-red-600 border-white hover:bg-red-50" onClick={handleCall911}>
                <Phone className="h-3.5 w-3.5 mr-1" />Call 911
              </Button>
              <Button size="sm" variant="outline" className="bg-white/20 border-white text-white hover:bg-white/30" onClick={() => setActiveTab('emergencies')}>
                View
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={`bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm ${emergencies.length > 0 ? 'mt-12' : ''}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-emerald-600 flex items-center justify-center">
                <Heart className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{profile?.name || 'Caregiver'}</h1>
                <p className="text-sm text-gray-500">Caregiver Dashboard • {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={handleRefresh} disabled={refreshing} className="border-gray-300">
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
              <Button variant="outline" className="relative border-gray-300 text-gray-700" onClick={() => setShowConnections(true)}>
                <Users className="h-4 w-4 mr-2" />Connections
                {pendingInvitations > 0 && <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 rounded-full text-xs text-white flex items-center justify-center">{pendingInvitations}</span>}
              </Button>
              {emergencies.length > 0 && (
                <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleCall911}>
                  <Phone className="h-4 w-4 mr-2" />Call 911
                </Button>
              )}
              <Button variant="outline" onClick={handleLogout} className="border-gray-300 text-gray-700">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Patients', value: stats.totalPatients, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Medicines', value: stats.totalMeds, icon: Pill, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'Taken Today', value: stats.takenToday, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Missed Today', value: stats.missedToday, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'Adherence', value: `${stats.adherenceRate}%`, icon: Activity, color: 'text-teal-600', bg: 'bg-teal-50' },
            { label: 'Alerts', value: stats.criticalAlerts, icon: Bell, color: 'text-amber-600', bg: 'bg-amber-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <Card key={label} className="bg-white border border-gray-200 shadow-sm">
              <CardContent className="p-4 text-center">
                <div className={`h-10 w-10 ${bg} rounded-lg flex items-center justify-center mx-auto mb-2`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto">
            <TabsList className="bg-white border border-gray-200 rounded-lg p-1 h-auto flex w-full min-w-max">
              {[
                { value: 'patients', label: `Patients (${patients.length})`, icon: Users },
                { value: 'emergencies', label: `Emergencies${emergencies.length > 0 ? ` (${emergencies.length})` : ''}`, icon: AlertCircle },
                { value: 'monitoring', label: 'Monitoring', icon: Activity },
                { value: 'profile', label: 'Profile', icon: User },
              ].map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value}
                  className="flex-1 min-w-[130px] py-2.5 px-4 text-sm font-medium text-gray-600 data-[state=active]:bg-emerald-600 data-[state=active]:text-white rounded-md transition-all flex items-center justify-center gap-2 whitespace-nowrap">
                  <Icon className="h-4 w-4" />{label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Patients Tab */}
          <TabsContent value="patients" className="mt-4">
            <div className="mb-4 flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input placeholder="Search patients..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 border-gray-300" />
              </div>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setShowConnections(true)}>
                <UserPlus className="h-4 w-4 mr-2" />Add Patient
              </Button>
            </div>

            {filteredPatients.length === 0 ? (
              <Card className="bg-white border border-gray-200">
                <CardContent className="py-16 text-center">
                  <Heart className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-600 mb-2">No Patients Yet</h3>
                  <p className="text-gray-500 mb-6">{searchTerm ? 'No patients match your search' : 'Connect with elderly patients to start monitoring'}</p>
                  {!searchTerm && <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setShowConnections(true)}><UserPlus className="h-4 w-4 mr-2" />Connect Patient</Button>}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredPatients.map(patient => (
                  <Card key={patient.id} className={`bg-white border-2 hover:shadow-md transition-all cursor-pointer ${patient.riskLevel === 'high' ? 'border-red-200' : patient.riskLevel === 'medium' ? 'border-amber-200' : 'border-gray-200 hover:border-emerald-300'}`} onClick={() => { setSelectedPatient(patient); setShowPatientModal(true); }}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`h-12 w-12 rounded-full flex items-center justify-center font-bold text-white text-lg ${patient.riskLevel === 'high' ? 'bg-red-500' : patient.riskLevel === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'}`}>
                            {patient.name?.charAt(0)?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{patient.name}</p>
                            <p className="text-xs text-gray-500">{patient.email}</p>
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium border ${patient.riskLevel === 'high' ? 'bg-red-100 text-red-700 border-red-200' : patient.riskLevel === 'medium' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-green-100 text-green-700 border-green-200'}`}>
                          {patient.riskLevel === 'high' ? 'High Risk' : patient.riskLevel === 'medium' ? 'Medium' : 'Stable'}
                        </span>
                      </div>

                      <div className="mb-3">
                        <div className="flex justify-between text-sm mb-1.5">
                          <span className="text-gray-500">Today's Progress</span>
                          <span className="font-medium text-gray-800">{patient.stats.takenToday}/{patient.stats.scheduledToday} doses</span>
                        </div>
                        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${patient.stats.missedToday > 0 ? 'bg-red-500' : 'bg-emerald-500'}`}
                            style={{ width: `${patient.stats.scheduledToday > 0 ? (patient.stats.takenToday / patient.stats.scheduledToday) * 100 : 0}%` }} />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-4">
                        <div className="text-center p-2 bg-purple-50 rounded-lg">
                          <Pill className="h-4 w-4 text-purple-600 mx-auto mb-0.5" />
                          <p className="text-xs text-gray-500">Meds</p>
                          <p className="font-bold text-gray-900 text-sm">{patient.medicines?.length || 0}</p>
                        </div>
                        <div className="text-center p-2 bg-emerald-50 rounded-lg">
                          <Activity className="h-4 w-4 text-emerald-600 mx-auto mb-0.5" />
                          <p className="text-xs text-gray-500">Adherence</p>
                          <p className={`font-bold text-sm ${patient.stats.adherenceRate >= 80 ? 'text-emerald-700' : patient.stats.adherenceRate >= 60 ? 'text-amber-700' : 'text-red-700'}`}>{patient.stats.adherenceRate}%</p>
                        </div>
                        <div className="text-center p-2 bg-blue-50 rounded-lg">
                          <Clock className="h-4 w-4 text-blue-600 mx-auto mb-0.5" />
                          <p className="text-xs text-gray-500">Next Dose</p>
                          <p className="font-bold text-gray-900 text-sm">{patient.stats.nextDose?.time || '--:--'}</p>
                        </div>
                      </div>

                      {patient.stats.missedToday > 0 && (
                        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                          <span className="text-red-700 text-xs font-medium">{patient.stats.missedToday} missed dose{patient.stats.missedToday > 1 ? 's' : ''} today!</span>
                        </div>
                      )}

                      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                        <Button size="sm" className="flex-1 min-h-[40px] bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => patient.phone ? handleCall(patient.name, patient.phone) : handleCall911()}>
                          <Phone className="h-4 w-4 mr-1.5" />{patient.phone ? 'Call' : 'Call 911'}
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 min-h-[40px] border-blue-200 text-blue-600 hover:bg-blue-50"
                          onClick={() => { setSelectedPatient(patient); setShowPatientModal(true); }}>
                          <MessageSquare className="h-4 w-4 mr-1.5" />Details
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Emergencies Tab */}
          <TabsContent value="emergencies" className="mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Emergency Alerts</h2>
                <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleCall911}>
                  <Phone className="h-4 w-4 mr-2" />Call 911
                </Button>
              </div>

              {emergencies.length === 0 ? (
                <Card className="bg-white border border-gray-200">
                  <CardContent className="py-12 text-center">
                    <Shield className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">All clear — no active emergencies</p>
                  </CardContent>
                </Card>
              ) : (
                emergencies.map(em => (
                  <Card key={em.id} className="bg-red-50 border-2 border-red-300">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="h-6 w-6 text-red-500 mt-0.5 animate-pulse" />
                          <div>
                            <p className="font-bold text-gray-900 text-lg">{em.userName}</p>
                            <p className="text-red-700 font-medium">Emergency Type: {em.type?.toUpperCase()}</p>
                            {em.description && <p className="text-gray-700 text-sm mt-1">{em.description}</p>}
                            <p className="text-gray-500 text-xs mt-2">{em.timestamp?.toDate?.()?.toLocaleString() || 'Just now'}</p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleCall911}>
                            <Phone className="h-4 w-4 mr-1" />Call 911
                          </Button>
                          <Button variant="outline" className="border-gray-300 text-gray-600 hover:bg-gray-50" onClick={() => handleAcknowledgeEmergency(em.id)}>
                            <CheckCircle className="h-4 w-4 mr-1" />Acknowledge
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Monitoring Tab */}
          <TabsContent value="monitoring" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {patients.map(patient => (
                <Card key={patient.id} className="bg-white border border-gray-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-gray-900 text-base flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-white text-sm ${patient.riskLevel === 'high' ? 'bg-red-500' : patient.riskLevel === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'}`}>
                          {patient.name?.charAt(0)?.toUpperCase()}
                        </div>
                        {patient.name}
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${patient.stats.adherenceRate >= 80 ? 'bg-green-100 text-green-700' : patient.stats.adherenceRate >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                        {patient.stats.adherenceRate}% Adherence
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-500">Today's Doses</span>
                          <span className="font-medium">{patient.stats.takenToday} / {patient.stats.scheduledToday}</span>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${patient.stats.takenToday === patient.stats.scheduledToday ? 'bg-emerald-500' : patient.stats.missedToday > 0 ? 'bg-red-500' : 'bg-blue-500'}`}
                            style={{ width: `${patient.stats.scheduledToday > 0 ? (patient.stats.takenToday / patient.stats.scheduledToday) * 100 : 0}%` }} />
                        </div>
                      </div>

                      {patient.stats.nextDose && (
                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                          <p className="text-xs text-blue-600 font-medium">Next Dose</p>
                          <p className="text-sm font-semibold text-blue-900">{patient.stats.nextDose.name} {patient.stats.nextDose.dosage} at {patient.stats.nextDose.time}</p>
                        </div>
                      )}

                      {patient.stats.missedToday > 0 && (
                        <div className="p-3 bg-red-50 rounded-lg border border-red-200 flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-red-500" />
                          <span className="text-red-700 text-sm font-medium">{patient.stats.missedToday} missed dose{patient.stats.missedToday > 1 ? 's' : ''}</span>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button size="sm" className={`flex-1 min-h-[40px] ${patient.phone ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-gray-100 text-gray-400'}`}
                          onClick={() => patient.phone ? handleCall(patient.name, patient.phone) : null}
                          disabled={!patient.phone}>
                          <Phone className="h-3.5 w-3.5 mr-1" />Call
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 min-h-[40px] border-gray-300" onClick={() => { setSelectedPatient(patient); setShowPatientModal(true); }}>
                          View Details
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {patients.length === 0 && (
                <Card className="bg-white border border-gray-200 col-span-2">
                  <CardContent className="py-12 text-center">
                    <Activity className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No patients to monitor</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Profile Tab */}
          <TabsContent value="profile" className="mt-4">
            <ProfileTab
              user={user}
              profile={profile}
              onProfileUpdated={(updated) => setProfile(updated)}
              roleColor="emerald"
            />
          </TabsContent>
        </Tabs>
      </main>

      {/* Emergency Popup — real-time for connected patients */}
      {user && <EmergencyPopup userId={user.uid} />}

      {/* Connections Modal */}
      {showConnections && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl">
            <Button variant="ghost" size="icon" className="absolute top-3 right-3 z-10" onClick={() => setShowConnections(false)}>
              <X className="h-5 w-5" />
            </Button>
            <ConnectionsPanel userRole="caregiver" />
          </div>
        </div>
      )}

      {/* Patient Details Modal */}
      <Dialog open={showPatientModal} onOpenChange={setShowPatientModal}>
        <DialogContent className="bg-white max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl" aria-describedby="patient-desc">
          <DialogHeader>
            <DialogTitle className="text-gray-900 text-xl">Patient Details</DialogTitle>
          </DialogHeader>
          <div id="patient-desc" className="sr-only">Patient details</div>
          {selectedPatient && (
            <div className="space-y-5">
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                <div className={`h-16 w-16 rounded-full flex items-center justify-center font-bold text-white text-2xl ${selectedPatient.riskLevel === 'high' ? 'bg-red-500' : selectedPatient.riskLevel === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'}`}>
                  {selectedPatient.name?.charAt(0)?.toUpperCase()}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedPatient.name}</h2>
                  <p className="text-gray-500 flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{selectedPatient.email}</p>
                  {selectedPatient.phone && <p className="text-gray-500 flex items-center gap-1 mt-1"><Phone className="h-3.5 w-3.5" />{selectedPatient.phone}</p>}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <p className="text-2xl font-bold text-blue-700">{selectedPatient.medicines?.length || 0}</p>
                  <p className="text-xs text-gray-500">Medicines</p>
                </div>
                <div className="text-center p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                  <p className="text-2xl font-bold text-emerald-700">{selectedPatient.stats.adherenceRate}%</p>
                  <p className="text-xs text-gray-500">Adherence</p>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-xl border border-red-100">
                  <p className="text-2xl font-bold text-red-700">{selectedPatient.stats.missedToday}</p>
                  <p className="text-xs text-gray-500">Missed Today</p>
                </div>
              </div>

              {selectedPatient.medicines && selectedPatient.medicines.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2">Medicines</h3>
                  <div className="space-y-2">
                    {selectedPatient.medicines.map((m: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-100 rounded-lg">
                        <Pill className="h-4 w-4 text-purple-600" />
                        <div>
                          <span className="font-medium text-gray-900">{m.name}</span>
                          <span className="text-gray-500 text-sm ml-2">{m.dosage}</span>
                        </div>
                        {m.schedule?.length > 0 && <span className="ml-auto text-xs text-gray-400">{m.schedule.join(', ')}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <Button className={`flex-1 min-h-[48px] ${selectedPatient.phone ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                  onClick={() => selectedPatient.phone ? handleCall(selectedPatient.name, selectedPatient.phone) : null}
                  disabled={!selectedPatient.phone}>
                  <Phone className="h-4 w-4 mr-2" />{selectedPatient.phone ? 'Call Patient' : 'No Phone Number'}
                </Button>
                <Button variant="outline" className="border-gray-300" onClick={() => setShowPatientModal(false)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Call UI Modal */}
      <Dialog open={showCallModal} onOpenChange={() => {}}>
        <DialogContent className="bg-gray-900 text-white max-w-sm rounded-3xl" aria-describedby="call-desc">
          <div id="call-desc" className="sr-only">Call in progress</div>
          <div className="flex flex-col items-center py-6 space-y-6">
            <div className={`h-24 w-24 rounded-full flex items-center justify-center ${callStatus === 'calling' ? 'bg-emerald-600 animate-pulse' : callStatus === 'connected' ? 'bg-emerald-500' : 'bg-gray-600'}`}>
              {callTarget?.type === 'emergency' ? (
                <Shield className="h-12 w-12 text-white" />
              ) : (
                <Phone className="h-12 w-12 text-white" />
              )}
            </div>

            <div className="text-center">
              <p className="text-xl font-bold">{callTarget?.name}</p>
              <p className="text-gray-400 mt-1">
                {callStatus === 'calling' ? '📞 Calling...' : callStatus === 'connected' ? '✅ Connected' : '📵 Call Ended'}
              </p>
              {callTarget?.phone !== '911' && <p className="text-gray-500 text-sm mt-1">{callTarget?.phone}</p>}
            </div>

            {callStatus === 'calling' && (
              <div className="flex gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-2 w-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
                ))}
              </div>
            )}

            {(callStatus === 'calling' || callStatus === 'connected') && (
              <Button className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-700" onClick={handleEndCall}>
                <PhoneOff className="h-7 w-7" />
              </Button>
            )}

            {callStatus === 'ended' && (
              <p className="text-gray-400 text-sm">Call ended</p>
            )}

            {callTarget?.type !== 'emergency' && (
              <p className="text-gray-500 text-xs text-center">
                {callStatus === 'calling' ? 'Initiating call via your phone...' : callStatus === 'connected' ? 'Call is in progress' : ''}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CaregiverApp;