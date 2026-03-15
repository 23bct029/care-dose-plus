// src/pages/CaregiverApp.tsx - Fixed patient bug + professional UI
import { useState, useEffect, useRef } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ConnectionsPanel from '@/components/ConnectionsPanel';
import EmergencyPopup from '@/components/EmergencyPopup';
import ProfileTab from '@/components/ProfileTab';
import AIInsightsPanel from '@/components/AIInsightsPanel';
import VideoConsult from '@/components/VideoConsult';
import {
  Users, Heart, Pill, Calendar, Bell, AlertCircle,
  CheckCircle, XCircle, Clock, Phone, Activity, LogOut,
  X, RefreshCw, Shield, User, Package, TrendingUp,
  UserPlus, Search, ChevronRight
} from 'lucide-react';

interface Patient {
  id: string; name: string; email: string; phone?: string; age?: number;
  bloodGroup?: string; medicalConditions?: string; allergies?: string;
  medicines?: any[]; appointments?: any[];
  stats: { scheduledToday:number; takenToday:number; missedToday:number; nextDose?:{name:string;dosage:string;time:string}; adherenceRate:number; };
  riskLevel?: 'low'|'medium'|'high';
  refillAlerts?: {medicineName:string;daysLeft:number;remaining:number}[];
}
interface Emergency { id:string; userId:string; userName:string; type:string; status:string; timestamp:any; }
interface CareNotif { id:string; type:string; message:string; read:boolean; createdAt:any; }

