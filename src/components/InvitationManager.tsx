import React, { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  onSnapshot,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Invitation {
  id: string;
  fromUserId: string;
  fromUserEmail: string;
  fromUserName: string;
  toUserId: string;
  toEmail: string;
  toUserName: string;
  relationship: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: any;
}

interface Connection {
  id: string;
  users: string[];
  userEmails: string[];
  relationship: string;
  status: 'active' | 'inactive';
  createdAt: any;
}

interface Notification {
  id: string;
  userId: string;
  type: string;
  invitationId?: string;
  fromUserId: string;
  fromUserName: string;
  message: string;
  read: boolean;
  createdAt: any;
}

const InvitationManager = () => {
  const [email, setEmail] = useState('');
  const [invitations, setInvitations] = useState<{ received: Invitation[]; sent: Invitation[] }>({
    received: [],
    sent: []
  });
  const [connections, setConnections] = useState<Connection[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = async () => {
    if (!auth.currentUser) return;
    
    try {
      // Load received invitations
      const receivedQuery = query(
        collection(db, 'invitations'),
        where('toUserId', '==', auth.currentUser.uid),
        where('status', '==', 'pending')
      );
      const receivedSnapshot = await getDocs(receivedQuery);
      const received = receivedSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Invitation[];

      // Load sent invitations
      const sentQuery = query(
        collection(db, 'invitations'),
        where('fromUserId', '==', auth.currentUser.uid),
        where('status', '==', 'pending')
      );
      const sentSnapshot = await getDocs(sentQuery);
      const sent = sentSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Invitation[];

      // Load connections
      const connectionsQuery = query(
        collection(db, 'connections'),
        where('users', 'array-contains', auth.currentUser.uid),
        where('status', '==', 'active')
      );
      const connectionsSnapshot = await getDocs(connectionsQuery);
      const connectionsData = connectionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Connection[];

      // Load notifications
      const notificationsQuery = query(
        collection(db, 'notifications'),
        where('userId', '==', auth.currentUser.uid),
        where('read', '==', false)
      );
      const notificationsSnapshot = await getDocs(notificationsQuery);
      const notificationsData = notificationsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Notification[];
      
      setInvitations({ received, sent });
      setConnections(connectionsData);
      setNotifications(notificationsData);
    } catch (err) {
      console.error('Load data error:', err);
    }
  };

  useEffect(() => {
    loadData();
    
    // Refresh every 10 seconds
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (!auth.currentUser) throw new Error('You must be logged in');

      // Check if user exists with this email
      const usersQuery = query(
        collection(db, 'users'),
        where('email', '==', email)
      );
      const usersSnapshot = await getDocs(usersQuery);
      
      if (usersSnapshot.empty) {
        throw new Error('User with this email not found');
      }

      const targetUser = usersSnapshot.docs[0];
      const targetUserId = targetUser.id;
      const targetUserData = targetUser.data();

      // Check if already connected
      const connectionsQuery = query(
        collection(db, 'connections'),
        where('users', 'array-contains', auth.currentUser.uid)
      );
      const connectionsSnapshot = await getDocs(connectionsQuery);
      
      let alreadyConnected = false;
      connectionsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.users.includes(targetUserId)) {
          alreadyConnected = true;
        }
      });

      if (alreadyConnected) {
        throw new Error('Already connected with this user');
      }

      // Create invitation
      await addDoc(collection(db, 'invitations'), {
        fromUserId: auth.currentUser.uid,
        fromUserEmail: auth.currentUser.email,
        fromUserName: auth.currentUser.displayName || auth.currentUser.email,
        toUserId: targetUserId,
        toEmail: email,
        toUserName: targetUserData.name || email,
        relationship: 'caregiver-elderly',
        status: 'pending',
        createdAt: serverTimestamp()
      });

      // Create notification
      await addDoc(collection(db, 'notifications'), {
        userId: targetUserId,
        type: 'invitation',
        fromUserId: auth.currentUser.uid,
        fromUserName: auth.currentUser.displayName || auth.currentUser.email,
        message: `You have a new connection request from ${auth.currentUser.displayName || auth.currentUser.email}`,
        read: false,
        createdAt: serverTimestamp()
      });

      setSuccess(`Invitation sent to ${email}`);
      setEmail('');
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (invitationId: string) => {
    setError('');
    try {
      const invitationRef = doc(db, 'invitations', invitationId);
      await updateDoc(invitationRef, {
        status: 'accepted',
        acceptedAt: serverTimestamp()
      });

      // Create connection
      const invitation = invitations.received.find(i => i.id === invitationId);
      if (invitation) {
        const connectionId = [invitation.fromUserId, invitation.toUserId].sort().join('_');
        await addDoc(collection(db, 'connections'), {
          id: connectionId,
          users: [invitation.fromUserId, invitation.toUserId],
          userEmails: [invitation.fromUserEmail, invitation.toEmail],
          relationship: invitation.relationship,
          status: 'active',
          createdAt: serverTimestamp(),
          initiatedBy: invitation.fromUserId
        });

        // Create notification for sender
        await addDoc(collection(db, 'notifications'), {
          userId: invitation.fromUserId,
          type: 'invitation_accepted',
          fromUserId: auth.currentUser?.uid,
          fromUserName: auth.currentUser?.displayName || auth.currentUser?.email,
          message: `${auth.currentUser?.displayName || auth.currentUser?.email} accepted your connection request`,
          read: false,
          createdAt: serverTimestamp()
        });
      }

      setSuccess('Invitation accepted!');
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleReject = async (invitationId: string) => {
    setError('');
    try {
      const invitationRef = doc(db, 'invitations', invitationId);
      await updateDoc(invitationRef, {
        status: 'rejected',
        rejectedAt: serverTimestamp()
      });

      setSuccess('Invitation rejected');
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleNotificationClick = async (notificationId: string) => {
    try {
      const notificationRef = doc(db, 'notifications', notificationId);
      await updateDoc(notificationRef, {
        read: true
      });
      await loadData();
    } catch (err) {
      console.error('Error marking notification:', err);
    }
  };

  if (!auth.currentUser) {
    return <div className="p-4">Please log in to manage connections</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h2 className="text-2xl font-bold mb-6">Connections</h2>

      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">Notifications</h3>
          <div className="space-y-2">
            {notifications.map(notif => (
              <div 
                key={notif.id} 
                className="bg-blue-50 p-3 rounded flex justify-between items-center cursor-pointer"
                onClick={() => handleNotificationClick(notif.id)}
              >
                <span>{notif.message}</span>
                <button className="text-sm text-blue-600">Mark read</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Send Invitation */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-2">Invite Someone</h3>
        <form onSubmit={handleSendInvitation} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter email address"
            className="flex-1 p-2 border rounded"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Sending...' : 'Send Invitation'}
          </button>
        </form>
        {error && <p className="text-red-500 mt-2">{error}</p>}
        {success && <p className="text-green-500 mt-2">{success}</p>}
      </div>

      {/* Received Invitations */}
      {invitations.received.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">Received Invitations</h3>
          <div className="space-y-2">
            {invitations.received.map(inv => (
              <div key={inv.id} className="border p-3 rounded flex justify-between items-center">
                <div>
                  <p className="font-medium">{inv.fromUserName}</p>
                  <p className="text-sm text-gray-600">{inv.fromUserEmail}</p>
                  <p className="text-xs text-gray-500">Status: Pending</p>
                </div>
                <div className="space-x-2">
                  <button
                    onClick={() => handleAccept(inv.id)}
                    className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleReject(inv.id)}
                    className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sent Invitations */}
      {invitations.sent.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">Sent Invitations</h3>
          <div className="space-y-2">
            {invitations.sent.map(inv => (
              <div key={inv.id} className="border p-3 rounded">
                <p className="font-medium">{inv.toUserName || inv.toEmail}</p>
                <p className="text-sm text-gray-600">{inv.toEmail}</p>
                <p className="text-xs text-gray-500">Status: {inv.status}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Connections */}
      {connections.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-2">Your Connections</h3>
          <div className="space-y-2">
            {connections.map(conn => {
              const otherUserId = conn.users.find(id => id !== auth.currentUser?.uid);
              const otherEmail = conn.userEmails.find(email => email !== auth.currentUser?.email);
              return (
                <div key={conn.id} className="border p-3 rounded bg-gray-50">
                  <p className="font-medium">{otherEmail}</p>
                  <p className="text-xs text-green-600">Active Connection</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {invitations.received.length === 0 && 
       invitations.sent.length === 0 && 
       connections.length === 0 && (
        <p className="text-gray-500 text-center py-8">
          No invitations or connections yet. Start by inviting someone!
        </p>
      )}
    </div>
  );
};

export default InvitationManager;