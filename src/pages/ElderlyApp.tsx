import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getUserProfile, logOut } from '@/lib/firebase-auth';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, onSnapshot, orderBy, limit, doc, updateDoc } from 'firebase/firestore';
import { speechService } from '@/lib/speech';
import { requestNotificationPermission, sendBrowserNotification } from '@/lib/notifications';
import { logger } from '@/lib/logger';
import NotificationPanel from '@/components/NotificationPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  Pill, Bell, Clock, Calendar, Heart, 
  User, Phone, AlertCircle, CheckCircle,
  Volume2, Mic, LogOut, MessageSquare, Activity,
  XCircle, ChevronRight, Clock as TimerIcon
} from 'lucide-react';

const ElderlyApp = () => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [todayMeds, setTodayMeds] = useState<any[]>([]);
  const [nextDose, setNextDose] = useState<any>(null);
  const [caregivers, setCaregivers] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [adherence, setAdherence] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [voiceResponse, setVoiceResponse] = useState('');
  const [missedDoses, setMissedDoses] = useState<string[]>([]);
  const navigate = useNavigate();

  // Logger function
  const logUserAction = async (action: string, details?: any) => {
    if (user) {
      await logger.logWithUser(user.uid, user.email, 'info', action, details);
    }
  };

  useEffect(() => {
    loadData();
    requestNotificationPermission();
    
    // Set up real-time medicine tracking
    if (user) {
      setupRealtimeTracking();
    }
    
    // Set up interval to check for reminders every minute
    const interval = setInterval(checkForDueReminders, 60000);
    return () => clearInterval(interval);
  }, [user]);

  // Log page view when user is loaded
  useEffect(() => {
    if (user) {
      logUserAction('Page viewed', { page: 'ElderlyDashboard' });
    }
  }, [user]);

  const setupRealtimeTracking = () => {
    // Real-time listener for tracking updates
    const today = new Date().toISOString().split('T')[0];
    const trackingRef = collection(db, 'tracking');
    const q = query(
      trackingRef,
      where('userId', '==', user.uid),
      where('date', '==', today)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Update UI in real-time when new tracking data comes in
      console.log('Tracking updated');
      loadData(); // Reload data to reflect changes
    });

    return unsubscribe;
  };

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
      
      await logger.logWithUser(currentUser.uid, currentUser.email, 'info', 'Data loading started', { page: 'ElderlyDashboard' });

      // Load medicines from Firestore
      const medicinesRef = collection(db, 'medicines');
      const medicinesQuery = query(medicinesRef, where('userId', '==', currentUser.uid));
      const medicinesSnap = await getDocs(medicinesQuery);
      
      const medicines: any[] = [];
      medicinesSnap.forEach((doc) => {
        medicines.push({ id: doc.id, ...doc.data() });
      });

      // Get today's tracking data
      const today = new Date().toISOString().split('T')[0];
      const trackingRef = collection(db, 'tracking');
      const trackingQuery = query(
        trackingRef,
        where('userId', '==', currentUser.uid),
        where('date', '==', today)
      );
      const trackingSnap = await getDocs(trackingQuery);
      
      const takenMeds = new Set();
      trackingSnap.forEach((doc) => {
        takenMeds.add(doc.data().medicineId);
      });

      // Process today's medicines
      const todayMedsList = medicines.filter(med => {
        const startDate = new Date(med.startDate || med.createdAt);
        const endDate = med.endDate ? new Date(med.endDate) : null;
        const todayDate = new Date(today);
        return startDate <= todayDate && (!endDate || endDate >= todayDate);
      }).map(med => ({
        ...med,
        taken: takenMeds.has(med.id)
      }));

      setTodayMeds(todayMedsList);

      // Find next dose (only pending ones)
      const now = new Date();
      const nextDose = todayMedsList
        .filter(med => !med.taken)
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

      setNextDose(nextDose);

      // Calculate adherence (last 7 days)
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      const weekTrackingRef = collection(db, 'tracking');
      const weekQuery = query(
        weekTrackingRef, 
        where('userId', '==', currentUser.uid),
        where('timestamp', '>=', weekAgo.toISOString())
      );
      
      const weekSnap = await getDocs(weekQuery);
      
      let taken = 0;
      let total = 0;
      weekSnap.forEach((doc) => {
        total++;
        if (doc.data().status === 'taken') taken++;
      });
      
      setAdherence(total > 0 ? Math.round((taken / total) * 100) : 0);

      // Load caregivers (optional - may be empty)
      const caregiversRef = collection(db, 'caregiver_relationships');
      const caregiversQuery = query(caregiversRef, where('elderlyId', '==', currentUser.uid), where('status', '==', 'active'));
      const caregiversSnap = await getDocs(caregiversQuery);
      
      const caregiversList: any[] = [];
      caregiversSnap.forEach((doc) => {
        caregiversList.push({ id: doc.id, ...doc.data() });
      });
      setCaregivers(caregiversList);

      // Load appointments
      const appointmentsRef = collection(db, 'appointments');
      const appointmentsQuery = query(
        appointmentsRef, 
        where('userId', '==', currentUser.uid),
        where('date', '>=', today),
        orderBy('date', 'asc'),
        orderBy('time', 'asc')
      );
      const appointmentsSnap = await getDocs(appointmentsQuery);
      
      const appointmentsList: any[] = [];
      appointmentsSnap.forEach((doc) => {
        appointmentsList.push({ id: doc.id, ...doc.data() });
      });
      setAppointments(appointmentsList);

      await logger.logWithUser(currentUser.uid, currentUser.email, 'info', 'Data loaded successfully', { 
        medicinesCount: medicines.length,
        caregiversCount: caregiversList.length,
        appointmentsCount: appointmentsList.length 
      });

    } catch (error: any) {
      console.error('Error loading data:', error);
      if (user) {
        await logger.error('Failed to load elderly data', { 
          userId: user.uid,
          error: error.message 
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const checkForDueReminders = () => {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    todayMeds.forEach(med => {
      if (med.taken) return; // Skip if already taken

      med.schedule?.forEach((time: string) => {
        const [hours, minutes] = time.split(':');
        const doseTime = new Date();
        doseTime.setHours(parseInt(hours), parseInt(minutes), 0);
        
        // Check if within 5 minutes of scheduled time
        const timeDiff = Math.abs(now.getTime() - doseTime.getTime());
        const minutesDiff = Math.floor(timeDiff / (1000 * 60));
        
        if (minutesDiff <= 5 && minutesDiff >= 0 && time === currentTime) {
          // Due now or within 5 minutes
          triggerReminder(med, time);
        } else if (now > doseTime && !med.taken) {
          // Overdue - check if should be marked missed
          const twoHoursLater = new Date(doseTime.getTime() + 2 * 60 * 60 * 1000);
          if (now > twoHoursLater) {
            markAsMissed(med.id, time);
          }
        }
      });
    });
  };

  const triggerReminder = (medicine: any, time: string) => {
    // Show notification
    sendBrowserNotification(
      '💊 Medicine Reminder',
      `Time to take ${medicine.name} - ${medicine.dosage}`,
      {
        tag: `reminder-${medicine.id}`,
        requireInteraction: true,
        onClick: () => window.focus()
      }
    );

    // Voice reminder with food timing if available
    let reminder = `Hello! It's time to take your medicine: ${medicine.name}, ${medicine.dosage}.`;
    if (medicine.foodTiming) {
      reminder += ` Please take it ${medicine.foodTiming} food.`;
    } else {
      reminder += ` Please take it now.`;
    }
    speechService.speak(reminder);

    // Log reminder triggered
    logUserAction('Medicine reminder triggered', { medicine: medicine.name, time });
  };

  const markAsTaken = async (medicineId: string, time?: string) => {
    try {
      const trackingRef = collection(db, 'tracking');
      await addDoc(trackingRef, {
        userId: user.uid,
        medicineId,
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().split(' ')[0],
        scheduledTime: time || 'unknown',
        status: 'taken',
        timestamp: new Date().toISOString()
      });

      speechService.speak('Thank you! Stay healthy.');
      
      // Log medicine taken
      await logUserAction('Medicine marked as taken', { medicineId, time });
      
      // Update local state immediately for better UX
      setTodayMeds(prev => 
        prev.map(med => 
          med.id === medicineId ? { ...med, taken: true } : med
        )
      );
      
      // Remove from next dose if it was the next dose
      if (nextDose?.id === medicineId) {
        setNextDose(null);
      }

      loadData(); // Reload to get fresh data
    } catch (error: any) {
      console.error('Error marking as taken:', error);
      await logger.error('Failed to mark medicine as taken', { 
        userId: user.uid,
        medicineId,
        error: error.message 
      });
    }
  };

  const markAsMissed = async (medicineId: string, time: string) => {
    try {
      // Check if already marked
      const today = new Date().toISOString().split('T')[0];
      const trackingRef = collection(db, 'tracking');
      const q = query(
        trackingRef,
        where('userId', '==', user.uid),
        where('medicineId', '==', medicineId),
        where('date', '==', today)
      );
      const snap = await getDocs(q);
      
      if (snap.empty) {
        await addDoc(trackingRef, {
          userId: user.uid,
          medicineId,
          date: today,
          scheduledTime: time,
          status: 'missed',
          timestamp: new Date().toISOString()
        });

        // Notify if caregivers exist
        if (caregivers.length > 0) {
          caregivers.forEach(cg => {
            sendBrowserNotification(
              '⚠️ Missed Dose',
              `${profile?.name} missed their ${time} dose`,
              { tag: 'missed-dose' }
            );
          });
        }

        // Update local state
        setMissedDoses(prev => [...prev, medicineId]);
      }
    } catch (error) {
      console.error('Error marking as missed:', error);
    }
  };

  const triggerEmergency = (reason: string) => {
    // Log emergency
    logUserAction('Emergency triggered', { reason });
    
    // Show emergency notification to self
    sendBrowserNotification(
      '🚨 EMERGENCY ACTIVATED',
      'Help is being notified. Please stay calm.',
      { tag: 'emergency', requireInteraction: true }
    );

    speechService.speak('Emergency alert triggered. Help is on the way. Please stay calm.');

    // Notify caregivers if they exist (optional)
    if (caregivers.length > 0) {
      caregivers.forEach(cg => {
        sendBrowserNotification(
          '🚨 EMERGENCY ALERT',
          `${profile?.name} needs assistance: ${reason}`,
          { tag: 'emergency', requireInteraction: true }
        );
      });
    }

    // Save to emergencies collection
    saveEmergency(reason);
  };

  const saveEmergency = async (reason: string) => {
    try {
      const emergenciesRef = collection(db, 'emergencies');
      await addDoc(emergenciesRef, {
        userId: user.uid,
        userName: profile?.name,
        reason,
        status: 'active',
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error saving emergency:', error);
    }
  };

  const handleVoiceChat = () => {
  setIsListening(true);
  logUserAction('Voice assistant activated');
  setVoiceResponse('');
  
  speechService.askQuestion('How can I help you?')
    .then(async (result) => {
      setIsListening(false);
      
      // Handle both string and object responses
      let responseText = '';
      if (typeof result === 'string') {
        responseText = result;
      } else if (result && typeof result === 'object') {
        responseText = result.text || '';
      }
      
      setVoiceResponse(responseText);
      
      const lowerResponse = responseText.toLowerCase();
      let botResponse = '';
      
      // Basic command handling
      if (lowerResponse.includes('medicine') || lowerResponse.includes('medication') || lowerResponse.includes('pill')) {
        if (nextDose) {
          botResponse = `Your next medicine is ${nextDose.name} at ${nextDose.time}`;
          if (nextDose.foodTiming) {
            botResponse += `. Take ${nextDose.foodTiming} food.`;
          }
        } else if (todayMeds.length > 0) {
          const pendingCount = todayMeds.filter(m => !m.taken).length;
          const takenCount = todayMeds.length - pendingCount;
          botResponse = `You have ${todayMeds.length} medicines today. ${takenCount} taken, ${pendingCount} pending.`;
        } else {
          botResponse = 'You have no medicines scheduled for today.';
        }
      }
      else if (lowerResponse.includes('appointment')) {
        if (appointments.length > 0) {
          const apt = appointments[0];
          const aptDate = new Date(apt.date).toLocaleDateString('en-US', { 
            weekday: 'long', 
            month: 'long', 
            day: 'numeric' 
          });
          botResponse = `Your next appointment is on ${aptDate} at ${apt.time}`;
          if (apt.doctor) {
            botResponse += ` with ${apt.doctor}`;
          }
        } else {
          botResponse = 'You have no upcoming appointments.';
        }
      }
      else if (lowerResponse.includes('caregiver') || lowerResponse.includes('helper') || lowerResponse.includes('nurse')) {
        if (caregivers.length > 0) {
          const names = caregivers.map(c => c.name || 'Caregiver').join(', ');
          botResponse = `You have ${caregivers.length} caregiver(s): ${names}. `;
          if (caregivers[0].phone) {
            botResponse += 'Say "call caregiver" to call them.';
          }
        } else {
          botResponse = 'You have no assigned caregivers. You can still use all features independently.';
        }
      }
      else if (lowerResponse.includes('call') && lowerResponse.includes('caregiver')) {
        if (caregivers.length > 0 && caregivers[0].phone) {
          window.location.href = `tel:${caregivers[0].phone}`;
          botResponse = `Calling ${caregivers[0].name || 'caregiver'}...`;
        } else {
          botResponse = 'No phone number available for caregiver.';
        }
      }
      else if (lowerResponse.includes('emergency') || lowerResponse.includes('help') || lowerResponse.includes('pain')) {
        triggerEmergency('Voice emergency request');
        botResponse = '🚨 Emergency alert sent! Help is on the way. Please stay calm.';
      }
      else if (lowerResponse.includes('thank')) {
        botResponse = "You're welcome! Is there anything else I can help with?";
      }
      else if (lowerResponse.includes('hello') || lowerResponse.includes('hi') || lowerResponse.includes('hey')) {
        botResponse = `Hello ${profile?.name?.split(' ')[0] || 'there'}! How can I help you today?`;
      }
      else if (lowerResponse.includes('taken') || lowerResponse.includes('took')) {
        if (nextDose) {
          await markAsTaken(nextDose.id, nextDose.time);
          botResponse = `Great! I've marked ${nextDose.name} as taken. Stay healthy!`;
        } else {
          const pendingMeds = todayMeds.filter(m => !m.taken);
          if (pendingMeds.length > 0) {
            botResponse = `You have ${pendingMeds.length} pending medicines. Which one did you take?`;
          } else {
            botResponse = 'You have no pending medicines to mark as taken.';
          }
        }
      }
      else if (lowerResponse.includes('schedule') || lowerResponse.includes('today')) {
        if (todayMeds.length > 0) {
          const pendingMeds = todayMeds.filter(m => !m.taken);
          const takenMeds = todayMeds.filter(m => m.taken);
          botResponse = `Today you have ${todayMeds.length} medicines. `;
          if (takenMeds.length > 0) {
            botResponse += `Taken: ${takenMeds.length}. `;
          }
          if (pendingMeds.length > 0) {
            botResponse += `Pending: ${pendingMeds.length}. `;
            if (nextDose) {
              botResponse += `Next: ${nextDose.name} at ${nextDose.time}.`;
            }
          }
        } else {
          botResponse = 'You have no medicines scheduled for today.';
        }
      }
      else {
        botResponse = "I can help you with medicines, appointments, or emergencies. Try saying: 'What medicines do I have?', 'Next appointment', or 'Emergency'.";
      }
      
      // Speak the response
      speechService.speak(botResponse);
      
      // Add to chat history
      setChatHistory(prev => [...prev, { 
        user: responseText, 
        bot: botResponse 
      }]);
    })
    .catch((error) => {
      setIsListening(false);
      console.error('Voice chat error:', error);
      speechService.speak('Sorry, I had trouble understanding. Please try again.');
    });
};
  const handleEmergency = () => {
    triggerEmergency('User pressed emergency button');
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

  const handleMedicines = () => {
    navigate('/medicines');
  };

  const handleSchedule = () => {
    navigate('/schedule');
  };

  const handleCallCaregiver = (phone: string) => {
    if (phone) {
      window.location.href = `tel:${phone}`;
    } else {
      alert('No phone number available');
    }
  };

  const getStatusColor = (med: any, time: string) => {
    if (med.taken) return 'bg-green-100 border-green-300';
    
    const now = new Date();
    const [hours, minutes] = time.split(':');
    const doseTime = new Date();
    doseTime.setHours(parseInt(hours), parseInt(minutes), 0);
    
    if (now > doseTime) {
      const twoHoursLater = new Date(doseTime.getTime() + 2 * 60 * 60 * 1000);
      if (now > twoHoursLater) {
        return 'bg-red-100 border-red-300'; // Missed
      }
      return 'bg-orange-100 border-orange-300'; // Overdue but not missed
    }
    
    // Upcoming
    const timeDiff = doseTime.getTime() - now.getTime();
    const minutesDiff = Math.floor(timeDiff / (1000 * 60));
    
    if (minutesDiff <= 30) {
      return 'bg-yellow-100 border-yellow-400 animate-pulse'; // Due soon
    }
    
    return 'bg-gray-50 border-gray-200'; // Future
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-lg text-gray-700">Loading your dashboard...</p>
          <p className="text-sm text-gray-500 mt-2">Please wait</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12 border-2 border-blue-500">
                <AvatarImage src={profile?.avatar} />
                <AvatarFallback className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
                  {profile?.name?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Welcome, {profile?.name?.split(' ')[0]}!</h1>
                <p className="text-sm text-gray-600">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <NotificationPanel userId={user?.uid} userRole="elderly" />
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleVoiceChat}
                className={`relative ${isListening ? 'bg-green-100' : 'hover:bg-gray-100'}`}
                disabled={isListening}
              >
                {isListening ? (
                  <div className="absolute inset-0 animate-ping bg-green-400 rounded-full"></div>
                ) : null}
                <Mic className={`h-5 w-5 ${isListening ? 'text-green-600' : ''}`} />
              </Button>
              <Button 
                variant="destructive" 
                size="icon" 
                onClick={handleEmergency}
                className="bg-red-600 hover:bg-red-700 transition-all hover:scale-105"
              >
                <AlertCircle className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="hover:bg-gray-100">
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Voice Response Toast */}
        {voiceResponse && (
          <div className="bg-green-100 border border-green-300 text-green-800 px-4 py-2 rounded-lg mb-4 animate-fade-in">
            <p className="text-sm font-medium">You said: "{voiceResponse}"</p>
          </div>
        )}

        {/* Next Dose Alert */}
        {nextDose && !nextDose.taken && (
          <Card className="border-4 border-yellow-500 bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-lg animate-pulse">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/20 rounded-full">
                    <TimerIcon className="h-8 w-8" />
                  </div>
                  <div>
                    <p className="text-sm opacity-90">Next Dose Due Now</p>
                    <h2 className="text-2xl font-bold">{nextDose.name}</h2>
                    <p className="text-lg opacity-90">{nextDose.dosage} at {nextDose.time}</p>
                    {nextDose.foodTiming && (
                      <p className="text-sm opacity-80 mt-1">Take {nextDose.foodTiming} food</p>
                    )}
                  </div>
                </div>
                <Button 
                  variant="secondary" 
                  className="bg-white text-yellow-600 hover:bg-yellow-50 transition-all hover:scale-105"
                  onClick={() => markAsTaken(nextDose.id, nextDose.time)}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Mark Taken
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card 
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105" 
            onClick={handleMedicines}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Today's Meds</p>
                  <p className="text-2xl font-bold">{todayMeds.length}</p>
                  <p className="text-xs text-gray-500">
                    {todayMeds.filter(m => m.taken).length} taken
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
                  <p className="text-2xl font-bold">{adherence}%</p>
                  <p className="text-xs text-gray-500">Last 7 days</p>
                </div>
                <Activity className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105" 
            onClick={handleSchedule}
          >
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
                    {caregivers.length === 0 ? 'Independent mode' : 'Connected'}
                  </p>
                </div>
                <Heart className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Independent Mode Banner (shown when no caregivers) */}
        {caregivers.length === 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-700 text-sm">
            <p className="font-medium">✨ You're in independent mode</p>
            <p className="text-xs mt-1">You can use all features on your own. Add caregivers later for additional support.</p>
          </div>
        )}

        {/* Voice Assistant Status */}
        <Card className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-white/20 rounded-full">
                <Mic className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold mb-2">Voice Assistant</h3>
                <p className="text-white/90 mb-4">
                  {isListening ? '🎤 Listening...' : 'Click the mic button and speak to ask for help'}
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto mb-4">
                  {chatHistory.map((chat, idx) => (
                    <div key={idx} className="bg-white/10 rounded-lg p-2">
                      <p className="text-sm"><span className="font-semibold">You:</span> {chat.user}</p>
                      <p className="text-sm"><span className="font-semibold">Assistant:</span> {chat.bot}</p>
                    </div>
                  ))}
                </div>
                <Button 
                  onClick={handleVoiceChat}
                  disabled={isListening}
                  className="bg-white text-indigo-600 hover:bg-indigo-50 transition-all hover:scale-105"
                >
                  {isListening ? 'Listening...' : 'Ask Voice Assistant'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Today's Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              Today's Medicine Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todayMeds.length === 0 ? (
              <div className="text-center py-8">
                <Pill className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No medicines scheduled for today</p>
                <Button variant="link" onClick={handleMedicines} className="mt-2">
                  Add medicines
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {todayMeds.map((med) => (
                  med.schedule?.map((time: string, index: number) => {
                    const statusColor = getStatusColor(med, time);
                    const isTaken = med.taken;
                    
                    return (
                      <div key={index} className={`p-4 rounded-lg border-2 ${statusColor} transition-all hover:shadow-md`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold">{med.name}</h3>
                            <p className="text-sm text-gray-600">{med.dosage}</p>
                            {med.foodTiming && (
                              <p className="text-xs text-gray-500 mt-1">Take {med.foodTiming} food</p>
                            )}
                            {med.instructions && (
                              <p className="text-xs text-gray-500 mt-1 italic">"{med.instructions}"</p>
                            )}
                          </div>
                          <div className="text-right">
                            <Badge variant={isTaken ? 'secondary' : 'default'} className="mb-2">
                              {time}
                            </Badge>
                            {isTaken ? (
                              <div className="flex items-center gap-1 text-green-600">
                                <CheckCircle className="h-4 w-4" />
                                <span className="text-xs">Taken</span>
                              </div>
                            ) : (
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="mt-2 bg-white hover:bg-blue-50 transition-all hover:scale-105"
                                onClick={() => markAsTaken(med.id, time)}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Mark Taken
                              </Button>
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

        {/* Caregivers Section (Optional) */}
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
                {caregivers.map((cg, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-all">
                    <div>
                      <p className="font-semibold">{cg.name || 'Caregiver'}</p>
                      <p className="text-sm text-gray-600">{cg.phone || 'No phone'}</p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleCallCaregiver(cg.phone)}
                      disabled={!cg.phone}
                      className="hover:bg-green-100 transition-all hover:scale-105"
                    >
                      <Phone className="h-4 w-4 mr-1" />
                      Call
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Upcoming Appointments */}
        {appointments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                Upcoming Appointments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {appointments.map((apt) => (
                  <div key={apt.id} className="p-3 border rounded-lg hover:bg-gray-50 transition-all">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{apt.title || 'Appointment'}</p>
                        <p className="text-sm text-gray-600">Dr. {apt.doctor || 'Unknown'}</p>
                      </div>
                      <Badge className="bg-blue-100 text-blue-800">
                        {new Date(apt.date).toLocaleDateString()} at {apt.time}
                      </Badge>
                    </div>
                    {apt.location && (
                      <p className="text-xs text-gray-500 mt-1">{apt.location}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Button 
            onClick={handleMedicines}
            className="h-20 flex flex-col items-center justify-center bg-blue-600 hover:bg-blue-700 text-white transition-all hover:scale-105"
          >
            <Pill className="h-6 w-6 mb-1" />
            <span>Medicines</span>
          </Button>
          <Button 
            onClick={handleSchedule}
            className="h-20 flex flex-col items-center justify-center bg-purple-600 hover:bg-purple-700 text-white transition-all hover:scale-105"
          >
            <Calendar className="h-6 w-6 mb-1" />
            <span>Schedule</span>
          </Button>
        </div>

        {/* Independent Usage Note */}
        <div className="text-center text-xs text-gray-500 mt-4">
          <p>You can use all features independently. Add caregivers or doctors for additional support.</p>
        </div>
      </main>
    </div>
  );
};

export default ElderlyApp;