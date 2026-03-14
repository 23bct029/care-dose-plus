// src/lib/offline.ts - Basic offline support for medicine schedules
const DB_NAME = 'eldercare-offline';
const DB_VERSION = 1;
const MEDS_STORE = 'medicines';
const PENDING_STORE = 'pending-actions';

let db: IDBDatabase | null = null;

async function openDB(): Promise<IDBDatabase> {
  if (db) return db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const database = (e.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(MEDS_STORE)) {
        database.createObjectStore(MEDS_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(PENDING_STORE)) {
        database.createObjectStore(PENDING_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
}

export async function cacheMedicines(medicines: any[]): Promise<void> {
  try {
    const database = await openDB();
    const tx = database.transaction(MEDS_STORE, 'readwrite');
    const store = tx.objectStore(MEDS_STORE);
    for (const med of medicines) {
      store.put(med);
    }
  } catch (e) {
    console.warn('Offline cache write failed:', e);
  }
}

export async function getCachedMedicines(): Promise<any[]> {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(MEDS_STORE, 'readonly');
      const store = tx.objectStore(MEDS_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('Offline cache read failed:', e);
    return [];
  }
}

export async function queueOfflineAction(action: {
  type: 'mark_taken' | 'mark_skipped' | 'mark_missed';
  medicineId: string;
  time: string;
  date: string;
  userId: string;
  timestamp: string;
}): Promise<void> {
  try {
    const database = await openDB();
    const tx = database.transaction(PENDING_STORE, 'readwrite');
    const store = tx.objectStore(PENDING_STORE);
    store.add(action);
  } catch (e) {
    console.warn('Failed to queue offline action:', e);
  }
}

export async function getPendingActions(): Promise<any[]> {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(PENDING_STORE, 'readonly');
      const store = tx.objectStore(PENDING_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return [];
  }
}

export async function clearPendingActions(): Promise<void> {
  try {
    const database = await openDB();
    const tx = database.transaction(PENDING_STORE, 'readwrite');
    const store = tx.objectStore(PENDING_STORE);
    store.clear();
  } catch (e) {
    console.warn('Failed to clear pending actions:', e);
  }
}

export function isOnline(): boolean {
  return navigator.onLine;
}

export function calculateRefillStatus(medicine: {
  startDate?: string;
  totalPills?: number;
  dosesPerDay?: number;
  name: string;
}): { daysRemaining: number | null; needsRefill: boolean } {
  if (!medicine.startDate || !medicine.totalPills || !medicine.dosesPerDay) {
    return { daysRemaining: null, needsRefill: false };
  }
  const start = new Date(medicine.startDate);
  const now = new Date();
  const daysUsed = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const pillsUsed = daysUsed * medicine.dosesPerDay;
  const pillsRemaining = Math.max(0, medicine.totalPills - pillsUsed);
  const daysRemaining = Math.floor(pillsRemaining / medicine.dosesPerDay);
  return { daysRemaining, needsRefill: daysRemaining <= 7 };
}
