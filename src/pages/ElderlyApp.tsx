// src/pages/ElderlyApp.tsx - COMPLETE FIXED VERSION
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getUserProfile, logOut } from '@/lib/firebase-auth';
import { db, auth } from '@/lib/firebase';
import { 
  collection, query, where, getDocs, doc, getDoc, addDoc, 
  updateDoc, onSnapshot, serverTimestamp, orderBy, deleteDoc 
} from 'firebase/firestore';
import { logger } from '@/lib/logger';
import { speechService } from '@/lib/speech';
import { sendBrowserNotification } from '@/lib/notifications';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ConnectionsPanel from '@/components/ConnectionsPanel';
import { 
  Pill, Bell, Clock, Calendar, Heart, User, Phone, 
  AlertCircle, CheckCircle, XCircle, Volume2, Mic, 
  LogOut, MessageSquare, Activity, Users, UserPlus,
  UserCheck, UserX, Mail, Download, X, Volume, VolumeX,
  RefreshCw, Eye, Edit, Trash2, Plus, ChevronRight, Info
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
  invitationId?: string;
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
  foodTiming?: 'before' | 'after' | 'with';
  startDate?: string;
  endDate?: string;
  refills?: number;
  prescribedBy?: string;
  notes?: string;
  taken?: boolean;
}

interface Tracking {
  id: string;
  medicineId: string;
  status: 'taken' | 'missed' | 'skipped' | 'late';
  scheduledTime: string;
  actualTime?: string;
  date: string;
  notes?: string;
  timestamp: any;
}

interface Appointment {
  id: string;
  title: string;
  doctor: string;
  doctorId?: string;
  date: string;
  time: string;
  duration?: number;
  location?: string;
  notes?: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
  type?: 'checkup' | 'followup' | 'emergency' | 'consultation';
}

interface Caregiver {
  id: string;
  name: string;
  email: string;
  phone?: string;
  relationship: string;
  avatar?: string;
  permissions?: string[];
}

