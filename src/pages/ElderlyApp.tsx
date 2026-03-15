// src/pages/ElderlyApp.tsx - Complete with inline voice, proper medicine tracking, refill alerts
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getUserProfile, logOut } from '@/lib/firebase-auth';
import { db } from '@/lib/firebase';
import {
  collection, query, where, getDocs, doc, getDoc, addDoc,
  updateDoc, onSnapshot, serverTimestamp
} from 'firebase/firestore';
import { logger } from '@/lib/logger';
import { speechService } from '@/lib/speech';
import { cacheMedicines, getCachedMedicines, queueOfflineAction, getPendingActions, clearPendingActions, isOnline } from '@/lib/offline';
import { sendBrowserNotification } from '@/lib/notifications';
import { registerPushNotifications, setupForegroundNotifications } from '@/lib/push-notifications';
import SetupGuide from '@/components/SetupGuide';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ConnectionsPanel from '@/components/ConnectionsPanel';
import EmergencyPopup from '@/components/EmergencyPopup';
import AIInsightsPanel from '@/components/AIInsightsPanel';
import FamilySharing from '@/components/FamilySharing';
import WearableWidget from '@/components/WearableWidget';
import VideoConsult from '@/components/VideoConsult';
import IncomingCallPopup from '@/components/IncomingCallPopup';
import { triggerSync } from '@/lib/offline';
import {
  Pill, Clock, Calendar, Heart, User, Phone,
  AlertCircle, CheckCircle, XCircle, Mic, LogOut,
  Activity, Users, UserPlus, X, Volume2, VolumeX,
  RefreshCw, Plus, Info, History, Save, Edit,
  Shield, TrendingUp, Package, Bell
} from 'lucide-react';

interface Medicine {
  id: string; name: string; dosage: string; schedule: string[];
  instructions?: string; foodTiming?: string;
  totalQuantity?: number; currentQuantity?: number;
  taken?: boolean; skipped?: boolean;
}
interface TrackingRecord {
  id: string; medicineId: string; medicineName?: string;
  status: 'taken' | 'missed' | 'skipped'; scheduledTime: string; date: string; timestamp: any;
}
interface Appointment { id: string; title: string; doctor: string; date: string; time: string; status: string; location?: string; }
interface Caregiver { id: string; name: string; email: string; phone?: string; }

