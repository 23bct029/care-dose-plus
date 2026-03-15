// Real-time incoming call popup via Firestore signaling
import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Video, PhoneOff } from 'lucide-react';

interface IncomingCallPopupProps {
  currentUserId: string;
  currentUserName: string;
  onAccept: (call: CallData) => void;
}

export interface CallData {
  id: string;
  doctorId: string;
  patientId: string;
  doctorName: string;
  patientName: string;
  roomName: string;
  callerName?: string;
  appointmentId?: string;
}

const IncomingCallPopup = ({ currentUserId, currentUserName, onAccept }: IncomingCallPopupProps) => {
  const [call, setCall] = useState<CallData | null>(null);
  const ringRef = useRef<any>(null);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!currentUserId) return;
    
    // Listen for ANY call where this user is the receiver (patientId)
    // Both doctors and caregivers can call the elderly user
    const q = query(
      collection(db, 'video_calls'),
      where('patientId', '==', currentUserId),
      where('status', '==', 'ringing')
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const d = snap.docs[0];
        setCall({ id: d.id, ...d.data() } as CallData);
        startRing();
      } else {
        setCall(null);
        stopRing();
      }
    }, (error) => {
      console.error('IncomingCallPopup listener error:', error);
    });

    return () => { unsub(); stopRing(); };
  }, [currentUserId]);

  const startRing = () => {
    stopRing();
    const ring = () => {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioRef.current = ctx;
        const play = (f: number, t: number, d: number) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value = f; o.type = 'sine';
          g.gain.setValueAtTime(0.2, ctx.currentTime + t);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + d);
          o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + d);
        };
        play(880, 0, 0.15); play(1100, 0.2, 0.15); play(880, 0.4, 0.15);
      } catch {}
    };
    ring();
    ringRef.current = setInterval(ring, 2800);
  };

  const stopRing = () => {
    if (ringRef.current) { clearInterval(ringRef.current); ringRef.current = null; }
    try { audioRef.current?.close(); } catch {}
  };

  const handleAccept = async () => {
    if (!call) return;
    stopRing();
    try {
      await updateDoc(doc(db, 'video_calls', call.id), {
        status: 'accepted', acceptedAt: serverTimestamp()
      });
    } catch {}
    onAccept(call);
    setCall(null);
  };

  const handleDecline = async () => {
    if (!call) return;
    stopRing();
    try {
      await updateDoc(doc(db, 'video_calls', call.id), {
        status: 'declined', declinedAt: serverTimestamp()
      });
    } catch {}
    setCall(null);
  };

  if (!call) return null;

  const callerName = call.callerName || call.doctorName;

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="bg-gray-900 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-white/10">
        {/* Animated ring */}
        <div className="relative flex items-center justify-center py-10 bg-gradient-to-b from-gray-800 to-gray-900">
          <div className="absolute h-36 w-36 rounded-full border-4 border-green-500/20 animate-ping"/>
          <div className="absolute h-28 w-28 rounded-full border-4 border-green-500/40 animate-pulse"/>
          <div className="h-20 w-20 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center shadow-xl z-10">
            <Video className="h-10 w-10 text-white"/>
          </div>
        </div>

        <div className="px-6 py-5 text-center">
          <p className="text-gray-400 text-xs font-medium uppercase tracking-widest mb-2">Incoming Video Call</p>
          <h2 className="text-2xl font-bold text-white mb-1">{callerName || 'Unknown Caller'}</h2>
          <p className="text-gray-400 text-sm">is calling you for a consultation</p>
        </div>

        <div className="flex gap-6 px-8 pb-8 justify-center">
          <button onClick={handleDecline}
            className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-700 flex flex-col items-center justify-center gap-1 transition-all hover:scale-105 shadow-lg shadow-red-900/50">
            <PhoneOff className="h-6 w-6 text-white"/>
            <span className="text-white text-[10px] font-medium">Decline</span>
          </button>
          <button onClick={handleAccept}
            className="h-16 w-16 rounded-full bg-green-600 hover:bg-green-700 flex flex-col items-center justify-center gap-1 transition-all hover:scale-105 shadow-lg shadow-green-900/50 animate-bounce">
            <Video className="h-6 w-6 text-white"/>
            <span className="text-white text-[10px] font-medium">Accept</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallPopup;
