// src/lib/notifications.ts
import { db } from './firebase';
import { collection, addDoc, query, where, onSnapshot } from 'firebase/firestore';

export type NotificationType = 
  | 'reminder' 
  | 'missed_dose' 
  | 'low_stock' 
  | 'emergency' 
  | 'appointment' 
  | 'message'
  | 'prescription'
  | 'system';

export interface Notification {
  id?: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: any;
  read: boolean;
  createdAt: string;
  priority?: 'low' | 'medium' | 'high' | 'emergency';
}

// Request notification permission
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    console.log('This browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
};

// Send browser notification
export const sendBrowserNotification = (
  title: string, 
  body: string, 
  options?: {
    tag?: string;
    requireInteraction?: boolean;
    data?: any;
    onClick?: () => void;
  }
) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    console.log('Notification would show:', title, '-', body);
    return null;
  }

  try {
    const notification = new Notification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      tag: options?.tag || Date.now().toString(),
      requireInteraction: options?.requireInteraction ?? true,
      data: options?.data,
      silent: false,
    });

    if (options?.onClick) {
      notification.onclick = () => {
        window.focus();
        options.onClick?.();
        notification.close();
      };
    }

    if (!options?.requireInteraction) {
      setTimeout(() => notification.close(), 10000);
    }

    return notification;
  } catch (error) {
    console.error('Error sending notification:', error);
    return null;
  }
};

// Save notification to Firestore
export const saveNotification = async (notification: Omit<Notification, 'id' | 'createdAt'>) => {
  try {
    const notificationsRef = collection(db, 'notifications');
    const docRef = await addDoc(notificationsRef, {
      ...notification,
      createdAt: new Date().toISOString(),
      read: false
    });
    return docRef.id;
  } catch (error) {
    console.error('Error saving notification:', error);
    return null;
  }
};

// Medicine reminder
export const sendMedicineReminder = async (
  userId: string,
  userName: string,
  medicineName: string, 
  dosage: string, 
  time: string,
  foodTiming?: string
) => {
  const foodText = foodTiming ? ` (${foodTiming} food)` : '';
  const message = `${userName}, time to take ${medicineName} ${dosage}${foodText}`;
  
  await saveNotification({
    userId,
    type: 'reminder',
    title: '💊 Medicine Reminder',
    message,
    priority: 'high',
    read: false
  });

  sendBrowserNotification('💊 Medicine Reminder', message, {
    tag: `reminder-${medicineName}`,
    requireInteraction: true
  });

  return message;
};

// Missed dose alert
export const sendMissedDoseAlert = async (
  userId: string,
  userName: string,
  medicineName: string, 
  time: string
) => {
  const message = `${userName} missed ${medicineName} at ${time}`;
  
  await saveNotification({
    userId,
    type: 'missed_dose',
    title: '⚠️ Missed Dose',
    message,
    priority: 'high',
    read: false
  });

  sendBrowserNotification('⚠️ Missed Dose Alert', message, {
    tag: 'missed-dose',
    requireInteraction: true
  });
};

// Emergency alert
export const sendEmergencyAlert = async (
  userId: string,
  userName: string,
  message: string,
  location?: any
) => {
  const emergencyMessage = `${userName} needs assistance: ${message}`;
  
  await saveNotification({
    userId,
    type: 'emergency',
    title: '🚨 EMERGENCY ALERT',
    message: emergencyMessage,
    data: { location },
    priority: 'emergency',
    read: false
  });

  sendBrowserNotification('🚨 EMERGENCY ALERT', emergencyMessage, {
    tag: 'emergency',
    requireInteraction: true
  });
};

// Appointment reminder
export const sendAppointmentReminder = async (
  userId: string,
  userName: string,
  doctorName: string,
  date: string,
  time: string
) => {
  const formattedDate = new Date(date).toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'long', 
    day: 'numeric' 
  });
  
  const message = `${userName}, you have an appointment with ${doctorName} on ${formattedDate} at ${time}`;
  
  await saveNotification({
    userId,
    type: 'appointment',
    title: '📅 Appointment Reminder',
    message,
    priority: 'medium',
    read: false
  });

  sendBrowserNotification('📅 Appointment Reminder', message, {
    tag: `appointment-${date}`,
    requireInteraction: true
  });
};

// Prescription alert
export const sendPrescriptionAlert = async (
  userId: string,
  userName: string,
  medicineName: string,
  doctorName: string
) => {
  const message = `New prescription: ${medicineName} prescribed by ${doctorName}`;
  
  await saveNotification({
    userId,
    type: 'prescription',
    title: '📋 New Prescription',
    message,
    priority: 'medium',
    read: false
  });

  sendBrowserNotification('📋 New Prescription', message);
};

// Low stock alert
export const sendLowStockAlert = async (
  userId: string,
  userName: string,
  medicineName: string, 
  daysLeft: number
) => {
  const message = `${medicineName} will run out in ${daysLeft} days`;
  
  await saveNotification({
    userId,
    type: 'low_stock',
    title: '📦 Low Stock Alert',
    message,
    priority: 'medium',
    read: false
  });

  sendBrowserNotification('📦 Low Stock Alert', message);
};

// ✅ ADD THIS EXPORT - This is what your components need
export const sendNotification = sendBrowserNotification;