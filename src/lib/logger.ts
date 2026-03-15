// src/lib/logger.ts - Always logs to Firestore (fixed dev-skip bug)
import { db } from './firebase';
import { collection, addDoc, query, where, orderBy, getDocs, limit } from 'firebase/firestore';

export type LogLevel = 'info' | 'warning' | 'error' | 'debug';

export interface LogEntry {
  id?: string;
  userId?: string | null;
  userEmail?: string | null;
  level: LogLevel;
  action: string;
  details?: any;
  timestamp: string;
  page?: string;
  browser?: string;
  os?: string;
}

const sanitizeData = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(sanitizeData);
  if (typeof obj === 'object') {
    const out: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined) {
        out[key] = sanitizeData(obj[key]);
      }
    }
    return out;
  }
  return obj;
};

class Logger {
  private enabled = true;

  private getBrowserInfo() {
    const ua = navigator.userAgent;
    let browser = 'Unknown', os = 'Unknown';
    if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari')) browser = 'Safari';
    else if (ua.includes('Edge')) browser = 'Edge';
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'MacOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    return { browser, os };
  }

  async log(level: LogLevel, action: string, details?: any): Promise<LogEntry | null> {
    const timestamp = new Date().toISOString();
    const { browser, os } = this.getBrowserInfo();
    const page = typeof window !== 'undefined' ? window.location.pathname : '';
    const sanitized = sanitizeData(details);
    const method = level === 'error' ? console.error : level === 'warning' ? console.warn : console.log;
    method(`[${level.toUpperCase()}] ${action}`, sanitized || '');
    if (!this.enabled) return null;
    try {
      const entry = { level, action, details: sanitized ?? null, timestamp, browser, os, page, userId: null, userEmail: null };
      const ref = await addDoc(collection(db, 'system_logs'), entry);
      return { id: ref.id, ...entry };
    } catch (e) { console.error('Logger: Firestore write failed', e); return null; }
  }

  async logWithUser(userId: string | null | undefined, userEmail: string | null | undefined, level: LogLevel, action: string, details?: any): Promise<LogEntry | null> {
    const timestamp = new Date().toISOString();
    const { browser, os } = this.getBrowserInfo();
    const page = typeof window !== 'undefined' ? window.location.pathname : '';
    const sanitized = sanitizeData(details);
    console.log(`[${level.toUpperCase()}] [${userEmail || 'unknown'}] ${action}`, sanitized || '');
    if (!this.enabled) return null;
    try {
      const entry = { userId: userId || null, userEmail: userEmail || null, level, action, details: sanitized ?? null, timestamp, browser, os, page };
      const ref = await addDoc(collection(db, 'system_logs'), entry);
      return { id: ref.id, ...entry };
    } catch (e) { console.error('Logger: Firestore write failed', e); return null; }
  }

  async info(action: string, details?: any) { return this.log('info', action, details); }
  async warning(action: string, details?: any) { return this.log('warning', action, details); }
  async error(action: string, details?: any) { return this.log('error', action, details); }
  async debug(action: string, details?: any) { return this.log('debug', action, details); }

  async getUserLogs(userId: string, options?: { limit?: number }): Promise<LogEntry[]> {
    try {
      const q = query(collection(db, 'system_logs'), where('userId', '==', userId), orderBy('timestamp', 'desc'), limit(options?.limit || 200));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as LogEntry));
    } catch (e) { console.error('Logger: getUserLogs failed', e); return []; }
  }

  async getRecentLogs(limitCount = 200): Promise<LogEntry[]> {
    try {
      const q = query(collection(db, 'system_logs'), orderBy('timestamp', 'desc'), limit(limitCount));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as LogEntry));
    } catch (e) { console.error('Logger: getRecentLogs failed', e); return []; }
  }

  enable() { this.enabled = true; }
  disable() { this.enabled = false; }
}

export const logger = new Logger();
