import React from 'react';
import { auth, db } from '@/lib/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  deleteDoc
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Users, 
  UserPlus, 
  Check, 
  X, 
  Clock, 
  Bell,
  Mail,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Send,
  UserCheck
} from 'lucide-react';

interface Connection {
  id: string;
  users: string[];
  userEmails: string[];
  relationship: string;
  status: 'active' | 'inactive';
  createdAt: any;
}

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

interface ConnectionsPanelProps {
  userRole: 'elderly' | 'caregiver' | 'doctor';
}

const ConnectionsPanel: React.FC<ConnectionsPanelProps> = ({ userRole }) => {
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
  const [activeTab, setActiveTab] = useState('connections');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteType, setConfirmDeleteType] = useState<'connection' | 'invitation'>('connection');

  useEffect(() => {
    if (!auth.currentUser) return;

    const receivedQuery = query(
      collection(db, 'invitations'),
      where('toUserId', '==', auth.currentUser.uid),
      where('status', '==', 'pending')
    );
    const unsubscribeReceived = onSnapshot(receivedQuery, (snapshot) => {
      const received = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Invitation[];
      setInvitations(prev => ({ ...prev, received }));
    });

    const sentQuery = query(
      collection(db, 'invitations'),
      where('fromUserId', '==', auth.currentUser.uid),
      where('status', '==', 'pending')
    );
    const unsubscribeSent = onSnapshot(sentQuery, (snapshot) => {
      const sent = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Invitation[];
      setInvitations(prev => ({ ...prev, sent }));
    });

    const connectionsQuery = query(
      collection(db, 'connections'),
      where('users', 'array-contains', auth.currentUser.uid),
      where('status', '==', 'active')
    );
    const unsubscribeConnections = onSnapshot(connectionsQuery, (snapshot) => {
      const connectionsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Connection[];
      setConnections(connectionsData);
    });

    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', auth.currentUser.uid),
      where('read', '==', false)
    );
    const unsubscribeNotifications = onSnapshot(notificationsQuery, (snapshot) => {
      const notificationsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Notification[];
      notificationsData.sort((a: any, b: any) => {
        const at = a.createdAt?.toMillis?.() || 0;
        const bt = b.createdAt?.toMillis?.() || 0;
        return bt - at;
      });
      setNotifications(notificationsData);
    });

    return () => {
      unsubscribeReceived();
      unsubscribeSent();
      unsubscribeConnections();
      unsubscribeNotifications();
    };
  }, []);

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (!auth.currentUser) throw new Error('You must be logged in');

      const trimmedEmail = email.trim().toLowerCase();
      if (trimmedEmail === auth.currentUser.email?.toLowerCase()) {
        throw new Error('You cannot connect with yourself');
      }

      const usersQuery = query(collection(db, 'users'), where('email', '==', trimmedEmail));
      const usersSnapshot = await getDocs(usersQuery);
      
      if (usersSnapshot.empty) {
        throw new Error('No user found with this email address');
      }

      const targetUser = usersSnapshot.docs[0];
      const targetUserId = targetUser.id;
      const targetUserData = targetUser.data();

      const alreadyConnected = connections.some(conn => conn.users.includes(targetUserId));
      if (alreadyConnected) throw new Error('You are already connected with this user');

      const alreadySent = invitations.sent.some(inv => inv.toUserId === targetUserId);
      if (alreadySent) throw new Error('You already have a pending invitation to this user');

      const relationship = userRole === 'elderly' ? 'elderly-caregiver'
        : userRole === 'caregiver' ? 'caregiver-elderly'
        : 'doctor-patient';

      await addDoc(collection(db, 'invitations'), {
        fromUserId: auth.currentUser.uid,
        fromUserEmail: auth.currentUser.email,
        fromUserName: auth.currentUser.displayName || auth.currentUser.email,
        toUserId: targetUserId,
        toEmail: trimmedEmail,
        toUserName: targetUserData.name || trimmedEmail,
        relationship,
        status: 'pending',
        createdAt: serverTimestamp()
      });

      await addDoc(collection(db, 'notifications'), {
        userId: targetUserId,
        type: 'invitation',
        fromUserId: auth.currentUser.uid,
        fromUserName: auth.currentUser.displayName || auth.currentUser.email,
        message: `You have a new connection request from ${auth.currentUser.displayName || auth.currentUser.email}`,
        read: false,
        createdAt: serverTimestamp()
      });

      setSuccess(`Invitation sent to ${trimmedEmail}`);
      setEmail('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (invitationId: string) => {
    try {
      const invitationRef = doc(db, 'invitations', invitationId);
      await updateDoc(invitationRef, { status: 'accepted', acceptedAt: serverTimestamp() });

      const invitation = invitations.received.find(i => i.id === invitationId);
      if (invitation) {
        const connectionId = [invitation.fromUserId, invitation.toUserId].sort().join('_');
        await setDoc(doc(db, 'connections', connectionId), {
          users: [invitation.fromUserId, invitation.toUserId],
          userEmails: [invitation.fromUserEmail, invitation.toEmail],
          relationship: invitation.relationship,
          status: 'active',
          createdAt: serverTimestamp(),
          initiatedBy: invitation.fromUserId
        });

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
      setSuccess('Connection established!');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleReject = async (invitationId: string) => {
    try {
      await updateDoc(doc(db, 'invitations', invitationId), {
        status: 'rejected',
        rejectedAt: serverTimestamp()
      });
      setSuccess('Invitation declined');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteConnection = async (connectionId: string) => {
    try {
      await deleteDoc(doc(db, 'connections', connectionId));
      setSuccess('Connection removed');
      setConfirmDeleteId(null);
    } catch (err: any) {
      setError('Failed to remove connection');
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      await updateDoc(doc(db, 'invitations', invitationId), {
        status: 'rejected',
        rejectedAt: serverTimestamp()
      });
      setSuccess('Invitation cancelled');
      setConfirmDeleteId(null);
    } catch (err: any) {
      setError('Failed to cancel invitation');
    }
  };

  const handleMarkNotificationRead = async (notificationId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), { read: true });
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await Promise.all(notifications.map(n =>
        updateDoc(doc(db, 'notifications', n.id), { read: true })
      ));
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
    }
  };

  const getOtherUser = (connection: Connection) => {
    const otherUserId = connection.users.find(id => id !== auth.currentUser?.uid);
    const otherEmail = connection.userEmails.find(e => e !== auth.currentUser?.email);
    return { id: otherUserId, email: otherEmail };
  };

  const getRoleLabel = () => {
    if (userRole === 'doctor') return 'patient';
    if (userRole === 'caregiver') return 'elderly person';
    return 'caregiver or doctor';
  };

  const getRelationshipLabel = (relationship: string) => {
    if (relationship.includes('doctor')) return 'Doctor–Patient';
    if (relationship.includes('caregiver')) return 'Caregiver–Elderly';
    return relationship;
  };

  if (!auth.currentUser) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Please log in to manage connections</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="w-full max-w-3xl mx-auto shadow-xl">
        <CardHeader className="pb-3 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Users className="h-5 w-5 text-blue-600" />
              Manage Connections
            </CardTitle>
            <div className="flex items-center gap-2">
              {notifications.length > 0 && (
                <Badge className="bg-red-500 text-white animate-pulse">
                  {notifications.length} new
                </Badge>
              )}
              <Badge variant="outline" className="text-gray-600">
                {connections.length} active
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4">
          {/* Send Invitation Form */}
          <div className="mb-5 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
            <p className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Invite a {getRoleLabel()}
            </p>
            <form onSubmit={handleSendInvitation} className="flex gap-2">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={`Enter ${getRoleLabel()}'s email address`}
                className="flex-1 bg-white border-blue-200 focus:border-blue-400"
                required
              />
              <Button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
              >
                <Send className="h-4 w-4 mr-2" />
                {loading ? 'Sending…' : 'Send'}
              </Button>
            </form>
            {error && (
              <p className="text-red-600 text-sm mt-2 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> {error}
              </p>
            )}
            {success && (
              <p className="text-green-600 text-sm mt-2 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> {success}
              </p>
            )}
          </div>

          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setError(''); setSuccess(''); }}>
            <TabsList className="w-full bg-gray-100 p-1 rounded-lg">
              <TabsTrigger value="connections" className="flex-1 rounded-md text-sm py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700 font-medium">
                <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                Active ({connections.length})
              </TabsTrigger>
              <TabsTrigger value="received" className="flex-1 rounded-md text-sm py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-green-700 font-medium">
                <Clock className="h-3.5 w-3.5 mr-1.5" />
                Received
                {invitations.received.length > 0 && (
                  <span className="ml-1.5 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5">{invitations.received.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="sent" className="flex-1 rounded-md text-sm py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-purple-700 font-medium">
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Sent ({invitations.sent.length})
              </TabsTrigger>
              <TabsTrigger value="notifications" className="flex-1 rounded-md text-sm py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-orange-700 font-medium">
                <Bell className="h-3.5 w-3.5 mr-1.5" />
                Alerts
                {notifications.length > 0 && (
                  <span className="ml-1.5 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5">{notifications.length}</span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Active Connections */}
            <TabsContent value="connections" className="mt-4 space-y-3">
              {connections.length === 0 ? (
                <div className="text-center py-10">
                  <Users className="h-14 w-14 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No active connections</p>
                  <p className="text-sm text-gray-400 mt-1">Send an invitation above to get started</p>
                </div>
              ) : (
                connections.map(conn => {
                  const other = getOtherUser(conn);
                  const initial = other.email?.[0]?.toUpperCase() || '?';
                  return (
                    <div key={conn.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all group">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-semibold">
                            {initial}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-gray-800">{other.email}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block"></span>
                              Connected
                            </span>
                            <span className="text-xs text-gray-400">• {getRelationshipLabel(conn.relationship)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 items-center">
                        <a href={`mailto:${other.email}`}>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-blue-50 hover:text-blue-600">
                            <Mail className="h-4 w-4" />
                          </Button>
                        </a>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => { setConfirmDeleteId(conn.id); setConfirmDeleteType('connection'); }}
                          title="Remove connection"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </TabsContent>

            {/* Received Invitations */}
            <TabsContent value="received" className="mt-4 space-y-3">
              {invitations.received.length === 0 ? (
                <div className="text-center py-10">
                  <Clock className="h-14 w-14 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No pending invitations</p>
                  <p className="text-sm text-gray-400 mt-1">Invitations sent to you will appear here</p>
                </div>
              ) : (
                invitations.received.map(inv => (
                  <div key={inv.id} className="p-4 border border-green-200 bg-green-50 rounded-xl">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarFallback className="bg-gradient-to-br from-green-500 to-emerald-600 text-white font-semibold">
                            {inv.fromUserName?.[0]?.toUpperCase() || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-gray-800">{inv.fromUserName}</p>
                          <p className="text-sm text-gray-500">{inv.fromUserEmail}</p>
                          <span className="text-xs text-green-700 mt-1 bg-green-100 px-2 py-0.5 rounded-full inline-block">
                            {getRelationshipLabel(inv.relationship)}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => handleAccept(inv.id)}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => handleReject(inv.id)}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Decline
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            {/* Sent Invitations */}
            <TabsContent value="sent" className="mt-4 space-y-3">
              {invitations.sent.length === 0 ? (
                <div className="text-center py-10">
                  <Send className="h-14 w-14 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No pending sent invitations</p>
                  <p className="text-sm text-gray-400 mt-1">Invitations you send will appear here</p>
                </div>
              ) : (
                invitations.sent.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-xl group hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-gradient-to-br from-purple-500 to-indigo-600 text-white font-semibold">
                          {(inv.toUserName || inv.toEmail)?.[0]?.toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-semibold text-gray-800">{inv.toUserName || inv.toEmail}</p>
                        <p className="text-sm text-gray-500">{inv.toEmail}</p>
                        <Badge variant="outline" className="mt-1 text-xs border-yellow-300 text-yellow-700 bg-yellow-50">
                          <Clock className="h-3 w-3 mr-1" /> Awaiting response
                        </Badge>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => { setConfirmDeleteId(inv.id); setConfirmDeleteType('invitation'); }}
                      title="Cancel invitation"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                  </div>
                ))
              )}
            </TabsContent>

            {/* Notifications */}
            <TabsContent value="notifications" className="mt-4 space-y-3">
              {notifications.length > 0 && (
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" className="text-blue-600 text-xs" onClick={handleMarkAllRead}>
                    Mark all as read
                  </Button>
                </div>
              )}
              {notifications.length === 0 ? (
                <div className="text-center py-10">
                  <Bell className="h-14 w-14 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">All caught up!</p>
                  <p className="text-sm text-gray-400 mt-1">No new notifications</p>
                </div>
              ) : (
                notifications.map(notif => (
                  <div
                    key={notif.id}
                    className="p-4 bg-blue-50 border border-blue-200 rounded-xl cursor-pointer hover:bg-blue-100 transition-all flex items-start gap-3"
                    onClick={() => handleMarkNotificationRead(notif.id)}
                  >
                    <Bell className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-gray-800">{notif.message}</p>
                      <p className="text-xs text-blue-500 mt-1">Click to dismiss</p>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Confirm Delete Dialog */}
      <Dialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
        <DialogContent className="max-w-sm" aria-describedby="confirm-delete-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              {confirmDeleteType === 'connection' ? 'Remove Connection' : 'Cancel Invitation'}
            </DialogTitle>
          </DialogHeader>
          <p id="confirm-delete-desc" className="text-gray-600 text-sm">
            {confirmDeleteType === 'connection'
              ? 'Are you sure you want to remove this connection? This action cannot be undone.'
              : 'Are you sure you want to cancel this pending invitation?'}
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmDeleteId(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => {
                if (!confirmDeleteId) return;
                if (confirmDeleteType === 'connection') {
                  handleDeleteConnection(confirmDeleteId);
                } else {
                  handleCancelInvitation(confirmDeleteId);
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {confirmDeleteType === 'connection' ? 'Remove' : 'Cancel Invite'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ConnectionsPanel;
