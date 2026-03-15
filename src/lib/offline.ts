// src/lib/offline.ts - Complete offline support with IndexedDB
const DB_NAME = 'caredose-offline';
const DB_VERSION = 2;

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('medicines')) db.createObjectStore('medicines', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('schedules')) db.createObjectStore('schedules', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('pending_actions')) db.createObjectStore('pending_actions', { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains('prescriptions')) db.createObjectStore('prescriptions', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('appointments')) db.createObjectStore('appointments', { keyPath: 'id' });
    };
    req.onsuccess = () => { _db = req.result; resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
}

function idbPut(store: string, data: any): Promise<void> {
  return openDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(data);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  }));
}

function idbGetAll(store: string): Promise<any[]> {
  return openDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  }));
}

function idbClear(store: string): Promise<void> {
  return openDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  }));
}

function idbAdd(store: string, data: any): Promise<void> {
  return openDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).add(data);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  }));
}

// ── Public API ───────────────────────────────────────────────
export async function cacheMedicines(medicines: any[]) {
  for (const m of medicines) { try { await idbPut('medicines', m); } catch {} }
}

export async function getCachedMedicines(): Promise<any[]> {
  try { return await idbGetAll('medicines'); } catch { return []; }
}

export async function cachePrescriptions(rxs: any[]) {
  for (const r of rxs) { try { await idbPut('prescriptions', r); } catch {} }
}

export async function getCachedPrescriptions(): Promise<any[]> {
  try { return await idbGetAll('prescriptions'); } catch { return []; }
}

export async function cacheAppointments(apts: any[]) {
  for (const a of apts) { try { await idbPut('appointments', a); } catch {} }
}

export async function getCachedAppointments(): Promise<any[]> {
  try { return await idbGetAll('appointments'); } catch { return []; }
}

export interface PendingAction {
  type: 'mark_taken' | 'mark_skipped' | 'mark_missed';
  medicineId: string;
  medicineName?: string;
  scheduledTime: string;
  date: string;
  userId: string;
  timestamp: string;
}

export async function queueOfflineAction(action: PendingAction) {
  try { await idbAdd('pending_actions', action); } catch(e) { console.warn('queue failed', e); }
}

export async function getPendingActions(): Promise<PendingAction[]> {
  try { return await idbGetAll('pending_actions'); } catch { return []; }
}

export async function clearPendingActions() {
  try { await idbClear('pending_actions'); } catch {}
}

export function isOnline(): boolean { return navigator.onLine; }

// Register SW
export function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(async r => {
      console.log('[SW] Registered:', r.scope);
      // Listen for sync messages
      navigator.serviceWorker.addEventListener('message', e => {
        if (e.data?.type === 'SYNC_NEEDED') {
          window.dispatchEvent(new CustomEvent('offline-sync-needed'));
        }
      });
    }).catch(e => console.warn('[SW] Registration failed:', e));
  }
}

// Trigger background sync when back online
export async function triggerSync() {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const reg = await navigator.serviceWorker.ready;
    try { await (reg as any).sync.register('sync-medicine-actions'); } catch {}
  }
}

// Refill calculation
export function calculateRefillStatus(medicine: {
  totalQuantity?: number; currentQuantity?: number;
  schedule?: string[]; startDate?: string;
  name: string;
}): { daysRemaining: number | null; needsRefill: boolean } {
  const qty = medicine.currentQuantity ?? medicine.totalQuantity;
  if (qty == null) return { daysRemaining: null, needsRefill: false };
  const dosesPerDay = medicine.schedule?.length || 1;
  const daysRemaining = Math.floor(qty / dosesPerDay);
  return { daysRemaining, needsRefill: daysRemaining <= 5 };
}
