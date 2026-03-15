// src/lib/wearable.ts - Wearable integrations with real API credentials
// Google Fit Client ID: 773546090775-m6397lr6kkft8rjllv7c7afrjgkn5fki.apps.googleusercontent.com

export interface HealthData {
  heartRate?: number;
  steps?: number;
  bloodOxygen?: number;
  sleepHours?: number;
  calories?: number;
  timestamp: string;
  source: 'apple_health' | 'fitbit' | 'google_fit' | 'manual';
}

// ─── Google Fit OAuth ──────────────────────────────────────────────────────
const GOOGLE_FIT_CLIENT_ID = import.meta.env.VITE_GOOGLE_FIT_CLIENT_ID ||
  '773546090775-m6397lr6kkft8rjllv7c7afrjgkn5fki.apps.googleusercontent.com';

const GOOGLE_FIT_SCOPES = [
  'https://www.googleapis.com/auth/fitness.heart_rate.read',
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/fitness.sleep.read',
  'https://www.googleapis.com/auth/fitness.oxygen_saturation.read',
].join(' ');

export class GoogleFitAPI {
  // Start OAuth flow — opens Google consent screen
  static connect(): void {
    const redirectUri = `${window.location.origin}/google-fit-callback`;
    const params = new URLSearchParams({
      client_id: GOOGLE_FIT_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'token',   // implicit flow, token in URL hash
      scope: GOOGLE_FIT_SCOPES,
      include_granted_scopes: 'true',
      state: 'google_fit',
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  // Call this on /google-fit-callback page to extract token from URL hash
  static extractTokenFromCallback(): string | null {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');
    if (token) {
      localStorage.setItem('google_fit_token', token);
      // Store expiry
      const expiresIn = parseInt(params.get('expires_in') || '3600');
      localStorage.setItem('google_fit_expires', String(Date.now() + expiresIn * 1000));
    }
    return token;
  }

  static getStoredToken(): string | null {
    const token = localStorage.getItem('google_fit_token');
    const expires = parseInt(localStorage.getItem('google_fit_expires') || '0');
    if (!token || Date.now() > expires) {
      localStorage.removeItem('google_fit_token');
      return null;
    }
    return token;
  }

  static isConnected(): boolean {
    return !!this.getStoredToken();
  }

  static disconnect(): void {
    localStorage.removeItem('google_fit_token');
    localStorage.removeItem('google_fit_expires');
  }

  static async getHeartRate(): Promise<number | null> {
    const token = this.getStoredToken();
    if (!token) return null;
    try {
      const now = Date.now();
      const oneHourAgo = now - 3600000;
      const body = {
        aggregateBy: [{ dataTypeName: 'com.google.heart_rate.bpm' }],
        bucketByTime: { durationMillis: 3600000 },
        startTimeMillis: oneHourAgo,
        endTimeMillis: now,
      };
      const res = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 401) { this.disconnect(); return null; }
      if (!res.ok) return null;
      const data = await res.json();
      const points = data.bucket?.[0]?.dataset?.[0]?.point;
      if (!points?.length) return null;
      const val = Math.round(points[0].value?.[0]?.fpVal || 0);
      return val || null;
    } catch { return null; }
  }

  static async getSteps(): Promise<number | null> {
    const token = this.getStoredToken();
    if (!token) return null;
    try {
      const now = Date.now();
      const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
      const body = {
        aggregateBy: [{ dataTypeName: 'com.google.step_count.delta' }],
        bucketByTime: { durationMillis: now - startOfDay.getTime() },
        startTimeMillis: startOfDay.getTime(),
        endTimeMillis: now,
      };
      const res = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 401) { this.disconnect(); return null; }
      if (!res.ok) return null;
      const data = await res.json();
      const points = data.bucket?.[0]?.dataset?.[0]?.point || [];
      const total = points.reduce((s: number, p: any) => s + (p.value?.[0]?.intVal || 0), 0);
      return total || null;
    } catch { return null; }
  }

  static async getBloodOxygen(): Promise<number | null> {
    const token = this.getStoredToken();
    if (!token) return null;
    try {
      const now = Date.now();
      const oneHourAgo = now - 3600000;
      const body = {
        aggregateBy: [{ dataTypeName: 'com.google.oxygen_saturation' }],
        bucketByTime: { durationMillis: 3600000 },
        startTimeMillis: oneHourAgo,
        endTimeMillis: now,
      };
      const res = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const val = data.bucket?.[0]?.dataset?.[0]?.point?.[0]?.value?.[0]?.fpVal;
      return val ? Math.round(val * 100) : null;
    } catch { return null; }
  }
}

// ─── Fitbit OAuth ─────────────────────────────────────────────────────────
// To get Fitbit Client ID:
// 1. Go to https://dev.fitbit.com/apps/new
// 2. Fill in:
//    - Application Name: CareDose+
//    - Description: Smart medication management for elderly care
//    - Application Website: https://your-render-url.onrender.com
//    - Organization: CareDose
//    - Organization Website: https://your-render-url.onrender.com
//    - OAuth 2.0 Application Type: Personal (fastest for demo/testing)
//    - Callback URL: https://your-render-url.onrender.com/fitbit-callback
//    - Default Access Type: Read-Only
// 3. Copy the OAuth 2.0 Client ID and paste in .env as VITE_FITBIT_CLIENT_ID

const FITBIT_CLIENT_ID = import.meta.env.VITE_FITBIT_CLIENT_ID || '';

export class FitbitAPI {
  static isConfigured(): boolean { return !!FITBIT_CLIENT_ID; }

