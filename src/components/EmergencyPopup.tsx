// src/components/EmergencyPopup.tsx — Real-time emergency alert popup
import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { AlertCircle, Phone, CheckCircle, X } from 'lucide-react';

interface EmergencyPopupProps {
  userId: string;          // current logged-in user id
  patientIds?: string[];   // optional: only show emergencies from these patients
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

const EmergencyPopup = ({ userId, patientIds }: EmergencyPopupProps) => {
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'emergencies'), where('status', '==', 'active'));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Emergency[];
      // filter to relevant patients if specified
      const filtered = patientIds
        ? data.filter(e => patientIds.includes(e.userId))
        : data;
      setEmergencies(filtered);
      if (filtered.length > 0) {
        // Play alert sound using Web Audio API (no file needed)
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const playBeep = (freq: number, start: number) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            osc.type = 'square';
            gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + 0.3);
            osc.start(ctx.currentTime + start);
            osc.stop(ctx.currentTime + start + 0.3);
          };
          [0, 0.4, 0.8].forEach((t, i) => playBeep(880 + i * 110, t));
        } catch {}
      }
    });
    return () => unsub();
  }, [userId, patientIds]);

  const handleAcknowledge = async (id: string) => {
    await updateDoc(doc(db, 'emergencies', id), {
      caregiverAcknowledged: true, acknowledgedAt: serverTimestamp(), acknowledgedBy: userId
    });
    setDismissed(prev => new Set([...prev, id]));
  };

  const handleResolve = async (id: string) => {
    await updateDoc(doc(db, 'emergencies', id), { status: 'resolved', resolvedAt: serverTimestamp(), resolvedBy: userId });
    setDismissed(prev => new Set([...prev, id]));
  };

  const visible = emergencies.filter(e => !dismissed.has(e.id));
  if (visible.length === 0) return null;

  // Show top-most emergency as popup
  const em = visible[0];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border-4 border-red-500 emergency-pulse overflow-hidden">
        {/* Red header */}
        <div className="bg-red-600 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-7 w-7 text-white animate-pulse" />
            <div>
              <p className="text-white font-bold text-lg leading-tight">🚨 EMERGENCY ALERT</p>
              <p className="text-red-100 text-xs">Action required immediately</p>
            </div>
          </div>
          {visible.length > 1 && (
            <span className="bg-white text-red-600 text-xs font-bold px-2 py-1 rounded-full">{visible.length} active</span>
          )}
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm text-red-600 font-semibold uppercase tracking-wide mb-1">Patient</p>
            <p className="text-2xl font-bold text-gray-800">{em.userName || 'Unknown Patient'}</p>
            <p className="text-red-700 font-medium mt-1">Type: <span className="uppercase">{em.type}</span></p>
            {em.description && <p className="text-gray-600 text-sm mt-1">{em.description}</p>}
            <p className="text-gray-400 text-xs mt-2">{em.timestamp?.toDate?.()?.toLocaleString() || 'Just now'}</p>
          </div>

          {visible.length > 1 && (
            <p className="text-center text-sm text-gray-500">+{visible.length - 1} more emergency alert{visible.length - 1 > 1 ? 's' : ''}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button className="bg-red-600 hover:bg-red-700 text-white h-11" onClick={() => window.location.href = 'tel:911'}>
              <Phone className="h-4 w-4 mr-2" />Call 911
            </Button>
            <Button variant="outline" className="border-green-400 text-green-700 hover:bg-green-50 h-11" onClick={() => handleResolve(em.id)}>
              <CheckCircle className="h-4 w-4 mr-2" />Resolve
            </Button>
          </div>
          <Button variant="ghost" className="w-full text-gray-500 hover:text-gray-700 h-9 text-sm" onClick={() => handleAcknowledge(em.id)}>
            <X className="h-3.5 w-3.5 mr-1" />Acknowledge & Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EmergencyPopup;
