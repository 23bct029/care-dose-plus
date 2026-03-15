// src/pages/DoctorApp.tsx - Calendar, medicine autocomplete, appointment reminders
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getUserProfile, logOut } from '@/lib/firebase-auth';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, addDoc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ConnectionsPanel from '@/components/ConnectionsPanel';
import EmergencyPopup from '@/components/EmergencyPopup';
import ProfileTab from '@/components/ProfileTab';
import VideoConsult from '@/components/VideoConsult';
import MedicineSearch from '@/components/MedicineSearch';
import PatientSearch from '@/components/PatientSearch';
import { checkLocalInteractions, SEVERITY_CONFIG } from '@/lib/drug-interactions';
import {
  Stethoscope, Users, Calendar, Pill, Clock, Search, UserPlus,
  LogOut, Bell, AlertCircle, CheckCircle, XCircle, Heart, Plus,
  X, RefreshCw, Eye, Trash2, Phone, FileText, ChevronLeft, ChevronRight, Video
} from 'lucide-react';

interface Patient { id:string; name:string; email:string; phone?:string; age?:number; gender?:string; bloodGroup?:string; allergies?:string; medicalConditions?:string; riskLevel?:'low'|'medium'|'high'; }
interface Appointment { id:string; patientId:string; patientName:string; date:string; time:string; type?:string; status:'scheduled'|'completed'|'cancelled'|'pending'; notes?:string; doctorId?:string; createdAt:any; }
interface PrescriptionMed { name:string; dosage:string; frequency:string; timing:string; duration:string; notes:string; }
interface Prescription { id:string; patientId:string; patientName:string; medicines:PrescriptionMed[]; totalDuration:string; generalNotes?:string; status:'active'|'completed'|'cancelled'; createdAt:any; }
interface Emergency { id:string; userId:string; userName:string; type:string; status:'active'|'resolved'; timestamp:any; }

const EMPTY_MED: PrescriptionMed = { name:'', dosage:'', frequency:'Once daily', timing:'After food', duration:'30 days', notes:'' };
const FREQUENCIES = ['Once daily','Twice daily','Three times daily','Four times daily','As needed','Weekly'];
const TIMINGS = ['Before food','After food','With food','Empty stomach','At bedtime'];
const APT_TYPES = ['checkup','follow-up','consultation','emergency','review','procedure','teleconsultation'];

