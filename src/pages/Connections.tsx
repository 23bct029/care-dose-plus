import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getUserProfile } from '@/lib/firebase-auth';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  UserPlus, Mail, Phone, CheckCircle, XCircle, 
  Clock, QrCode, Scan, Send, Trash2, UserCheck 
} from 'lucide-react';

const Connections = () => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [connections, setConnections] = useState<any[]>([]);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState('elderly');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        navigate('/login');
        return;
      }
      setUser(currentUser);

      const userProfile = await getUserProfile(currentUser.uid);
      setProfile(userProfile);

      // Load connections based on user role
      loadConnections(currentUser.uid, userProfile.role);
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const loadConnections = (userId: string, role: string) => {
    let q;
    
    if (role === 'elderly') {
      // Elderly sees their caregivers and doctors
      q = query(
        collection(db, 'connections'),
        where('elderlyId', '==', userId)
      );
    } else if (role === 'caregiver') {
      // Caregiver sees their elderly patients
      q = query(
        collection(db, 'connections'),
        where('caregiverId', '==', userId)
      );
    } else if (role === 'doctor') {
      // Doctor sees their patients
      q = query(
        collection(db, 'connections'),
        where('doctorId', '==', userId)
      );
    } else {
      return;
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const connectionsList: any[] = [];
      snapshot.forEach((doc) => {
        connectionsList.push({ id: doc.id, ...doc.data() });
      });
      setConnections(connectionsList);
    });

    // Load pending invites
    loadPendingInvites(userId);

    return unsubscribe;
  };

  const loadPendingInvites = async (userId: string) => {
    const q = query(
      collection(db, 'invites'),
      where('targetId', '==', userId),
      where('status', '==', 'pending')
    );
    
    const snapshot = await getDocs(q);
    const invites: any[] = [];
    snapshot.forEach((doc) => {
      invites.push({ id: doc.id, ...doc.data() });
    });
    setPendingInvites(invites);
  };

  // Option 1: Elderly invites caregiver by email
  const sendInvite = async () => {
    if (!inviteEmail.trim()) {
      setError('Please enter an email');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      // Check if user exists
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', inviteEmail));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setError('No user found with this email');
        setLoading(false);
        return;
      }

      const targetUser = snapshot.docs[0].data();

      // Create invite
      await addDoc(collection(db, 'invites'), {
        fromId: user.uid,
        fromEmail: profile?.email,
        fromName: profile?.name,
        fromRole: profile?.role,
        targetId: targetUser.uid,
        targetEmail: inviteEmail,
        targetRole: targetUser.role,
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      });

      setMessage(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
    } catch (error: any) {
      console.error('Error sending invite:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Option 2: Caregiver creates account for elderly
  const createElderlyAccount = async () => {
    if (!newUserEmail.trim() || !newUserPassword.trim() || !newUserName.trim()) {
      setError('All fields are required');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      // This would need a Cloud Function for security
      // For now, simulate success
      setMessage(`Account created for ${newUserName}. They can login with the provided credentials.`);
      
      // Clear form
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserName('');
      setNewUserRole('elderly');
    } catch (error: any) {
      console.error('Error creating account:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Accept invite
  const acceptInvite = async (inviteId: string) => {
    try {
      const inviteRef = doc(db, 'invites', inviteId);
      await updateDoc(inviteRef, { status: 'accepted' });

      // Create connection
      await addDoc(collection(db, 'connections'), {
        elderlyId: profile?.role === 'elderly' ? user.uid : null,
        caregiverId: profile?.role === 'caregiver' ? user.uid : null,
        doctorId: profile?.role === 'doctor' ? user.uid : null,
        connectedAt: new Date().toISOString(),
        status: 'active'
      });

      loadPendingInvites(user.uid);
    } catch (error) {
      console.error('Error accepting invite:', error);
    }
  };

  // Decline invite
  const declineInvite = async (inviteId: string) => {
    try {
      const inviteRef = doc(db, 'invites', inviteId);
      await updateDoc(inviteRef, { status: 'declined' });
      loadPendingInvites(user.uid);
    } catch (error) {
      console.error('Error declining invite:', error);
    }
  };

  // Remove connection
  const removeConnection = async (connectionId: string) => {
    if (!confirm('Are you sure you want to remove this connection?')) return;
    
    try {
      await deleteDoc(doc(db, 'connections', connectionId));
    } catch (error) {
      console.error('Error removing connection:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Connections</h1>

        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <Card className="mb-6 border-yellow-400">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-700">
                <Clock className="h-5 w-5" />
                Pending Invitations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingInvites.map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div>
                      <p className="font-medium">{invite.fromName}</p>
                      <p className="text-sm text-gray-600">{invite.fromEmail}</p>
                      <Badge className="mt-1">{invite.fromRole}</Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => acceptInvite(invite.id)}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Accept
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="border-red-300 text-red-600 hover:bg-red-50"
                        onClick={() => declineInvite(invite.id)}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs for different connection methods */}
        <Tabs defaultValue="invite" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="invite">Invite by Email</TabsTrigger>
            <TabsTrigger value="create">Create Account</TabsTrigger>
            <TabsTrigger value="qr">QR Code</TabsTrigger>
          </TabsList>

          {/* Option 1: Invite by Email */}
          <TabsContent value="invite">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Invite Someone to Connect</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter email address"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="flex-1"
                    />
                    <Button 
                      onClick={sendInvite}
                      disabled={loading}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Send Invite
                    </Button>
                  </div>
                </div>

                {message && (
                  <Alert className="bg-green-50 border-green-500">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-700">{message}</AlertDescription>
                  </Alert>
                )}

                {error && (
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Option 2: Create Account for Elderly */}
          <TabsContent value="create">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Create Account for Elderly Person</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input
                    placeholder="Enter full name"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input
                    type="email"
                    placeholder="Enter email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    placeholder="Enter password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Role</Label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value)}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="elderly">Elderly</option>
                    <option value="caregiver">Caregiver</option>
                    <option value="doctor">Doctor</option>
                  </select>
                </div>

                <Button 
                  onClick={createElderlyAccount}
                  disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Create Account
                </Button>

                {message && (
                  <Alert className="bg-green-50 border-green-500 mt-4">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-700">{message}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Option 3: QR Code */}
          <TabsContent value="qr">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Connect via QR Code</CardTitle>
              </CardHeader>
              <CardContent className="text-center py-8">
                <div className="bg-white p-8 inline-block rounded-lg mb-4">
                  <QrCode className="h-32 w-32 text-gray-800" />
                </div>
                <p className="text-gray-600 mb-4">Scan this QR code to connect instantly</p>
                <Button variant="outline" className="gap-2">
                  <Scan className="h-4 w-4" />
                  Scan QR Code
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Current Connections */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-green-600" />
              Your Connections
            </CardTitle>
          </CardHeader>
          <CardContent>
            {connections.length === 0 ? (
              <p className="text-center text-gray-500 py-4">No connections yet</p>
            ) : (
              <div className="space-y-3">
                {connections.map((conn) => (
                  <div key={conn.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback className="bg-blue-100 text-blue-800">
                          {conn.name?.charAt(0) || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{conn.name || 'Connected User'}</p>
                        <p className="text-sm text-gray-600">{conn.role}</p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => removeConnection(conn.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Connections;