const ElderlyApp = () => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [nextDose, setNextDose] = useState<any>(null);
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [doctors, setDoctors] = useState<{id:string;name:string;email:string;phone?:string}[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [adherenceRate, setAdherenceRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const [missedDoses, setMissedDoses] = useState<string[]>([]);
  const [showConnections, setShowConnections] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [emergencyActive, setEmergencyActive] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<TrackingRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // Voice state
  const [isListening, setIsListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [voiceReply, setVoiceReply] = useState('');
  const [voiceInput, setVoiceInput] = useState('');
  const [voiceHistory, setVoiceHistory] = useState<{q:string;a:string}[]>([]);
  // Profile editing
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name:'', phone:'', bloodGroup:'', age:'', gender:'',
    address:'', medicalConditions:'', allergies:'', emergencyContact:''
  });
  const [pendingInvitations, setPendingInvitations] = useState(0);
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingSync, setPendingSync] = useState(0);
  const [showVideoConsult, setShowVideoConsult] = useState(false);
  const [videoDoctor, setVideoDoctor] = useState<any>(null);
  const [acceptedCallData, setAcceptedCallData] = useState<any>(null);
  const navigate = useNavigate();
  const timerRef = useRef<any>(null);

  // Listen for SW sync messages
  useEffect(() => {
    const onSync = async () => {
      const pending = await getPendingActions();
      if (pending.length > 0) {
        // Re-trigger from ElderlyApp's online handler
        window.dispatchEvent(new Event('online'));
      }
    };
    window.addEventListener('offline-sync-needed', onSync);
    return () => window.removeEventListener('offline-sync-needed', onSync);
  }, []);

  // Online/offline detection + sync
  useEffect(() => {
    const goOnline = async () => {
      setOnline(true);
      triggerSync(); // Register background sync
      // Sync pending offline actions
      const pending = await getPendingActions();
      if (pending.length > 0) {
        for (const action of pending) {
          try {
            const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
            await addDoc(collection(db, 'medicineTracking'), {
              userId: action.userId, medicineId: action.medicineId,
              date: action.date, scheduledTime: action.scheduledTime,
              status: action.type === 'mark_taken' ? 'taken' : action.type === 'mark_skipped' ? 'skipped' : 'missed',
              timestamp: serverTimestamp(), syncedFromOffline: true
            });
          } catch {}
        }
        await clearPendingActions();
        setPendingSync(0);
        loadData();
      }
    };
    const goOffline = () => { setOnline(false); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  useEffect(() => {
    loadData();
    timerRef.current = setInterval(checkMedicineTimes, 60000);
    return () => clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (!user) return;
    const subs: (() => void)[] = [];
    subs.push(onSnapshot(
      query(collection(db,'connections'), where('users','array-contains',user.uid), where('status','==','active')),
      async snap => {
        const cgList: Caregiver[] = [];
        for (const connDoc of snap.docs) {
          const conn = connDoc.data();
          if (!conn.relationship?.includes('caregiver')) continue;
          const otherId = conn.users?.find((id:string) => id !== user.uid);
          if (!otherId) continue;
          try {
            const ud = await getDoc(doc(db,'users',otherId));
            if (ud.exists()) {
              const d = ud.data();
              cgList.push({ id: otherId, name: d.name||'Caregiver', email: d.email||'', phone: d.phone });
            }
          } catch {}
        }
        setCaregivers(cgList);
      }
    ));
    subs.push(onSnapshot(
      query(collection(db,'invitations'), where('toUserId','==',user.uid), where('status','==','pending')),
      snap => setPendingInvitations(snap.size)
    ));
    subs.push(onSnapshot(
      query(collection(db,'emergencies'), where('userId','==',user.uid), where('status','==','active')),
      snap => setEmergencyActive(!snap.empty)
    ));
    // Real-time appointment notifications
    subs.push(onSnapshot(
      query(collection(db,'appointments'), where('patientId','==',user.uid)),
      snap => {
        const today = new Date().toISOString().split('T')[0];
        const apts = snap.docs.map(d=>({id:d.id,...d.data()} as Appointment)).filter(a=>a.date >= today);
        setAppointments(apts.sort((a,b)=>a.date.localeCompare(b.date)));
      }
    ));
    return () => subs.forEach(u => u());
  }, [user]);

  const loadData = async () => {
    setRefreshing(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) { navigate('/login'); return; }
      setUser(currentUser);
      const userProfile = await getUserProfile(currentUser.uid);
      setProfile(userProfile);
      if (userProfile) setProfileForm({
        name: userProfile.name||'', phone: userProfile.phone||'',
        bloodGroup: userProfile.bloodGroup||'', age: userProfile.age ? String(userProfile.age) : '',
        gender: userProfile.gender||'', address: userProfile.address||'',
        medicalConditions: userProfile.medicalConditions||'',
        allergies: userProfile.allergies||'', emergencyContact: userProfile.emergencyContact||''
      });

      // Load medicines
      const medsSnap = await getDocs(query(collection(db,'medicines'), where('userId','==',currentUser.uid)));
      const medicinesData: Medicine[] = medsSnap.docs.map(d => ({id:d.id,...d.data()} as Medicine));

      // Today tracking
      const today = new Date().toISOString().split('T')[0];
      let trackData: any[] = [];
      try {
        const ts = await getDocs(query(collection(db,'medicineTracking'), where('userId','==',currentUser.uid), where('date','==',today)));
        trackData = ts.docs.map(d => d.data());
      } catch {}
      const takenSet = new Set(trackData.filter(t=>t.status==='taken').map(t=>t.medicineId));
      const skippedSet = new Set(trackData.filter(t=>t.status==='skipped').map(t=>t.medicineId));
      const missedSet = new Set(trackData.filter(t=>t.status==='missed').map(t=>t.medicineId));
      const meds = medicinesData.map(m => ({...m, taken: takenSet.has(m.id), skipped: skippedSet.has(m.id)}));
      setMedicines(meds);
      setMissedDoses([...missedSet] as string[]);
      computeNextDose(meds, trackData);
      // Cache for offline
      try { await cacheMedicines(meds); } catch {}

      // Adherence (30-day)
      try {
        const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate()-30);
        const hs = await getDocs(query(collection(db,'medicineTracking'), where('userId','==',currentUser.uid)));
        let total=0, taken=0;
        hs.forEach(d => { const td=d.data(); if(td.date >= thirtyAgo.toISOString().split('T')[0]) { total++; if(td.status==='taken') taken++; }});
        setAdherenceRate(total>0 ? Math.round((taken/total)*100) : 100);
      } catch {}

      // Check refill alerts
      await checkRefillAlerts(currentUser, medicinesData, userProfile);

      await logger.logWithUser(currentUser.uid, currentUser.email, 'info', 'Elderly dashboard loaded');
      // Request push notification permission
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      // Register FCM push token for this device
      registerPushNotifications(currentUser.uid).then(token => {
        if (token) console.log('[FCM] Push registered for elderly user');
      });
      // Listen for foreground FCM messages
      setupForegroundNotifications((payload) => {
        const { title, body } = payload.notification || {};
        if (title?.includes('Incoming call') || title?.includes('Video')) {
          // Handled by IncomingCallPopup via Firestore listener
        }
      });
      // Pre-load history for AI insights
      try {
        const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate()-30);
        const hs = await getDocs(query(collection(db,'medicineTracking'), where('userId','==',currentUser.uid)));
        const recs = hs.docs.map(d=>({id:d.id,...d.data()})).filter((r:any)=>r.date>=thirtyAgo.toISOString().split('T')[0]);
        const medMap: Record<string,string> = {};
        medicinesData.forEach(m=>{ medMap[m.id]=m.name; });
        setHistoryRecords(recs.map((r:any)=>({...r,medicineName:medMap[r.medicineId]||'Unknown'})));
      } catch {}
    } catch(err) { console.error(err); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const checkRefillAlerts = async (currentUser: any, medicinesData: Medicine[], userProfile: any) => {
    for (const med of medicinesData) {
      if (!med.totalQuantity || !med.currentQuantity) continue;
      const dosesPerDay = med.schedule?.length || 1;
      const daysLeft = Math.floor(med.currentQuantity / dosesPerDay);
      if (daysLeft <= 5) {
        // Notify caregivers
        const cgConns = await getDocs(query(collection(db,'connections'), where('users','array-contains',currentUser.uid), where('status','==','active')));
        for (const c of cgConns.docs) {
          const conn = c.data();
          if (!conn.relationship?.includes('caregiver')) continue;
          const cgId = conn.users.find((id:string) => id !== currentUser.uid);
          if (!cgId) continue;
          // Check if already notified recently
          const existing = await getDocs(query(collection(db,'notifications'), where('userId','==',cgId), where('medicineId','==',med.id), where('type','==','refill_reminder')));
          if (!existing.empty) continue;
          await addDoc(collection(db,'notifications'), {
            userId: cgId, type: 'refill_reminder', medicineId: med.id,
            message: `💊 Refill needed: ${med.name} for ${userProfile?.name||'patient'} — only ~${daysLeft} day(s) left (${med.currentQuantity} tablets remaining). Please refill soon.`,
            patientName: userProfile?.name, patientId: currentUser.uid,
            read: false, createdAt: serverTimestamp()
          });
        }
      }
    }
  };

  const computeNextDose = (meds: Medicine[], trackData: any[]) => {
    const now = new Date();
    const cur = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    const next = meds.filter(m => !m.taken && !m.skipped)
      .flatMap(m => (m.schedule||[]).map(t => ({...m, time:t})))
      .filter(item => item.time > cur && !trackData.find(t => t.medicineId===item.id && t.scheduledTime===item.time))
      .sort((a,b) => a.time.localeCompare(b.time))[0];
    setNextDose(next || null);
  };

  const checkMedicineTimes = () => {
    const now = new Date();
    const t = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    medicines.forEach(m => {
      if (!m.taken && !m.skipped && m.schedule?.includes(t)) {
        sendBrowserNotification('💊 Medicine Reminder', `Time to take ${m.name} - ${m.dosage}`);
        if (!isMuted) speechService.speak(`Time to take ${m.name}, ${m.dosage}`);
        // Show browser/device push notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('💊 Medicine Reminder — CareDose+', {
            body: `Time to take ${m.name} ${m.dosage}${m.foodTiming ? ` (${m.foodTiming} food)` : ''}`,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-72.png',
            tag: `med-${m.id}`,
            requireInteraction: true,
          });
        }
      }
    });
  };

  const handleMarkTaken = async (medicineId: string, time: string) => {
    if (!isOnline()) {
      const pending = await getPendingActions();
      await queueOfflineAction({ type:'mark_taken', medicineId, scheduledTime:time, date:new Date().toISOString().split('T')[0], userId:user.uid, timestamp:new Date().toISOString() });
      setPendingSync(p=>p+1);
      setMedicines(prev=>prev.map(m=>m.id===medicineId?{...m,taken:true,skipped:false}:m));
      if (!isMuted) speechService.speak('Medicine marked as taken. Will sync when online.');
      return;
    }
    try {
      const med = medicines.find(m => m.id === medicineId);
      await addDoc(collection(db,'medicineTracking'), {
        userId: user.uid, medicineId, date: new Date().toISOString().split('T')[0],
        scheduledTime: time, status: 'taken', timestamp: serverTimestamp()
      });
      // Decrement stock if tracked
      if (med?.currentQuantity != null && med.currentQuantity > 0) {
        await updateDoc(doc(db,'medicines',medicineId), { currentQuantity: med.currentQuantity - 1 });
      }
      setMedicines(prev => prev.map(m => m.id===medicineId ? {...m, taken:true, skipped:false} : m));
      setMissedDoses(prev => prev.filter(id => id!==medicineId));
      if (!isMuted) speechService.speak('Great job! Medicine marked as taken. Stay healthy!');
      await logger.logWithUser(user.uid, user.email, 'info', 'Medicine taken', {medicineId, time});
      setTimeout(() => loadData(), 1000);
    } catch(e) { console.error(e); }
  };

  const handleManualRestock = async (medicineId: string, addQty: number) => {
    const med = medicines.find(m=>m.id===medicineId);
    if (!med) return;
    const newQty = (med.currentQuantity||0) + addQty;
    try {
      await updateDoc(doc(db,'medicines',medicineId), { currentQuantity:newQty, lastRestockedAt:serverTimestamp(), lastRestockedQty:addQty });
      setMedicines(prev=>prev.map(m=>m.id===medicineId?{...m,currentQuantity:newQty}:m));
      // Save notification for caregiver
      if (user) {
        await addDoc(collection(db,'notifications'), {
          userId: user.uid, type:'restock_done', medicineId,
          message:`✅ ${med.name} restocked — added ${addQty} tablets. New stock: ${newQty} tablets.`,
          read:false, createdAt:serverTimestamp()
        });
      }
      if (!isMuted) speechService.speak(`${med.name} restocked with ${addQty} tablets.`);
    } catch(e) { console.error(e); }
  };

  const handleMarkSkipped = async (medicineId: string, time: string) => {
    try {
      await addDoc(collection(db,'medicineTracking'), {
        userId: user.uid, medicineId, date: new Date().toISOString().split('T')[0],
        scheduledTime: time, status: 'skipped', notes: 'Skipped by user', timestamp: serverTimestamp()
      });
      setMedicines(prev => prev.map(m => m.id===medicineId ? {...m, skipped:true, taken:false} : m));
      if (!isMuted) speechService.speak('Dose skipped. Please talk to your doctor if needed.');
      await logger.logWithUser(user.uid, user.email, 'info', 'Medicine skipped', {medicineId, time});
    } catch(e) { console.error(e); }
  };

  const handleEmergency = async (type: string) => {
    try {
      await addDoc(collection(db,'emergencies'), {
        userId: user.uid, userName: profile?.name||user.email,
        type, status: 'active', timestamp: serverTimestamp()
      });
      for (const cg of caregivers) {
        await addDoc(collection(db,'notifications'), {
          userId: cg.id, type: 'emergency', fromUserId: user.uid,
          fromUserName: profile?.name,
          message: `🚨 EMERGENCY: ${profile?.name} triggered a ${type} alert! Immediate attention required.`,
          read: false, createdAt: serverTimestamp()
        });
      }
      sendBrowserNotification('🚨 EMERGENCY ACTIVATED', 'Help is being notified. Stay calm.');
      if (!isMuted) speechService.speak('Emergency alert sent. Help is on the way. Please stay calm.');
      await logger.logWithUser(user.uid, user.email, 'warning', 'Emergency triggered', {type});
      setEmergencyActive(true);
      setShowEmergencyModal(false);
    } catch(e) { console.error(e); }
  };

  const handleResolveEmergency = async () => {
    const snap = await getDocs(query(collection(db,'emergencies'), where('userId','==',user.uid), where('status','==','active')));
    for (const d of snap.docs) await updateDoc(d.ref, {status:'resolved', resolvedAt:serverTimestamp()});
    setEmergencyActive(false);
    await logger.logWithUser(user.uid, user.email, 'info', 'Emergency resolved');
  };

  const loadHistory = async () => {
    if (!user) return;
    setHistoryLoading(true);
    try {
      const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate()-30);
      const snap = await getDocs(query(collection(db,'medicineTracking'), where('userId','==',user.uid)));
      const medMap: Record<string,string> = {};
      medicines.forEach(m => { medMap[m.id] = m.name; });
      const records: TrackingRecord[] = snap.docs.map(d => ({id:d.id,...d.data()} as TrackingRecord))
        .filter(r => r.date >= thirtyAgo.toISOString().split('T')[0])
        .map(r => ({...r, medicineName: medMap[r.medicineId]||'Unknown'}))
        .sort((a,b) => (b.timestamp?.toMillis?.()||0) - (a.timestamp?.toMillis?.()||0));
      setHistoryRecords(records);
    } finally { setHistoryLoading(false); }
  };

  const handleVoiceCommand = async () => {
    if (isListening) return;
    setIsListening(true);
    setVoiceText('');
    setVoiceReply('');
    try {
      // Don't speak first - it blocks the microphone on mobile
      // Just show visual feedback and start listening immediately
      const text = await speechService.listenForResponse(8000);
      setIsListening(false);
      if (!text || text === 'timeout' || text === 'error' || text === 'not_supported' || text === 'busy') {
        const errorMsg = text === 'not_supported'
          ? 'Voice not supported in this browser. Please type your question below.'
          : text === 'permission_denied'
          ? 'Microphone blocked. Please allow microphone access in your browser settings.'
          : 'Please try again — speak clearly after pressing the button.';
        setVoiceReply(errorMsg);
        if (!isMuted && text !== 'not_supported') speechService.speak('Please try again and speak clearly.');
        return;
      }
      setVoiceText(text);
      await processVoiceInput(text);
    } catch(e) {
      setIsListening(false);
      setVoiceReply('Microphone error. Please check browser permissions and try again.');
      console.error('Voice error:', e);
    }
  };

  // Text input fallback for voice
  const handleTextCommand = async (text: string) => {
    if (!text.trim()) return;
    setVoiceText(text.trim());
    setVoiceReply('');
    await processVoiceInput(text.trim());
  };

  const processVoiceInput = async (text: string) => {
    if (!text || !user) return;
    const ctx = {
      medicines, nextDose, caregivers, doctors,
      appointments: appointments.filter(a => a.date >= new Date().toISOString().split('T')[0]),
      missedDoses, adherenceRate, profileName: profile?.name || 'friend',
      wellnessScore: adherenceRate,
    };
    const intent = speechService.processQuery(text.toLowerCase());
    let reply = await speechService.handleIntent(intent, ctx);

    // Handle action intents
    if (reply === 'EMERGENCY_MODAL' || reply.startsWith('EMERGENCY_')) {
      const typeMap: Record<string,string> = {
        EMERGENCY_FALL:'fall', EMERGENCY_PAIN:'chest pain', EMERGENCY_CONFUSION:'confusion',
        EMERGENCY_BLEEDING:'bleeding', EMERGENCY_BREATHING:'breathing difficulty', EMERGENCY_STROKE:'stroke'
      };
      const eType = typeMap[reply] || 'emergency';
      setShowEmergencyModal(true);
      reply = `Sending ${eType} emergency alert! Help is on the way.`;
    } else if (reply === 'CALL_911') {
      window.location.href = 'tel:911';
      reply = 'Calling 911 now!';
    } else if (reply.startsWith('CALL_CAREGIVER:')) {
      const cg = caregivers[0];
      if (cg?.phone) window.location.href = `tel:${cg.phone}`;
      reply = `Calling ${cg?.name || 'your caregiver'} now!`;
    } else if (reply.startsWith('VIDEO_CAREGIVER:')) {
      if (caregivers.length > 0) {
        setVideoDoctor({ id: caregivers[0].id, name: caregivers[0].name });
        setShowVideoConsult(true);
        reply = `Starting video call with ${caregivers[0].name}!`;
      }
    } else if (reply.startsWith('CALL_DOCTOR:')) {
      const dr = doctors?.[0];
      if (dr?.phone) window.location.href = `tel:${dr.phone}`;
      reply = `Calling Dr. ${dr?.name || 'your doctor'} now!`;
    } else if (reply.startsWith('VIDEO_DOCTOR:')) {
      if (doctors && doctors.length > 0) {
        setVideoDoctor({ id: doctors[0].id, name: doctors[0].name });
        setShowVideoConsult(true);
        reply = `Starting video call with Dr. ${doctors[0].name}!`;
      }
    } else if (reply.startsWith('MARK_TAKEN:')) {
      const parts = reply.split(':');
      const medId = parts[1], doseTime = parts[2];
      if (medId) {
        await handleMarkTaken(medId, doseTime || '');
        reply = `Great! ${medicines.find(m=>m.id===medId)?.name || 'Medicine'} marked as taken!`;
      }
    } else if (reply.startsWith('MARK_SKIPPED:')) {
      const parts = reply.split(':');
      const medId = parts[1], doseTime = parts[2];
      if (medId) {
        await handleMarkSkipped(medId, doseTime || '');
        reply = `${medicines.find(m=>m.id===medId)?.name || 'Medicine'} skipped.`;
      }
    } else if (reply === 'BOOK_APPOINTMENT') {
      navigate('/schedule');
      reply = 'Opening your appointment schedule. You can book an appointment there!';
    } else if (reply === 'RESTOCK_MEDICINE') {
      reply = 'To restock, tap the +Restock button next to any medicine in your list below.';
    } else if (reply === 'CALL_FAMILY') {
      reply = 'Please use the caregivers section to call a family member.';
    }

    setVoiceReply(reply);
    setVoiceHistory(prev => [{ q: text, a: reply }, ...prev].slice(0, 6));
    if (!isMuted) speechService.speak(reply);
    await logger.logWithUser(user?.uid, user?.email, 'info', 'Voice command', { text, intent });
  };

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      await updateDoc(doc(db,'users',user.uid), {
        ...profileForm, age: profileForm.age ? parseInt(profileForm.age) : null, updatedAt: serverTimestamp()
      });
      setProfile((prev:any) => ({...prev,...profileForm}));
      setIsEditingProfile(false);
      await logger.logWithUser(user.uid, user.email, 'info', 'Profile updated');
    } catch(e) { console.error(e); }
    finally { setSavingProfile(false); }
  };

  const handleLogout = async () => {
    await logger.logWithUser(user?.uid, user?.email, 'info', 'User logged out');
    await logOut();
    navigate('/login');
  };

  const adherenceSummary = () => ({
    taken: historyRecords.filter(r=>r.status==='taken').length,
    skipped: historyRecords.filter(r=>r.status==='skipped').length,
    missed: historyRecords.filter(r=>r.status==='missed').length,
    total: historyRecords.length,
  });

  const firstName = profile?.name?.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour<12 ? `Good morning, ${firstName}` : hour<17 ? `Good afternoon, ${firstName}` : `Good evening, ${firstName}`;

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-14 w-14 border-4 border-blue-600 border-t-transparent mx-auto"></div>
        <p className="mt-4 text-gray-600 font-medium">Loading your dashboard...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Emergency Banner */}
      {emergencyActive && (
        <div className="bg-red-600 text-white py-3 px-4 fixed top-0 left-0 right-0 z-50 shadow-lg">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 animate-pulse" />
              <span className="font-bold">EMERGENCY ACTIVE — Help notified</span>
            </div>
            <Button size="sm" className="bg-white text-red-600 hover:bg-red-50 font-semibold" onClick={handleResolveEmergency}>
              <CheckCircle className="h-4 w-4 mr-1" />Resolve
            </Button>
          </div>
        </div>
      )}

      {/* Offline Banner */}
      {!online && (
        <div className="bg-amber-500 text-white px-4 py-2 text-center text-sm font-medium">
          📶 You are offline. Medicines marked as taken will sync when you reconnect.
          {pendingSync > 0 && ` (${pendingSync} action${pendingSync > 1 ? 's' : ''} queued)`}
        </div>
      )}

      {/* Header */}
      <header className={`bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm ${emergencyActive?'mt-12':''}`}>
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xl">
                {profile?.name?.charAt(0)||'U'}
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">{greeting}</h1>
                <p className="text-xs text-gray-500">{new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="icon" onClick={loadData} disabled={refreshing} className="text-gray-600 hover:bg-gray-100 h-9 w-9">
                <RefreshCw className={`h-4 w-4 ${refreshing?'animate-spin':''}`} />
              </Button>
              <Button variant="ghost" size="icon" className="relative text-gray-600 hover:bg-gray-100 h-9 w-9" onClick={() => setShowConnections(true)}>
                <Users className="h-4 w-4" />
                {pendingInvitations > 0 && <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">{pendingInvitations}</span>}
              </Button>
              <Button variant="ghost" size="icon" className="text-gray-600 hover:bg-gray-100 h-9 w-9" onClick={() => setIsMuted(m=>!m)}>
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              <Button size="sm" className="h-9 px-3 bg-red-600 hover:bg-red-700 text-white font-semibold" onClick={() => setShowEmergencyModal(true)}>
                <AlertCircle className="h-4 w-4 mr-1" />SOS
              </Button>
              <Button variant="ghost" size="icon" className="text-gray-600 hover:bg-gray-100 h-9 w-9" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {/* Next Dose Banner */}
        {nextDose && (
          <Card className="border-2 border-orange-400 bg-gradient-to-r from-orange-50 to-amber-50 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-orange-100 rounded-full"><Clock className="h-5 w-5 text-orange-600" /></div>
                  <div>
                    <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide">Next Dose Due</p>
                    <p className="text-lg font-bold text-gray-900">{nextDose.name}</p>
                    <p className="text-sm text-gray-600">{nextDose.dosage} at <span className="font-semibold text-orange-700">{nextDose.time}</span></p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button className="bg-green-600 hover:bg-green-700 text-white font-semibold h-10 px-5"
                    onClick={() => { handleMarkTaken(nextDose.id, nextDose.time); if(!isMuted) speechService.speak('Medicine taken!'); }}>
                    <CheckCircle className="h-4 w-4 mr-2" />Take Now
                  </Button>
                  <Button className="bg-amber-500 hover:bg-amber-600 text-white font-semibold h-10 px-4"
                    onClick={() => { handleMarkSkipped(nextDose.id, nextDose.time); }}>
                    <XCircle className="h-4 w-4 mr-2" />Skip
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label:"Today's Meds", value: medicines.length, sub:`${medicines.filter(m=>m.taken).length} taken`, icon:<Pill className="h-5 w-5 text-blue-600"/>, bg:'bg-blue-50 border-blue-200' },
            { label:'Adherence', value:`${adherenceRate}%`, sub:'30-day avg', icon:<TrendingUp className="h-5 w-5 text-green-600"/>, bg:'bg-green-50 border-green-200' },
            { label:'Appointments', value: appointments.length, sub:'Upcoming', icon:<Calendar className="h-5 w-5 text-purple-600"/>, bg:'bg-purple-50 border-purple-200' },
            { label:'Missed Today', value: missedDoses.length, sub: missedDoses.length>0?'Action needed':'All good', icon:<AlertCircle className={`h-5 w-5 ${missedDoses.length>0?'text-red-500':'text-gray-400'}`}/>, bg: missedDoses.length>0?'bg-red-50 border-red-200':'bg-gray-50 border-gray-200' },
          ].map((s,i) => (
            <Card key={i} className={`border ${s.bg}`}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="shrink-0">{s.icon}</div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">{s.label}</p>
                  <p className="text-xl font-bold text-gray-900">{s.value}</p>
                  <p className="text-xs text-gray-500">{s.sub}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Caregiver notice */}
        {caregivers.length === 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
            <Info className="h-4 w-4 text-blue-500 shrink-0" />
            <p className="text-sm text-blue-700 flex-1">You're in independent mode. Add a caregiver for extra support.</p>
            <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700 h-8 px-3 text-xs shrink-0" onClick={() => setShowConnections(true)}>
              <UserPlus className="h-3.5 w-3.5 mr-1" />Add
            </Button>
          </div>
        )}

        {/* Voice Assistant Panel */}
        <Card className="border border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="flex items-center gap-2 text-base text-indigo-900">
              <div className="p-1.5 bg-indigo-100 rounded-lg"><Mic className="h-4 w-4 text-indigo-600" /></div>
              Voice Assistant
              {isListening && <Badge className="bg-green-600 text-white animate-pulse text-xs ml-1">Listening...</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex gap-2 mb-3">
              <Button
                className={`flex-1 h-10 font-semibold ${isListening ? 'bg-green-600 text-white animate-pulse' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                onClick={handleVoiceCommand} disabled={isListening}>
                <Mic className="h-4 w-4 mr-2" />{isListening ? 'Listening...' : 'Speak to Assistant'}
              </Button>
              <Button variant="outline" className="h-10 border-indigo-300 text-indigo-700 hover:bg-indigo-100" onClick={() => setIsMuted(m=>!m)}>
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
            </div>

            {/* Quick command buttons */}
            <div className="flex flex-wrap gap-2 mb-3">
              {[
                { label:'💊 Next Dose', cmd:'What is my next medicine?' },
                { label:'📅 Appointments', cmd:'Show my appointments' },
                { label:'📊 Adherence', cmd:'What is my adherence rate?' },
                { label:'✅ Mark Taken', cmd:'Mark medicine as taken' },
                { label:'📞 Call Caregiver', cmd:'Call caregiver' },
                { label:'🏥 My Medicines', cmd:'List all my medicines' },
                { label:'📦 Refill Alert', cmd:'Check refill status' },
                { label:'❓ Help', cmd:'Help' },
              ].map(({label, cmd}) => (
                <button key={label}
                  className="text-xs bg-white border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-full hover:bg-indigo-50 transition-colors font-medium shadow-sm"
                  onClick={() => { setVoiceText(cmd); setVoiceInput(''); processVoiceInput(cmd); }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Text input fallback */}
            <div className="flex gap-2">
              <input
                type="text"
                value={voiceInput}
                onChange={e => setVoiceInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && voiceInput.trim()) { handleTextCommand(voiceInput); setVoiceInput(''); } }}
                placeholder="Or type your question here…"
                className="flex-1 text-sm border border-indigo-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300"
              />
              <button
                onClick={() => { if (voiceInput.trim()) { handleTextCommand(voiceInput); setVoiceInput(''); } }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Ask
              </button>
            </div>

            {/* Current conversation */}
            {(voiceText || voiceReply) && (
              <div className="bg-white rounded-lg border border-indigo-100 p-3 mb-2">
                {voiceText && <p className="text-xs text-indigo-500 font-medium mb-1">You: "{voiceText}"</p>}
                {voiceReply && <p className="text-sm text-gray-800">{voiceReply}</p>}
              </div>
            )}

            {/* History */}
            {voiceHistory.length > 0 && (
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {voiceHistory.slice(1).map((h,i) => (
                  <div key={i} className="text-xs text-gray-500 flex gap-2">
                    <span className="text-indigo-400 shrink-0">Q:</span>
                    <span className="truncate">{h.q}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Health Insights */}
        {historyRecords.length > 0 && (
          <AIInsightsPanel records={historyRecords} medicines={medicines} userName={profile?.name||'there'} compact={true}/>
        )}

        {/* Tabs */}
        <Tabs defaultValue="medicines" onValueChange={v => { if(v==='history') loadHistory(); }}>
          <TabsList className="w-full">
            <TabsTrigger value="medicines">💊 Medicines</TabsTrigger>
            <TabsTrigger value="history">📋 History</TabsTrigger>
            <TabsTrigger value="appointments">📅 Appointments</TabsTrigger>
            <TabsTrigger value="profile">👤 Profile</TabsTrigger>
          </TabsList>

          {/* MEDICINES */}
          <TabsContent value="medicines" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base"><Pill className="h-5 w-5 text-blue-600" />Today's Schedule</CardTitle>
                  <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700 h-8 px-3 text-xs" onClick={() => navigate('/medicines/add')}>
                    <Plus className="h-3.5 w-3.5 mr-1" />Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {medicines.length === 0 ? (
                  <div className="text-center py-10">
                    <Pill className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No medicines scheduled</p>
                    <Button className="mt-3 bg-blue-600 text-white hover:bg-blue-700" onClick={() => navigate('/medicines/add')}>Add Medicine</Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {medicines.map(med => (med.schedule||[]).map((time, idx) => {
                      const [h,m] = time.split(':');
                      const dt = new Date(); dt.setHours(+h,+m,0);
                      const isPast = new Date() > dt;
                      let cls = 'bg-white border-gray-200';
                      if (med.taken) cls = 'bg-green-50 border-green-300';
                      else if (med.skipped) cls = 'bg-amber-50 border-amber-300';
                      else if (isPast) cls = 'bg-red-50 border-red-300';
                      const stockLow = med.currentQuantity != null && med.currentQuantity <= (med.schedule?.length||1)*5;
                      return (
                        <div key={`${med.id}-${idx}`} className={`p-4 rounded-xl border-2 ${cls} transition-all`}>
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-gray-900">{med.name}</span>
                                {med.taken && <Badge className="bg-green-600 text-white text-xs">✓ Taken</Badge>}
                                {med.skipped && !med.taken && <Badge className="bg-amber-500 text-white text-xs">⏭ Skipped</Badge>}
                                {missedDoses.includes(med.id) && !med.taken && !med.skipped && <Badge className="bg-red-600 text-white text-xs">✗ Missed</Badge>}
                                {stockLow && <Badge className="bg-orange-500 text-white text-xs"><Package className="h-2.5 w-2.5 mr-1 inline" />Low Stock</Badge>}
                              </div>
                              <p className="text-sm text-gray-600 mt-0.5">{med.dosage}{med.foodTiming ? ` • ${med.foodTiming} food` : ''}</p>
                              {med.currentQuantity != null && (
                                <div className="flex items-center gap-2 mt-0.5">
                                  <p className="text-xs text-gray-400">{med.currentQuantity} tablets remaining</p>
                                  <button className="text-xs text-blue-600 hover:text-blue-700 underline"
                                    onClick={()=>handleManualRestock(med.id, med.totalQuantity||30)}>
                                    +Restock
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-sm font-bold text-gray-700 bg-gray-100 px-3 py-1 rounded-full">{time}</span>
                              {!med.taken && !med.skipped && (
                                <div className="flex gap-1.5">
                                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-9 px-3 font-medium"
                                    onClick={() => handleMarkTaken(med.id, time)}>
                                    <CheckCircle className="h-3.5 w-3.5 mr-1" />Take
                                  </Button>
                                  <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white h-9 px-3 font-medium"
                                    onClick={() => handleMarkSkipped(med.id, time)}>
                                    <XCircle className="h-3.5 w-3.5 mr-1" />Skip
                                  </Button>
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

          {/* HISTORY */}
          <TabsContent value="history" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {label:'Total',value:adherenceSummary().total,cls:'bg-blue-50 border-blue-200 text-blue-700'},
                {label:'✓ Taken',value:adherenceSummary().taken,cls:'bg-green-50 border-green-200 text-green-700'},
                {label:'⏭ Skipped',value:adherenceSummary().skipped,cls:'bg-amber-50 border-amber-200 text-amber-700'},
                {label:'✗ Missed',value:adherenceSummary().missed,cls:'bg-red-50 border-red-200 text-red-700'},
              ].map((s,i) => (
                <div key={i} className={`rounded-xl border p-3 ${s.cls}`}>
                  <p className="text-xs font-medium">{s.label}</p>
                  <p className="text-2xl font-bold">{s.value}</p>
                </div>
              ))}
            </div>
            {adherenceSummary().total > 0 && (
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Adherence Rate</span>
                    <span className="text-sm font-bold text-gray-900">
                      {adherenceSummary().total > 0 ? Math.round((adherenceSummary().taken / adherenceSummary().total)*100) : 0}%
                    </span>
                  </div>
                  <Progress value={adherenceSummary().total > 0 ? (adherenceSummary().taken / adherenceSummary().total)*100 : 0} className="h-3" />
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><History className="h-5 w-5 text-blue-600" />Last 30 Days</CardTitle></CardHeader>
              <CardContent>
                {historyLoading ? (
                  <div className="py-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mx-auto"></div></div>
                ) : historyRecords.length === 0 ? (
                  <div className="py-8 text-center text-gray-500">No history found.</div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {historyRecords.map(r => (
                      <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-white hover:bg-gray-50">
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{r.medicineName||'Unknown'}</p>
                          <p className="text-xs text-gray-500">{r.date} at {r.scheduledTime}</p>
                        </div>
                        <Badge className={r.status==='taken'?'bg-green-600 text-white':r.status==='skipped'?'bg-amber-500 text-white':'bg-red-600 text-white'}>
                          {r.status==='taken'?'✓ Taken':r.status==='skipped'?'⏭ Skipped':'✗ Missed'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* APPOINTMENTS */}
          <TabsContent value="appointments" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base"><Calendar className="h-5 w-5 text-purple-600" />Appointments</CardTitle>
                  <Button size="sm" className="bg-purple-600 text-white hover:bg-purple-700 h-8 px-3 text-xs" onClick={() => navigate('/schedule')}>
                    <Plus className="h-3.5 w-3.5 mr-1" />Book
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {appointments.length === 0 ? (
                  <div className="py-8 text-center">
                    <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No upcoming appointments</p>
                    <Button className="mt-3 bg-purple-600 text-white hover:bg-purple-700" onClick={() => navigate('/schedule')}>Book Appointment</Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {appointments.map(apt => (
                      <div key={apt.id} className="p-4 border border-gray-200 rounded-xl hover:bg-gray-50 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-purple-100 rounded-lg"><Calendar className="h-4 w-4 text-purple-600" /></div>
                          <div>
                            <p className="font-semibold text-gray-900">{apt.title||'Appointment'}</p>
                            <p className="text-sm text-gray-600">Dr. {apt.doctor||'Unknown'}{apt.location ? ` • ${apt.location}` : ''}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-purple-700">{new Date(apt.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</p>
                          <p className="text-xs text-gray-500">{apt.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* PROFILE */}
          <TabsContent value="profile" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base"><User className="h-5 w-5 text-blue-600" />My Profile</CardTitle>
                  {!isEditingProfile ? (
                    <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700 h-8 px-3 text-xs" onClick={() => setIsEditingProfile(true)}>
                      <Edit className="h-3.5 w-3.5 mr-1" />Edit
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100 h-8 px-3 text-xs" onClick={() => setIsEditingProfile(false)}>Cancel</Button>
                      <Button size="sm" className="bg-green-600 text-white hover:bg-green-700 h-8 px-3 text-xs" onClick={saveProfile} disabled={savingProfile}>
                        <Save className="h-3.5 w-3.5 mr-1" />{savingProfile?'Saving...':'Save'}
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!isEditingProfile ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {label:'Full Name',value:profile?.name,icon:<User className="h-4 w-4 text-blue-500"/>},
                      {label:'Phone',value:profile?.phone,icon:<Phone className="h-4 w-4 text-blue-500"/>},
                      {label:'Blood Group',value:profile?.bloodGroup,icon:<Heart className="h-4 w-4 text-red-500"/>},
                      {label:'Age',value:profile?.age,icon:<Calendar className="h-4 w-4 text-blue-500"/>},
                      {label:'Gender',value:profile?.gender,icon:<User className="h-4 w-4 text-blue-500"/>},
                      {label:'Address',value:profile?.address,icon:<Shield className="h-4 w-4 text-gray-500"/>},
                      {label:'Medical Conditions',value:profile?.medicalConditions,icon:<Activity className="h-4 w-4 text-orange-500"/>},
                      {label:'Allergies',value:profile?.allergies,icon:<AlertCircle className="h-4 w-4 text-red-500"/>},
                      {label:'Emergency Contact',value:profile?.emergencyContact,icon:<Phone className="h-4 w-4 text-red-500"/>},
                    ].map((f,i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                        <div className="mt-0.5 shrink-0">{f.icon}</div>
                        <div>
                          <p className="text-xs text-gray-500 font-medium">{f.label}</p>
                          <p className="text-sm text-gray-900">{f.value||<span className="text-gray-400 italic">Not set</span>}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      {key:'name',label:'Full Name',type:'text'},{key:'phone',label:'Phone',type:'tel'},
                      {key:'bloodGroup',label:'Blood Group',type:'text',placeholder:'e.g. A+, O-'},{key:'age',label:'Age',type:'number'},
                      {key:'gender',label:'Gender',type:'text',placeholder:'Male / Female / Other'},{key:'address',label:'Address',type:'text'},
                      {key:'medicalConditions',label:'Medical Conditions',type:'text'},{key:'allergies',label:'Allergies',type:'text'},
                      {key:'emergencyContact',label:'Emergency Contact',type:'text',placeholder:'Name: +91...'},
                    ].map(f => (
                      <div key={f.key} className="space-y-1">
                        <Label className="text-xs font-medium text-gray-600">{f.label}</Label>
                        <Input type={f.type} placeholder={f.placeholder||f.label}
                          value={(profileForm as any)[f.key]}
                          onChange={e => setProfileForm(prev => ({...prev,[f.key]:e.target.value}))}
                          className="h-9 text-sm border-gray-300 bg-white" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Setup Guide — push notifications + wearables */}
            {user && <SetupGuide userId={user.uid}/>}
          </TabsContent>
        </Tabs>

        {/* Doctor Contacts */}
        {doctors.length > 0 && (
          <Card className="bg-white border border-gray-200 shadow-none">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                My Doctors
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {doctors.map(dr=>(
                  <div key={dr.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">{dr.name?.charAt(0)}</div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">Dr. {dr.name}</p>
                        <p className="text-xs text-gray-500">{dr.email}</p>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      {dr.phone && (
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-3 text-xs"
                          onClick={()=>window.location.href=`tel:${dr.phone}`}>
                          <Phone className="h-3.5 w-3.5 mr-1"/>Call
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Wearable Health Widget */}
        <WearableWidget userId={user?.uid||''} onFallDetected={()=>setShowEmergencyModal(true)} compact={true}/>

        {/* Family Sharing */}
        {user && profile && (
          <FamilySharing patientId={user.uid} patientName={profile.name||'Patient'} currentUserId={user.uid}/>
        )}

        {/* Caregivers */}
        {caregivers.length > 0 && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Heart className="h-4 w-4 text-red-500"/>Your Caregivers</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {caregivers.map(cg => (
                  <div key={cg.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-xl bg-white hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-green-600 flex items-center justify-center text-white font-bold text-sm">{cg.name?.charAt(0)}</div>
                      <div><p className="font-medium text-sm text-gray-900">{cg.name}</p><p className="text-xs text-gray-500">{cg.email}</p></div>
                    </div>
                    {cg.phone && (
                      <Button size="sm" className="bg-green-600 text-white hover:bg-green-700 h-8 px-3 text-xs"
                        onClick={() => window.location.href=`tel:${cg.phone}`}>
                        <Phone className="h-3.5 w-3.5 mr-1"/>Call
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-3 pb-6">
          <Button className="h-16 flex flex-col gap-1 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl" onClick={() => navigate('/medicines')}>
            <Pill className="h-5 w-5"/><span className="text-xs">Medicines</span>
          </Button>
          <Button className="h-16 flex flex-col gap-1 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-xl" onClick={() => navigate('/schedule')}>
            <Calendar className="h-5 w-5"/><span className="text-xs">Schedule</span>
          </Button>
          <Button className="h-16 flex flex-col gap-1 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl" onClick={() => setShowConnections(true)}>
            <Users className="h-5 w-5"/><span className="text-xs">Connections</span>
          </Button>
        </div>
      </main>

      {/* Emergency Popup */}
      {user && <EmergencyPopup userId={user.uid} />}

      {/* Connections Modal */}
      {showConnections && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl">
            <Button variant="ghost" size="icon" className="absolute top-3 right-3 z-10 bg-white rounded-full shadow"
              onClick={() => setShowConnections(false)}><X className="h-4 w-4"/></Button>
            <ConnectionsPanel userRole="elderly"/>
          </div>
        </div>
      )}

      {/* Emergency Modal */}
      <Dialog open={showEmergencyModal} onOpenChange={setShowEmergencyModal}>
        <DialogContent className="max-w-sm bg-white" aria-describedby="em-desc">
          <DialogHeader>
            <DialogTitle className="text-xl text-red-600 flex items-center gap-2">
              <AlertCircle className="h-5 w-5"/>Emergency Alert
            </DialogTitle>
          </DialogHeader>
          <p id="em-desc" className="text-sm text-gray-600">Your caregivers will be notified immediately. Select the emergency type:</p>
          <div className="grid grid-cols-2 gap-3 py-2">
            {[['fall','🤸 Fall'],['pain','❤️ Chest/Pain'],['confusion','🧠 Confusion'],['other','⚠️ Other']].map(([type,label]) => (
              <Button key={type} className="h-16 flex flex-col gap-1 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl"
                onClick={() => handleEmergency(type)}>{label}</Button>
            ))}
          </div>
          <Button variant="outline" className="w-full border-gray-300 text-gray-700 hover:bg-gray-100 font-medium"
            onClick={() => setShowEmergencyModal(false)}>Cancel</Button>
        </DialogContent>
      </Dialog>

      {/* ── INCOMING VIDEO CALL POPUP ── */}
      {user && (
        <IncomingCallPopup
          currentUserId={user.uid}
          currentUserName={profile?.name || ''}
          onAccept={(call) => {
            setAcceptedCallData(call);
            setVideoDoctor({ id: call.doctorId, name: call.doctorName });
            setShowVideoConsult(true);
          }}
        />
      )}

      {/* ── VIDEO CONSULT (outgoing or accepted) ── */}
      {user && showVideoConsult && videoDoctor && (
        <VideoConsult
          open={showVideoConsult}
          onClose={() => { setShowVideoConsult(false); setAcceptedCallData(null); setVideoDoctor(null); }}
          doctorName={videoDoctor.name}
          patientName={profile?.name || ''}
          doctorId={acceptedCallData?.doctorId || videoDoctor.id}
          patientId={user.uid}
          appointmentId={acceptedCallData?.appointmentId}
          role="patient"
        />
      )}
    </div>
  );
};

export default ElderlyApp;
