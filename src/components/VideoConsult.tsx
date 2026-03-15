// src/components/VideoConsult.tsx - Full video with Firestore call signaling
import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { addDoc, collection, doc, onSnapshot, updateDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Video, PhoneOff, Maximize2, ExternalLink, Phone } from 'lucide-react';
import { generateRoomName, getJitsiUrl, isVideoSupported } from '@/lib/telemedicine';

interface VideoConsultProps {
  open: boolean;
  onClose: () => void;
  doctorName: string;
  patientName: string;
  doctorId: string;
  patientId: string;
  appointmentId?: string;
  role: 'doctor' | 'patient';
}

const VideoConsult = ({ open, onClose, doctorName, patientName, doctorId, patientId, appointmentId, role }: VideoConsultProps) => {
  const [started, setStarted] = useState(false);
  const [jitsiLoaded, setJitsiLoaded] = useState(false);
  const callDocId = useRef<string | null>(null);

  const displayName = role === 'doctor' ? `Dr. ${doctorName}` : patientName;
  const roomName = generateRoomName(doctorId, patientId, appointmentId);
  const jitsiUrl = getJitsiUrl(roomName, displayName, role);

  useEffect(() => {
    if (!open) { setStarted(false); setJitsiLoaded(false); return; }
    if (role === 'doctor' && open) {
      // Doctor initiates: write call invitation to Firestore
      const initiateCall = async () => {
        const ref = await addDoc(collection(db, 'video_calls'), {
          doctorId, patientId, doctorName, patientName,
          roomName, status: 'ringing',
          initiatedAt: serverTimestamp(),
          appointmentId: appointmentId || null,
        });
        callDocId.current = ref.id;
      };
      initiateCall();
    }
    return () => {
      // Cleanup: mark call ended
      if (callDocId.current) {
        updateDoc(doc(db, 'video_calls', callDocId.current), { status: 'ended', endedAt: serverTimestamp() }).catch(() => {});
      }
    };
  }, [open]);

  const handleEndCall = () => {
    if (callDocId.current) {
      updateDoc(doc(db, 'video_calls', callDocId.current), { status: 'ended', endedAt: serverTimestamp() }).catch(() => {});
    }
    setStarted(false);
    onClose();
  };

  if (!isVideoSupported()) return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white max-w-sm" aria-describedby="vc-ns">
        <DialogHeader><DialogTitle>Video Consultation</DialogTitle></DialogHeader>
        <p id="vc-ns" className="text-sm text-gray-600">Please use Chrome or Firefox for video calls.</p>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </DialogContent>
    </Dialog>
  );

  return (
    <Dialog open={open} onOpenChange={handleEndCall}>
      <DialogContent className="bg-gray-900 text-white max-w-4xl w-full max-h-[92vh] p-0 overflow-hidden" aria-describedby="vc-main">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 bg-green-400 rounded-full animate-pulse"></div>
            <span className="font-semibold text-white text-sm">
              {role === 'doctor' ? `Consultation — ${patientName}` : `Consultation — Dr. ${doctorName}`}
            </span>
          </div>
          <p className="text-xs text-gray-400">🔒 End-to-end encrypted · Jitsi Meet</p>
        </div>
        <p id="vc-main" className="sr-only">Video call in progress</p>

        {!started ? (
          <div className="py-10 px-6 text-center space-y-5">
            <div className="h-24 w-24 bg-gradient-to-br from-green-500 to-teal-600 rounded-full flex items-center justify-center mx-auto shadow-xl">
              <Video className="h-12 w-12 text-white"/>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-2">
                {role === 'doctor' ? `Calling ${patientName}...` : `Consultation with Dr. ${doctorName}`}
              </h3>
              <p className="text-gray-400 text-sm">Secure video call via Jitsi Meet — no account needed</p>
              <p className="text-gray-500 text-xs mt-1">Camera and microphone access required</p>
            </div>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button className="bg-green-600 hover:bg-green-700 text-white h-12 px-8 font-semibold" onClick={() => setStarted(true)}>
                <Video className="h-5 w-5 mr-2"/>Join Video Call
              </Button>
              <Button variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-800 h-12 px-5"
                onClick={() => window.open(jitsiUrl, '_blank', 'noopener,noreferrer')}>
                <ExternalLink className="h-4 w-4 mr-2"/>Open in New Tab
              </Button>
            </div>
            <Button variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-gray-800" onClick={handleEndCall}>
              <PhoneOff className="h-4 w-4 mr-2"/>Decline / Cancel
            </Button>
          </div>
        ) : (
          <div>
            <div className="relative bg-black" style={{ height: '72vh' }}>
              {!jitsiLoaded && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-4 border-green-500 border-t-transparent mx-auto mb-3"></div>
                    <p className="text-gray-400 text-sm">Connecting...</p>
                  </div>
                </div>
              )}
              <iframe src={jitsiUrl} allow="camera; microphone; fullscreen; display-capture; autoplay"
                style={{ width: '100%', height: '100%', border: 'none' }}
                onLoad={() => setJitsiLoaded(true)} title="Video Call"/>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800">
              <p className="text-gray-400 text-xs">Room: {roomName}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-700 h-8 text-xs"
                  onClick={() => window.open(jitsiUrl, '_blank')}>
                  <Maximize2 className="h-3.5 w-3.5 mr-1"/>Fullscreen
                </Button>
                <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white h-8 text-xs" onClick={handleEndCall}>
                  <PhoneOff className="h-3.5 w-3.5 mr-1"/>End Call
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default VideoConsult;
