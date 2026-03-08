// src/lib/logger.ts - COMPLETE FIXED
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

// Helper function to recursively remove undefined values
const sanitizeData = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return null;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeData(item));
  }
  
  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (value !== undefined) {
          sanitized[key] = sanitizeData(value);
        }
      }
    }
    return sanitized;
  }
  
  return obj;
};

class Logger {
  private enabled: boolean = true;
  private consoleEnabled: boolean = true;
  private logCache: Map<string, LogEntry[]> = new Map();
  private cacheTimeout: number = 5 * 60 * 1000; // 5 minutes
  private isDevelopment: boolean = process.env.NODE_ENV === 'development';

  constructor() {
    this.logBrowserInfo();
    setInterval(() => this.cleanCache(), this.cacheTimeout);
  }

  private getBrowserInfo() {
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    let os = 'Unknown';

    if (ua.indexOf('Chrome') > -1) browser = 'Chrome';
    else if (ua.indexOf('Firefox') > -1) browser = 'Firefox';
    else if (ua.indexOf('Safari') > -1) browser = 'Safari';
    else if (ua.indexOf('Edge') > -1) browser = 'Edge';
    else if (ua.indexOf('MSIE') > -1 || ua.indexOf('Trident/') > -1) browser = 'Internet Explorer';

    if (ua.indexOf('Windows') > -1) os = 'Windows';
    else if (ua.indexOf('Mac') > -1) os = 'MacOS';
    else if (ua.indexOf('Linux') > -1) os = 'Linux';
    else if (ua.indexOf('Android') > -1) os = 'Android';
    else if (ua.indexOf('iOS') > -1) os = 'iOS';
    else if (ua.indexOf('iPhone') > -1) os = 'iOS';
    else if (ua.indexOf('iPad') > -1) os = 'iOS';

    return { browser, os };
  }

  private async logBrowserInfo() {
    const { browser, os } = this.getBrowserInfo();
    await this.info('Browser info', { browser, os }, true);
  }

  private cleanCache() {}

  async log(level: LogLevel, action: string, details?: any, skipFirestore: boolean = false) {
    const timestamp = new Date().toISOString();
    const { browser, os } = this.getBrowserInfo();
    const page = window.location.pathname;

    const sanitizedDetails = sanitizeData(details);

    if (this.consoleEnabled) {
      const logMethod = level === 'error' ? console.error : 
                       level === 'warning' ? console.warn : 
                       console.log;
      logMethod(`[${level.toUpperCase()}] ${action}`, sanitizedDetails || '');
    }

    if (this.isDevelopment && !skipFirestore) {
      return null;
    }

    if (this.enabled && !skipFirestore) {
      try {
        const logsRef = collection(db, 'system_logs');
        const logEntry = {
          level,
          action,
          details: sanitizedDetails,
          timestamp,
          browser,
          os,
          page,
          userId: null,
          userEmail: null
        };
        
        const docRef = await addDoc(logsRef, logEntry);
        
        const logWithId = { id: docRef.id, ...logEntry };
        this.addToCache('all', logWithId);
        
        return logWithId;
      } catch (error) {
        console.error('Failed to log to Firestore:', error);
      }
    }
    return null;
  }

  private addToCache(key: string, log: LogEntry) {
    if (!this.logCache.has(key)) {
      this.logCache.set(key, []);
    }
    const logs = this.logCache.get(key)!;
    logs.unshift(log);
    if (logs.length > 100) logs.pop();
  }

  async info(action: string, details?: any, skipFirestore?: boolean) {
    return this.log('info', action, details, skipFirestore);
  }

  async warning(action: string, details?: any, skipFirestore?: boolean) {
    return this.log('warning', action, details, skipFirestore);
  }

  async error(action: string, details?: any, skipFirestore?: boolean) {
    return this.log('error', action, details, skipFirestore);
  }

  async debug(action: string, details?: any, skipFirestore?: boolean) {
    if (this.isDevelopment) {
      return this.log('debug', action, details, skipFirestore);
    }
    return null;
  }