  static connect(): void {
    if (!FITBIT_CLIENT_ID) {
      alert('Fitbit Client ID not configured. See .env.example for setup instructions.');
      return;
    }
    const redirectUri = `${window.location.origin}/fitbit-callback`;
    const params = new URLSearchParams({
      response_type: 'token',
      client_id: FITBIT_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: 'heartrate activity sleep',
      expires_in: '604800',
    });
    window.location.href = `https://www.fitbit.com/oauth2/authorize?${params}`;
  }

  static extractTokenFromCallback(): string | null {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');
    if (token) {
      localStorage.setItem('fitbit_token', token);
      const expiresIn = parseInt(params.get('expires_in') || '604800');
      localStorage.setItem('fitbit_expires', String(Date.now() + expiresIn * 1000));
    }
    return token;
  }

  static getStoredToken(): string | null {
    const token = localStorage.getItem('fitbit_token');
    const expires = parseInt(localStorage.getItem('fitbit_expires') || '0');
    if (!token || Date.now() > expires) { localStorage.removeItem('fitbit_token'); return null; }
    return token;
  }

  static isConnected(): boolean { return !!this.getStoredToken(); }

  static disconnect(): void {
    localStorage.removeItem('fitbit_token');
    localStorage.removeItem('fitbit_expires');
  }

  static async getHeartRate(): Promise<number | null> {
    const token = this.getStoredToken();
    if (!token) return null;
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(
        `https://api.fitbit.com/1/user/-/activities/heart/date/${today}/1d/1min.json`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }
      );
      if (res.status === 401) { this.disconnect(); return null; }
      if (!res.ok) return null;
      const data = await res.json();
      const dataset = data['activities-heart-intraday']?.dataset || [];
      return dataset[dataset.length - 1]?.value || null;
    } catch { return null; }
  }

  static async getSteps(): Promise<number | null> {
    const token = this.getStoredToken();
    if (!token) return null;
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`https://api.fitbit.com/1/user/-/activities/date/${today}.json`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
      if (res.status === 401) { this.disconnect(); return null; }
      if (!res.ok) return null;
      const data = await res.json();
      return data.summary?.steps || null;
    } catch { return null; }
  }
}

// ─── Apple HealthKit ───────────────────────────────────────────────────────
// Works via iOS Safari native bridge. In React Native, use react-native-health.
export class AppleHealthKit {
  static isAvailable(): boolean {
    return typeof (window as any).webkit?.messageHandlers?.healthkit !== 'undefined';
  }
  static async getHeartRate(): Promise<number | null> { return null; }
  static async getSteps(): Promise<number | null> { return null; }
}

// ─── Fall Detection (DeviceMotion API) ────────────────────────────────────
export function setupFallDetection(onFallDetected: () => void): () => void {
  if (!window.DeviceMotionEvent) return () => {};
  let lastAccel = { x: 0, y: 0, z: 0 };
  const THRESHOLD = 25;
  const handler = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    if (!a) return;
    const { x=0, y=0, z=0 } = a;
    const delta = Math.sqrt(Math.pow((x||0)-lastAccel.x,2)+Math.pow((y||0)-lastAccel.y,2)+Math.pow((z||0)-lastAccel.z,2));
    if (delta > THRESHOLD) onFallDetected();
    lastAccel = { x:x||0, y:y||0, z:z||0 };
  };
  window.addEventListener('devicemotion', handler);
  return () => window.removeEventListener('devicemotion', handler);
}

// ─── Local health data storage ────────────────────────────────────────────
export function saveHealthData(userId: string, data: Partial<HealthData>): HealthData {
  const entry: HealthData = { ...data, timestamp: new Date().toISOString(), source: data.source || 'manual' };
  const key = `health_data_${userId}`;
  const existing = JSON.parse(localStorage.getItem(key) || '[]');
  existing.push(entry);
  if (existing.length > 200) existing.splice(0, existing.length - 200);
  localStorage.setItem(key, JSON.stringify(existing));
  return entry;
}

export function getHealthData(userId: string, days = 7): HealthData[] {
  const key = `health_data_${userId}`;
  const all: HealthData[] = JSON.parse(localStorage.getItem(key) || '[]');
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  return all.filter(d => new Date(d.timestamp) > cutoff);
}