// Calendar helpers
const getDaysInMonth = (year:number, month:number) => new Date(year, month+1, 0).getDate();
const getFirstDayOfMonth = (year:number, month:number) => new Date(year, month, 1).getDay();
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const DoctorApp = () => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient|null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [activeTab, setActiveTab] = useState('patients');
  const [pendingInvitations, setPendingInvitations] = useState(0);
  const [interactions, setInteractions] = useState<any[]>([]);
  const [rxMeds, setRxMeds] = useState<PrescriptionMed[]>([{...EMPTY_MED}]);
  const [rxNotes, setRxNotes] = useState('');
  const [rxDuration, setRxDuration] = useState('30 days');
  const [rxNextAppt, setRxNextAppt] = useState('');
  const [aptForm, setAptForm] = useState({ patientId:'', patientName:'', date:'', time:'09:00', type:'checkup', notes:'', duration:30 });
  // Calendar state
  const calNow = new Date();
  const [calYear, setCalYear] = useState(calNow.getFullYear());
  const [calMonth, setCalMonth] = useState(calNow.getMonth());
  const [calSelected, setCalSelected] = useState<string|null>(null);
  // Video
  const [showVideoConsult, setShowVideoConsult] = useState(false);
  const [videoPatient, setVideoPatient] = useState<Patient|null>(null);
  const [videoAppointmentId, setVideoAppointmentId] = useState<string|undefined>();
  const [stats, setStats] = useState({ totalPatients:0, todayApts:0, activePrescriptions:0, emergencies:0, completedToday:0 });
  // Map patientId -> their current prescriptions (for patient card display)
  const [patientPrescriptions, setPatientPrescriptions] = useState<Record<string, Prescription[]>>({});
  const unsubRef = useRef<(()=>void)[]>([]);
  const navigate = useNavigate();
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const init = async () => {
      const cu = await getCurrentUser();
      if (!cu) { navigate('/login'); return; }
      setUser(cu);
      setProfile(await getUserProfile(cu.uid));
      setLoading(false);
      await setupListeners(cu.uid);
      await logger.logWithUser(cu.uid, cu.email, 'info', 'Doctor dashboard loaded')
      // Register FCM push token
      import('@/lib/push-notifications').then(m => m.registerPushNotifications(cu.uid));;
    };
    init();
    return () => unsubRef.current.forEach(u=>u());
  }, []);

  // Appointment reminders — check every minute
  useEffect(() => {
    if (!user || appointments.length === 0) return;
    const check = () => {
      const now = new Date();
      const in30 = new Date(now.getTime() + 30*60*1000);
      const t30 = `${in30.getHours().toString().padStart(2,'0')}:${in30.getMinutes().toString().padStart(2,'0')}`;
      const todayDate = now.toISOString().split('T')[0];
      appointments.filter(a => a.date === todayDate && a.status === 'scheduled' && a.time === t30).forEach(a => {
        if (Notification.permission === 'granted') {
          new Notification('📅 Appointment in 30 minutes', { body: `${a.patientName} at ${a.time}`, icon: '/favicon.svg' });
        }
      });
    };
    const timer = setInterval(check, 60000);
    // Request notification permission
    if (Notification.permission === 'default') Notification.requestPermission();
    return () => clearInterval(timer);
  }, [user, appointments]);

  const setupListeners = async (uid: string) => {
    unsubRef.current.forEach(u=>u()); unsubRef.current = [];
    const u1 = onSnapshot(query(collection(db,'connections'), where('users','array-contains',uid), where('status','==','active')), async snap => {
      const list: Patient[] = [];
      for (const cd of snap.docs) {
        const conn = cd.data();
        const otherId = conn.users?.find((id:string)=>id!==uid);
        if (!otherId) continue;
        try {
          const ud = await getDoc(doc(db,'users',otherId));
          const d = ud.data();
          if (d && (d.role==='elderly'||d.role==='patient')) {
            list.push({ id:otherId, name:d.name||d.email?.split('@')[0], email:d.email||'', phone:d.phone, age:d.age, gender:d.gender, bloodGroup:d.bloodGroup, allergies:d.allergies, medicalConditions:d.medicalConditions, riskLevel:d.riskLevel||'low' });
          }
        } catch {}
      }
      setPatients(list);
      setStats(p=>({...p, totalPatients:list.length}));
    });
    const u2 = onSnapshot(query(collection(db,'appointments'), where('doctorId','==',uid)), snap => {
      const apts = snap.docs.map(d=>({id:d.id,...d.data()})) as Appointment[];
      apts.sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
      setAppointments(apts);
      setStats(p=>({...p, todayApts:apts.filter(a=>a.date===today&&a.status==='scheduled').length, completedToday:apts.filter(a=>a.date===today&&a.status==='completed').length}));
    });
    const u3 = onSnapshot(query(collection(db,'prescriptions'), where('doctorId','==',uid), where('status','==','active')), snap => {
      const rxs = snap.docs.map(d=>({id:d.id,...d.data()})) as Prescription[];
      setPrescriptions(rxs);
      setStats(p=>({...p, activePrescriptions:rxs.length}));
      // Group by patient for card display
      const byPatient: Record<string,Prescription[]> = {};
      rxs.forEach(rx => { if (!byPatient[rx.patientId]) byPatient[rx.patientId]=[]; byPatient[rx.patientId].push(rx); });
      setPatientPrescriptions(byPatient);
    });
    const u4 = onSnapshot(query(collection(db,'emergencies'), where('status','==','active')), snap => {
      setEmergencies(snap.docs.map(d=>({id:d.id,...d.data()})) as Emergency[]);
      setStats(p=>({...p, emergencies:snap.size}));
    });
    const u5 = onSnapshot(query(collection(db,'invitations'), where('toUserId','==',uid), where('status','==','pending')), snap => setPendingInvitations(snap.size));
    unsubRef.current = [u1,u2,u3,u4,u5];
  };

  const handleSavePrescription = async () => {
    if (!selectedPatient || !rxMeds[0].name) return;
    try {
      const rxRef = await addDoc(collection(db,'prescriptions'), {
        doctorId:user.uid, doctorName:profile?.name, patientId:selectedPatient.id, patientName:selectedPatient.name,
        medicines:rxMeds.filter(m=>m.name), totalDuration:rxDuration, generalNotes:rxNotes, status:'active', createdAt:serverTimestamp()
      });
      for (const med of rxMeds.filter(m=>m.name)) {
        const times = med.frequency.includes('Once')?['08:00']:med.frequency.includes('Twice')?['08:00','20:00']:['08:00','13:00','20:00'];
        const qty = parseInt(rxDuration)*times.length || 30;
        await addDoc(collection(db,'medicines'), {
          userId:selectedPatient.id, name:med.name, dosage:med.dosage, schedule:times,
          instructions:med.notes, foodTiming:med.timing.includes('After')?'after':'before',
          prescribedBy:profile?.name, prescriptionId:rxRef.id,
          totalQuantity:qty, currentQuantity:qty, createdAt:serverTimestamp()
        });
      }
      // Notify patient
      await addDoc(collection(db,'notifications'), {
        userId:selectedPatient.id, type:'prescription', prescriptionId:rxRef.id,
        fromUserId:user.uid, fromUserName:profile?.name, navigateTo:'/elderly',
        message:`💊 Dr. ${profile?.name} has issued a new prescription for you (${rxMeds.filter(m=>m.name).map(m=>m.name).join(', ')}).`,
        read:false, createdAt:serverTimestamp()
      });
      // Notify connected caregivers
      try {
        const conns = await getDocs(query(collection(db,'connections'), where('users','array-contains',selectedPatient.id), where('status','==','active')));
        for (const cd of conns.docs) {
          const conn = cd.data();
          const cgId = conn.users?.find((id:string)=>id!==selectedPatient.id);
          if (!cgId) continue;
          const cgDoc = await getDoc(doc(db,'users',cgId));
          if (cgDoc.data()?.role==='caregiver') {
            await addDoc(collection(db,'notifications'), {
              userId:cgId, type:'prescription', prescriptionId:rxRef.id,
              fromUserId:user.uid, fromUserName:profile?.name, navigateTo:'/caregiver',
              message:`💊 Dr. ${profile?.name} issued a prescription for ${selectedPatient.name}: ${rxMeds.filter(m=>m.name).map(m=>m.name).join(', ')}.`,
              read:false, createdAt:serverTimestamp()
            });
          }
        }
      } catch {}
      if (rxNextAppt) {
        await addDoc(collection(db,'appointments'), { doctorId:user.uid, doctorName:profile?.name, patientId:selectedPatient.id, patientName:selectedPatient.name, date:rxNextAppt, time:'10:00', type:'follow-up', status:'scheduled', notes:'Follow-up after prescription', createdAt:serverTimestamp() });
        await addDoc(collection(db,'notifications'), { userId:selectedPatient.id, type:'appointment_booked', fromUserId:user.uid, fromUserName:profile?.name, message:`📅 Dr. ${profile?.name} scheduled a follow-up appointment on ${rxNextAppt} at 10:00 AM.`, read:false, createdAt:serverTimestamp() });
      }
      await logger.logWithUser(user.uid, user.email, 'info', 'Prescription issued', { patientId:selectedPatient.id });
      setShowPrescriptionModal(false);
      setRxMeds([{...EMPTY_MED}]); setRxNotes(''); setRxDuration('30 days'); setRxNextAppt('');
      setInteractions([]);
    } catch(e) { console.error(e); }
  };

  const handleBookAppointment = async () => {
    if (!aptForm.patientId || !aptForm.date || !aptForm.time) return;
    try {
      await addDoc(collection(db,'appointments'), { doctorId:user.uid, doctorName:profile?.name, ...aptForm, status:'scheduled', createdAt:serverTimestamp() });
      await addDoc(collection(db,'notifications'), { userId:aptForm.patientId, type:'appointment_booked', fromUserId:user.uid, fromUserName:profile?.name, message:`📅 Dr. ${profile?.name} has scheduled a ${aptForm.type} appointment on ${aptForm.date} at ${aptForm.time}.`, read:false, createdAt:serverTimestamp() });
      await logger.logWithUser(user.uid, user.email, 'info', 'Appointment booked', {patientId:aptForm.patientId, date:aptForm.date});
      setShowAppointmentModal(false);
      setAptForm({patientId:'',patientName:'',date:'',time:'09:00',type:'checkup',notes:'',duration:30});
    } catch(e) { console.error(e); }
  };

  const handleUpdateAppointment = async (id:string, status:string) => {
    await updateDoc(doc(db,'appointments',id), {status, updatedAt:serverTimestamp()});
  };

  const updateRxMed = (i:number, k:keyof PrescriptionMed, v:string) => {
    setRxMeds(p => { const n=[...p]; n[i]={...n[i],[k]:v}; return n; });
    const names = [...rxMeds]; names[i] = {...names[i], [k]:v};
    setInteractions(checkLocalInteractions(names.map(m=>m.name).filter(Boolean)));
  };

  // Calendar helpers
  const calDays = getDaysInMonth(calYear, calMonth);
  const calFirst = getFirstDayOfMonth(calYear, calMonth);
  const aptsByDate: Record<string, Appointment[]> = {};
  appointments.forEach(a => { if (!aptsByDate[a.date]) aptsByDate[a.date] = []; aptsByDate[a.date].push(a); });
  const prevMonth = () => { if (calMonth===0) { setCalMonth(11); setCalYear(y=>y-1); } else setCalMonth(m=>m-1); };
  const nextMonth = () => { if (calMonth===11) { setCalMonth(0); setCalYear(y=>y+1); } else setCalMonth(m=>m+1); };
  const calDateStr = (day:number) => `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const selectedApts = calSelected ? (aptsByDate[calSelected] || []) : [];
  const filtered = patients.filter(p=>p.name?.toLowerCase().includes(searchTerm.toLowerCase())||p.email?.toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading) return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center">
      <div className="text-center"><div className="animate-spin rounded-full h-14 w-14 border-4 border-blue-600 border-t-transparent mx-auto"></div><p className="mt-4 text-gray-600">Loading...</p></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {emergencies.length>0&&(
        <div className="bg-red-600 text-white py-2.5 px-4 fixed top-0 left-0 right-0 z-50">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4 animate-pulse"/><span className="font-bold text-sm">{emergencies.length} ACTIVE EMERGENCY{emergencies.length>1?'S':''}</span></div>
            <Button size="sm" className="bg-white text-red-600 hover:bg-red-50 h-7 px-3 text-xs" onClick={()=>setActiveTab('emergencies')}>View</Button>
          </div>
        </div>
      )}

      <header className={`bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm ${emergencies.length>0?'mt-10':''}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-blue-600 flex items-center justify-center shrink-0"><Stethoscope className="h-6 w-6 text-white"/></div>
              <div>
                <h1 className="text-base font-bold text-gray-900">Dr. {profile?.name||'Doctor'}</h1>
                <p className="text-xs text-gray-500">{new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" className="relative border-gray-300 text-gray-700 hover:bg-gray-50 h-9 px-3 text-sm" onClick={()=>setShowConnections(true)}>
                <Users className="h-4 w-4 mr-1.5"/>Connections
                {pendingInvitations>0&&<span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">{pendingInvitations}</span>}
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500 hover:bg-red-50 hover:text-red-600" onClick={async()=>{await logger.logWithUser(user?.uid,user?.email,'info','Doctor logged out');unsubRef.current.forEach(u=>u());await logOut();navigate('/login');}}>
                <LogOut className="h-4 w-4"/>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {[
            {label:'Patients',value:stats.totalPatients,icon:<Users className="h-5 w-5"/>,color:'text-blue-600',bg:'bg-blue-50',border:'border-blue-100'},
            {label:"Today's Apts",value:stats.todayApts,icon:<Calendar className="h-5 w-5"/>,color:'text-emerald-600',bg:'bg-emerald-50',border:'border-emerald-100'},
            {label:'Completed',value:stats.completedToday,icon:<CheckCircle className="h-5 w-5"/>,color:'text-teal-600',bg:'bg-teal-50',border:'border-teal-100'},
            {label:'Prescriptions',value:stats.activePrescriptions,icon:<Pill className="h-5 w-5"/>,color:'text-purple-600',bg:'bg-purple-50',border:'border-purple-100'},
            {label:'Emergencies',value:stats.emergencies,icon:<AlertCircle className="h-5 w-5"/>,color:'text-red-600',bg:'bg-red-50',border:'border-red-100'},
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

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="patients">🧑‍⚕️ Patients ({patients.length})</TabsTrigger>
            <TabsTrigger value="calendar">📅 Calendar</TabsTrigger>
            <TabsTrigger value="appointments">🕐 Appointments ({appointments.filter(a=>a.status==='scheduled').length})</TabsTrigger>
  
            <TabsTrigger value="emergencies">🚨{emergencies.length>0?` (${emergencies.length})`:''}</TabsTrigger>
            <TabsTrigger value="profile">👤 Profile</TabsTrigger>
          </TabsList>

          {/* ── PATIENTS ── */}
          <TabsContent value="patients" className="mt-4 space-y-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"/>
                <Input placeholder="Search patients…" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} className="pl-9 bg-white border-gray-300 h-10"/>
              </div>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white h-10 px-4 shrink-0" onClick={()=>setShowConnections(true)}>
                <UserPlus className="h-4 w-4 mr-2"/>Add Patient
              </Button>
            </div>
            {filtered.length===0?(
              <Card className="bg-white border border-gray-200"><CardContent className="py-16 text-center">
                <div className="h-16 w-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4"><Heart className="h-8 w-8 text-blue-400"/></div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">No patients connected</h3>
                <p className="text-gray-500 text-sm mb-5">{searchTerm?'No patients match':'Connect with patients to start'}</p>
                {!searchTerm&&<Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={()=>setShowConnections(true)}><UserPlus className="h-4 w-4 mr-2"/>Add Patient</Button>}
              </CardContent></Card>
            ):(
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map(p=>(
                  <Card key={p.id} className="bg-white border-2 border-gray-100 hover:border-blue-300 hover:shadow-md transition-all">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`h-12 w-12 rounded-xl flex items-center justify-center font-bold text-white text-lg ${p.riskLevel==='high'?'bg-red-500':p.riskLevel==='medium'?'bg-amber-500':'bg-blue-500'}`}>{p.name?.charAt(0)?.toUpperCase()}</div>
                          <div>
                            <h3 className="font-semibold text-gray-900">{p.name}</h3>
                            <p className="text-xs text-gray-400 truncate max-w-[160px]">{p.email}</p>
                            {p.age&&<p className="text-xs text-gray-400">Age {p.age}{p.bloodGroup?` · ${p.bloodGroup}`:''}</p>}
                          </div>
                        </div>
                        <Badge className={`text-xs ${p.riskLevel==='high'?'bg-red-100 text-red-700':p.riskLevel==='medium'?'bg-amber-100 text-amber-700':'bg-green-100 text-green-700'}`}>
                          {p.riskLevel==='high'?'High Risk':p.riskLevel==='medium'?'Medium':'Stable'}
                        </Badge>
                      </div>
                      {(p.allergies||p.medicalConditions)&&(
                        <div className="mb-3 space-y-1">
                          {p.allergies&&<p className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">⚠️ Allergies: {p.allergies}</p>}
                          {p.medicalConditions&&<p className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded">🩺 {p.medicalConditions}</p>}
                        </div>
                      )}
                      {/* Current prescriptions */}
                      {patientPrescriptions[p.id]?.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs font-semibold text-purple-700 mb-1">💊 Current Medications</p>
                          <div className="flex flex-wrap gap-1">
                            {patientPrescriptions[p.id].flatMap(rx=>rx.medicines||[]).slice(0,4).map((m,i)=>(
                              <span key={i} className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">{m.name} {m.dosage}</span>
                            ))}
                            {patientPrescriptions[p.id].flatMap(rx=>rx.medicines||[]).length > 4 && (
                              <span className="text-xs text-gray-400">+{patientPrescriptions[p.id].flatMap(rx=>rx.medicines||[]).length - 4} more</span>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-2">
                        <Button size="sm" variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50 h-9 text-xs" onClick={()=>{setSelectedPatient(p);setShowPatientModal(true);}}>
                          <Eye className="h-3.5 w-3.5 mr-1"/>View
                        </Button>
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-xs" onClick={()=>{setSelectedPatient(p);setRxMeds([{...EMPTY_MED}]);setInteractions([]);setShowPrescriptionModal(true);}}>
                          <Pill className="h-3.5 w-3.5 mr-1"/>Prescribe
                        </Button>
                        <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white h-9 text-xs" onClick={()=>{setSelectedPatient(p);setAptForm(f=>({...f,patientId:p.id,patientName:p.name}));setShowAppointmentModal(true);}}>
                          <Calendar className="h-3.5 w-3.5 mr-1"/>Book
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── CALENDAR ── */}
          <TabsContent value="calendar" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Calendar widget */}
              <Card className="bg-white border border-gray-200 shadow-none lg:col-span-2">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold text-gray-900">{MONTH_NAMES[calMonth]} {calYear}</CardTitle>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:bg-gray-100" onClick={prevMonth}><ChevronLeft className="h-4 w-4"/></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:bg-gray-100" onClick={nextMonth}><ChevronRight className="h-4 w-4"/></Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Day headers */}
                  <div className="grid grid-cols-7 mb-2">
                    {DAY_NAMES.map(d=><div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>)}
                  </div>
                  {/* Days grid */}
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({length:calFirst}).map((_,i)=><div key={`empty-${i}`}/>)}
                    {Array.from({length:calDays}).map((_,i)=>{
                      const day = i+1;
                      const dateStr = calDateStr(day);
                      const dayApts = aptsByDate[dateStr] || [];
                      const isToday = dateStr === today;
                      const isSelected = dateStr === calSelected;
                      const hasPending = dayApts.some(a=>a.status==='scheduled');
                      return (
                        <button key={day} onClick={()=>setCalSelected(isSelected?null:dateStr)}
                          className={`relative aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-medium transition-all hover:bg-blue-50
                            ${isToday?'ring-2 ring-blue-500':''}
                            ${isSelected?'bg-blue-600 text-white hover:bg-blue-700':'text-gray-700'}
                            ${!isSelected&&hasPending?'bg-blue-50':''}`}>
                          <span className={isSelected?'text-white':''}>{day}</span>
                          {dayApts.length>0&&(
                            <div className="flex gap-0.5 mt-0.5">
                              {dayApts.slice(0,3).map((a,j)=>(
                                <div key={j} className={`h-1.5 w-1.5 rounded-full ${a.status==='scheduled'?'bg-blue-500':a.status==='completed'?'bg-emerald-500':'bg-gray-300'} ${isSelected?'bg-white':''}`}/>
                              ))}
                              {dayApts.length>3&&<span className="text-[8px] text-gray-400">+</span>}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {/* Legend */}
                  <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="h-2.5 w-2.5 rounded-full bg-blue-500"/><span>Scheduled</span></div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="h-2.5 w-2.5 rounded-full bg-emerald-500"/><span>Completed</span></div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="h-2.5 w-2.5 rounded-full ring-2 ring-blue-500 ring-inset"/><span>Today</span></div>
                  </div>
                </CardContent>
              </Card>

              {/* Day detail panel */}
              <Card className="bg-white border border-gray-200 shadow-none">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-gray-900">
                      {calSelected ? new Date(calSelected+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'}) : 'Select a date'}
                    </CardTitle>
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-7 px-2 text-xs" onClick={()=>{setAptForm(f=>({...f,date:calSelected||today}));setShowAppointmentModal(true);}}>
                      <Plus className="h-3 w-3 mr-1"/>Add
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {!calSelected?(
                    <div className="py-6 text-center"><Calendar className="h-10 w-10 text-gray-300 mx-auto mb-2"/><p className="text-sm text-gray-400">Click a date to see appointments</p></div>
                  ):selectedApts.length===0?(
                    <div className="py-6 text-center"><p className="text-sm text-gray-400">No appointments this day</p><Button size="sm" className="mt-3 bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs" onClick={()=>{setAptForm(f=>({...f,date:calSelected}));setShowAppointmentModal(true);}}>Schedule one</Button></div>
                  ):(
                    <div className="space-y-2">
                      {selectedApts.map(a=>(
                        <div key={a.id} className={`p-3 rounded-xl border ${a.status==='scheduled'?'bg-blue-50 border-blue-200':a.status==='completed'?'bg-emerald-50 border-emerald-200':'bg-gray-50 border-gray-200'}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-semibold text-gray-900">{a.patientName}</span>
                            <span className="text-xs font-bold text-blue-700">{a.time}</span>
                          </div>
                          <p className="text-xs text-gray-500 capitalize">{a.type||'Checkup'}</p>
                          <div className="flex gap-1.5 mt-2">
                            {a.status==='scheduled'&&<>
                              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 px-2 text-xs" onClick={()=>handleUpdateAppointment(a.id,'completed')}>Done</Button>
                              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-7 px-2 text-xs" onClick={()=>{const p=patients.find(pt=>pt.id===a.patientId)||{id:a.patientId,name:a.patientName,email:''};setVideoPatient(p as Patient);setVideoAppointmentId(a.id);setShowVideoConsult(true);}}>📹</Button>
                              <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 h-7 px-2 text-xs" onClick={()=>handleUpdateAppointment(a.id,'cancelled')}>Cancel</Button>
                            </>}
                            {a.status!=='scheduled'&&<Badge className={a.status==='completed'?'bg-emerald-100 text-emerald-700 text-xs':'bg-gray-200 text-gray-600 text-xs'}>{a.status}</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── APPOINTMENTS LIST ── */}
          <TabsContent value="appointments" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">All Appointments</h2>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-4 text-sm" onClick={()=>setShowAppointmentModal(true)}>
                <Plus className="h-4 w-4 mr-2"/>Schedule
              </Button>
            </div>
            {/* Today's appointments highlighted */}
            {appointments.filter(a=>a.date===today&&a.status==='scheduled').length>0&&(
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-xs font-semibold text-blue-700 mb-2">📅 Today's Appointments</p>
                <div className="space-y-2">
                  {appointments.filter(a=>a.date===today&&a.status==='scheduled').map(a=>(
                    <div key={a.id} className="flex items-center justify-between bg-white rounded-lg p-2.5 border border-blue-100">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{a.patientName}</p>
                        <p className="text-xs text-gray-500">{a.time} · {a.type||'Checkup'}</p>
                      </div>
                      <div className="flex gap-1.5">
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-7 px-2 text-xs" onClick={()=>{const p=patients.find(pt=>pt.id===a.patientId)||{id:a.patientId,name:a.patientName,email:''};setVideoPatient(p as Patient);setVideoAppointmentId(a.id);setShowVideoConsult(true);}}>📹 Video</Button>
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 px-2 text-xs" onClick={()=>handleUpdateAppointment(a.id,'completed')}>Done</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {appointments.length===0?(
              <Card className="bg-white border border-gray-200"><CardContent className="py-12 text-center"><Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3"/><p className="text-gray-500">No appointments</p></CardContent></Card>
            ):(
              <div className="space-y-2">
                {appointments.filter(a=>!(a.date===today&&a.status==='scheduled')).map(apt=>(
                  <div key={apt.id} className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${apt.date===today?'bg-blue-50 border-blue-200':'bg-white border-gray-100 hover:bg-gray-50'}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2 rounded-xl shrink-0 ${apt.date===today?'bg-blue-600':'bg-gray-100'}`}><Clock className={`h-4 w-4 ${apt.date===today?'text-white':'text-gray-500'}`}/></div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{apt.patientName}</p>
                        <p className="text-xs text-gray-500">{apt.date} · {apt.time} · {apt.type||'Checkup'}</p>
                        {apt.notes&&<p className="text-xs text-gray-400 truncate">{apt.notes}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={apt.status==='completed'?'bg-emerald-100 text-emerald-700 text-xs':apt.status==='cancelled'?'bg-red-100 text-red-700 text-xs':apt.status==='pending'?'bg-amber-100 text-amber-700 text-xs':'bg-blue-100 text-blue-700 text-xs'}>{apt.status}</Badge>
                      {apt.status==='scheduled'&&<>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-7 px-2 text-xs" onClick={()=>{const p=patients.find(pt=>pt.id===apt.patientId)||{id:apt.patientId,name:apt.patientName,email:''};setVideoPatient(p as Patient);setVideoAppointmentId(apt.id);setShowVideoConsult(true);}}>📹</Button>
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 px-2 text-xs" onClick={()=>handleUpdateAppointment(apt.id,'completed')}><CheckCircle className="h-3 w-3"/></Button>
                        <Button size="sm" variant="outline" className="border-red-300 text-red-500 hover:bg-red-50 h-7 px-2 text-xs" onClick={()=>handleUpdateAppointment(apt.id,'cancelled')}><XCircle className="h-3 w-3"/></Button>
                      </>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── EMERGENCIES ── */}
          <TabsContent value="emergencies" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Emergency Alerts</h2>
              <Button className="bg-red-600 hover:bg-red-700 text-white h-9 px-4 text-sm" onClick={()=>window.location.href='tel:911'}><Phone className="h-4 w-4 mr-2"/>Call 911</Button>
            </div>
            {emergencies.length===0?(
              <Card className="bg-white border border-gray-200"><CardContent className="py-12 text-center">
                <div className="h-12 w-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3"><CheckCircle className="h-6 w-6 text-emerald-600"/></div>
                <p className="text-gray-500 font-medium">All clear — no active emergencies</p>
              </CardContent></Card>
            ):emergencies.map(em=>(
              <Card key={em.id} className="bg-red-50 border-2 border-red-300">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-3"><AlertCircle className="h-6 w-6 text-red-500 animate-pulse mt-0.5 shrink-0"/>
                      <div><p className="font-bold text-gray-900">{em.userName}</p><p className="text-red-700 font-semibold text-sm">🚨 {em.type?.toUpperCase()}</p><p className="text-xs text-gray-500 mt-1">{em.timestamp?.toDate?.()?.toLocaleString()||'Just now'}</p></div>
                    </div>
                    <div className="flex gap-2">
                      <Button className="bg-red-600 hover:bg-red-700 text-white h-9 px-4 text-sm" onClick={()=>window.location.href='tel:911'}><Phone className="h-4 w-4 mr-1"/>Call 911</Button>
                      <Button variant="outline" className="border-emerald-400 text-emerald-700 hover:bg-emerald-50 h-9 px-4 text-sm" onClick={()=>updateDoc(doc(db,'emergencies',em.id),{status:'resolved',resolvedAt:serverTimestamp(),resolvedBy:user?.uid})}><CheckCircle className="h-4 w-4 mr-1"/>Resolve</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* ── PROFILE ── */}
          <TabsContent value="profile" className="mt-4">
            <ProfileTab user={user} profile={profile} onProfileUpdated={u=>setProfile(u)} roleColor="blue"/>
          </TabsContent>
        </Tabs>
      </main>

      {user&&<EmergencyPopup userId={user.uid}/>}

      {showConnections&&(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl">
            <Button variant="ghost" size="icon" className="absolute top-3 right-3 z-10 bg-white rounded-full shadow" onClick={()=>setShowConnections(false)}><X className="h-4 w-4"/></Button>
            <ConnectionsPanel userRole="doctor"/>
          </div>
        </div>
      )}

      {/* Patient Detail */}
      <Dialog open={showPatientModal} onOpenChange={setShowPatientModal}>
        <DialogContent className="bg-white max-w-lg" aria-describedby="pm-d">
          <DialogHeader><DialogTitle>Patient Details</DialogTitle></DialogHeader>
          <p id="pm-d" className="sr-only">Patient info</p>
          {selectedPatient&&(
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <div className={`h-16 w-16 rounded-xl flex items-center justify-center font-bold text-white text-2xl ${selectedPatient.riskLevel==='high'?'bg-red-500':selectedPatient.riskLevel==='medium'?'bg-amber-500':'bg-blue-500'}`}>{selectedPatient.name?.charAt(0)?.toUpperCase()}</div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedPatient.name}</h2>
                  <p className="text-sm text-gray-500">{selectedPatient.email}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {selectedPatient.age&&<span className="text-xs bg-white px-2 py-0.5 rounded-full border border-gray-200">Age {selectedPatient.age}</span>}
                    {selectedPatient.bloodGroup&&<span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full border border-red-200">{selectedPatient.bloodGroup}</span>}
                  </div>
                </div>
              </div>
              {selectedPatient.allergies&&<div className="p-3 bg-red-50 border border-red-200 rounded-lg"><p className="text-xs font-semibold text-red-700 mb-1">⚠️ Allergies</p><p className="text-sm text-gray-800">{selectedPatient.allergies}</p></div>}
              {selectedPatient.medicalConditions&&<div className="p-3 bg-blue-50 border border-blue-200 rounded-lg"><p className="text-xs font-semibold text-blue-700 mb-1">Medical Conditions</p><p className="text-sm text-gray-800">{selectedPatient.medicalConditions}</p></div>}
              <div className="flex gap-3 flex-wrap">
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-10 min-w-[90px]" onClick={()=>{setShowPatientModal(false);setRxMeds([{...EMPTY_MED}]);setInteractions([]);setShowPrescriptionModal(true);}}><Pill className="h-4 w-4 mr-2"/>Prescribe</Button>
                <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white h-10 min-w-[90px]" onClick={()=>{setAptForm(f=>({...f,patientId:selectedPatient.id,patientName:selectedPatient.name}));setShowPatientModal(false);setShowAppointmentModal(true);}}><Calendar className="h-4 w-4 mr-2"/>Book Apt</Button>
                <Button className="bg-green-600 hover:bg-green-700 text-white h-10 px-4" onClick={()=>{setVideoPatient(selectedPatient);setShowPatientModal(false);setShowVideoConsult(true);}}>📹 Video</Button>
                <Button variant="outline" className="border-gray-300 text-gray-600 h-10 px-4" onClick={()=>setShowPatientModal(false)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Prescription Modal */}
      <Dialog open={showPrescriptionModal} onOpenChange={setShowPrescriptionModal}>
        <DialogContent className="bg-white max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="rx-d">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-blue-900"><Pill className="h-5 w-5 text-blue-600"/>Prescription — {selectedPatient?.name}</DialogTitle></DialogHeader>
          <p id="rx-d" className="sr-only">Write prescription</p>
          {interactions.length>0&&(
            <div className="space-y-2">
              {interactions.map((ix,i)=>{
                const cfg=SEVERITY_CONFIG[ix.severity as keyof typeof SEVERITY_CONFIG]||SEVERITY_CONFIG.moderate;
                return <div key={i} className={`p-3 rounded-lg border ${cfg.bg} ${cfg.border}`}><p className={`text-sm font-bold ${cfg.color}`}>⚠️ {cfg.label}: {ix.drug1} + {ix.drug2}</p><p className={`text-xs ${cfg.color} mt-1`}>{ix.description}</p><p className={`text-xs ${cfg.color} font-medium`}>→ {ix.recommendation}</p></div>;
              })}
            </div>
          )}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm font-medium text-gray-700">Duration</Label>
                <select value={rxDuration} onChange={e=>setRxDuration(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm h-10">
                  {['7 days','14 days','30 days','60 days','90 days','Ongoing'].map(d=><option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-medium text-gray-700">Next Appointment</Label>
                <Input type="date" value={rxNextAppt} onChange={e=>setRxNextAppt(e.target.value)} className="border-gray-300 bg-white h-10 text-sm" min={today}/>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-800">Medicines</p>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-3 text-xs" onClick={()=>setRxMeds(p=>[...p,{...EMPTY_MED}])}><Plus className="h-3.5 w-3.5 mr-1"/>Add</Button>
              </div>
              <div className="space-y-3">
                {rxMeds.map((med,i)=>(
                  <div key={i} className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-blue-700">Medicine {i+1}</p>
                      {rxMeds.length>1&&<button onClick={()=>setRxMeds(p=>p.filter((_,idx)=>idx!==i))} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4"/></button>}
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1 col-span-2 sm:col-span-1">
                        <Label className="text-xs text-gray-600">Medicine Name *</Label>
                        <MedicineSearch value={med.name} onChange={v=>updateRxMed(i,'name',v)} placeholder="Search medicine..."/>
                      </div>
                      <div className="space-y-1 col-span-2 sm:col-span-1">
                        <Label className="text-xs text-gray-600">Dosage</Label>
                        <Input placeholder="e.g. 500mg" value={med.dosage} onChange={e=>updateRxMed(i,'dosage',e.target.value)} className="bg-white border-gray-300 h-9 text-sm"/>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-600">Frequency</Label>
                        <select value={med.frequency} onChange={e=>updateRxMed(i,'frequency',e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-sm h-9">
                          {FREQUENCIES.map(f=><option key={f}>{f}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-600">Timing</Label>
                        <select value={med.timing} onChange={e=>updateRxMed(i,'timing',e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-sm h-9">
                          {TIMINGS.map(t=><option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-600">Duration</Label>
                        <Input placeholder="30 days" value={med.duration} onChange={e=>updateRxMed(i,'duration',e.target.value)} className="bg-white border-gray-300 h-9 text-sm"/>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-600">Instructions</Label>
                        <Input placeholder="Notes…" value={med.notes} onChange={e=>updateRxMed(i,'notes',e.target.value)} className="bg-white border-gray-300 h-9 text-sm"/>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-medium text-gray-700">General Notes</Label>
              <Textarea placeholder="Additional instructions…" value={rxNotes} onChange={e=>setRxNotes(e.target.value)} className="border-gray-300 bg-white text-sm resize-none" rows={2}/>
            </div>
            <div className="flex gap-3">
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white h-11 font-semibold" onClick={handleSavePrescription}><FileText className="h-4 w-4 mr-2"/>Issue Prescription</Button>
              <Button variant="outline" className="border-gray-300 text-gray-700 h-11 px-5" onClick={()=>setShowPrescriptionModal(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Appointment Modal */}
      <Dialog open={showAppointmentModal} onOpenChange={setShowAppointmentModal}>
        <DialogContent className="bg-white max-w-md" aria-describedby="apt-d">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-blue-600"/>Schedule Appointment</DialogTitle></DialogHeader>
          <p id="apt-d" className="sr-only">Book appointment</p>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Patient *</Label>
              <PatientSearch patients={patients} value={aptForm.patientId} onChange={(id,name)=>setAptForm(f=>({...f,patientId:id,patientName:name}))} placeholder="Search or select patient..."/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Date *</Label>
                <Input type="date" value={aptForm.date} onChange={e=>setAptForm(f=>({...f,date:e.target.value}))} className="border-gray-300 bg-white h-10 text-sm" min={today}/>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Time *</Label>
                <Input type="time" value={aptForm.time} onChange={e=>setAptForm(f=>({...f,time:e.target.value}))} className="border-gray-300 bg-white h-10 text-sm"/>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Type</Label>
              <select value={aptForm.type} onChange={e=>setAptForm(f=>({...f,type:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm h-10">
                {APT_TYPES.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1).replace('-',' ')}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Notes</Label>
              <Textarea placeholder="Purpose of visit…" value={aptForm.notes} onChange={e=>setAptForm(f=>({...f,notes:e.target.value}))} className="border-gray-300 bg-white text-sm resize-none" rows={2}/>
            </div>
            <div className="flex gap-3">
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white h-10 font-semibold" onClick={handleBookAppointment}><Calendar className="h-4 w-4 mr-2"/>Book Appointment</Button>
              <Button variant="outline" className="border-gray-300 text-gray-700 h-10 px-4" onClick={()=>setShowAppointmentModal(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Video Consultation */}
      {user && videoPatient && (
        <VideoConsult open={showVideoConsult} onClose={()=>{setShowVideoConsult(false);setVideoPatient(null);}}
          doctorName={profile?.name||''} patientName={videoPatient.name}
          doctorId={user.uid} patientId={videoPatient.id}
          appointmentId={videoAppointmentId} role="doctor"/>
      )}
    </div>
  );
};

export default DoctorApp;
