// src/lib/telemedicine.ts - Video consultation via Jitsi Meet (no login required)

export function generateRoomName(doctorId: string, patientId: string, appointmentId?: string): string {
  const base = appointmentId || `${doctorId.slice(-6)}-${patientId.slice(-6)}`;
  const hash = Array.from(base).reduce((acc, c) => ((acc << 5) - acc) + c.charCodeAt(0), 0);
  return `caredose-${Math.abs(hash).toString(36)}`;
}

export function getJitsiUrl(roomName: string, displayName: string): string {
  // Use Jitsi with config params that disable login requirement
  const configOverwrite = JSON.stringify({
    startWithAudioMuted: false,
    startWithVideoMuted: false,
    prejoinPageEnabled: false,       // Skip pre-join page (no login prompt)
    requireDisplayName: false,
    disableDeepLinking: true,
    enableClosePage: false,
    disableInviteFunctions: true,
    enableWelcomePage: false,
    startAudioOnly: false,
    subject: 'CareDose+ Consultation',
    disableThirdPartyRequests: true,
  });
  const interfaceConfigOverwrite = JSON.stringify({
    TOOLBAR_BUTTONS: ['microphone','camera','fullscreen','hangup','chat','tileview'],
    SHOW_JITSI_WATERMARK: false,
    SHOW_WATERMARK_FOR_GUESTS: false,
    DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
  });
  // Build URL with fragment config to skip login
  const encodedName = encodeURIComponent(displayName);
  return `https://meet.jit.si/${roomName}#` +
    `userInfo.displayName="${encodedName}"&` +
    `config=${encodeURIComponent(configOverwrite)}&` +
    `interfaceConfig=${encodeURIComponent(interfaceConfigOverwrite)}`;
}

export function isVideoSupported(): boolean {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}
