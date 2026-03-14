// src/pages/ElderlyApp.tsx - FULLY UPDATED: Skip fix, History tab, Profile tab, real name display, improved voice
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getUserProfile, logOut } from '@/lib/firebase-auth';
import { db } from '@/lib/firebase';
import { 
  collection, query, where, getDocs, doc, getDoc, addDoc, 
  updateDoc, onSnapshot, serverTimestamp
} from 'firebase/firestore';
import { logger } from '@/lib/logger';
import { speechService } from '@/lib/speech';
import { sendBrowserNotification } from '@/lib/notifications';
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
  Pill, Bell, Clock, Calendar, Heart, User, Phone, 
  AlertCircle, CheckCircle, XCircle, Volume2, Mic, 
  LogOut, MessageSquare, Activity, Users, UserPlus,
  UserCheck, Mail, Download, X, Volume, VolumeX,
  RefreshCw, Eye, Edit, Trash2, Plus, ChevronRight, Info,
  History, Save, Shield
} from 'lucide-react';

interface Connection { id:string; users:string[]; userEmails:string[]; relationship:string; status:'active'|'inactive'; createdAt:any; }
interface Invitation { id:string; fromUserId:string; fromUserEmail:string; fromUserName:string; toUserId:string; toEmail:string; toUserName:string; relationship:string; status:'pending'|'accepted'|'rejected'; createdAt:any; }
interface Notification { id:string; userId:string; type:string; invitationId?:string; fromUserId:string; fromUserName:string; message:string; read:boolean; createdAt:any; }
interface Medicine { id:string; name:string; dosage:string; schedule:string[]; instructions?:string; foodTiming?:'before'|'after'|'with'; startDate?:string; endDate?:string; refills?:number; prescribedBy?:string; notes?:string; taken?:boolean; skipped?:boolean; totalQuantity?:number; }
interface TrackingRecord { id:string; medicineId:string; medicineName?:string; status:'taken'|'missed'|'skipped'|'late'; scheduledTime:string; actualTime?:string; date:string; notes?:string; timestamp:any; }
interface Appointment { id:string; title:string; doctor:string; doctorId?:string; date:string; time:string; duration?:number; location?:string; notes?:string; status:'scheduled'|'completed'|'cancelled'|'rescheduled'; type?:string; }
interface Caregiver { id:string; name:string; email:string; phone?:string; relationship:string; avatar?:string; }

