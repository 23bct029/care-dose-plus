import { db } from './firebase';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  getDoc,
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot,
  orderBy,
  limit 
} from 'firebase/firestore';
import { sendBrowserNotification } from './notifications';

export interface Connection {
  id?: string;
  fromId: string;
  fromName: string;
  fromRole: string;
  fromEmail: string;
  fromAvatar?: string;
  fromPhone?: string;
  toId?: string;
  toEmail: string;
  toRole: string;
  toName?: string;
  toPhone?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'blocked';
  type: 'invitation' | 'connection' | 'block';
  message?: string;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
}

class ConnectionService {
  // Send connection invitation
  async sendInvitation(
    fromUserId: string,
    fromUser: any,
    toEmail: string,
    toRole: string,
    message?: string
  ) {
    try {
      // Check if user exists with this email
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', toEmail));
      const snapshot = await getDocs(q);
      
      let toUserId = null;
      let toUserName = null;
      let toUserPhone = null;
      
      if (!snapshot.empty) {
        const userDoc = snapshot.docs[0];
        toUserId = userDoc.id;
        toUserName = userDoc.data().name;
        toUserPhone = userDoc.data().phone;
      } else {
        // If user doesn't exist, we can still send invitation
        // They'll need to sign up first
        console.log('User not found, sending pending invitation');
      }

      // Create invitation
      const invitation: Omit<Connection, 'id'> = {
        fromId: fromUserId,
        fromName: fromUser.name || '',
        fromRole: fromUser.role || '',
        fromEmail: fromUser.email || '',
        fromAvatar: fromUser.avatar || null,
        fromPhone: fromUser.phone || null,
        toEmail,
        toRole,
        toId: toUserId || undefined,
        toName: toUserName || null,
        toPhone: toUserPhone || null,
        status: 'pending',
        type: 'invitation',
        message: message || `I'd like to connect with you as your ${fromUser.role || 'caregiver'}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'connections'), invitation);

      // Create notification for the recipient if they exist
      if (toUserId) {
        await this.createNotification(
          toUserId,
          'connection_request',
          `New Connection Request`,
          `${fromUser.name} (${fromUser.role}) wants to connect with you`,
          { 
            connectionId: docRef.id,
            fromId: fromUserId,
            fromName: fromUser.name,
            fromRole: fromUser.role 
          }
        );
      }

      return { success: true, id: docRef.id };
    } catch (error: any) {
      console.error('Error sending invitation:', error);
      return { success: false, error: error.message };
    }
  }

  // Create notification
  async createNotification(
    userId: string,
    type: string,
    title: string,
    body: string,
    data?: any
  ) {
    try {
      const notificationRef = collection(db, 'notifications');
      await addDoc(notificationRef, {
        userId,
        type,
        title,
        body,
        data,
        read: false,
        createdAt: new Date().toISOString()
      });

      // Send push notification if browser permission granted
      sendBrowserNotification(title, body, {
        tag: type,
        data,
        onClick: () => {
          window.focus();
          window.location.href = '/connections';
        }
      });
    } catch (error) {
      console.error('Error creating notification:', error);
    }
  }

  // Get real-time connections for a user
  subscribeToConnections(userId: string, callback: (connections: Connection[]) => void) {
    const q = query(
      collection(db, 'connections'),
      where('toId', '==', userId),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const connections: Connection[] = [];
      snapshot.forEach((doc) => {
        connections.push({ id: doc.id, ...doc.data() } as Connection);
      });
      callback(connections);
    });
  }

  // Get all active connections for a user
  async getActiveConnections(userId: string): Promise<Connection[]> {
    const q = query(
      collection(db, 'connections'),
      where('status', '==', 'accepted'),
      where('toId', '==', userId)
    );
    
    const snapshot = await getDocs(q);
    const connections: Connection[] = [];
    snapshot.forEach((doc) => {
      connections.push({ id: doc.id, ...doc.data() } as Connection);
    });
    return connections;
  }

  // Get connections where user is the sender
  async getSentConnections(userId: string): Promise<Connection[]> {
    const q = query(
      collection(db, 'connections'),
      where('fromId', '==', userId),
      where('status', '==', 'pending')
    );
    
    const snapshot = await getDocs(q);
    const connections: Connection[] = [];
    snapshot.forEach((doc) => {
      connections.push({ id: doc.id, ...doc.data() } as Connection);
    });
    return connections;
  }

  // Accept connection
  async acceptConnection(connectionId: string, userId: string) {
    try {
      const connectionRef = doc(db, 'connections', connectionId);
      const connectionSnap = await getDoc(connectionRef);
      
      if (!connectionSnap.exists()) {
        return { success: false, error: 'Connection not found' };
      }

      const connectionData = connectionSnap.data() as Connection;

      await updateDoc(connectionRef, {
        status: 'accepted',
        toId: userId,
        acceptedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Create notification for the sender
      await this.createNotification(
        connectionData.fromId,
        'connection_accepted',
        'Connection Accepted',
        `${connectionData.toName || connectionData.toEmail} accepted your connection request`,
        { connectionId }
      );

      return { success: true };
    } catch (error: any) {
      console.error('Error accepting connection:', error);
      return { success: false, error: error.message };
    }
  }

  // Reject connection
  async rejectConnection(connectionId: string) {
    try {
      const connectionRef = doc(db, 'connections', connectionId);
      await updateDoc(connectionRef, {
        status: 'rejected',
        updatedAt: new Date().toISOString()
      });
      return { success: true };
    } catch (error: any) {
      console.error('Error rejecting connection:', error);
      return { success: false, error: error.message };
    }
  }

  // Remove connection (delete)
  async removeConnection(connectionId: string) {
    try {
      await deleteDoc(doc(db, 'connections', connectionId));
      return { success: true };
    } catch (error: any) {
      console.error('Error removing connection:', error);
      return { success: false, error: error.message };
    }
  }

  // Get single connection
  async getConnection(connectionId: string): Promise<Connection | null> {
    const docRef = doc(db, 'connections', connectionId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Connection : null;
  }
}

export const connectionService = new ConnectionService();