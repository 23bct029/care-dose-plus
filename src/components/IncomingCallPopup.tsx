// src/components/IncomingCallPopup.tsx
// Real-time incoming call popup using Firestore as signaling layer
import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Video, PhoneOff, Phone } from 'lucide-react';

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
  appointmentId?: string;
}

const IncomingCallPopup = ({ currentUserId, currentUserName, onAccept }: IncomingCallPopupProps) => {
  const [incomingCall, setIncomingCall] = useState<CallData | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringIntervalRef = useRef<any>(null);

  useEffect(() => {
    // Listen for calls where this user is the patient and status is 'ringing'
    const q = query(
      collection(db, 'video_calls'),
      where('patientId', '==', currentUserId),
      where('status', '==', 'ringing')
    );
    const unsub = onSnapshot(q, snap => {
      if (!snap.empty) {
        const callDoc = snap.docs[0];
        const data = callDoc.data();
        setIncomingCall({ id: callDoc.id, ...data } as CallData);
        startRinging();
      } else {
        setIncomingCall(null);
        stopRinging();
      }
    });
    return () => { unsub(); stopRinging(); };
  }, [currentUserId]);

  const startRinging = () => {
    stopRinging();
    const ring = () => {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtxRef.current = ctx;
        const playTone = (freq: number, start: number, duration: number) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.frequency.value = freq; osc.type = 'sine';
          gain.gain.setValueAtTime(0.25, ctx.currentTime + start);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
          osc.start(ctx.currentTime + start);
          osc.stop(ctx.currentTime + start + duration);
        };
        playTone(880, 0, 0.2);
        playTone(1100, 0.25, 0.2);
        playTone(880, 0.5, 0.2);
      } catch {}
    };
    ring();
    ringIntervalRef.current = setInterval(ring, 2500);
  };

  const stopRinging = () => {
    if (ringIntervalRef.current) { clearInterval(ringIntervalRef.current); ringIntervalRef.current = null; }
    try { audioCtxRef.current?.close(); } catch {}
  };

  const handleAccept = async () => {
    if (!incomingCall) return;
    stopRinging();
    await updateDoc(doc(db, 'video_calls', incomingCall.id), {
      status: 'accepted', acceptedAt: serverTimestamp()
    });
    onAccept(incomingCall);
    setIncomingCall(null);
  };

  const handleDecline = async () => {
    if (!incomingCall) return;
    stopRinging();
    await updateDoc(doc(db, 'video_calls', incomingCall.id), {
      status: 'declined', declinedAt: serverTimestamp()
    });
    setIncomingCall(null);
  };

  if (!incomingCall) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="bg-gray-900 rounded-3xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden border border-gray-700">
        {/* Animated ring */}
        <div className="relative flex items-center justify-center py-8 bg-gradient-to-b from-gray-800 to-gray-900">
          <div className="absolute h-36 w-36 rounded-full border-4 border-green-500/30 animate-ping"></div>
          <div className="absolute h-28 w-28 rounded-full border-4 border-green-500/50 animate-pulse"></div>
          <div className="h-20 w-20 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center shadow-xl z-10">
            <Video className="h-10 w-10 text-white" />
          </div>
        </div>

        {/* Call info */}
        <div className="px-6 py-5 text-center">
          <p className="text-gray-400 text-xs font-medium uppercase tracking-widest mb-2">Incoming Video Call</p>
          <h2 className="text-2xl font-bold text-white mb-1">Dr. {incomingCall.doctorName}</h2>
          <p className="text-gray-400 text-sm">is calling you for a video consultation</p>
        </div>

        {/* Actions */}
        <div className="flex gap-4 px-6 pb-8 justify-center">
          <button
            onClick={handleDecline}
            className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-700 flex flex-col items-center justify-center transition-all hover:scale-105 shadow-lg"
          >
            <PhoneOff className="h-6 w-6 text-white mb-0.5" />
            <span className="text-white text-[10px] font-medium">Decline</span>
          </button>
          <button
            onClick={handleAccept}
            className="h-16 w-16 rounded-full bg-green-600 hover:bg-green-700 flex flex-col items-center justify-center transition-all hover:scale-105 shadow-lg animate-bounce"
          >
            <Video className="h-6 w-6 text-white mb-0.5" />
            <span className="text-white text-[10px] font-medium">Accept</span>
          </button>
        </div>

        <p className="text-center text-xs text-gray-600 pb-4">
          Powered by Jitsi Meet · End-to-end encrypted
        </p>
      </div>
    </div>
  );
};

export default IncomingCallPopup;