  async logWithUser(
    userId: string | null | undefined, 
    userEmail: string | null | undefined, 
    level: LogLevel, 
    action: string, 
    details?: any,
    skipFirestore: boolean = false
  ) {
    const timestamp = new Date().toISOString();
    const { browser, os } = this.getBrowserInfo();
    const page = window.location.pathname;

    const sanitizedDetails = sanitizeData(details);

    if (this.consoleEnabled) {
      console.log(`[${level.toUpperCase()}] [${userEmail || 'unknown'}] ${action}`, sanitizedDetails || '');
    }

    if (this.isDevelopment && !skipFirestore) {
      return null;
    }

    if (this.enabled && !skipFirestore) {
      try {
        const logsRef = collection(db, 'system_logs');
        const logEntry = {
          userId: userId || null,
          userEmail: userEmail || null,
          level,
          action,
          details: sanitizedDetails,
          timestamp,
          browser,
          os,
          page
        };
        
        const docRef = await addDoc(logsRef, logEntry);
        
        const logWithId = { id: docRef.id, ...logEntry };
        this.addToCache('all', logWithId);
        if (userId) {
          this.addToCache(`user_${userId}`, logWithId);
        }
        
        return logWithId;
      } catch (error) {
        console.error('Failed to log to Firestore:', error);
      }
    }
    return null;
  }

  async getUserLogs(
    userId: string, 
    options?: {
      level?: LogLevel;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      page?: string;
    }
  ): Promise<LogEntry[]> {
    try {
      const logsRef = collection(db, 'system_logs');
      let q = query(
        logsRef,
        where('userId', '==', userId),
        orderBy('timestamp', 'desc')
      );

      if (options?.level) {
        q = query(q, where('level', '==', options.level));
      }

      if (options?.page) {
        q = query(q, where('page', '==', options.page));
      }

      if (options?.startDate) {
        q = query(q, where('timestamp', '>=', options.startDate.toISOString()));
      }

      if (options?.endDate) {
        q = query(q, where('timestamp', '<=', options.endDate.toISOString()));
      }

      if (options?.limit) {
        q = query(q, limit(options.limit));
      }

      const querySnapshot = await getDocs(q);
      
      const logs: LogEntry[] = [];
      querySnapshot.forEach((doc) => {
        logs.push({ id: doc.id, ...doc.data() } as LogEntry);
      });

      return logs;
    } catch (error) {
      console.error('Error getting user logs:', error);
      return [];
    }
  }

  async getRecentLogs(limitCount: number = 100): Promise<LogEntry[]> {
    try {
      const logsRef = collection(db, 'system_logs');
      const q = query(logsRef, orderBy('timestamp', 'desc'), limit(limitCount));
      const querySnapshot = await getDocs(q);
      
      const logs: LogEntry[] = [];
      querySnapshot.forEach((doc) => {
        logs.push({ id: doc.id, ...doc.data() } as LogEntry);
      });

      return logs;
    } catch (error) {
      console.error('Error getting recent logs:', error);
      return [];
    }
  }

  async getLogsByLevel(
    level: LogLevel,
    limitCount: number = 50
  ): Promise<LogEntry[]> {
    try {
      const logsRef = collection(db, 'system_logs');
      const q = query(
        logsRef,
        where('level', '==', level),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );
      const querySnapshot = await getDocs(q);
      
      const logs: LogEntry[] = [];
      querySnapshot.forEach((doc) => {
        logs.push({ id: doc.id, ...doc.data() } as LogEntry);
      });

      return logs;
    } catch (error) {
      console.error('Error getting logs by level:', error);
      return [];
    }
  }

  async getUserActivitySummary(userId: string): Promise<{
    totalLogs: number;
    errors: number;
    warnings: number;
    lastActive: Date | null;
    pages: string[];
  }> {
    try {
      const logs = await this.getUserLogs(userId, { limit: 1000 });
      
      const pages = logs
        .map(l => l.page)
        .filter((page): page is string => page !== undefined && page !== null);
      
      const summary = {
        totalLogs: logs.length,
        errors: logs.filter(l => l.level === 'error').length,
        warnings: logs.filter(l => l.level === 'warning').length,
        lastActive: logs.length > 0 ? new Date(logs[0].timestamp) : null,
        pages: [...new Set(pages)]
      };

      return summary;
    } catch (error) {
      console.error('Error getting user activity summary:', error);
      return {
        totalLogs: 0,
        errors: 0,
        warnings: 0,
        lastActive: null,
        pages: []
      };
    }
  }

  exportLogs(logs: LogEntry[]): string {
    return JSON.stringify(logs, null, 2);
  }

  clearCache() {
    this.logCache.clear();
  }

  enable() { this.enabled = true; }
  disable() { this.enabled = false; }
  enableConsole() { this.consoleEnabled = true; }
  disableConsole() { this.consoleEnabled = false; }
}

export const logger = new Logger();