const ElderlyApp = () => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [nextDose, setNextDose] = useState<any>(null);
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [adherenceRate, setAdherenceRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [chatHistory, setChatHistory] = useState<Array<{user:string;bot:string;timestamp:Date}>>([]);
  const [lastCommand, setLastCommand] = useState('');
  const [missedDoses, setMissedDoses] = useState<string[]>([]);
  const [showConnections, setShowConnections] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [emergencyActive, setEmergencyActive] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyType, setEmergencyType] = useState<'fall'|'pain'|'confusion'|'other'>('other');
  const [showMedicineDetails, setShowMedicineDetails] = useState<string|null>(null);
  const [wellnessScore, setWellnessScore] = useState(0);
  const [showCallModal, setShowCallModal] = useState<{type:string;name:string;phone:string|null}|null>(null);
  const [fontSize, setFontSize] = useState(16);
  const [highContrast, setHighContrast] = useState(false);
  const [showAccessibility, setShowAccessibility] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingOfflineActions, setPendingOfflineActions] = useState<any[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [invitations, setInvitations] = useState<{received:Invitation[];sent:Invitation[]}>({received:[],sent:[]});
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  // History tab state
  const [historyRecords, setHistoryRecords] = useState<TrackingRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name:'', phone:'', bloodGroup:'', age:'', gender:'', address:'',
    medicalConditions:'', allergies:'', emergencyContact:''
  });
  const [savingProfile, setSavingProfile] = useState(false);

  const navigate = useNavigate();

  // Online/offline
  useEffect(() => {
    const on  = () => { setIsOnline(true);  syncPendingActions(); };
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => { document.documentElement.style.fontSize = `${fontSize}px`; return () => { document.documentElement.style.fontSize = '16px'; }; }, [fontSize]);
  useEffect(() => { highContrast ? document.documentElement.classList.add('high-contrast') : document.documentElement.classList.remove('high-contrast'); return () => document.documentElement.classList.remove('high-contrast'); }, [highContrast]);

  const syncPendingActions = async () => {
    const pending = JSON.parse(localStorage.getItem('pendingMedicineActions') || '[]');
    if (!pending.length) return;
    for (const action of pending) {
      try { await addDoc(collection(db, 'medicineTracking'), { ...action, synced: true }); } catch (e) {}
    }
    localStorage.removeItem('pendingMedicineActions');
    setPendingOfflineActions([]);
  };

  const logUserAction = async (action: string, details?: any) => {
    if (user?.uid && user?.email) await logger.logWithUser(user.uid, user.email, 'info', action, details || {});
  };

  useEffect(() => { loadData(); const interval = setInterval(checkMedicineTimes, 60000); return () => clearInterval(interval); }, []);

  // Real-time listeners
  useEffect(() => {
    if (!user) return;
    const subs: (() => void)[] = [];

    subs.push(onSnapshot(query(collection(db,'invitations'), where('toUserId','==',user.uid), where('status','==','pending')), snap => {
      setInvitations(prev => ({ ...prev, received: snap.docs.map(d => ({id:d.id,...d.data()})) as Invitation[] }));
    }));
    subs.push(onSnapshot(query(collection(db,'invitations'), where('fromUserId','==',user.uid), where('status','==','pending')), snap => {
      setInvitations(prev => ({ ...prev, sent: snap.docs.map(d => ({id:d.id,...d.data()})) as Invitation[] }));
    }));
    subs.push(onSnapshot(query(collection(db,'connections'), where('users','array-contains',user.uid), where('status','==','active')), async snap => {
      const cs = snap.docs.map(d => ({id:d.id,...d.data()})) as Connection[];
      setConnections(cs);
      const cgList: Caregiver[] = [];
      for (const conn of cs) {
        if (!conn.relationship?.includes('caregiver')) continue;
        const otherId = conn.users.find(id => id !== user.uid);
        const otherEmail = conn.userEmails?.find(e => e !== user.email);
        if (otherId && otherEmail) {
          try {
            const snap2 = await getDoc(doc(db,'users',otherId));
            const d2 = snap2.data();
            if (d2?.role === 'caregiver') cgList.push({ id:otherId, name:d2.name||otherEmail.split('@')[0], email:otherEmail, phone:d2.phone, avatar:d2.avatar, relationship:conn.relationship });
          } catch {}
        }
      }
      setCaregivers(cgList);
    }));
    subs.push(onSnapshot(query(collection(db,'notifications'), where('userId','==',user.uid), where('read','==',false)), snap => {
      const nd = snap.docs.map(d => ({id:d.id,...d.data()})) as Notification[];
      nd.sort((a,b) => (b.createdAt?.toMillis?.()||0) - (a.createdAt?.toMillis?.()||0));
      setNotifications(nd);
    }));
    subs.push(onSnapshot(query(collection(db,'emergencies'), where('userId','==',user.uid), where('status','==','active')), snap => setEmergencyActive(!snap.empty)));

    return () => subs.forEach(u => u());
  }, [user]);

  useEffect(() => { if (user) { logUserAction('Page viewed', {page:'ElderlyDashboard'}); calculateWellnessScore(); } }, [user]);

  const loadData = async () => {
    setRefreshing(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) { navigate('/login'); return; }
      setUser(currentUser);
      const userProfile = await getUserProfile(currentUser.uid);
      setProfile(userProfile);
      // Pre-fill profile form
      if (userProfile) {
        setProfileForm({
          name: userProfile.name || '',
          phone: userProfile.phone || '',
          bloodGroup: userProfile.bloodGroup || '',
          age: userProfile.age ? String(userProfile.age) : '',
          gender: userProfile.gender || '',
          address: userProfile.address || '',
          medicalConditions: userProfile.medicalConditions || '',
          allergies: userProfile.allergies || '',
          emergencyContact: userProfile.emergencyContact || '',
        });
      }

      // Load medicines
      const medsSnap = await getDocs(query(collection(db,'medicines'), where('userId','==',currentUser.uid)));
      const medicinesData: Medicine[] = medsSnap.docs.map(d => ({id:d.id,...d.data()} as Medicine));
      
      // Refill check
      try {
        const { cacheMedicines, calculateRefillStatus } = await import('@/lib/offline');
        await cacheMedicines(medicinesData);
        for (const med of medicinesData) {
          const { daysRemaining, needsRefill } = calculateRefillStatus(med as any);
          if (needsRefill && daysRemaining !== null) {
            const existing = await getDocs(query(collection(db,'notifications'), where('userId','==',currentUser.uid), where('type','==','refill_reminder'), where('medicineId','==',med.id)));
            if (existing.empty) {
              await addDoc(collection(db,'notifications'), { userId:currentUser.uid, type:'refill_reminder', medicineId:med.id, message:`💊 Refill needed: ${med.name} — only ~${daysRemaining} day(s) remaining.`, read:false, createdAt:serverTimestamp() });
              // Also notify caregivers
              const cgConns = await getDocs(query(collection(db,'connections'), where('users','array-contains',currentUser.uid), where('status','==','active')));
              for (const cgConn of cgConns.docs) {
                const connData = cgConn.data();
                if (!connData.relationship?.includes('caregiver')) continue;
                const cgId = connData.users.find((id:string) => id !== currentUser.uid);
                if (cgId) await addDoc(collection(db,'notifications'), { userId:cgId, type:'refill_reminder', medicineId:med.id, message:`💊 Stock low for ${userProfile?.name || 'patient'}: ${med.name} — ~${daysRemaining} day(s) left. Please refill.`, read:false, createdAt:serverTimestamp() });
              }
            }
          }
        }
      } catch {}

      // Load appointments
      const today = new Date().toISOString().split('T')[0];
      const aptsSnap = await getDocs(query(collection(db,'appointments'), where('patientId','==',currentUser.uid)));
      const aptsData: Appointment[] = aptsSnap.docs.map(d => ({id:d.id,...d.data()} as Appointment)).filter(a => a.date >= today);
      setAppointments(aptsData);

      // Load today's tracking
      const trackSnap = await getDocs(query(collection(db,'medicineTracking'), where('userId','==',currentUser.uid), where('date','==',today)));
      const takenIds = new Set<string>();
      const skippedIds = new Set<string>();
      const missedIds = new Set<string>();
      trackSnap.forEach(d => {
        const td = d.data();
        if (td.status === 'taken') takenIds.add(td.medicineId);
        else if (td.status === 'skipped') skippedIds.add(td.medicineId);
        else if (td.status === 'missed') missedIds.add(td.medicineId);
      });

      const updatedMeds = medicinesData.map(m => ({ ...m, taken: takenIds.has(m.id), skipped: skippedIds.has(m.id) }));
      setMedicines(updatedMeds);
      setMissedDoses(Array.from(missedIds));

      // Next dose
      const now = new Date();
      const next = updatedMeds
        .filter(m => !m.taken && !m.skipped)
        .flatMap(m => (m.schedule||[]).map(t => ({...m, time:t})))
        .filter(item => { const [h,min] = item.time.split(':'); const dt = new Date(); dt.setHours(+h,+min,0); return dt > now; })
        .sort((a,b) => a.time.localeCompare(b.time))[0];
      setNextDose(next);

      // 30-day adherence
      const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate()-30);
      const thirtyAgoStr = thirtyAgo.toISOString().split('T')[0];
      const histSnap = await getDocs(query(collection(db,'medicineTracking'), where('userId','==',currentUser.uid)));
      let total = 0, taken = 0;
      histSnap.forEach(d => { const td = d.data(); if (td.date >= thirtyAgoStr) { total++; if (td.status==='taken') taken++; } });
      setAdherenceRate(total > 0 ? Math.round((taken/total)*100) : 100);
    } catch (err:any) { console.error(err); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const loadHistory = async () => {
    if (!user) return;
    setHistoryLoading(true);
    try {
      const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate()-30);
      const thirtyAgoStr = thirtyAgo.toISOString().split('T')[0];
      const snap = await getDocs(query(collection(db,'medicineTracking'), where('userId','==',user.uid)));
      const records: TrackingRecord[] = snap.docs
        .map(d => ({id:d.id,...d.data()} as TrackingRecord))
        .filter(r => r.date >= thirtyAgoStr)
        .sort((a,b) => {
          const at = a.timestamp?.toMillis?.() || 0;
          const bt = b.timestamp?.toMillis?.() || 0;
          return bt - at;
        });
      // Attach medicine names
      const medMap: Record<string,string> = {};
      for (const m of medicines) medMap[m.id] = m.name;
      const enriched = await Promise.all(records.map(async r => {
        if (medMap[r.medicineId]) return {...r, medicineName: medMap[r.medicineId]};
        try { const ms = await getDoc(doc(db,'medicines',r.medicineId)); return {...r, medicineName: ms.data()?.name || 'Unknown'}; } catch { return {...r, medicineName:'Unknown'}; }
      }));
      setHistoryRecords(enriched);
    } finally { setHistoryLoading(false); }
  };

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      await updateDoc(doc(db,'users',user.uid), {
        name: profileForm.name,
        phone: profileForm.phone,
        bloodGroup: profileForm.bloodGroup,
        age: profileForm.age ? parseInt(profileForm.age) : null,
        gender: profileForm.gender,
        address: profileForm.address,
        medicalConditions: profileForm.medicalConditions,
        allergies: profileForm.allergies,
        emergencyContact: profileForm.emergencyContact,
        updatedAt: serverTimestamp(),
      });
      setProfile((prev: any) => ({ ...prev, ...profileForm }));
      setIsEditingProfile(false);
      await logUserAction('Profile updated', {});
    } catch (e) { console.error(e); }
    finally { setSavingProfile(false); }
  };

  const calculateWellnessScore = () => {
    let score = (adherenceRate/100)*40;
    score += Math.max(0, 30 - missedDoses.length*5);
    const kept = appointments.filter(a=>a.status==='completed').length;
    score += appointments.length > 0 ? (kept/appointments.length)*20 : 20;
    if (!emergencyActive) score += 10;
    setWellnessScore(Math.round(score));
  };

  const checkMedicineTimes = () => {
    const now = new Date();
    const t = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    medicines.forEach(m => { if (!m.taken && !m.skipped && m.schedule?.includes(t)) triggerReminder(m); });
  };

  const triggerReminder = (medicine: Medicine) => {
    sendBrowserNotification('💊 Medicine Reminder', `Time to take ${medicine.name} - ${medicine.dosage}`, { tag:`reminder-${medicine.id}`, requireInteraction:true, onClick:()=>window.focus() });
    if (!isMuted) speechService.speak(`Hello! Time to take ${medicine.name}, ${medicine.dosage}.`);
  };

  const handleLogout = async () => { await logUserAction('User logged out',{}); await logOut(); navigate('/login'); };

  // ── FIXED: Take marks taken, Skip marks skipped ─────────────────────────
  const handleMarkTaken = async (medicineId: string, time: string) => {
    const trackData = { userId:user.uid, medicineId, date:new Date().toISOString().split('T')[0], time:new Date().toTimeString().split(' ')[0], scheduledTime:time, status:'taken', timestamp:serverTimestamp() };
    try {
      if (!isOnline) {
        const pending = JSON.parse(localStorage.getItem('pendingMedicineActions')||'[]');
        pending.push({...trackData, timestamp:new Date().toISOString()});
        localStorage.setItem('pendingMedicineActions', JSON.stringify(pending));
        setPendingOfflineActions(pending);
      } else {
        await addDoc(collection(db,'medicineTracking'), trackData);
      }
      if (!isMuted) await speechService.speak("Great job! Medicine marked as taken. Stay healthy!");
      await logUserAction('Medicine taken', {medicineId, time});
      setMedicines(prev => prev.map(m => m.id===medicineId ? {...m, taken:true, skipped:false} : m));
      setMissedDoses(prev => prev.filter(id => id!==medicineId));
      updateNextDose(medicineId);
      calculateWellnessScore();
    } catch (e) { console.error(e); }
  };

  // ── FIXED: Skip correctly marks as 'skipped', NOT 'taken' ───────────────
  const handleMarkSkipped = async (medicineId: string, time: string) => {
    try {
      await addDoc(collection(db,'medicineTracking'), {
        userId:user.uid, medicineId,
        date:new Date().toISOString().split('T')[0],
        scheduledTime:time, status:'skipped',
        timestamp:serverTimestamp(), notes:'Skipped by user'
      });
      if (!isMuted) speechService.speak("Dose skipped. Please talk to your doctor if you're having difficulties.");
      await logUserAction('Medicine skipped', {medicineId, time});
      // Mark as skipped (not taken) — showing amber badge
      setMedicines(prev => prev.map(m => m.id===medicineId ? {...m, skipped:true, taken:false} : m));
      updateNextDose(medicineId);
    } catch (e) { console.error(e); }
  };

  const updateNextDose = (excludeId: string) => {
    const now = new Date();
    const next = medicines
      .filter(m => m.id!==excludeId && !m.taken && !m.skipped)
      .flatMap(m => (m.schedule||[]).map(t => ({...m,time:t})))
      .filter(item => { const [h,min] = item.time.split(':'); const dt=new Date(); dt.setHours(+h,+min,0); return dt>now; })
      .sort((a,b) => a.time.localeCompare(b.time))[0];
    setNextDose(next);
  };

  const handleEmergency = (type: 'fall'|'pain'|'confusion'|'other' = 'other', description?: string) => {
    sendBrowserNotification('🚨 EMERGENCY ACTIVATED', 'Help is being notified. Stay calm.', { tag:'emergency', requireInteraction:true });
    if (!isMuted) speechService.speak("Emergency alert triggered. Help is on the way. Please stay calm.");
    addDoc(collection(db,'emergencies'), { userId:user.uid, userName:profile?.name, type, description:description||'', status:'active', timestamp:serverTimestamp() });
    const notifyUser = (uid: string) => addDoc(collection(db,'notifications'), { userId:uid, type:'emergency', fromUserId:user.uid, fromUserName:profile?.name, message:`🚨 EMERGENCY: ${profile?.name} triggered a ${type} alert! Immediate attention required.`, read:false, createdAt:serverTimestamp() });
    caregivers.forEach(cg => { sendBrowserNotification('🚨 EMERGENCY ALERT', `${profile?.name} needs assistance: ${type}`, {tag:'emergency'}); notifyUser(cg.id); });
    connections.forEach(conn => { const otherId = conn.users.find((id:string) => id!==user?.uid); if (otherId && conn.relationship?.includes('doctor')) notifyUser(otherId); });
    setEmergencyActive(true);
    logUserAction('Emergency triggered', {type, description:description||''});
  };

  const handleResolveEmergency = async () => {
    const snap = await getDocs(query(collection(db,'emergencies'), where('userId','==',user.uid), where('status','==','active')));
    for (const d of snap.docs) await updateDoc(d.ref, { status:'resolved', resolvedAt:serverTimestamp() });
    setEmergencyActive(false);
    if (!isMuted) speechService.speak("Emergency has been resolved. Thank you.");
    logUserAction('Emergency resolved', {});
  };

  const handleVoiceCommand = async () => {
    if (isListening) return;
    setIsListening(true);
    try {
      if (!isMuted) await speechService.speak("How can I help you?");
      const rawText = await speechService.listenForResponse(8000);
      setIsListening(false);
      if (!rawText || rawText==='timeout'||rawText==='error'||rawText==='not_supported') {
        const msg = "I didn't catch that. Please try again.";
        if (!isMuted) await speechService.speak(msg);
        setChatHistory(prev => [...prev, {user:'(no response)',bot:msg,timestamp:new Date()}]);
        return;
      }
      const text = rawText.toLowerCase().trim();
      setLastCommand(text);
      const ctx = { nextDose, medicines, appointments, caregivers, missedDoses, wellnessScore, adherenceRate, profileName: profile?.name };
      const intent = speechService.processQuery(text);
      let botResponse = await speechService.handleIntent(intent, ctx);

      // Action intents
      if (botResponse==='EMERGENCY_MODAL') { setShowEmergencyModal(true); botResponse="Please select the type of emergency."; }
      else if (botResponse==='EMERGENCY_FALL') { handleEmergency('fall'); botResponse="🚨 Fall alert sent! Help is on the way."; }
      else if (botResponse==='EMERGENCY_PAIN') { handleEmergency('pain'); botResponse="🚨 Pain alert sent! Help is on the way."; }
      else if (botResponse==='EMERGENCY_CONFUSION') { handleEmergency('confusion'); botResponse="🚨 Confusion alert sent!"; }
      else if (botResponse.startsWith('CALL_CAREGIVER:')) { const name=botResponse.replace('CALL_CAREGIVER:',''); setShowCallModal({type:'caregiver',name,phone:caregivers[0]?.phone||null}); botResponse=`Calling caregiver ${name}...`; }
      else if (botResponse==='CALL_DOCTOR') { setShowCallModal({type:'doctor',name:'your doctor',phone:null}); botResponse="Calling your doctor..."; }
      else if (botResponse==='CALL_911') { setShowCallModal({type:'911',name:'Emergency Services',phone:'911'}); botResponse="Calling emergency services..."; }
      else if (botResponse.startsWith('MARK_TAKEN:')) { if (nextDose) { await handleMarkTaken(nextDose.id, nextDose.time); botResponse=`✅ ${nextDose.name} marked as taken!`; } }
      else if (botResponse.startsWith('MARK_SKIPPED:')) { if (nextDose) { await handleMarkSkipped(nextDose.id, nextDose.time); botResponse=`⏭️ ${nextDose.name} marked as skipped.`; } }

      if (!isMuted) speechService.speak(botResponse);
      setChatHistory(prev => [...prev, {user:text,bot:botResponse,timestamp:new Date()}]);
    } catch (e) { setIsListening(false); }
  };

  const toggleMute = () => { if (!isMuted) speechService.stopSpeaking(); setIsMuted(!isMuted); };

  const getMedStatusClass = (med: Medicine, time: string) => {
    if (med.taken) return 'bg-green-50 border-green-300';
    if (med.skipped) return 'bg-amber-50 border-amber-300';
    const [h,min] = time.split(':'); const dt = new Date(); dt.setHours(+h,+min,0); const now = new Date();
    if (now > dt) { const late = now.getTime()-dt.getTime(); return late > 1800000 ? 'bg-red-50 border-red-300' : 'bg-orange-50 border-orange-300'; }
    if (dt.getTime()-now.getTime() <= 1800000) return 'bg-yellow-50 border-yellow-400 animate-pulse';
    return 'bg-white border-gray-200';
  };

  const firstName = profile?.name?.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? `Good morning, ${firstName}!` : hour < 17 ? `Good afternoon, ${firstName}!` : `Good evening, ${firstName}!`;

  const adherenceSummary = () => {
    const taken = historyRecords.filter(r=>r.status==='taken').length;
    const skipped = historyRecords.filter(r=>r.status==='skipped').length;
    const missed = historyRecords.filter(r=>r.status==='missed').length;
    const total = historyRecords.length;
    return { taken, skipped, missed, total };
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center"><div className="animate-spin rounded-full h-14 w-14 border-4 border-blue-600 border-t-transparent mx-auto"></div><p className="mt-4 text-gray-600">Loading your dashboard...</p></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Emergency Banner */}
      {emergencyActive && (
        <div className="bg-red-600 text-white py-3 px-4 fixed top-0 left-0 right-0 z-50">
          <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3"><AlertCircle className="h-5 w-5 animate-pulse"/><span className="font-bold">EMERGENCY ACTIVE — Help has been notified</span></div>
            <Button variant="outline" size="sm" className="bg-white text-red-600 hover:bg-red-50" onClick={handleResolveEmergency}><CheckCircle className="h-4 w-4 mr-2"/>Resolve</Button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={`bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm ${emergencyActive?'mt-12':''}`}>
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12 border-2 border-blue-500">
                <AvatarImage src={profile?.avatar}/>
                <AvatarFallback className="bg-blue-600 text-white text-lg">{profile?.name?.charAt(0)||'U'}</AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-xl font-bold text-gray-800">{greeting}</h1>
                <p className="text-xs text-gray-500">{new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <div className="hidden md:flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-full text-sm">
                <Heart className="h-3.5 w-3.5"/><span className="font-semibold">Wellness: {wellnessScore}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={loadData} disabled={refreshing} className="hover:bg-gray-100"><RefreshCw className={`h-4 w-4 ${refreshing?'animate-spin':''}`}/></Button>
              <Button variant="ghost" size="icon" onClick={()=>setShowConnections(!showConnections)} className="relative hover:bg-gray-100">
                <Users className="h-4 w-4"/>
                {(invitations.received.length+notifications.length)>0&&<span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">{invitations.received.length+notifications.length}</span>}
              </Button>
              <Button variant="ghost" size="icon" onClick={()=>setShowAccessibility(a=>!a)} className={`hover:bg-gray-100 ${showAccessibility?'bg-blue-50':''}`}><span className="text-base">♿</span></Button>
              <Button variant="ghost" size="icon" onClick={toggleMute} className="hover:bg-gray-100">{isMuted?<VolumeX className="h-4 w-4"/>:<Volume className="h-4 w-4"/>}</Button>
              <Button variant="ghost" size="icon" onClick={handleVoiceCommand} disabled={isListening} className={`hover:bg-gray-100 ${isListening?'bg-green-100':''}`}><Mic className={`h-4 w-4 ${isListening?'text-green-600':''}`}/></Button>
              <Button variant="destructive" size="icon" onClick={()=>setShowEmergencyModal(true)} className="bg-red-600 hover:bg-red-700 min-h-[40px] min-w-[40px]"><AlertCircle className="h-4 w-4"/></Button>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="hover:bg-gray-100"><LogOut className="h-4 w-4"/></Button>
            </div>
          </div>
        </div>
      </header>

      {/* Offline banner */}
      {!isOnline&&<div className="bg-amber-500 text-white px-4 py-2 text-center text-sm font-medium">⚠️ You are offline. Actions will sync when you reconnect.{pendingOfflineActions.length>0&&` (${pendingOfflineActions.length} pending)`}</div>}

      {/* Accessibility panel */}
      {showAccessibility&&(
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="container mx-auto flex flex-wrap gap-6 items-center">
            <span className="font-semibold text-gray-700 text-sm">Accessibility:</span>
            <div className="flex items-center gap-2 text-sm">
              <span>Font:</span>
              <Button size="sm" variant="outline" className="h-8 px-3 text-gray-700 border-gray-300" onClick={()=>setFontSize(f=>Math.max(12,f-2))}>A−</Button>
              <span className="font-bold w-6 text-center">{fontSize}</span>
              <Button size="sm" className="h-8 px-3 bg-blue-600 text-white hover:bg-blue-700" onClick={()=>setFontSize(f=>Math.min(24,f+2))}>A+</Button>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span>High Contrast:</span>
              <button onClick={()=>setHighContrast(h=>!h)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${highContrast?'bg-blue-600':'bg-gray-300'}`} aria-label="Toggle high contrast">
                <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${highContrast?'translate-x-6':'translate-x-1'}`}/>
              </button>
            </div>
            <Button size="sm" variant="outline" className="h-8 px-3 text-gray-600 border-gray-300" onClick={()=>{setFontSize(16);setHighContrast(false);}}>Reset</Button>
          </div>
        </div>
      )}

      {/* Main */}
      <main className="container mx-auto px-4 py-5 space-y-5">
        {/* Next Dose Alert */}
        {nextDose&&!nextDose.taken&&!nextDose.skipped&&(
          <Card className="border-2 border-orange-400 bg-orange-50 shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-full"><Clock className="h-6 w-6 text-orange-600"/></div>
                  <div>
                    <p className="text-xs text-orange-600 font-semibold uppercase tracking-wide">Next Dose</p>
                    <h2 className="text-xl font-bold text-gray-800">{nextDose.name}</h2>
                    <p className="text-sm text-gray-600">{nextDose.dosage} at {nextDose.time}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={()=>handleMarkTaken(nextDose.id,nextDose.time)}><CheckCircle className="mr-2 h-4 w-4"/>Take Now</Button>
                  <Button variant="outline" className="border-amber-400 text-amber-700 hover:bg-amber-50" onClick={()=>handleMarkSkipped(nextDose.id,nextDose.time)}><XCircle className="mr-2 h-4 w-4"/>Skip</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            {label:"Today's Meds",value:medicines.length,sub:`${medicines.filter(m=>m.taken).length} taken`,icon:<Pill className="h-7 w-7 text-blue-500"/>,click:()=>navigate('/medicines')},
            {label:"Adherence",value:`${adherenceRate}%`,sub:"30 day avg",icon:<Activity className="h-7 w-7 text-green-500"/>},
            {label:"Wellness",value:wellnessScore,sub:"Score",icon:<Heart className="h-7 w-7 text-red-400"/>},
            {label:"Appointments",value:appointments.length,sub:"Upcoming",icon:<Calendar className="h-7 w-7 text-purple-500"/>,click:()=>navigate('/schedule')},
            {label:"Caregivers",value:caregivers.length,sub:caregivers.length===0?'None':'Active',icon:<Users className="h-7 w-7 text-indigo-500"/>},
            {label:"Missed",value:missedDoses.length,sub:"Today",icon:<AlertCircle className="h-7 w-7 text-orange-400"/>},
          ].map((s,i) => (
            <Card key={i} className={`${s.click?'cursor-pointer hover:shadow-md':''} transition-all`} onClick={s.click}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div><p className="text-xs text-gray-500">{s.label}</p><p className="text-xl font-bold text-gray-800">{s.value}</p><p className="text-xs text-gray-400">{s.sub}</p></div>
                  {s.icon}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Independent mode notice */}
        {caregivers.length===0&&(
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3 text-blue-700">
            <Info className="h-4 w-4 flex-shrink-0"/>
            <p className="text-sm flex-1">You're in independent mode. <span className="font-medium">Add a caregiver</span> for additional support.</p>
            <Button variant="outline" size="sm" className="border-blue-300 text-blue-700 hover:bg-blue-100 h-8" onClick={()=>setShowConnections(true)}><UserPlus className="h-3.5 w-3.5 mr-1"/>Add</Button>
          </div>
        )}

        {/* TABBED SECTION */}
        <Tabs defaultValue="medicines" className="w-full" onValueChange={(v)=>{ if(v==='history') loadHistory(); }}>
          <TabsList className="w-full">
            <TabsTrigger value="medicines">💊 Today's Meds</TabsTrigger>
            <TabsTrigger value="history">📋 History</TabsTrigger>
            <TabsTrigger value="appointments">📅 Appointments</TabsTrigger>
            <TabsTrigger value="voice">🎤 Voice</TabsTrigger>
            <TabsTrigger value="profile">👤 Profile</TabsTrigger>
          </TabsList>

          {/* ── TODAY'S MEDICINES ── */}
          <TabsContent value="medicines" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg"><Pill className="h-5 w-5 text-blue-600"/>Medicine Schedule</CardTitle>
                  <Button variant="outline" size="sm" className="h-8 border-blue-300 text-blue-700 hover:bg-blue-50" onClick={()=>navigate('/medicines/add')}><Plus className="h-3.5 w-3.5 mr-1"/>Add</Button>
                </div>
              </CardHeader>
              <CardContent>
                {medicines.length===0 ? (
                  <div className="text-center py-10"><Pill className="h-10 w-10 text-gray-300 mx-auto mb-3"/><p className="text-gray-500">No medicines scheduled</p><Button variant="link" onClick={()=>navigate('/medicines/add')} className="text-blue-600 mt-1">Add your first medicine</Button></div>
                ) : (
                  <div className="space-y-3">
                    {medicines.map(med => med.schedule?.map((time, idx) => {
                      const statusClass = getMedStatusClass(med, time);
                      return (
                        <div key={`${med.id}-${idx}`} className={`p-4 rounded-lg border-2 ${statusClass} transition-all hover:shadow-sm cursor-pointer`} onClick={()=>setShowMedicineDetails(med.id)}>
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold text-gray-800">{med.name}</h3>
                                {med.taken&&<Badge className="bg-green-600 text-white text-xs">✓ Taken</Badge>}
                                {med.skipped&&!med.taken&&<Badge className="bg-amber-500 text-white text-xs">⏭ Skipped</Badge>}
                                {missedDoses.includes(med.id)&&<Badge className="bg-red-600 text-white text-xs">✗ Missed</Badge>}
                              </div>
                              <p className="text-sm text-gray-600">{med.dosage}</p>
                              {med.foodTiming&&<p className="text-xs text-gray-400 mt-0.5">Take {med.foodTiming} food</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-sm font-semibold">{time}</Badge>
                              {!med.taken&&!med.skipped&&(
                                <div className="flex gap-1">
                                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-9" onClick={e=>{e.stopPropagation();handleMarkTaken(med.id,time);}}><CheckCircle className="h-3.5 w-3.5 mr-1"/>Take</Button>
                                  <Button size="sm" variant="outline" className="border-amber-400 text-amber-700 hover:bg-amber-50 h-9" onClick={e=>{e.stopPropagation();handleMarkSkipped(med.id,time);}}><XCircle className="h-3.5 w-3.5 mr-1"/>Skip</Button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── HISTORY TAB ── */}
          <TabsContent value="history" className="mt-4 space-y-4">
            {/* Adherence summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {label:'Total Records',value:adherenceSummary().total,color:'bg-blue-50 border-blue-200 text-blue-700'},
                {label:'✓ Taken',value:adherenceSummary().taken,color:'bg-green-50 border-green-200 text-green-700'},
                {label:'⏭ Skipped',value:adherenceSummary().skipped,color:'bg-amber-50 border-amber-200 text-amber-700'},
                {label:'✗ Missed',value:adherenceSummary().missed,color:'bg-red-50 border-red-200 text-red-700'},
              ].map((s,i)=>(
                <div key={i} className={`rounded-lg border p-3 ${s.color}`}>
                  <p className="text-xs font-medium">{s.label}</p>
                  <p className="text-2xl font-bold">{s.value}</p>
                </div>
              ))}
            </div>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg"><History className="h-5 w-5 text-blue-600"/>Medication History (Last 30 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <div className="py-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mx-auto"></div><p className="mt-2 text-sm text-gray-500">Loading history...</p></div>
                ) : historyRecords.length===0 ? (
                  <div className="py-8 text-center"><History className="h-10 w-10 text-gray-300 mx-auto mb-3"/><p className="text-gray-500">No history found for the last 30 days.</p></div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {historyRecords.map(record => (
                      <div key={record.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-white hover:bg-gray-50">
                        <div>
                          <p className="font-medium text-gray-800">{record.medicineName||'Unknown'}</p>
                          <p className="text-xs text-gray-500">{record.date} at {record.scheduledTime}</p>
                        </div>
                        <Badge className={record.status==='taken'?'bg-green-600 text-white':record.status==='skipped'?'bg-amber-500 text-white':'bg-red-600 text-white'}>
                          {record.status==='taken'?'✓ Taken':record.status==='skipped'?'⏭ Skipped':'✗ Missed'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── APPOINTMENTS ── */}
          <TabsContent value="appointments" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg"><Calendar className="h-5 w-5 text-purple-600"/>Upcoming Appointments</CardTitle>
                  <Button variant="outline" size="sm" className="h-8 border-purple-300 text-purple-700 hover:bg-purple-50" onClick={()=>navigate('/schedule')}><Plus className="h-3.5 w-3.5 mr-1"/>Book</Button>
                </div>
              </CardHeader>
              <CardContent>
                {appointments.length===0 ? (
                  <div className="py-8 text-center"><Calendar className="h-10 w-10 text-gray-300 mx-auto mb-3"/><p className="text-gray-500">No upcoming appointments</p><Button variant="link" onClick={()=>navigate('/schedule')} className="text-purple-600">Book an appointment</Button></div>
                ) : (
                  <div className="space-y-3">
                    {appointments.map(apt=>(
                      <div key={apt.id} className="p-3 border rounded-lg hover:bg-gray-50 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-gray-800">{apt.title||'Appointment'}</p>
                          <p className="text-sm text-gray-600">Dr. {apt.doctor||'Unknown'}</p>
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">{new Date(apt.date).toLocaleDateString()} • {apt.time}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── VOICE ── */}
          <TabsContent value="voice" className="mt-4">
            <Card className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-white/20 rounded-full"><Mic className="h-6 w-6"/></div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold mb-1">Voice Assistant</h3>
                    <p className="text-white/80 text-sm mb-3">{isListening?'🎤 Listening… speak now':'Click the button and give a command'}</p>
                    {lastCommand&&<div className="bg-white/10 rounded-lg p-2 mb-3 text-sm">You said: "{lastCommand}"</div>}
                    {chatHistory.length>0&&(
                      <div className="bg-white/10 rounded-lg p-3 mb-3 max-h-32 overflow-y-auto space-y-2">
                        {chatHistory.slice(-3).map((item,i)=>(
                          <div key={i} className="text-xs"><p className="opacity-70">You: {item.user}</p><p className="opacity-90 mt-0.5">Assistant: {item.bot}</p></div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {['"Show my medicines"','"Next dose"','"Call caregiver"','"Book appointment"','"Send emergency"','"What time is it?"'].map(cmd=>(
                        <span key={cmd} className="bg-white/20 text-white/90 text-xs px-2 py-0.5 rounded-full">{cmd}</span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleVoiceCommand} disabled={isListening} className={`bg-white text-indigo-600 hover:bg-indigo-50 ${isListening?'animate-pulse':''}`}><Mic className="h-4 w-4 mr-2"/>{isListening?'Listening…':'Ask Assistant'}</Button>
                      <Button onClick={toggleMute} variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20">{isMuted?<VolumeX className="h-4 w-4"/>:<Volume className="h-4 w-4"/>}</Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── PROFILE ── */}
          <TabsContent value="profile" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg"><User className="h-5 w-5 text-blue-600"/>My Profile</CardTitle>
                  {!isEditingProfile ? (
                    <Button variant="outline" size="sm" className="h-8 border-blue-300 text-blue-700 hover:bg-blue-50" onClick={()=>setIsEditingProfile(true)}><Edit className="h-3.5 w-3.5 mr-1"/>Edit</Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="h-8" onClick={()=>setIsEditingProfile(false)}>Cancel</Button>
                      <Button size="sm" className="h-8 bg-blue-600 text-white hover:bg-blue-700" onClick={saveProfile} disabled={savingProfile}><Save className="h-3.5 w-3.5 mr-1"/>{savingProfile?'Saving...':'Save'}</Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!isEditingProfile ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      {label:'Full Name',value:profile?.name,icon:<User className="h-4 w-4"/>},
                      {label:'Phone',value:profile?.phone,icon:<Phone className="h-4 w-4"/>},
                      {label:'Blood Group',value:profile?.bloodGroup,icon:<Shield className="h-4 w-4"/>},
                      {label:'Age',value:profile?.age,icon:<Calendar className="h-4 w-4"/>},
                      {label:'Gender',value:profile?.gender,icon:<User className="h-4 w-4"/>},
                      {label:'Address',value:profile?.address,icon:<Info className="h-4 w-4"/>},
                      {label:'Medical Conditions',value:profile?.medicalConditions,icon:<Activity className="h-4 w-4"/>},
                      {label:'Allergies',value:profile?.allergies,icon:<AlertCircle className="h-4 w-4"/>},
                      {label:'Emergency Contact',value:profile?.emergencyContact,icon:<Phone className="h-4 w-4"/>},
                    ].map((f,i)=>(
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                        <div className="mt-0.5 text-blue-500">{f.icon}</div>
                        <div><p className="text-xs text-gray-500 font-medium">{f.label}</p><p className="text-sm text-gray-800">{f.value||<span className="text-gray-400 italic">Not set</span>}</p></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      {key:'name',label:'Full Name',type:'text'},
                      {key:'phone',label:'Phone Number',type:'tel'},
                      {key:'bloodGroup',label:'Blood Group',type:'text',placeholder:'e.g. A+, O-'},
                      {key:'age',label:'Age',type:'number'},
                      {key:'gender',label:'Gender',type:'text',placeholder:'Male / Female / Other'},
                      {key:'address',label:'Address',type:'text'},
                      {key:'medicalConditions',label:'Medical Conditions',type:'text'},
                      {key:'allergies',label:'Allergies',type:'text'},
                      {key:'emergencyContact',label:'Emergency Contact',type:'text',placeholder:'Name: Phone'},
                    ].map(f=>(
                      <div key={f.key} className="space-y-1">
                        <Label className="text-xs font-medium text-gray-600">{f.label}</Label>
                        <Input type={f.type} placeholder={f.placeholder||f.label} value={(profileForm as any)[f.key]} onChange={e=>setProfileForm(prev=>({...prev,[f.key]:e.target.value}))} className="h-9 text-sm border-gray-300"/>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Caregivers section */}
        {caregivers.length>0&&(
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Heart className="h-4 w-4 text-red-500"/>Your Caregivers</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {caregivers.map(cg=>(
                  <div key={cg.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9"><AvatarImage src={cg.avatar}/><AvatarFallback className="bg-green-600 text-white">{cg.name?.charAt(0)}</AvatarFallback></Avatar>
                      <div><p className="font-medium text-sm">{cg.name}</p><p className="text-xs text-gray-500">{cg.email}</p></div>
                    </div>
                    {cg.phone&&<Button variant="outline" size="sm" className="h-8 border-green-300 text-green-700 hover:bg-green-50" onClick={()=>window.location.href=`tel:${cg.phone}`}><Phone className="h-3.5 w-3.5 mr-1"/>Call</Button>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-3">
          <Button onClick={()=>navigate('/medicines')} className="h-16 flex flex-col gap-1 bg-blue-600 hover:bg-blue-700 text-white"><Pill className="h-5 w-5"/><span className="text-xs font-medium">Medicines</span></Button>
          <Button onClick={()=>navigate('/schedule')} className="h-16 flex flex-col gap-1 bg-purple-600 hover:bg-purple-700 text-white"><Calendar className="h-5 w-5"/><span className="text-xs font-medium">Schedule</span></Button>
          <Button onClick={()=>setShowConnections(true)} className="h-16 flex flex-col gap-1 bg-green-600 hover:bg-green-700 text-white"><Users className="h-5 w-5"/><span className="text-xs font-medium">Connections</span></Button>
        </div>
      </main>

      {/* Connections Panel Modal */}
      {showConnections&&(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <Button variant="ghost" size="icon" className="absolute top-2 right-2 z-10 bg-white rounded-full shadow-lg" onClick={()=>setShowConnections(false)}><X className="h-4 w-4"/></Button>
            <ConnectionsPanel userRole="elderly"/>
          </div>
        </div>
      )}

      {/* Emergency Modal */}
      <Dialog open={showEmergencyModal} onOpenChange={setShowEmergencyModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-xl text-red-600 flex items-center gap-2"><AlertCircle className="h-5 w-5"/>Emergency Assistance</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">Select the type of emergency. Your caregivers will be notified immediately.</p>
          <div className="grid grid-cols-2 gap-3 py-3">
            {([['fall','🤸 Fall','red'],['pain','❤️ Pain','orange'],['confusion','🧠 Confusion','yellow'],['other','⚠️ Other','gray']] as [any,string,string][]).map(([type,label])=>(
              <Button key={type} className="h-16 flex flex-col gap-1 bg-red-600 hover:bg-red-700 text-white" onClick={()=>{handleEmergency(type);setShowEmergencyModal(false);}}>{label}</Button>
            ))}
          </div>
          <Button variant="outline" onClick={()=>setShowEmergencyModal(false)} className="w-full text-gray-600">Cancel</Button>
        </DialogContent>
      </Dialog>

      {/* Medicine Details Modal */}
      <Dialog open={!!showMedicineDetails} onOpenChange={()=>setShowMedicineDetails(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Medicine Details</DialogTitle></DialogHeader>
          {showMedicineDetails&&medicines.filter(m=>m.id===showMedicineDetails).map(med=>(
            <div key={med.id} className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-full"><Pill className="h-6 w-6 text-blue-600"/></div>
                <div><h3 className="text-xl font-bold">{med.name}</h3><p className="text-gray-600">{med.dosage}</p></div>
              </div>
              <div className="space-y-1.5 text-sm">
                <p><span className="font-semibold">Schedule:</span> {med.schedule?.join(', ')}</p>
                {med.foodTiming&&<p><span className="font-semibold">Food:</span> Take {med.foodTiming} food</p>}
                {med.instructions&&<p><span className="font-semibold">Instructions:</span> {med.instructions}</p>}
                {med.prescribedBy&&<p><span className="font-semibold">Prescribed by:</span> {med.prescribedBy}</p>}
                {med.totalQuantity&&<p><span className="font-semibold">Total quantity:</span> {med.totalQuantity} tablets</p>}
              </div>
              <Button variant="outline" className="w-full" onClick={()=>setShowMedicineDetails(null)}>Close</Button>
            </div>
          ))}
        </DialogContent>
      </Dialog>

      {/* Call Modal */}
      <Dialog open={!!showCallModal} onOpenChange={()=>setShowCallModal(null)}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader><DialogTitle>📞 Calling</DialogTitle></DialogHeader>
          {showCallModal&&(
            <div className="py-4 space-y-4">
              <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center animate-pulse ${showCallModal.type==='911'?'bg-red-100':'bg-green-100'}`}><Phone className={`h-8 w-8 ${showCallModal.type==='911'?'text-red-600':'text-green-600'}`}/></div>
              <p className="font-semibold">{showCallModal.name}</p>
              <div className="flex gap-2">
                {showCallModal.phone&&<Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={()=>window.location.href=`tel:${showCallModal.phone}`}><Phone className="h-4 w-4 mr-2"/>Open Dialer</Button>}
                <Button variant="outline" className="flex-1 border-red-300 text-red-600" onClick={()=>setShowCallModal(null)}>End Call</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ElderlyApp;