interface Emergency {
  id: string;
  type: 'fall' | 'pain' | 'confusion' | 'other';
  description?: string;
  status: 'active' | 'resolved' | 'false_alarm';
  timestamp: any;
  resolvedAt?: any;
  notifiedCaregivers?: string[];
}

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
  const [chatHistory, setChatHistory] = useState<Array<{user: string, bot: string, timestamp: Date}>>([]);
  const [lastCommand, setLastCommand] = useState('');
  const [missedDoses, setMissedDoses] = useState<string[]>([]);
  const [showConnections, setShowConnections] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [emergencyActive, setEmergencyActive] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyType, setEmergencyType] = useState<'fall' | 'pain' | 'confusion' | 'other'>('other');
  const [emergencyDescription, setEmergencyDescription] = useState('');
  const [showMedicineDetails, setShowMedicineDetails] = useState<string | null>(null);
  const [wellnessScore, setWellnessScore] = useState(0);

  // Connections state
  const [connections, setConnections] = useState<Connection[]>([]);
  const [invitations, setInvitations] = useState<{ received: Invitation[]; sent: Invitation[] }>({
    received: [],
    sent: []
  });
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const navigate = useNavigate();

  // Logger function with safe handling - FIXED
  const logUserAction = async (action: string, details?: any) => {
    if (user && user.uid && user.email) {
      await logger.logWithUser(
        user.uid, 
        user.email, 
        'info', 
        action, 
        details || {} // Always provide an object, even if empty
      );
    }
  };

  useEffect(() => {
    loadData();
    
    // Set up medicine check interval (every minute)
    const interval = setInterval(checkMedicineTimes, 60000);
    
    return () => {
      clearInterval(interval);
    };
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
      
      // Filter caregivers to only show actual caregivers
      const fetchCaregivers = async () => {
        const caregiversList: Caregiver[] = [];
        
        for (const conn of connectionsData) {
          if (conn.relationship === 'caregiver-elderly' || conn.relationship.includes('caregiver')) {
            const otherId = conn.users.find(id => id !== user.uid);
            const otherEmail = conn.userEmails.find(email => email !== user.email);
            
            if (otherId && otherEmail) {
              try {
                const otherUserRef = doc(db, 'users', otherId);
                const otherUserSnap = await getDoc(otherUserRef);
                const otherUserData = otherUserSnap.data();
                
                if (otherUserData && otherUserData.role === 'caregiver') {
                  caregiversList.push({
                    id: otherId,
                    name: otherUserData.name || otherEmail.split('@')[0],
                    email: otherEmail,
                    phone: otherUserData.phone,
                    avatar: otherUserData.avatar,
                    relationship: conn.relationship
                  });
                }
              } catch (error) {
                console.error('Error fetching caregiver profile:', error);
              }
            }
          }
        }
        
        setCaregivers(caregiversList);
      };
      
      fetchCaregivers();
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

    const emergenciesQuery = query(
      collection(db, 'emergencies'),
      where('userId', '==', user.uid),
      where('status', '==', 'active')
    );
    
    const unsubscribeEmergencies = onSnapshot(emergenciesQuery, (snapshot) => {
      setEmergencyActive(!snapshot.empty);
    });

    return () => {
      unsubscribeReceived();
      unsubscribeSent();
      unsubscribeConnections();
      unsubscribeNotifications();
      unsubscribeEmergencies();
    };
  }, [user]);

  useEffect(() => {
    if (user) {
      logUserAction('Page viewed', { page: 'ElderlyDashboard' });
      calculateWellnessScore();
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

      await logUserAction('Data loading started', { page: 'ElderlyDashboard' });

      // Load medicines
      const medicinesRef = collection(db, 'medicines');
      const medicinesQuery = query(medicinesRef, where('userId', '==', currentUser.uid));
      const medicinesSnap = await getDocs(medicinesQuery);
      const medicinesData: Medicine[] = [];
      medicinesSnap.forEach((doc) => {
        medicinesData.push({ id: doc.id, ...doc.data() } as Medicine);
      });
      setMedicines(medicinesData);

      // Load appointments
      const today = new Date().toISOString().split('T')[0];
      const appointmentsRef = collection(db, 'appointments');
      const appointmentsQuery = query(
        appointmentsRef,
        where('userId', '==', currentUser.uid),
        where('date', '>=', today),
        orderBy('date', 'asc'),
        orderBy('time', 'asc')
      );
      const appointmentsSnap = await getDocs(appointmentsQuery);
      const appointmentsData: Appointment[] = [];
      appointmentsSnap.forEach((doc) => {
        appointmentsData.push({ id: doc.id, ...doc.data() } as Appointment);
      });
      setAppointments(appointmentsData);

      // Load today's tracking
      const trackingRef = collection(db, 'tracking');
      const trackingQuery = query(
        trackingRef,
        where('userId', '==', currentUser.uid),
        where('date', '==', today)
      );
      const trackingSnap = await getDocs(trackingQuery);
      const takenMedicineIds = new Set();
      const missedMedicineIds = new Set();
      
      trackingSnap.forEach((doc) => {
        const data = doc.data();
        if (data.status === 'taken') {
          takenMedicineIds.add(data.medicineId);
        } else if (data.status === 'missed') {
          missedMedicineIds.add(data.medicineId);
        }
      });

      const updatedMedicines = medicinesData.map(med => ({
        ...med,
        taken: takenMedicineIds.has(med.id)
      }));
      setMedicines(updatedMedicines);
      setMissedDoses(Array.from(missedMedicineIds) as string[]);

      // Calculate next dose
      const now = new Date();
      const next = updatedMedicines
        .filter(med => !med.taken)
        .flatMap(med => (med.schedule || []).map((time: string) => ({
          ...med,
          time
        })))
        .filter(item => {
          const [hours, minutes] = item.time.split(':');
          const doseTime = new Date();
          doseTime.setHours(parseInt(hours), parseInt(minutes), 0);
          return doseTime > now;
        })
        .sort((a, b) => a.time.localeCompare(b.time))[0];
      setNextDose(next);

      // Calculate adherence rate (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const historyTrackingQuery = query(
        trackingRef,
        where('userId', '==', currentUser.uid),
        where('timestamp', '>=', thirtyDaysAgo.toISOString())
      );
      const historyTrackingSnap = await getDocs(historyTrackingQuery);
      
      let total = 0;
      let taken = 0;
      
      historyTrackingSnap.forEach((doc) => {
        const data = doc.data();
        total++;
        if (data.status === 'taken') taken++;
      });
      
      setAdherenceRate(total > 0 ? Math.round((taken / total) * 100) : 100);

      await logUserAction('Data loaded successfully', { 
        medicinesCount: medicinesData.length,
        appointmentsCount: appointmentsData.length
      });

    } catch (error: any) {
      console.error('Error loading data:', error);
      await logger.error('Failed to load elderly data', { 
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

  const calculateWellnessScore = () => {
    let score = 0;
    score += (adherenceRate / 100) * 40;
    const missedPenalty = Math.min(missedDoses.length * 5, 30);
    score += (30 - missedPenalty);
    const keptAppointments = appointments.filter(a => a.status === 'completed').length;
    const totalAppointments = appointments.length;
    if (totalAppointments > 0) {
      score += (keptAppointments / totalAppointments) * 20;
    } else {
      score += 20;
    }
    if (!emergencyActive) {
      score += 10;
    }
    setWellnessScore(Math.round(score));
  };

  const checkMedicineTimes = () => {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    medicines.forEach(med => {
      if (!med.taken && med.schedule?.includes(currentTime)) {
        triggerReminder(med);
      }
    });
  };

  const triggerReminder = (medicine: Medicine) => {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    sendBrowserNotification('💊 Medicine Reminder', `Time to take ${medicine.name} - ${medicine.dosage}`, {
      tag: `reminder-${medicine.id}`,
      requireInteraction: true,
      onClick: () => window.focus()
    });

    if (!isMuted) {
      let message = `Hello! It's time to take your medicine: ${medicine.name}, ${medicine.dosage}.`;
      if (medicine.foodTiming) {
        const timingText = medicine.foodTiming === 'before' ? 'before' : 
                          medicine.foodTiming === 'after' ? 'after' : 'with';
        message += ` Please take it ${timingText} food.`;
      }
      if (medicine.instructions) {
        message += ` ${medicine.instructions}`;
      }
      speechService.speak(message);
    }

    logUserAction('Medicine reminder triggered', { 
      medicine: medicine.name,
      time: currentTime 
    });
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

  const handleMarkTaken = async (medicineId: string, time: string) => {
    try {
      const trackingRef = collection(db, 'tracking');
      await addDoc(trackingRef, {
        userId: user.uid,
        medicineId,
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().split(' ')[0],
        scheduledTime: time,
        status: 'taken',
        timestamp: serverTimestamp()
      });
      
      if (!isMuted) {
        speechService.speak("Thank you! Stay healthy.");
      }
      
      await logUserAction('Medicine taken', { medicineId, time });
      
      setMedicines(prev => 
        prev.map(med => 
          med.id === medicineId ? { ...med, taken: true } : med
        )
      );
      
      setMissedDoses(prev => prev.filter(id => id !== medicineId));
      
      const now = new Date();
      const next = medicines
        .filter(med => med.id !== medicineId ? !med.taken : false)
        .flatMap(med => (med.schedule || []).map((t: string) => ({
          ...med,
          time: t
        })))
        .filter(item => {
          const [hours, minutes] = item.time.split(':');
          const doseTime = new Date();
          doseTime.setHours(parseInt(hours), parseInt(minutes), 0);
          return doseTime > now;
        })
        .sort((a, b) => a.time.localeCompare(b.time))[0];
      setNextDose(next);
      
      calculateWellnessScore();
      
    } catch (error) {
      console.error('Error marking as taken:', error);
    }
  };

  const handleMarkSkipped = async (medicineId: string, time: string) => {
    try {
      const trackingRef = collection(db, 'tracking');
      await addDoc(trackingRef, {
        userId: user.uid,
        medicineId,
        date: new Date().toISOString().split('T')[0],
        scheduledTime: time,
        status: 'skipped',
        timestamp: serverTimestamp(),
        notes: 'Skipped by user'
      });
      
      if (!isMuted) {
        speechService.speak("I've marked this dose as skipped. Please contact your doctor if you have concerns.");
      }
      
      await logUserAction('Medicine skipped', { medicineId, time });
      
      setMedicines(prev => 
        prev.map(med => 
          med.id === medicineId ? { ...med, taken: true } : med
        )
      );
      
    } catch (error) {
      console.error('Error marking as skipped:', error);
    }
  };

  // FIXED handleEmergency function
  const handleEmergency = (type: 'fall' | 'pain' | 'confusion' | 'other' = 'other', description?: string) => {
    sendBrowserNotification('🚨 EMERGENCY ACTIVATED', 'Help is being notified. Please stay calm.', {
      tag: 'emergency',
      requireInteraction: true
    });
    
    if (!isMuted) {
      speechService.speak("Emergency alert triggered. Help is on the way. Please stay calm.");
    }
    
    const emergenciesRef = collection(db, 'emergencies');
    addDoc(emergenciesRef, {
      userId: user.uid,
      userName: profile?.name,
      type,
      description: description || '',
      status: 'active',
      timestamp: serverTimestamp()
    });
    
    caregivers.forEach(cg => {
      sendBrowserNotification('🚨 EMERGENCY ALERT', `${profile?.name} needs assistance: ${type}`, {
        tag: 'emergency'
      });
      
      const notificationsRef = collection(db, 'notifications');
      addDoc(notificationsRef, {
        userId: cg.id,
        type: 'emergency',
        fromUserId: user.uid,
        fromUserName: profile?.name,
        message: `🚨 EMERGENCY: ${profile?.name} triggered a ${type} alert!`,
        read: false,
        createdAt: serverTimestamp()
      });
    });
    
    setEmergencyActive(true);
    
    // FIX: Ensure description is never undefined
    logUserAction('Emergency triggered', { 
      type, 
      description: description || '' 
    });
  };

  // FIXED handleResolveEmergency function
  const handleResolveEmergency = async () => {
    const emergenciesRef = collection(db, 'emergencies');
    const emergenciesQuery = query(
      emergenciesRef,
      where('userId', '==', user.uid),
      where('status', '==', 'active')
    );
    const emergenciesSnap = await getDocs(emergenciesQuery);
    
    emergenciesSnap.forEach(async (doc) => {
      await updateDoc(doc.ref, {
        status: 'resolved',
        resolvedAt: serverTimestamp()
      });
    });
    
    setEmergencyActive(false);
    
    // FIX: Log with empty object instead of undefined
    logUserAction('Emergency resolved', {});
    
    if (!isMuted) {
      speechService.speak("Emergency has been resolved. Thank you.");
    }
  };

  // FIXED voice command with error handling
  const handleVoiceCommand = () => {
    setIsListening(true);
    speechService.askQuestion("How can I help you?")
      .then(async (response) => {
        setIsListening(false);
        setLastCommand(response.text);
        
        let botResponse = '';
        const text = response.text.toLowerCase();

        if (text.includes('medicine') || text.includes('medication') || text.includes('pill')) {
          if (nextDose) {
            botResponse = `Your next medicine is ${nextDose.name} at ${nextDose.time}`;
            if (nextDose.foodTiming) {
              const timingText = nextDose.foodTiming === 'before' ? 'before' : 
                                nextDose.foodTiming === 'after' ? 'after' : 'with';
              botResponse += `. Take ${timingText} food.`;
            }
          } else if (medicines.length > 0) {
            const pendingCount = medicines.filter(m => !m.taken).length;
            const takenCount = medicines.length - pendingCount;
            botResponse = `You have ${medicines.length} medicines today. ${takenCount} taken, ${pendingCount} pending.`;
          } else {
            botResponse = "You have no medicines scheduled for today.";
          }
        } 
        else if (text.includes('appointment')) {
          if (appointments.length > 0) {
            const appt = appointments[0];
            const apptDate = new Date(appt.date).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric'
            });
            botResponse = `Your next appointment is on ${apptDate} at ${appt.time}`;
            if (appt.doctor) {
              botResponse += ` with ${appt.doctor}`;
            }
          } else {
            botResponse = "You have no upcoming appointments.";
          }
        } 
        else if (text.includes('caregiver') || text.includes('helper') || text.includes('nurse')) {
          if (caregivers.length > 0) {
            const names = caregivers.map(c => c.name).join(', ');
            botResponse = `You have ${caregivers.length} caregiver(s): ${names}.`;
            if (caregivers[0].phone) {
              botResponse += ' Say "call caregiver" to call them.';
            }
          } else {
            botResponse = "You have no caregivers connected yet. You can invite caregivers from the connections panel.";
          }
        } 
        else if (text.includes('call') && text.includes('caregiver')) {
          if (caregivers.length > 0 && caregivers[0].phone) {
            window.location.href = `tel:${caregivers[0].phone}`;
            botResponse = `Calling ${caregivers[0].name}...`;
          } else {
            botResponse = "No phone number available for caregiver.";
          }
        } 
        else if (text.includes('emergency') || text.includes('help') || text.includes('pain')) {
          setShowEmergencyModal(true);
          botResponse = "I can help you trigger an emergency alert. Please confirm what type of emergency: fall, pain, confusion, or other?";
        } 
        else if (text.includes('fall')) {
          handleEmergency('fall');
          botResponse = "🚨 Fall detected! Emergency alert sent. Help is on the way. Please stay calm.";
        }
        else if (text.includes('pain')) {
          handleEmergency('pain');
          botResponse = "🚨 Pain reported! Emergency alert sent. Help is on the way.";
        }
        else if (text.includes('confusion')) {
          handleEmergency('confusion');
          botResponse = "🚨 Confusion reported! Emergency alert sent. Help is on the way.";
        }
        else if (text.includes('thank')) {
          botResponse = "You're welcome! Is there anything else I can help with?";
        } 
        else if (text.includes('hello') || text.includes('hi') || text.includes('hey')) {
          const hour = new Date().getHours();
          let greeting = "Hello";
          if (hour < 12) greeting = "Good morning";
          else if (hour < 18) greeting = "Good afternoon";
          else greeting = "Good evening";
          
          botResponse = `${greeting} ${profile?.name?.split(' ')[0] || 'there'}! How can I help you today?`;
        } 
        else if (text.includes('taken') || text.includes('took')) {
          if (nextDose) {
            await handleMarkTaken(nextDose.id, nextDose.time);
            botResponse = `Great! I've marked ${nextDose.name} as taken. Stay healthy!`;
          } else {
            const pending = medicines.filter(m => !m.taken);
            if (pending.length > 0) {
              botResponse = `You have ${pending.length} pending medicines. Which one did you take?`;
            } else {
              botResponse = "You have no pending medicines to mark as taken.";
            }
          }
        } 
        else {
          botResponse = "I can help you with medicines, appointments, caregivers, or emergencies. Try saying: 'What medicines do I have?', 'Next appointment', 'Call caregiver', or 'Emergency'.";
        }

        if (!isMuted) {
          speechService.speak(botResponse);
        }
        
        setChatHistory(prev => [...prev, { 
          user: text, 
          bot: botResponse,
          timestamp: new Date()
        }]);
      })
      .catch((error) => {
        setIsListening(false);
        // FIX: Only log actual errors, not interruptions
        if (error !== 'interrupted') {
          console.error('Voice command error:', error);
        }
        if (!isMuted && error !== 'interrupted') {
          speechService.speak("Sorry, I had trouble understanding. Please try again.");
        }
      });
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (!isMuted) {
      speechService.stopSpeaking();
    }
  };

  const getMedicineStatusClass = (medicine: Medicine, time: string) => {
    if (medicine.taken) return 'bg-green-100 border-green-300';
    
    const [hours, minutes] = time.split(':');
    const doseTime = new Date();
    doseTime.setHours(parseInt(hours), parseInt(minutes), 0);
    const now = new Date();
    
    if (now > doseTime) {
      const lateBy = now.getTime() - doseTime.getTime();
      if (lateBy > 30 * 60 * 1000) {
        return 'bg-red-100 border-red-300';
      }
      return 'bg-orange-100 border-orange-300';
    }
    
    const timeUntil = doseTime.getTime() - now.getTime();
    if (timeUntil <= 30 * 60 * 1000) {
      return 'bg-yellow-100 border-yellow-400 animate-pulse';
    }
    
    return 'bg-gray-50 border-gray-200';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-lg text-gray-700">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Emergency Banner */}
      {emergencyActive && (
        <div className="bg-red-600 text-white py-3 px-4 fixed top-0 left-0 right-0 z-50 animate-pulse">
          <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6" />
              <span className="font-bold">EMERGENCY ACTIVE - Help has been notified</span>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              className="bg-white text-red-600 hover:bg-red-50"
              onClick={handleResolveEmergency}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Resolve Emergency
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={`bg-white/80 backdrop-blur-md border-b sticky top-0 z-40 shadow-sm ${emergencyActive ? 'mt-12' : ''}`}>
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-14 w-14 border-2 border-blue-500">
                <AvatarImage src={profile?.avatar} />
                <AvatarFallback className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-lg">
                  {profile?.name?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">
                  Welcome, {profile?.name?.split(' ')[0]}!
                </h1>
                <p className="text-sm text-gray-600">
                  {new Date().toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              {/* Wellness Score Badge */}
              <div className="hidden md:flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-full">
                <Heart className="h-4 w-4" />
                <span className="font-semibold">Wellness: {wellnessScore}</span>
              </div>

              {/* Refresh Button */}
              <Button 
                variant="ghost" 
                size="icon"
                onClick={refreshData}
                disabled={refreshing}
                className="hover:bg-gray-100"
                title="Refresh data"
              >
                <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>

              {/* Connections Button */}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowConnections(!showConnections)}
                className="relative hover:bg-gray-100"
                title="Manage Connections"
              >
                <Users className="h-5 w-5" />
                {(invitations.received.length > 0 || notifications.length > 0) && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center animate-pulse">
                    {invitations.received.length + notifications.length}
                  </span>
                )}
              </Button>

              {/* Mute/Unmute Button */}
              <Button 
                variant="ghost" 
                size="icon"
                onClick={toggleMute}
                className="hover:bg-gray-100"
                title={isMuted ? "Unmute voice" : "Mute voice"}
              >
                {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume className="h-5 w-5" />}
              </Button>

              {/* Voice Assistant Button */}
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleVoiceCommand}
                disabled={isListening}
                className={isListening ? 'bg-green-100 relative' : 'hover:bg-gray-100'}
              >
                {isListening && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="animate-ping absolute h-5 w-5 rounded-full bg-green-400 opacity-75"></span>
                  </span>
                )}
                <Mic className={`h-5 w-5 ${isListening ? 'text-green-600' : ''}`} />
              </Button>

              {/* Emergency Button */}
              <Button 
                variant="destructive" 
                size="icon"
                onClick={() => setShowEmergencyModal(true)}
                className="bg-red-600 hover:bg-red-700 transition-all hover:scale-105"
              >
                <AlertCircle className="h-5 w-5" />
              </Button>

              {/* Logout Button */}
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleLogout}
                className="hover:bg-gray-100"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Next Dose Alert */}
        {nextDose && !nextDose.taken && (
          <Card className="border-4 border-yellow-500 bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-lg animate-pulse">
            <CardContent className="p-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/20 rounded-full">
                    <Clock className="h-8 w-8" />
                  </div>
                  <div>
                    <p className="text-sm opacity-90">Next Dose Due Now</p>
                    <h2 className="text-2xl font-bold">{nextDose.name}</h2>
                    <p className="text-lg opacity-90">{nextDose.dosage} at {nextDose.time}</p>
                    {nextDose.foodTiming && (
                      <p className="text-sm opacity-80 mt-1">
                        Take {nextDose.foodTiming === 'before' ? 'before' : 
                              nextDose.foodTiming === 'after' ? 'after' : 'with'} food
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="secondary"
                    className="bg-white text-yellow-600 hover:bg-yellow-50 transition-all hover:scale-105"
                    onClick={() => handleMarkTaken(nextDose.id, nextDose.time)}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Take Now
                  </Button>
                  <Button 
                    variant="outline"
                    className="bg-transparent border-white text-white hover:bg-white/20"
                    onClick={() => handleMarkSkipped(nextDose.id, nextDose.time)}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Skip
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card className="cursor-pointer hover:shadow-lg transition-all hover:scale-105" onClick={() => navigate('/medicines')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Today's Meds</p>
                  <p className="text-2xl font-bold">{medicines.length}</p>
                  <p className="text-xs text-gray-500">
                    {medicines.filter(m => m.taken).length} taken
                  </p>
                </div>
                <Pill className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Adherence</p>
                  <p className="text-2xl font-bold">{adherenceRate}%</p>
                  <p className="text-xs text-gray-500">30 day avg</p>
                </div>
                <Activity className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Wellness</p>
                  <p className="text-2xl font-bold">{wellnessScore}</p>
                  <p className="text-xs text-gray-500">Score</p>
                </div>
                <Heart className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-all hover:scale-105" onClick={() => navigate('/schedule')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Appointments</p>
                  <p className="text-2xl font-bold">{appointments.length}</p>
                  <p className="text-xs text-gray-500">Upcoming</p>
                </div>
                <Calendar className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Caregivers</p>
                  <p className="text-2xl font-bold">{caregivers.length}</p>
                  <p className="text-xs text-gray-500">
                    {caregivers.length === 0 ? 'None' : 'Connected'}
                  </p>
                </div>
                <Users className="h-8 w-8 text-indigo-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Missed</p>
                  <p className="text-2xl font-bold">{missedDoses.length}</p>
                  <p className="text-xs text-gray-500">Today</p>
                </div>
                <AlertCircle className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Independent Mode Banner */}
        {caregivers.length === 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-700">
            <div className="flex items-center gap-3">
              <Info className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-medium">✨ You're in independent mode</p>
                <p className="text-sm mt-1">
                  You can use all features on your own. Add caregivers from the connections panel for additional support.
                </p>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                className="ml-auto bg-white border-blue-300 text-blue-700 hover:bg-blue-50"
                onClick={() => setShowConnections(true)}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add Caregiver
              </Button>
            </div>
          </div>
        )}

        {/* Voice Assistant Card */}
        <Card className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="p-3 bg-white/20 rounded-full">
                <Mic className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold mb-2">Voice Assistant</h3>
                <p className="text-white/90 mb-4">
                  {isListening ? '🎤 Listening...' : 'Click the mic button and speak to ask for help'}
                </p>
                
                {lastCommand && (
                  <p className="text-sm text-white/80 mb-2">Last command: "{lastCommand}"</p>
                )}
                
                <div className="flex gap-2">
                  <Button 
                    onClick={handleVoiceCommand}
                    disabled={isListening}
                    className="bg-white text-indigo-600 hover:bg-indigo-50 transition-all hover:scale-105"
                  >
                    {isListening ? 'Listening...' : 'Ask Voice Assistant'}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Today's Medicine Schedule */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Pill className="h-5 w-5 text-blue-600" />
                Today's Medicine Schedule
              </CardTitle>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigate('/medicines/add')}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Medicine
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {medicines.length === 0 ? (
              <div className="text-center py-8">
                <Pill className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No medicines scheduled for today</p>
                <Button variant="link" onClick={() => navigate('/medicines/add')} className="mt-2">
                  Add your first medicine
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {medicines.map((med) => (
                  med.schedule?.map((time: string, idx: number) => {
                    const statusClass = getMedicineStatusClass(med, time);
                    const isMissed = missedDoses.includes(med.id);
                    return (
                      <div 
                        key={`${med.id}-${idx}`} 
                        className={`p-4 rounded-lg border-2 ${statusClass} transition-all hover:shadow-md cursor-pointer`}
                        onClick={() => setShowMedicineDetails(med.id)}
                      >
                        <div className="flex items-center justify-between flex-wrap gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-lg">{med.name}</h3>
                              {isMissed && (
                                <Badge className="bg-red-600">Missed</Badge>
                              )}
                            </div>
                            <p className="text-sm text-gray-600">{med.dosage}</p>
                            {med.foodTiming && (
                              <p className="text-xs text-gray-500 mt-1">
                                Take {med.foodTiming === 'before' ? 'before' : 
                                      med.foodTiming === 'after' ? 'after' : 'with'} food
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <Badge className="mb-2 text-base px-3 py-1">{time}</Badge>
                            {med.taken ? (
                              <div className="flex items-center gap-1 text-green-600">
                                <CheckCircle className="h-5 w-5" />
                                <span className="text-sm font-medium">Taken</span>
                              </div>
                            ) : (
                              <div className="flex gap-2 mt-2">
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  className="bg-white hover:bg-green-50 border-green-300 text-green-700"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMarkTaken(med.id, time);
                                  }}
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  Take
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  className="bg-white hover:bg-yellow-50 border-yellow-300 text-yellow-700"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMarkSkipped(med.id, time);
                                  }}
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Skip
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Caregivers Section */}
        {caregivers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-red-500" />
                Your Caregivers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {caregivers.map((cg) => (
                  <div key={cg.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-all">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={cg.avatar} />
                        <AvatarFallback className="bg-gradient-to-r from-green-600 to-emerald-600 text-white">
                          {cg.name?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-semibold">{cg.name}</p>
                        <p className="text-sm text-gray-600">{cg.email}</p>
                        <Badge className="mt-1 bg-green-600 text-xs">Caregiver</Badge>
                      </div>
                    </div>
                    {cg.phone && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => window.location.href = `tel:${cg.phone}`}
                        className="hover:bg-green-100 transition-all hover:scale-105"
                      >
                        <Phone className="h-4 w-4 mr-1" />
                        Call
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Appointments Section */}
        {appointments.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-purple-600" />
                  Upcoming Appointments
                </CardTitle>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => navigate('/schedule')}
                >
                  View All
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {appointments.slice(0, 3).map((apt) => (
                  <div key={apt.id} className="p-3 border rounded-lg hover:bg-gray-50 transition-all">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{apt.title || 'Appointment'}</p>
                        <p className="text-sm text-gray-600">Dr. {apt.doctor || 'Unknown'}</p>
                      </div>
                      <Badge className="bg-purple-100 text-purple-800">
                        {new Date(apt.date).toLocaleDateString()} at {apt.time}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-3">
          <Button 
            onClick={() => navigate('/medicines')}
            className="h-20 flex flex-col items-center justify-center bg-blue-600 hover:bg-blue-700 text-white transition-all hover:scale-105"
          >
            <Pill className="h-6 w-6 mb-1" />
            <span>Medicines</span>
          </Button>
          <Button 
            onClick={() => navigate('/schedule')}
            className="h-20 flex flex-col items-center justify-center bg-purple-600 hover:bg-purple-700 text-white transition-all hover:scale-105"
          >
            <Calendar className="h-6 w-6 mb-1" />
            <span>Schedule</span>
          </Button>
          <Button 
            onClick={() => setShowConnections(true)}
            className="h-20 flex flex-col items-center justify-center bg-green-600 hover:bg-green-700 text-white transition-all hover:scale-105"
          >
            <Users className="h-6 w-6 mb-1" />
            <span>Connections</span>
          </Button>
        </div>
      </main>

      {/* Connections Panel Modal */}
      {showConnections && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10 bg-white hover:bg-gray-100 rounded-full shadow-lg"
              onClick={() => setShowConnections(false)}
            >
              <X className="h-4 w-4" />
            </Button>
            <ConnectionsPanel userRole="elderly" />
          </div>
        </div>
      )}

      {/* Emergency Modal */}
      <Dialog open={showEmergencyModal} onOpenChange={setShowEmergencyModal}>
        <DialogContent className="max-w-md" aria-describedby="emergency-description">
          <DialogHeader>
            <DialogTitle className="text-2xl text-red-600 flex items-center gap-2">
              <AlertCircle className="h-6 w-6" />
              Emergency Assistance
            </DialogTitle>
          </DialogHeader>
          
          <div id="emergency-description" className="text-gray-600 mb-4">
            Please confirm the type of emergency. This will immediately notify your caregivers.
          </div>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <Button
                className="h-20 flex flex-col items-center justify-center bg-red-600 hover:bg-red-700 text-white"
                onClick={() => {
                  handleEmergency('fall');
                  setShowEmergencyModal(false);
                }}
              >
                <AlertCircle className="h-6 w-6 mb-1" />
                <span>Fall</span>
              </Button>
              
              <Button
                className="h-20 flex flex-col items-center justify-center bg-orange-600 hover:bg-orange-700 text-white"
                onClick={() => {
                  handleEmergency('pain');
                  setShowEmergencyModal(false);
                }}
              >
                <Heart className="h-6 w-6 mb-1" />
                <span>Pain</span>
              </Button>
              
              <Button
                className="h-20 flex flex-col items-center justify-center bg-yellow-600 hover:bg-yellow-700 text-white"
                onClick={() => {
                  handleEmergency('confusion');
                  setShowEmergencyModal(false);
                }}
              >
                <AlertCircle className="h-6 w-6 mb-1" />
                <span>Confusion</span>
              </Button>
              
              <Button
                className="h-20 flex flex-col items-center justify-center bg-gray-600 hover:bg-gray-700 text-white"
                onClick={() => {
                  handleEmergency('other');
                  setShowEmergencyModal(false);
                }}
              >
                <AlertCircle className="h-6 w-6 mb-1" />
                <span>Other</span>
              </Button>
            </div>
            
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowEmergencyModal(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={() => {
                  handleEmergency(emergencyType, emergencyDescription);
                  setShowEmergencyModal(false);
                }}
              >
                <AlertCircle className="h-4 w-4 mr-2" />
                Trigger Alert
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Medicine Details Modal */}
      <Dialog open={!!showMedicineDetails} onOpenChange={() => setShowMedicineDetails(null)}>
        <DialogContent className="max-w-md" aria-describedby="medicine-details-description">
          <DialogHeader>
            <DialogTitle>Medicine Details</DialogTitle>
          </DialogHeader>
          <div id="medicine-details-description" className="sr-only">
            Details for the selected medicine
          </div>
          {showMedicineDetails && (
            <div className="space-y-4">
              {medicines.filter(m => m.id === showMedicineDetails).map(med => (
                <div key={med.id} className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-100 rounded-full">
                      <Pill className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">{med.name}</h3>
                      <p className="text-gray-600">{med.dosage}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <p><span className="font-semibold">Schedule:</span> {med.schedule?.join(', ')}</p>
                    {med.foodTiming && (
                      <p><span className="font-semibold">Food Timing:</span> Take {med.foodTiming} food</p>
                    )}
                    {med.instructions && (
                      <p><span className="font-semibold">Instructions:</span> {med.instructions}</p>
                    )}
                    {med.prescribedBy && (
                      <p><span className="font-semibold">Prescribed by:</span> {med.prescribedBy}</p>
                    )}
                  </div>
                  
                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setShowMedicineDetails(null)}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ElderlyApp;