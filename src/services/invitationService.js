import { db, auth } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  getDoc,
  serverTimestamp,
  arrayUnion,
  setDoc
} from 'firebase/firestore';

// Send invitation
export const sendInvitation = async (email, relationship = 'caregiver-elderly') => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('You must be logged in');

    // Check if trying to invite yourself
    if (currentUser.email === email) {
      throw new Error('You cannot invite yourself');
    }

    // Find user by email
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      throw new Error('User with this email not found');
    }

    const targetUser = querySnapshot.docs[0];
    const targetUserId = targetUser.id;

    // Check if invitation already exists
    const invitationsRef = collection(db, 'invitations');
    const existingQuery = query(
      invitationsRef,
      where('fromUserId', '==', currentUser.uid),
      where('toUserId', '==', targetUserId),
      where('status', '==', 'pending')
    );
    const existingInvites = await getDocs(existingQuery);

    if (!existingInvites.empty) {
      throw new Error('Invitation already sent');
    }

    // Check if already connected
    const connectionsRef = collection(db, 'connections');
    const connectionQuery = query(
      connectionsRef,
      where('users', 'array-contains', currentUser.uid)
    );
    const connections = await getDocs(connectionQuery);
    
    let alreadyConnected = false;
    connections.forEach(doc => {
      const data = doc.data();
      if (data.users.includes(targetUserId)) {
        alreadyConnected = true;
      }
    });

    if (alreadyConnected) {
      throw new Error('Already connected with this user');
    }

    // Create invitation
    const invitation = {
      fromUserId: currentUser.uid,
      fromUserEmail: currentUser.email,
      fromUserName: currentUser.displayName || currentUser.email,
      toUserId: targetUserId,
      toEmail: email,
      toUserName: targetUser.data().name || email,
      relationship: relationship,
      status: 'pending',
      createdAt: serverTimestamp()
    };

    const invitationRef = await addDoc(invitationsRef, invitation);

    // Create notification for recipient
    const notificationRef = collection(db, 'notifications');
    await addDoc(notificationRef, {
      userId: targetUserId,
      type: 'invitation',
      invitationId: invitationRef.id,
      fromUserId: currentUser.uid,
      fromUserName: currentUser.displayName || currentUser.email,
      message: `You have a new connection request from ${currentUser.displayName || currentUser.email}`,
      read: false,
      createdAt: serverTimestamp()
    });

    return { success: true, invitationId: invitationRef.id };
  } catch (error) {
    console.error('Send invitation error:', error);
    throw error;
  }
};

// Accept invitation
export const acceptInvitation = async (invitationId) => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('You must be logged in');

    // Get invitation
    const invitationRef = doc(db, 'invitations', invitationId);
    const invitationSnap = await getDoc(invitationRef);
    
    if (!invitationSnap.exists()) {
      throw new Error('Invitation not found');
    }

    const invitation = invitationSnap.data();

    // Verify this invitation is for current user
    if (invitation.toUserId !== currentUser.uid) {
      throw new Error('This invitation is not for you');
    }

    // Update invitation status
    await updateDoc(invitationRef, {
      status: 'accepted',
      acceptedAt: serverTimestamp()
    });

    // Create connection
    const connectionId = [invitation.fromUserId, currentUser.uid].sort().join('_');
    const connectionRef = doc(db, 'connections', connectionId);
    
    await setDoc(connectionRef, {
      users: [invitation.fromUserId, currentUser.uid],
      userEmails: [invitation.fromUserEmail, currentUser.email],
      relationship: invitation.relationship,
      status: 'active',
      createdAt: serverTimestamp(),
      initiatedBy: invitation.fromUserId
    });

    // Create notification for inviter
    const notificationRef = collection(db, 'notifications');
    await addDoc(notificationRef, {
      userId: invitation.fromUserId,
      type: 'invitation_accepted',
      fromUserId: currentUser.uid,
      fromUserName: currentUser.displayName || currentUser.email,
      message: `${currentUser.displayName || currentUser.email} accepted your connection request`,
      read: false,
      createdAt: serverTimestamp()
    });

    return { success: true, connectionId };
  } catch (error) {
    console.error('Accept invitation error:', error);
    throw error;
  }
};

// Reject invitation
export const rejectInvitation = async (invitationId) => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('You must be logged in');

    const invitationRef = doc(db, 'invitations', invitationId);
    await updateDoc(invitationRef, {
      status: 'rejected',
      rejectedAt: serverTimestamp()
    });

    return { success: true };
  } catch (error) {
    console.error('Reject invitation error:', error);
    throw error;
  }
};

// Get user's invitations
export const getUserInvitations = async () => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) return [];

    // Received invitations
    const receivedQuery = query(
      collection(db, 'invitations'),
      where('toUserId', '==', currentUser.uid),
      where('status', '==', 'pending')
    );
    
    // Sent invitations
    const sentQuery = query(
      collection(db, 'invitations'),
      where('fromUserId', '==', currentUser.uid),
      where('status', '==', 'pending')
    );

    const [receivedSnap, sentSnap] = await Promise.all([
      getDocs(receivedQuery),
      getDocs(sentQuery)
    ]);

    const received = receivedSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      type: 'received'
    }));

    const sent = sentSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      type: 'sent'
    }));

    return { received, sent };
  } catch (error) {
    console.error('Get invitations error:', error);
    return { received: [], sent: [] };
  }
};

// Get user's connections
export const getUserConnections = async () => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) return [];

    const connectionsRef = collection(db, 'connections');
    const q = query(
      connectionsRef,
      where('users', 'array-contains', currentUser.uid),
      where('status', '==', 'active')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Get connections error:', error);
    return [];
  }
};

// Get user's notifications
export const getUserNotifications = async () => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) return [];

    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', currentUser.uid),
      where('read', '==', false)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Get notifications error:', error);
    return [];
  }
};

// Mark notification as read
export const markNotificationRead = async (notificationId) => {
  try {
    const notificationRef = doc(db, 'notifications', notificationId);
    await updateDoc(notificationRef, { read: true });
    return { success: true };
  } catch (error) {
    console.error('Mark notification read error:', error);
    throw error;
  }
};