const CaregiverApp = () => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient|null>(null);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [activeTab, setActiveTab] = useState('patients');
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [notifications, setNotifications] = useState<CareNotif[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState(0);
  const [stats, setStats] = useState({ totalPatients:0, totalMeds:0, missedToday:0, takenToday:0, adherenceRate:0, refillAlerts:0 });
  const [showVideoConsult, setShowVideoConsult] = useState(false);
  const [videoTarget, setVideoTarget] = useState<{id:string;name:string}|null>(null);
  const [patientHistory, setPatientHistory] = useState<Record<string,any[]>>({});
  const navigate = useNavigate();
  // Use ref to avoid stale closures / re-triggering effect
  const userRef = useRef<any>(null);
  const unsubRef = useRef<(() => void)[]>([]);

  // ─── Fetch full patient data ───────────────────────────────────────────────
  const fetchPatientData = async (patientId: string, patientEmail: string): Promise<Patient|null> => {
    let data: any;
    try {
      const snap = await getDoc(doc(db,'users',patientId));
      data = snap.data();
      if (!data) return null;
      if (data.role && data.role !== 'elderly') return null;
    } catch { return null; }

    let medicines: any[] = [];
    let refillAlerts: {medicineName:string;daysLeft:number;remaining:number}[] = [];
    try {
      const ms = await getDocs(query(collection(db,'medicines'), where('userId','==',patientId)));
      medicines = ms.docs.map(d => ({id:d.id,...d.data()}));
      for (const med of medicines) {
        if (med.currentQuantity != null) {
          const dpd = med.schedule?.length || 1;
          const dLeft = Math.floor(med.currentQuantity / dpd);
          if (dLeft <= 5) refillAlerts.push({medicineName:med.name, daysLeft:dLeft, remaining:med.currentQuantity});
        }
      }
    } catch {}

    let taken=0, missed=0, trackData:any[]=[];
    try {
      const today = new Date().toISOString().split('T')[0];
      const ts = await getDocs(query(collection(db,'medicineTracking'), where('userId','==',patientId), where('date','==',today)));
      trackData = ts.docs.map(d => d.data());
      taken = trackData.filter(t=>t.status==='taken').length;
      missed = trackData.filter(t=>t.status==='missed').length;
    } catch {}

    let adherRate=0;
    try {
      const thirtyAgo = new Date(Date.now()-30*24*60*60*1000).toISOString().split('T')[0];
      const ar = await getDocs(query(collection(db,'medicineTracking'), where('userId','==',patientId), where('date','>=',thirtyAgo)));
      const ad = ar.docs.map(d=>d.data());
      adherRate = ad.length>0 ? Math.round((ad.filter(t=>t.status==='taken').length/ad.length)*100) : 0;
    } catch {}

    let appointments:any[]=[];
    try {
      const today = new Date().toISOString().split('T')[0];
      const aps = await getDocs(query(collection(db,'appointments'), where('patientId','==',patientId)));
      appointments = aps.docs.map(d=>({id:d.id,...d.data()})).filter((a:any)=>a.date>=today);
    } catch {}

    const now = new Date();
    const cur = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    let nextDose:any;
    for (const med of medicines)
      for (const t of (med.schedule||[]))
        if (t>cur && !trackData.find(td=>td.medicineId===med.id&&td.scheduledTime===t))
          if (!nextDose||t<nextDose.time) nextDose={name:med.name,dosage:med.dosage,time:t};

    return {
      id:patientId, name:data.name||patientEmail.split('@')[0],
      email:patientEmail||data.email||'', phone:data.phone, age:data.age,
      bloodGroup:data.bloodGroup, medicalConditions:data.medicalConditions, allergies:data.allergies,
      medicines, appointments, refillAlerts,
      stats:{scheduledToday:medicines.reduce((a,m:any)=>a+(m.schedule?.length||0),0),takenToday:taken,missedToday:missed,nextDose,adherenceRate:adherRate},
      riskLevel:data.riskLevel||(missed>0?'medium':'low'),
    };
  };

  // ─── Setup listeners (stable function, does not go in deps) ───────────────
  const setupListeners = (uid: string, email: string) => {
    // Clean up any previous subs
    unsubRef.current.forEach(u => u());
    unsubRef.current = [];

    const connQ = query(collection(db,'connections'), where('users','array-contains',uid), where('status','==','active'));
    const u1 = onSnapshot(connQ, async snap => {
      const patientList: Patient[] = [];
      for (const cd of snap.docs) {
        const conn = cd.data();
        const otherId = conn.users?.find((id:string)=>id!==uid);
        if (!otherId) continue;
        const otherEmail = conn.userEmails?.find((e:string)=>e!==email)||'';
        const p = await fetchPatientData(otherId, otherEmail);
        if (p) patientList.push(p);
      }
      setPatients(patientList);
      const missed = patientList.reduce((a,p)=>a+p.stats.missedToday,0);
      const taken = patientList.reduce((a,p)=>a+p.stats.takenToday,0);
      const avg = patientList.length>0?Math.round(patientList.reduce((a,p)=>a+p.stats.adherenceRate,0)/patientList.length):0;
      const refills = patientList.reduce((a,p)=>a+(p.refillAlerts?.length||0),0);
      setStats({totalPatients:patientList.length, totalMeds:patientList.reduce((a,p)=>a+(p.medicines?.length||0),0), missedToday:missed, takenToday:taken, adherenceRate:avg, refillAlerts:refills});
    });

    const u2 = onSnapshot(query(collection(db,'invitations'),where('toUserId','==',uid),where('status','==','pending')), snap=>setPendingInvitations(snap.size));
    const u3 = onSnapshot(query(collection(db,'emergencies'),where('status','==','active')), snap=>setEmergencies(snap.docs.map(d=>({id:d.id,...d.data()})) as Emergency[]));
    const u4 = onSnapshot(query(collection(db,'notifications'),where('userId','==',uid),where('read','==',false)), snap=>{
      const ns = snap.docs.map(d=>({id:d.id,...d.data()})) as CareNotif[];
      ns.sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
      setNotifications(ns);
    });

    unsubRef.current = [u1,u2,u3,u4];
  };

  useEffect(() => {
    const init = async () => {
      const cu = await getCurrentUser();
      if (!cu) { navigate('/login'); return; }
      userRef.current = cu;
      setUser(cu);
      const up = await getUserProfile(cu.uid);
      setProfile(up);
      setLoading(false);
      setupListeners(cu.uid, cu.email||'');
      await logger.logWithUser(cu.uid, cu.email, 'info', 'Caregiver dashboard loaded')
      // Register FCM push token
      import('@/lib/push-notifications').then(m => m.registerPushNotifications(cu.uid));;
    };
    init();
    return () => { unsubRef.current.forEach(u=>u()); };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    if (userRef.current) {
      const p = await getUserProfile(userRef.current.uid);
      setProfile(p);
      setupListeners(userRef.current.uid, userRef.current.email||'');
    }
    setTimeout(()=>setRefreshing(false), 1000);
  };

  const markNotifRead = async (id: string) => {
    try { await updateDoc(doc(db,'notifications',id),{read:true}); } catch {}
  };

  const ackEmergency = async (id: string) => {
    await updateDoc(doc(db,'emergencies',id),{caregiverAcknowledged:true,acknowledgedAt:serverTimestamp(),acknowledgedBy:userRef.current?.uid});
  };

  const handleLogout = async () => {
    await logger.logWithUser(user?.uid, user?.email, 'info', 'Caregiver logged out');
    unsubRef.current.forEach(u=>u());
    await logOut();
    navigate('/login');
  };

  // Load patient history for AI insights
  const loadPatientHistory = async (patientId: string) => {
    if (patientHistory[patientId]) return; // already loaded
    try {
      const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate()-30);
      const snap = await getDocs(query(collection(db,'medicineTracking'), where('userId','==',patientId)));
      const recs = snap.docs.map(d=>({id:d.id,...d.data()})).filter((r:any)=>r.date>=thirtyAgo.toISOString().split('T')[0]);
      setPatientHistory(prev => ({...prev, [patientId]: recs}));
    } catch {}
  };

  const filtered = patients.filter(p=>
    p.name?.toLowerCase().includes(searchTerm.toLowerCase())||
    p.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const unreadCount = notifications.filter(n=>!n.read).length;
  const refillCount = patients.reduce((a,p)=>a+(p.refillAlerts?.length||0),0);

  if (loading) return (
    <div className="min-h-screen bg-teal-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-14 w-14 border-4 border-teal-600 border-t-transparent mx-auto"></div>
        <p className="mt-4 text-gray-600 font-medium">Loading caregiver dashboard...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Emergency Banner */}
      {emergencies.length > 0 && (
        <div className="bg-red-600 text-white py-2.5 px-4 fixed top-0 left-0 right-0 z-50">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4 animate-pulse"/><span className="font-bold text-sm">{emergencies.length} ACTIVE EMERGENCY{emergencies.length>1?'S':''}</span></div>
            <Button size="sm" className="bg-white text-red-600 hover:bg-red-50 h-7 px-3 text-xs font-semibold" onClick={()=>setActiveTab('emergencies')}>View →</Button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={`bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm ${emergencies.length>0?'mt-10':''}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-teal-600 flex items-center justify-center shrink-0">
                <Heart className="h-5 w-5 text-white"/>
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-bold text-gray-900 truncate">{profile?.name||'Caregiver'}</h1>
                <p className="text-xs text-gray-500">Caregiver Dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={refreshing} className="h-9 w-9 text-gray-500 hover:bg-gray-100">
                <RefreshCw className={`h-4 w-4 ${refreshing?'animate-spin':''}`}/>
              </Button>
              <Button variant="outline" className="relative border-gray-300 text-gray-700 hover:bg-gray-50 h-9 px-3 text-sm" onClick={()=>setShowConnections(true)}>
                <Users className="h-4 w-4 mr-1.5"/>Connections
                {pendingInvitations>0&&<span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">{pendingInvitations}</span>}
              </Button>
              <Button variant="ghost" size="icon" className="relative h-9 w-9 text-gray-500 hover:bg-gray-100" onClick={()=>setActiveTab('notifications')}>
                <Bell className="h-4 w-4"/>
                {unreadCount>0&&<span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">{unreadCount}</span>}
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500 hover:bg-gray-100" onClick={handleLogout}>
                <LogOut className="h-4 w-4"/>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Stats Row */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            {label:'Patients',value:stats.totalPatients,icon:<Users className="h-5 w-5"/>,color:'text-blue-600',bg:'bg-blue-50',border:'border-blue-100'},
            {label:'Medicines',value:stats.totalMeds,icon:<Pill className="h-5 w-5"/>,color:'text-purple-600',bg:'bg-purple-50',border:'border-purple-100'},
            {label:'Taken',value:stats.takenToday,icon:<CheckCircle className="h-5 w-5"/>,color:'text-emerald-600',bg:'bg-emerald-50',border:'border-emerald-100'},
            {label:'Missed',value:stats.missedToday,icon:<XCircle className="h-5 w-5"/>,color:'text-red-600',bg:'bg-red-50',border:'border-red-100'},
            {label:'Adherence',value:`${stats.adherenceRate}%`,icon:<TrendingUp className="h-5 w-5"/>,color:'text-teal-600',bg:'bg-teal-50',border:'border-teal-100'},
            {label:'Refills',value:refillCount,icon:<Package className="h-5 w-5"/>,color:'text-orange-600',bg:'bg-orange-50',border:'border-orange-100'},
          ].map(s=>(
            <Card key={s.label} className={`${s.bg} border ${s.border} shadow-none`}>
              <CardContent className="p-3">
                <div className={`${s.color} mb-1`}>{s.icon}</div>
                <p className="text-xl font-bold text-gray-900 leading-none">{s.value}</p>
                <p className="text-xs text-gray-500 mt-1">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Refill warning */}
        {refillCount>0&&(
          <div className="flex items-start gap-3 p-3 bg-orange-50 border border-orange-200 rounded-xl">
            <Package className="h-5 w-5 text-orange-600 mt-0.5 shrink-0"/>
            <div>
              <p className="font-semibold text-orange-800 text-sm">Medicine Refill Required</p>
              {patients.filter(p=>(p.refillAlerts?.length||0)>0).map(p=>
                p.refillAlerts?.map(a=>(
                  <p key={`${p.id}-${a.medicineName}`} className="text-xs text-orange-700 mt-0.5">
                    <b>{p.name}</b>: {a.medicineName} — {a.remaining} tablets (~{a.daysLeft} days)
                  </p>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="patients">👥 Patients ({patients.length})</TabsTrigger>
            <TabsTrigger value="emergencies">🚨{emergencies.length>0?` Alerts (${emergencies.length})`:' Emergencies'}</TabsTrigger>
            <TabsTrigger value="notifications">🔔{unreadCount>0?` (${unreadCount})`:' Notifications'}</TabsTrigger>
            <TabsTrigger value="profile">👤 Profile</TabsTrigger>
          </TabsList>

          {/* ── PATIENTS ── */}
          <TabsContent value="patients" className="mt-4 space-y-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"/>
                <Input placeholder="Search patients…" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} className="pl-9 bg-white border-gray-300 h-10"/>
              </div>
              <Button className="bg-teal-600 hover:bg-teal-700 text-white h-10 px-4 shrink-0" onClick={()=>setShowConnections(true)}>
                <UserPlus className="h-4 w-4 mr-2"/>Add Patient
              </Button>
            </div>

            {filtered.length===0 ? (
              <Card className="bg-white border border-gray-200">
                <CardContent className="py-16 text-center">
                  <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4"><Heart className="h-8 w-8 text-gray-400"/></div>
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">No Patients Connected</h3>
                  <p className="text-gray-500 text-sm mb-5">{searchTerm?'No patients match your search':'Connect with elderly patients to start monitoring'}</p>
                  {!searchTerm&&<Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={()=>setShowConnections(true)}><UserPlus className="h-4 w-4 mr-2"/>Connect Patient</Button>}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map(patient=>(
                  <Card key={patient.id}
                    className={`bg-white hover:shadow-md transition-all cursor-pointer border-2 ${
                      emergencies.some(e=>e.userId===patient.id)?'border-red-400':
                      patient.stats.missedToday>0?'border-amber-400':
                      (patient.refillAlerts?.length||0)>0?'border-orange-300':
                      'border-gray-100 hover:border-teal-300'
                    }`}
                    onClick={()=>{setSelectedPatient(patient);setShowPatientModal(true);loadPatientHistory(patient.id);}}>
                    <CardContent className="p-5">
                      {/* Header row */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`h-11 w-11 rounded-full flex items-center justify-center font-bold text-white text-base shrink-0 ${
                            emergencies.some(e=>e.userId===patient.id)?'bg-red-500':
                            patient.stats.missedToday>0?'bg-amber-500':'bg-teal-600'
                          }`}>{patient.name?.charAt(0)?.toUpperCase()}</div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 truncate">{patient.name}</p>
                            <p className="text-xs text-gray-400 truncate">{patient.email}</p>
                            {patient.age&&<p className="text-xs text-gray-400">Age {patient.age}{patient.bloodGroup?` · ${patient.bloodGroup}`:''}</p>}
                          </div>
                        </div>
                        <Badge className={`text-xs shrink-0 ml-2 ${
                          emergencies.some(e=>e.userId===patient.id)?'bg-red-600 text-white':
                          patient.stats.missedToday>0?'bg-amber-500 text-white':
                          patient.stats.adherenceRate>=80?'bg-emerald-600 text-white':'bg-gray-200 text-gray-700'
                        }`}>
                          {emergencies.some(e=>e.userId===patient.id)?'🚨 SOS':
                           patient.stats.missedToday>0?'⚠️ Missed':
                           patient.stats.adherenceRate>=80?'✓ Good':'Monitor'}
                        </Badge>
                      </div>

                      {/* Progress */}
                      <div className="mb-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-500">Today's doses</span>
                          <span className="font-medium text-gray-700">{patient.stats.takenToday}/{patient.stats.scheduledToday}</span>
                        </div>
                        <Progress
                          value={patient.stats.scheduledToday>0?(patient.stats.takenToday/patient.stats.scheduledToday)*100:0}
                          className="h-2"
                        />
                      </div>

                      {/* 3-col mini stats */}
                      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                        <div className="bg-gray-50 rounded-lg p-2">
                          <p className="text-xs text-gray-400">Meds</p>
                          <p className="font-bold text-gray-900 text-sm">{patient.medicines?.length||0}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2">
                          <p className="text-xs text-gray-400">Adherence</p>
                          <p className={`font-bold text-sm ${patient.stats.adherenceRate>=80?'text-emerald-700':patient.stats.adherenceRate>=60?'text-amber-700':'text-red-700'}`}>{patient.stats.adherenceRate}%</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2">
                          <p className="text-xs text-gray-400">Next Dose</p>
                          <p className="font-bold text-gray-900 text-sm">{patient.stats.nextDose?.time||'—'}</p>
                        </div>
                      </div>

                      {/* Alert chips */}
                      <div className="space-y-1.5 mb-3">
                        {patient.stats.missedToday>0&&<div className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 px-2.5 py-1.5 rounded-lg"><XCircle className="h-3.5 w-3.5 shrink-0"/>{patient.stats.missedToday} missed dose{patient.stats.missedToday>1?'s':''}</div>}
                        {(patient.refillAlerts?.length||0)>0&&<div className="flex items-center gap-1.5 text-xs text-orange-700 bg-orange-50 px-2.5 py-1.5 rounded-lg"><Package className="h-3.5 w-3.5 shrink-0"/>{patient.refillAlerts?.length} medicine{(patient.refillAlerts?.length||0)>1?'s':''} need refill</div>}
                        {(patient.appointments?.length||0)>0&&<div className="flex items-center gap-1.5 text-xs text-purple-700 bg-purple-50 px-2.5 py-1.5 rounded-lg"><Calendar className="h-3.5 w-3.5 shrink-0"/>Next appt: {patient.appointments![0].date}</div>}
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2" onClick={e=>e.stopPropagation()}>
                        <Button size="sm" className={`flex-1 h-9 text-sm font-medium ${patient.phone?'bg-teal-600 hover:bg-teal-700 text-white':'bg-red-600 hover:bg-red-700 text-white'}`}
                          onClick={()=>window.location.href=`tel:${patient.phone||'911'}`}>
                          <Phone className="h-3.5 w-3.5 mr-1"/>{patient.phone?'Call':'Call 911'}
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 h-9 text-sm border-gray-300 text-gray-700 hover:bg-gray-50"
                          onClick={()=>{setSelectedPatient(patient);setShowPatientModal(true);}}>
                          Details <ChevronRight className="h-3.5 w-3.5 ml-1"/>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── EMERGENCIES ── */}
          <TabsContent value="emergencies" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Emergency Alerts</h2>
              <Button className="bg-red-600 hover:bg-red-700 text-white h-9 px-4 text-sm" onClick={()=>window.location.href='tel:911'}>
                <Phone className="h-4 w-4 mr-2"/>Call 911
              </Button>
            </div>
            {emergencies.length===0?(
              <Card className="bg-white border border-gray-200">
                <CardContent className="py-12 text-center">
                  <Shield className="h-12 w-12 text-emerald-400 mx-auto mb-3"/>
                  <p className="text-gray-500 font-medium">All clear — no active emergencies</p>
                </CardContent>
              </Card>
            ):emergencies.map(em=>(
              <Card key={em.id} className="bg-red-50 border-2 border-red-300">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-6 w-6 text-red-500 animate-pulse mt-0.5"/>
                      <div>
                        <p className="font-bold text-gray-900">{em.userName}</p>
                        <p className="text-red-700 font-medium text-sm">🚨 {em.type?.toUpperCase()}</p>
                        <p className="text-gray-500 text-xs mt-1">{em.timestamp?.toDate?.()?.toLocaleString()||'Just now'}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button className="bg-red-600 hover:bg-red-700 text-white h-9 px-3 text-sm" onClick={()=>window.location.href='tel:911'}><Phone className="h-4 w-4 mr-1"/>Call 911</Button>
                      <Button variant="outline" className="border-green-400 text-green-700 hover:bg-green-50 h-9 px-3 text-sm" onClick={()=>ackEmergency(em.id)}><CheckCircle className="h-4 w-4 mr-1"/>Acknowledge</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* ── NOTIFICATIONS ── */}
          <TabsContent value="notifications" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Notifications</h2>
              {notifications.length>0&&<Button variant="outline" className="border-gray-300 text-gray-600 h-8 px-3 text-xs" onClick={async()=>{for(const n of notifications) await markNotifRead(n.id);}}>Mark all read</Button>}
            </div>
            {notifications.length===0?(
              <Card className="bg-white border border-gray-200"><CardContent className="py-12 text-center"><Bell className="h-12 w-12 text-gray-300 mx-auto mb-3"/><p className="text-gray-500">No new notifications</p></CardContent></Card>
            ):notifications.map(n=>(
              <div key={n.id} className={`flex gap-3 p-4 rounded-xl border ${n.type==='emergency'?'bg-red-50 border-red-200':n.type==='refill_reminder'?'bg-orange-50 border-orange-200':n.type==='appointment_booked'?'bg-purple-50 border-purple-200':'bg-blue-50 border-blue-100'}`}>
                <span className="text-xl shrink-0">{n.type==='emergency'?'🚨':n.type==='refill_reminder'?'💊':n.type==='appointment_booked'?'📅':'🔔'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{n.createdAt?.toDate?.()?.toLocaleString()||'Recently'}</p>
                </div>
                <button className="text-gray-400 hover:text-gray-600 shrink-0" onClick={()=>markNotifRead(n.id)}><X className="h-4 w-4"/></button>
              </div>
            ))}
          </TabsContent>

          {/* ── PROFILE ── */}
          <TabsContent value="profile" className="mt-4">
            <ProfileTab user={user} profile={profile} onProfileUpdated={u=>setProfile(u)} roleColor="teal"/>
          </TabsContent>
        </Tabs>
      </main>

      {user && <EmergencyPopup userId={user.uid}/>}

      {/* Connections modal */}
      {showConnections&&(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl">
            <Button variant="ghost" size="icon" className="absolute top-3 right-3 z-10 bg-white rounded-full shadow" onClick={()=>setShowConnections(false)}><X className="h-4 w-4"/></Button>
            <ConnectionsPanel userRole="caregiver"/>
          </div>
        </div>
      )}

      {/* Patient detail modal */}
      <Dialog open={showPatientModal} onOpenChange={setShowPatientModal}>
        <DialogContent className="bg-white max-w-2xl max-h-[88vh] overflow-y-auto" aria-describedby="pd-desc">
          <DialogHeader><DialogTitle className="text-gray-900">Patient Details</DialogTitle></DialogHeader>
          <p id="pd-desc" className="sr-only">Patient information</p>
          {selectedPatient&&(
            <div className="space-y-5">
              {/* Identity */}
              <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-teal-50 to-emerald-50 rounded-xl border border-teal-100">
                <div className={`h-16 w-16 rounded-xl flex items-center justify-center font-bold text-white text-2xl ${selectedPatient.stats.missedToday>0?'bg-amber-500':'bg-teal-600'}`}>{selectedPatient.name?.charAt(0)?.toUpperCase()}</div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedPatient.name}</h2>
                  <p className="text-sm text-gray-500">{selectedPatient.email}</p>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {selectedPatient.phone&&<span className="text-xs bg-white px-2 py-1 rounded-full border border-gray-200">📞 {selectedPatient.phone}</span>}
                    {selectedPatient.age&&<span className="text-xs bg-white px-2 py-1 rounded-full border border-gray-200">Age {selectedPatient.age}</span>}
                    {selectedPatient.bloodGroup&&<span className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded-full border border-red-200">{selectedPatient.bloodGroup}</span>}
                  </div>
                </div>
              </div>

              {/* Health info */}
              {(selectedPatient.medicalConditions||selectedPatient.allergies)&&(
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedPatient.medicalConditions&&<div className="p-3 bg-blue-50 border border-blue-100 rounded-xl"><p className="text-xs font-semibold text-blue-700 mb-1">Medical Conditions</p><p className="text-sm text-gray-800">{selectedPatient.medicalConditions}</p></div>}
                  {selectedPatient.allergies&&<div className="p-3 bg-red-50 border border-red-100 rounded-xl"><p className="text-xs font-semibold text-red-700 mb-1">⚠️ Allergies</p><p className="text-sm text-gray-800">{selectedPatient.allergies}</p></div>}
                </div>
              )}

              {/* AI Insights for this patient (from history records) */}
              {patientHistory[selectedPatient.id]?.length > 0 && (
                <AIInsightsPanel records={patientHistory[selectedPatient.id]} medicines={selectedPatient.medicines||[]} userName={selectedPatient.name} compact={true}/>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  {v:selectedPatient.medicines?.length||0,l:'Medicines',c:'text-blue-700',bg:'bg-blue-50 border-blue-100'},
                  {v:`${selectedPatient.stats.adherenceRate}%`,l:'Adherence',c:'text-emerald-700',bg:'bg-emerald-50 border-emerald-100'},
                  {v:selectedPatient.stats.missedToday,l:'Missed Today',c:'text-red-700',bg:'bg-red-50 border-red-100'},
                ].map((s,i)=><div key={i} className={`text-center p-3 rounded-xl border ${s.bg}`}><p className={`text-2xl font-bold ${s.c}`}>{s.v}</p><p className="text-xs text-gray-500">{s.l}</p></div>)}
              </div>

              {/* Refill alerts */}
              {(selectedPatient.refillAlerts?.length||0)>0&&(
                <div>
                  <h3 className="font-semibold text-orange-700 mb-2 flex items-center gap-2 text-sm"><Package className="h-4 w-4"/>Refill Alerts</h3>
                  {selectedPatient.refillAlerts?.map((a,i)=>(
                    <div key={i} className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg mb-2">
                      <div><p className="font-medium text-gray-900 text-sm">{a.medicineName}</p><p className="text-xs text-orange-700">{a.remaining} tablets · ~{a.daysLeft} days left</p></div>
                      <Badge className="bg-orange-500 text-white text-xs">Refill Soon</Badge>
                    </div>
                  ))}
                </div>
              )}

              {/* Medicines */}
              {(selectedPatient.medicines?.length||0)>0&&(
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2 flex items-center gap-2 text-sm"><Pill className="h-4 w-4 text-purple-600"/>Medicines</h3>
                  <div className="space-y-2">
                    {selectedPatient.medicines?.map((m:any,i:number)=>(
                      <div key={i} className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-100 rounded-lg">
                        <Pill className="h-4 w-4 text-purple-600 shrink-0"/>
                        <div className="flex-1 min-w-0"><span className="font-medium text-gray-900 text-sm">{m.name}</span><span className="text-gray-500 text-sm ml-2">{m.dosage}</span>{m.currentQuantity!=null&&<span className="text-xs text-gray-400 ml-2">({m.currentQuantity} left)</span>}</div>
                        {m.schedule?.length>0&&<span className="text-xs text-gray-500 shrink-0">{m.schedule.join(', ')}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Appointments */}
              {(selectedPatient.appointments?.length||0)>0&&(
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2 flex items-center gap-2 text-sm"><Calendar className="h-4 w-4 text-purple-600"/>Upcoming Appointments</h3>
                  {selectedPatient.appointments?.map((a:any)=>(
                    <div key={a.id} className="flex items-center justify-between p-3 bg-purple-50 border border-purple-100 rounded-lg mb-2">
                      <div><p className="font-medium text-sm text-gray-900">{a.title||'Appointment'}</p><p className="text-xs text-gray-500">Dr. {a.doctor}</p></div>
                      <div className="text-right"><p className="text-sm font-semibold text-purple-700">{a.date}</p><p className="text-xs text-gray-500">{a.time}</p></div>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1 flex-wrap">
                <Button className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-semibold h-11 min-w-[120px]" onClick={()=>{if(selectedPatient.phone)window.location.href=`tel:${selectedPatient.phone}`;else window.location.href='tel:911';}}>
                  <Phone className="h-4 w-4 mr-2"/>{selectedPatient.phone?`Call ${selectedPatient.name?.split(' ')[0]}`:'Call 911'}
                </Button>
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold h-11" onClick={()=>{setVideoTarget({id:selectedPatient.id,name:selectedPatient.name});setShowPatientModal(false);setShowVideoConsult(true);}}>
                  📹 Video Call
                </Button>
                <Button variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50 font-semibold h-11" onClick={()=>{setShowPatientModal(false);navigate('/schedule');}}>
                  <Calendar className="h-4 w-4 mr-2"/>Book Appointment
                </Button>
                <Button variant="outline" className="border-gray-300 text-gray-600 h-11 px-4" onClick={()=>setShowPatientModal(false)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    {/* Video Consultation */}
    {user && videoTarget && (
      <VideoConsult open={showVideoConsult} onClose={()=>setShowVideoConsult(false)}
        doctorName={profile?.name||'Caregiver'} patientName={videoTarget.name}
        doctorId={user.uid} patientId={videoTarget.id} role="doctor"
        callerName={profile?.name}/>
    )}
    </div>
  );
};

export default CaregiverApp;
