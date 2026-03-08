// src/pages/Connections.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '@/lib/firebase';
import { 
  collection, query, where, onSnapshot, 
  addDoc, updateDoc, doc, serverTimestamp, orderBy,
  getDocs
} from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, UserPlus, UserCheck, UserX, 
  Bell, Clock, ArrowLeft, MessageSquare, Phone, Mail,
  CheckCircle, XCircle
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
  fromUserId: string;
  fromUserName: string;
  message: string;
  read: boolean;
  createdAt: any;
}

const Connections = () => {
  const [user, setUser] = useState(auth.currentUser);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [invitations, setInvitations] = useState<{ received: Invitation[]; sent: Invitation[] }>({
    received: [],
    sent: []
  });
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      setUser(user);
    });
    return () => unsubscribeAuth();
  }, []);

  // Real-time listeners
  useEffect(() => {
    if (!user) return;

    // Received invitations
    const receivedQuery = query(
      collection(db, 'invitations'),
      where('toUserId', '==', user.uid),
      where('status', '==', 'pending')
    );
    
    const unsubscribeReceived = onSnapshot(receivedQuery, (snapshot) => {
      const received = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Invitation[];
      setInvitations(prev => ({ ...prev, received }));
    });

    // Sent invitations
    const sentQuery = query(
      collection(db, 'invitations'),
      where('fromUserId', '==', user.uid),
      where('status', '==', 'pending')
    );
    
    const unsubscribeSent = onSnapshot(sentQuery, (snapshot) => {
      const sent = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Invitation[];
      setInvitations(prev => ({ ...prev, sent }));
    });

    // Active connections
    const connectionsQuery = query(
      collection(db, 'connections'),
      where('users', 'array-contains', user.uid),
      where('status', '==', 'active')
    );
    
    const unsubscribeConnections = onSnapshot(connectionsQuery, (snapshot) => {
      const connectionsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Connection[];
      setConnections(connectionsData);
    });

    // Notifications
    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      where('read', '==', false),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribeNotifications = onSnapshot(notificationsQuery, (snapshot) => {
      const notificationsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Notification[];
      setNotifications(notificationsData);
    });

    return () => {
      unsubscribeReceived();
      unsubscribeSent();
      unsubscribeConnections();
      unsubscribeNotifications();
    };
  }, [user]);

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (!user) throw new Error('You must be logged in');

      // Find user by email
      const usersQuery = query(
        collection(db, 'users'),
        where('email', '==', inviteEmail)
      );
      const usersSnapshot = await getDocs(usersQuery);
      
      if (usersSnapshot.empty) {
        throw new Error('User with this email not found');
      }

      const targetUser = usersSnapshot.docs[0];
      const targetUserId = targetUser.id;
      const targetUserData = targetUser.data();

      // Check if already connected
      const existingConnection = connections.find(conn => 
        conn.users.includes(targetUserId)
      );
      
      if (existingConnection) {
        throw new Error('Already connected with this user');
      }

      // Check for existing pending invitation
      const existingInvite = invitations.sent.find(inv => 
        inv.toUserId === targetUserId
      );
      
      if (existingInvite) {
        throw new Error('Invitation already sent to this user');
      }

      // Create invitation
      await addDoc(collection(db, 'invitations'), {
        fromUserId: user.uid,
        fromUserEmail: user.email,
        fromUserName: user.displayName || user.email,
        toUserId: targetUserId,
        toEmail: inviteEmail,
        toUserName: targetUserData.name || inviteEmail,
        relationship: 'connection',
        status: 'pending',
        createdAt: serverTimestamp()
      });

      // Create notification for recipient
      await addDoc(collection(db, 'notifications'), {
        userId: targetUserId,
        type: 'invitation',
        fromUserId: user.uid,
        fromUserName: user.displayName || user.email,
        message: `You have a new connection request from ${user.displayName || user.email}`,
        read: false,
        createdAt: serverTimestamp()
      });

      setSuccess(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (invitationId: string) => {
    try {
      const invitationRef = doc(db, 'invitations', invitationId);
      await updateDoc(invitationRef, {
        status: 'accepted',
        acceptedAt: serverTimestamp()
      });

      const invitation = invitations.received.find(i => i.id === invitationId);
      
      if (invitation) {
        // Create connection
        await addDoc(collection(db, 'connections'), {
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
          fromUserId: user?.uid,
          fromUserName: user?.displayName || user?.email,
          message: `${user?.displayName || user?.email} accepted your connection request`,
          read: false,
          createdAt: serverTimestamp()
        });
      }

      setSuccess('Invitation accepted!');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleReject = async (invitationId: string) => {
    try {
      const invitationRef = doc(db, 'invitations', invitationId);
      await updateDoc(invitationRef, {
        status: 'rejected',
        rejectedAt: serverTimestamp()
      });
      setSuccess('Invitation rejected');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleMarkRead = async (notificationId: string) => {
    try {
      const notificationRef = doc(db, 'notifications', notificationId);
      await updateDoc(notificationRef, { read: true });
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const getOtherUser = (connection: Connection) => {
    const otherUserId = connection.users.find(id => id !== user?.uid);
    const otherEmail = connection.userEmails.find(email => email !== user?.email);
    return { id: otherUserId, email: otherEmail };
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">Please log in to manage connections</p>
            <Button onClick={() => navigate('/login')}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold">Manage Connections</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card className="max-w-4xl mx-auto">
          <CardContent className="p-6">
            <Tabs defaultValue="connections" className="space-y-6">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="connections">
                  Connections ({connections.length})
                </TabsTrigger>
                <TabsTrigger value="received" className="relative">
                  Received ({invitations.received.length})
                  {invitations.received.length > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">
                      {invitations.received.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="sent">
                  Sent ({invitations.sent.length})
                </TabsTrigger>
                <TabsTrigger value="notifications" className="relative">
                  Notifications
                  {notifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">
                      {notifications.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Send Invitation Form - Shows in all tabs */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <form onSubmit={handleSendInvitation} className="flex gap-2">
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="Enter email address to invite"
                    className="flex-1"
                    required
                  />
                  <Button type="submit" disabled={loading}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    {loading ? 'Sending...' : 'Invite'}
                  </Button>
                </form>
                {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
                {success && <p className="text-green-500 text-sm mt-2">{success}</p>}
              </div>

              {/* Connections Tab */}
              <TabsContent value="connections" className="space-y-4">
                {connections.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No connections yet</p>
                    <p className="text-sm text-gray-400 mt-2">
                      Invite someone to get started
                    </p>
                  </div>
                ) : (
                  connections.map((conn) => {
                    const other = getOtherUser(conn);
                    return (
                      <div key={conn.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback className="bg-blue-100 text-blue-600">
                              {other.email?.[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{other.email}</p>
                            <p className="text-xs text-green-600">Connected</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm">
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Phone className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Mail className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </TabsContent>

              {/* Received Invitations Tab */}
              <TabsContent value="received" className="space-y-4">
                {invitations.received.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No pending invitations</p>
                  </div>
                ) : (
                  invitations.received.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-medium">{inv.fromUserName}</p>
                        <p className="text-sm text-gray-600">{inv.fromUserEmail}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => handleAccept(inv.id)}
                        >
                          <UserCheck className="h-4 w-4 mr-1" />
                          Accept
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => handleReject(inv.id)}
                        >
                          <UserX className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              {/* Sent Invitations Tab */}
              <TabsContent value="sent" className="space-y-4">
                {invitations.sent.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No pending invitations sent</p>
                  </div>
                ) : (
                  invitations.sent.map((inv) => (
                    <div key={inv.id} className="p-4 border rounded-lg">
                      <p className="font-medium">{inv.toUserName || inv.toEmail}</p>
                      <p className="text-sm text-gray-600">{inv.toEmail}</p>
                      <Badge variant="outline" className="mt-2">Pending</Badge>
                    </div>
                  ))
                )}
              </TabsContent>

              {/* Notifications Tab */}
              <TabsContent value="notifications" className="space-y-4">
                {notifications.length === 0 ? (
                  <div className="text-center py-8">
                    <Bell className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No new notifications</p>
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div 
                      key={notif.id} 
                      className="p-4 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-100"
                      onClick={() => handleMarkRead(notif.id)}
                    >
                      <p className="text-sm">{notif.message}</p>
                      <p className="text-xs text-blue-600 mt-1">Click to mark as read</p>
                    </div>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Connections;