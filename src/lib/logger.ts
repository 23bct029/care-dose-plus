// src/lib/logger.ts
import { db } from './firebase';
import { collection, addDoc, query, where, orderBy, getDocs, limit } from 'firebase/firestore';

export type LogLevel = 'info' | 'warning' | 'error' | 'debug';

export interface LogEntry {
  id?: string;
  userId?: string;
  userEmail?: string;
  level: LogLevel;
  action: string;
  details?: any;
  timestamp: any;
  page?: string;
  browser?: string;
  os?: string;
  ip?: string;
}

class Logger {
  private enabled: boolean = true;
  private consoleEnabled: boolean = true;
  private logCache: Map<string, LogEntry[]> = new Map();
  private cacheTimeout: number = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Log browser info on init
    this.logBrowserInfo();
    
    // Set up periodic cache cleanup
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

  private cleanCache() {
    const now = Date.now();
    for (const [key, value] of this.logCache.entries()) {
      // Clean old cache entries (implement if needed)
    }
  }

  async log(level: LogLevel, action: string, details?: any, skipFirestore: boolean = false) {
    const timestamp = new Date().toISOString();
    const { browser, os } = this.getBrowserInfo();
    const page = window.location.pathname;

    // Console logging
    if (this.consoleEnabled) {
      const logMethod = level === 'error' ? console.error : 
                       level === 'warning' ? console.warn : 
                       console.log;
      logMethod(`[${level.toUpperCase()}] ${action}`, details || '');
    }

    // Firestore logging
    if (this.enabled && !skipFirestore) {
      try {
        const logsRef = collection(db, 'system_logs');
        const logEntry = {
          level,
          action,
          details: details || null,
          timestamp,
          browser,
          os,
          page,
          userId: null,
          userEmail: null
        };
        
        const docRef = await addDoc(logsRef, logEntry);
        
        // Cache the log
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
    if (logs.length > 100) logs.pop(); // Keep only last 100 logs
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
    if (process.env.NODE_ENV === 'development') {
      return this.log('debug', action, details, skipFirestore);
    }
    return null;
  }

  // Log with user context
  async logWithUser(
    userId: string, 
    userEmail: string | null, 
    level: LogLevel, 
    action: string, 
    details?: any,
    skipFirestore: boolean = false
  ) {
    const timestamp = new Date().toISOString();
    const { browser, os } = this.getBrowserInfo();
    const page = window.location.pathname;

    // Console logging
    if (this.consoleEnabled) {
      console.log(`[${level.toUpperCase()}] [${userEmail}] ${action}`, details || '');
    }

    // Firestore logging
    if (this.enabled && !skipFirestore) {
      try {
        const logsRef = collection(db, 'system_logs');
        const logEntry = {
          userId,
          userEmail,
          level,
          action,
          details: details || null,
          timestamp,
          browser,
          os,
          page
        };
        
        const docRef = await addDoc(logsRef, logEntry);
        
        // Cache the log
        const logWithId = { id: docRef.id, ...logEntry };
        this.addToCache('all', logWithId);
        this.addToCache(`user_${userId}`, logWithId);
        
        return logWithId;
      } catch (error) {
        console.error('Failed to log to Firestore:', error);
      }
    }
    return null;
  }

  // Get logs for a specific user
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

      // Apply filters
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

  // Get logs for multiple users
  async getMultipleUsersLogs(
    userIds: string[],
    options?: {
      level?: LogLevel;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): Promise<Map<string, LogEntry[]>> {
    const result = new Map<string, LogEntry[]>();
    
    for (const userId of userIds) {
      const logs = await this.getUserLogs(userId, options);
      result.set(userId, logs);
    }
    
    return result;
  }

  // Get recent logs across all users
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

  // Get logs by level
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

  // Get logs by page
  async getLogsByPage(
    page: string,
    limitCount: number = 50
  ): Promise<LogEntry[]> {
    try {
      const logsRef = collection(db, 'system_logs');
      const q = query(
        logsRef,
        where('page', '==', page),
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
      console.error('Error getting logs by page:', error);
      return [];
    }
  }

  // Get error logs
  async getErrorLogs(limitCount: number = 50): Promise<LogEntry[]> {
    return this.getLogsByLevel('error', limitCount);
  }

  // Get warning logs
  async getWarningLogs(limitCount: number = 50): Promise<LogEntry[]> {
    return this.getLogsByLevel('warning', limitCount);
  }

  // Get user activity summary
  async getUserActivitySummary(userId: string): Promise<{
    totalLogs: number;
    errors: number;
    warnings: number;
    lastActive: Date | null;
    pages: string[];
  }> {
    try {
      const logs = await this.getUserLogs(userId, { limit: 1000 });
      
      const summary = {
        totalLogs: logs.length,
        errors: logs.filter(l => l.level === 'error').length,
        warnings: logs.filter(l => l.level === 'warning').length,
        lastActive: logs.length > 0 ? new Date(logs[0].timestamp) : null,
        pages: [...new Set(logs.map(l => l.page).filter(Boolean))]
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

  // Delete old logs (admin function - would need backend)
  async deleteOldLogs(daysOld: number = 30): Promise<boolean> {
    // This would need to be implemented as a Cloud Function
    // for security reasons, can't delete from client
    console.warn('Delete old logs should be implemented as a Cloud Function');
    return false;
  }

  // Export logs as JSON
  exportLogs(logs: LogEntry[]): string {
    return JSON.stringify(logs, null, 2);
  }

  // Clear cache
  clearCache() {
    this.logCache.clear();
  }

  // Enable/disable logging
  enable() { this.enabled = true; }
  disable() { this.enabled = false; }
  enableConsole() { this.consoleEnabled = true; }
  disableConsole() { this.consoleEnabled = false; }

  // Get cache stats
  getCacheStats() {
    return {
      size: this.logCache.size,
      entries: Array.from(this.logCache.keys())
    };
  }
}

export const logger = new Logger();