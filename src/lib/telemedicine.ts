// src/lib/telemedicine.ts - Video consultation using WebRTC (peer-to-peer, no API key needed)
// Falls back to Jitsi Meet for production reliability

export interface VideoSession {
  sessionId: string;
  doctorId: string;
  patientId: string;
  appointmentId?: string;
  startedAt: string;
  status: 'waiting' | 'active' | 'ended';
}

// Generate a unique room name for a session
export function generateRoomName(doctorId: string, patientId: string, appointmentId?: string): string {
  const base = appointmentId || `${doctorId}-${patientId}`;
  const hash = Array.from(base).reduce((acc, c) => ((acc << 5) - acc) + c.charCodeAt(0), 0);
  return `caredose-${Math.abs(hash).toString(36)}`;
}

// Get Jitsi Meet URL (free, no API key required, HIPAA-ready with self-hosted)
export function getJitsiUrl(roomName: string, displayName: string, role: 'doctor' | 'patient'): string {
  const params = new URLSearchParams({
    config: JSON.stringify({
      startWithAudioMuted: false,
      startWithVideoMuted: false,
      prejoinPageEnabled: true,
      disableDeepLinking: true,
      subject: `CareDose+ Consultation`,
      enableClosePage: true,
    })
  });
  return `https://meet.jit.si/${roomName}#userInfo.displayName="${encodeURIComponent(displayName)}"`;
}

// Simple WebRTC peer connection (for direct browser-to-browser)
export class WebRTCSession {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;

  async startLocalStream(video = true, audio = true): Promise<MediaStream> {
    this.localStream = await navigator.mediaDevices.getUserMedia({ video, audio });
    return this.localStream;
  }

  async createOffer(onIceCandidate: (candidate: RTCIceCandidate) => void): Promise<RTCSessionDescriptionInit> {
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    this.localStream?.getTracks().forEach(t => this.pc!.addTrack(t, this.localStream!));
    this.pc.onicecandidate = e => { if (e.candidate) onIceCandidate(e.candidate); };
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    await this.pc?.setRemoteDescription(answer);
  }

  async createAnswer(offer: RTCSessionDescriptionInit, onIceCandidate: (c: RTCIceCandidate) => void, onRemoteStream: (stream: MediaStream) => void): Promise<RTCSessionDescriptionInit> {
    this.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    this.localStream?.getTracks().forEach(t => this.pc!.addTrack(t, this.localStream!));
    this.pc.onicecandidate = e => { if (e.candidate) onIceCandidate(e.candidate); };
    this.pc.ontrack = e => { if (e.streams[0]) onRemoteStream(e.streams[0]); };
    await this.pc.setRemoteDescription(offer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  addIceCandidate(candidate: RTCIceCandidateInit): void {
    this.pc?.addIceCandidate(candidate);
  }

  endCall(): void {
    this.localStream?.getTracks().forEach(t => t.stop());
    this.pc?.close();
    this.pc = null;
    this.localStream = null;
  }

  async toggleScreenShare(): Promise<MediaStream | null> {
    try {
      const screen = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
      return screen;
    } catch { return null; }
  }
}

export function isVideoSupported(): boolean {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}
