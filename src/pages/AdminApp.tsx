import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getUserProfile, logOut, getAllUsers } from '@/lib/firebase-auth';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, orderBy, limit, addDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Shield, Users, Activity, AlertCircle,
  Clock, Calendar, Bell, Download,
  Search, Eye, CheckCircle,
  XCircle, RefreshCw, 
  Trash2, Edit, UserPlus, 
  TrendingUp, MapPin, Phone,
  Mail, LogOut, 
  Stethoscope, Heart, 
  ToggleLeft, ToggleRight, UserCog, Key,
  Database, Globe, Lock, Server
} from 'lucide-react';

interface UserLog {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  level: string;
  timestamp: string;
  details?: any;
  page?: string;
}

const AdminApp = () => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [userLogs, setUserLogs] = useState<Record<string, UserLog[]>>({});
  const [systemHealth, setSystemHealth] = useState({
    database: 'healthy',
    auth: 'healthy',
    storage: 'healthy',
    api: 'healthy',
    lastChecked: new Date().toISOString()
  });
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeToday: 0,
    totalEmergencies: 0,
    resolvedEmergencies: 0,
    totalMedicines: 0,
    totalAppointments: 0,
    caregivers: 0,
    elderly: 0,
    doctors: 0,
    admins: 0
  });
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [logSearchTerm, setLogSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedUserLogs, setSelectedUserLogs] = useState<UserLog[]>([]);
  const [emergencies, setEmergencies] = useState<any[]>([]);
  
  // New user form state
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'elderly'
  });

  const navigate = useNavigate();

  useEffect(() => {
    loadAdminData();
    
    // Set up real-time health checks
    const healthInterval = setInterval(checkSystemHealth, 30000);
    return () => clearInterval(healthInterval);
  }, []);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        navigate('/login');
        return;
      }
      setUser(currentUser);

      const userProfile = await getUserProfile(currentUser.uid);
      setProfile(userProfile);

      // Get all users with profiles
      const usersList = await getAllUsers();
      setAllUsers(usersList || []);

      // Get all emergencies
      const emergenciesRef = collection(db, 'emergencies');
      const emergenciesQuery = query(emergenciesRef, orderBy('createdAt', 'desc'));
      const emergenciesSnap = await getDocs(emergenciesQuery);
      
      const emergenciesData: any[] = [];
      emergenciesSnap.forEach((doc) => {
        emergenciesData.push({ id: doc.id, ...doc.data() });
      });
      setEmergencies(emergenciesData);

      // Calculate stats
      const today = new Date().toISOString().split('T')[0];
      
      const userRoles = usersList?.reduce((acc: any, user: any) => {
        if (user.role === 'caregiver') acc.caregivers++;
        else if (user.role === 'elderly') acc.elderly++;
        else if (user.role === 'doctor') acc.doctors++;
        else if (user.role === 'admin') acc.admins++;
        return acc;
      }, { caregivers: 0, elderly: 0, doctors: 0, admins: 0 }) || {};

      setStats({
        totalUsers: usersList?.length || 0,
        activeToday: 0,
        totalEmergencies: emergenciesData?.length || 0,
        resolvedEmergencies: emergenciesData?.filter((e: any) => e.status === 'resolved').length || 0,
        totalMedicines: 0,
        totalAppointments: 0,
        ...userRoles
      });

    } catch (error: any) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserLogs = async (userId: string) => {
    try {
      // Check if already loaded
      if (userLogs[userId]) {
        setSelectedUserLogs(userLogs[userId]);
        return;
      }

      // Fetch from Firestore
      const logsRef = collection(db, 'system_logs');
      const q = query(
        logsRef,
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(100)
      );
      const querySnapshot = await getDocs(q);
      
      const logs: UserLog[] = [];
      querySnapshot.forEach((doc) => {
        logs.push({ id: doc.id, ...doc.data() } as UserLog);
      });
      
      setUserLogs(prev => ({ ...prev, [userId]: logs }));
      setSelectedUserLogs(logs);
    } catch (error) {
      console.error('Error loading user logs:', error);
    }
  };

  const handleViewLogs = async (user: any) => {
    setSelectedUser(user);
    await loadUserLogs(user.uid);
    setShowLogsModal(true);
  };

  const handleAddUser = async () => {
    // Validate form
    if (!newUser.name || !newUser.email || !newUser.password) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      // Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, newUser.email, newUser.password);
      const newUid = userCredential.user.uid;

      // Create user profile in Firestore
      const userRef = doc(db, 'users', newUid);
      await updateDoc(userRef, {
        uid: newUid,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone || '',
        role: newUser.role,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Log the action
      await addDoc(collection(db, 'system_logs'), {
        userId: user?.uid,
        userEmail: user?.email,
        action: `Created new user: ${newUser.name} (${newUser.role})`,
        level: 'info',
        timestamp: new Date().toISOString()
      });

      // Reset form and close modal
      setNewUser({
        name: '',
        email: '',
        password: '',
        phone: '',
        role: 'elderly'
      });
      setShowAddUserModal(false);
      
      // Reload users list
      loadAdminData();

    } catch (error: any) {
      console.error('Error creating user:', error);
      alert('Error creating user: ' + error.message);
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        isActive: !currentStatus,
        updatedAt: new Date().toISOString()
      });
      
      setAllUsers(prev => 
        prev.map(u => u.uid === userId ? { ...u, isActive: !currentStatus } : u)
      );
      
      // Log the action
      await addDoc(collection(db, 'system_logs'), {
        userId: user?.uid,
        userEmail: user?.email,
        action: `Toggled user status to ${!currentStatus ? 'active' : 'inactive'}`,
        level: 'info',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error toggling user status:', error);
    }
  };

  const handleUpdateUserRole = async (userId: string, newRole: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        role: newRole,
        updatedAt: new Date().toISOString()
      });

      setAllUsers(prev => 
        prev.map(u => u.uid === userId ? { ...u, role: newRole } : u)
      );

      await addDoc(collection(db, 'system_logs'), {
        userId: user?.uid,
        userEmail: user?.email,
        action: `Updated user role to ${newRole}`,
        level: 'info',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error updating user role:', error);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;

    try {
      const userRef = doc(db, 'users', userId);
      await deleteDoc(userRef);

      setAllUsers(prev => prev.filter(u => u.uid !== userId));
      
      await addDoc(collection(db, 'system_logs'), {
        userId: user?.uid,
        userEmail: user?.email,
        action: 'Deleted user',
        level: 'warning',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error deleting user:', error);
    }
  };

  const handleResolveEmergency = async (emergencyId: string) => {
    try {
      const emergencyRef = doc(db, 'emergencies', emergencyId);
      await updateDoc(emergencyRef, {
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
        resolvedBy: user?.uid
      });

      setEmergencies(prev => 
        prev.map(e => e.id === emergencyId ? { ...e, status: 'resolved' } : e)
      );

      await addDoc(collection(db, 'system_logs'), {
        userId: user?.uid,
        userEmail: user?.email,
        action: 'Resolved emergency',
        level: 'info',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error resolving emergency:', error);
    }
  };

  const checkSystemHealth = async () => {
    try {
      const healthCheck = {
        database: 'healthy',
        auth: 'healthy',
        storage: 'healthy',
        api: 'healthy',
        lastChecked: new Date().toISOString()
      };

      try {
        await getDocs(query(collection(db, 'system_logs'), limit(1)));
      } catch {
        healthCheck.database = 'degraded';
      }

      try {
        const currentUser = await getCurrentUser();
        if (!currentUser) healthCheck.auth = 'degraded';
      } catch {
        healthCheck.auth = 'degraded';
      }

      setSystemHealth(healthCheck);
    } catch (error) {
      console.error('Health check failed:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await logOut();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch(role) {
      case 'admin': return 'bg-purple-600 text-white';
      case 'doctor': return 'bg-blue-600 text-white';
      case 'caregiver': return 'bg-green-600 text-white';
      case 'elderly': return 'bg-orange-600 text-white';
      default: return 'bg-gray-600 text-white';
    }
  };

  const getLogLevelBadge = (level: string) => {
    switch(level) {
      case 'error': return <Badge className="bg-red-600 text-white">Error</Badge>;
      case 'warning': return <Badge className="bg-yellow-600 text-white">Warning</Badge>;
      case 'info': return <Badge className="bg-blue-600 text-white">Info</Badge>;
      default: return <Badge className="bg-gray-600 text-white">Log</Badge>;
    }
  };

  const getHealthIcon = (status: string) => {
    return status === 'healthy' 
      ? <span className="text-green-500">●</span>
      : <span className="text-red-500">●</span>;
  };

  const filteredUsers = allUsers.filter(u => 
    u.name?.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

  const filteredLogUsers = allUsers.filter(u => 
    u.name?.toLowerCase().includes(logSearchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(logSearchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-500 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-lg text-white">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-md border-b border-white/10 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-600 rounded-lg">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
                <p className="text-sm text-gray-300">System Monitoring & Control</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* System Health Indicators */}
              <div className="flex items-center gap-3 bg-black/30 rounded-lg px-3 py-2">
                <div className="flex items-center gap-1">
                  {getHealthIcon(systemHealth.database)}
                  <span className="text-xs text-gray-300">DB</span>
                </div>
                <div className="flex items-center gap-1">
                  {getHealthIcon(systemHealth.auth)}
                  <span className="text-xs text-gray-300">Auth</span>
                </div>
                <div className="flex items-center gap-1">
                  {getHealthIcon(systemHealth.api)}
                  <span className="text-xs text-gray-300">API</span>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="border-purple-500 text-purple-400 hover:bg-purple-600 hover:text-white transition-all"
                onClick={loadAdminData}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={handleLogout} 
                className="border-red-500 text-red-400 hover:bg-red-600 hover:text-white"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Stats Overview - Properly Centered Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <Card className="bg-gradient-to-br from-blue-600 to-blue-700 text-white">
            <CardContent className="p-4 text-center">
              <Users className="h-6 w-6 text-blue-200 mx-auto mb-2" />
              <p className="text-xl font-bold text-white">{stats.totalUsers}</p>
              <p className="text-xs text-blue-200">Total Users</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-600 to-green-700 text-white">
            <CardContent className="p-4 text-center">
              <Activity className="h-6 w-6 text-green-200 mx-auto mb-2" />
              <p className="text-xl font-bold text-white">{stats.activeToday}</p>
              <p className="text-xs text-green-200">Active Today</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-600 to-orange-700 text-white">
            <CardContent className="p-4 text-center">
              <Heart className="h-6 w-6 text-orange-200 mx-auto mb-2" />
              <p className="text-xl font-bold text-white">{stats.elderly}</p>
              <p className="text-xs text-orange-200">Elderly</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-600 to-green-700 text-white">
            <CardContent className="p-4 text-center">
              <Users className="h-6 w-6 text-green-200 mx-auto mb-2" />
              <p className="text-xl font-bold text-white">{stats.caregivers}</p>
              <p className="text-xs text-green-200">Caregivers</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-600 to-blue-700 text-white">
            <CardContent className="p-4 text-center">
              <Stethoscope className="h-6 w-6 text-blue-200 mx-auto mb-2" />
              <p className="text-xl font-bold text-white">{stats.doctors}</p>
              <p className="text-xs text-blue-200">Doctors</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-600 to-purple-700 text-white">
            <CardContent className="p-4 text-center">
              <Shield className="h-6 w-6 text-purple-200 mx-auto mb-2" />
              <p className="text-xl font-bold text-white">{stats.admins}</p>
              <p className="text-xs text-purple-200">Admins</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-600 to-red-700 text-white">
            <CardContent className="p-4 text-center">
              <AlertCircle className="h-6 w-6 text-red-200 mx-auto mb-2" />
              <p className="text-xl font-bold text-white">{stats.totalEmergencies}</p>
              <p className="text-xs text-red-200">Emergencies</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-teal-600 to-teal-700 text-white">
            <CardContent className="p-4 text-center">
              <CheckCircle className="h-6 w-6 text-teal-200 mx-auto mb-2" />
              <p className="text-xl font-bold text-white">{stats.resolvedEmergencies}</p>
              <p className="text-xs text-teal-200">Resolved</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs - Properly Centered */}
        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="bg-white/10 border-white/20 w-full flex justify-center items-center p-1 rounded-lg">
            <TabsTrigger value="users" className="text-white data-[state=active]:bg-purple-600 data-[state=active]:text-white px-4 py-2 mx-1 rounded-md">
              User Management
            </TabsTrigger>
            <TabsTrigger value="logs" className="text-white data-[state=active]:bg-purple-600 data-[state=active]:text-white px-4 py-2 mx-1 rounded-md">
              Activity Logs
            </TabsTrigger>
            <TabsTrigger value="emergencies" className="text-white data-[state=active]:bg-purple-600 data-[state=active]:text-white px-4 py-2 mx-1 rounded-md">
              Emergency Alerts
            </TabsTrigger>
            <TabsTrigger value="analytics" className="text-white data-[state=active]:bg-purple-600 data-[state=active]:text-white px-4 py-2 mx-1 rounded-md">
              Analytics
            </TabsTrigger>
            <TabsTrigger value="system" className="text-white data-[state=active]:bg-purple-600 data-[state=active]:text-white px-4 py-2 mx-1 rounded-md">
              System Health
            </TabsTrigger>
          </TabsList>

          {/* User Management Tab - NO LOGS BUTTON */}
          <TabsContent value="users">
            <Card className="bg-white/10 backdrop-blur border-white/20">
              <CardHeader>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <CardTitle className="text-white text-xl">User Management</CardTitle>
                  <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search users..."
                        value={userSearchTerm}
                        onChange={(e) => setUserSearchTerm(e.target.value)}
                        className="pl-9 bg-white/10 border-white/20 text-white placeholder:text-gray-400 w-full"
                      />
                    </div>
                    <Button 
                      className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
                      onClick={() => setShowAddUserModal(true)}
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add User
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {filteredUsers.length === 0 ? (
                    <div className="text-center py-12">
                      <Users className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                      <p className="text-gray-400">No users found</p>
                    </div>
                  ) : (
                    filteredUsers.map((user) => (
                      <div key={user.uid} className="p-5 bg-black/20 rounded-lg border border-white/10">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                          <div className="flex items-start gap-4">
                            <Avatar className="h-14 w-14">
                              <AvatarFallback className="bg-gradient-to-r from-purple-600 to-pink-600 text-white text-lg">
                                {user.name?.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="space-y-2">
                              <div>
                                <p className="text-white font-semibold text-lg">{user.name}</p>
                                <p className="text-sm text-gray-400">{user.email}</p>
                                {user.phone && (
                                  <p className="text-xs text-gray-500 mt-1">{user.phone}</p>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Badge className={getRoleBadgeColor(user.role)}>{user.role}</Badge>
                                <Badge variant="outline" className="border-white/20 text-gray-300">
                                  Joined {new Date(user.createdAt).toLocaleDateString()}
                                </Badge>
                                {user.isActive === false ? (
                                  <Badge className="bg-gray-600">Inactive</Badge>
                                ) : (
                                  <Badge className="bg-green-600">Active</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex gap-2">
                            <Button 
                              size="sm"
                              className="bg-yellow-600 hover:bg-yellow-700 text-white"
                              onClick={() => {
                                setSelectedUser(user);
                                setShowUserModal(true);
                              }}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="bg-red-600 hover:bg-red-700 text-white"
                              onClick={() => handleDeleteUser(user.uid)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </Button>
                          </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-white/10">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-400">Status:</span>
                            <Button
                              size="sm"
                              variant={user.isActive === false ? 'outline' : 'default'}
                              className={user.isActive === false 
                                ? 'border-gray-500 text-gray-400 hover:bg-gray-600 hover:text-white' 
                                : 'bg-green-600 hover:bg-green-700 text-white'
                              }
                              onClick={() => handleToggleUserStatus(user.uid, user.isActive !== false)}
                            >
                              {user.isActive === false ? (
                                <ToggleLeft className="h-4 w-4 mr-1" />
                              ) : (
                                <ToggleRight className="h-4 w-4 mr-1" />
                              )}
                              {user.isActive === false ? 'Activate' : 'Deactivate'}
                            </Button>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-400">Role:</span>
                            <select
                              value={user.role}
                              onChange={(e) => handleUpdateUserRole(user.uid, e.target.value)}
                              className="bg-black/30 border border-white/20 rounded-md px-3 py-1 text-sm text-white"
                            >
                              <option value="elderly">Elderly</option>
                              <option value="caregiver">Caregiver</option>
                              <option value="doctor">Doctor</option>
                              <option value="admin">Admin</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Logs Tab */}
          <TabsContent value="logs">
            <Card className="bg-white/10 backdrop-blur border-white/20">
              <CardHeader>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <CardTitle className="text-white text-xl">User Activity Logs</CardTitle>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search users..."
                      value={logSearchTerm}
                      onChange={(e) => setLogSearchTerm(e.target.value)}
                      className="pl-9 bg-white/10 border-white/20 text-white placeholder:text-gray-400 w-full"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {filteredLogUsers.length === 0 ? (
                    <div className="text-center py-12">
                      <Activity className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                      <p className="text-gray-400">No users found</p>
                    </div>
                  ) : (
                    filteredLogUsers.map((user) => (
                      <div key={user.uid} className="p-5 bg-black/20 rounded-lg border border-white/10">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <Avatar className="h-12 w-12">
                              <AvatarFallback className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
                                {user.name?.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-white font-semibold">{user.name}</p>
                              <p className="text-sm text-gray-400">{user.email}</p>
                              <Badge className={getRoleBadgeColor(user.role)}>
                                {user.role}
                              </Badge>
                            </div>
                          </div>
                          <Button 
                            className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
                            onClick={() => handleViewLogs(user)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Activity Logs
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Rest of the tabs remain the same... */}
          {/* Emergencies Tab */}
          <TabsContent value="emergencies">
            <Card className="bg-white/10 backdrop-blur border-white/20">
              <CardHeader>
                <CardTitle className="text-white text-xl">Emergency Alerts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {emergencies.length === 0 ? (
                    <div className="text-center py-12">
                      <AlertCircle className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                      <p className="text-gray-400">No emergency alerts</p>
                    </div>
                  ) : (
                    emergencies.map((emergency) => {
                      const user = allUsers.find(u => u.uid === emergency.userId);
                      return (
                        <div key={emergency.id} className="p-5 bg-black/20 rounded-lg border border-white/10">
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                            <div>
                              <p className="text-white font-semibold">
                                {user?.name || 'Unknown User'}
                              </p>
                              <p className="text-sm text-gray-400 mt-1">{emergency.message || 'Emergency alert'}</p>
                              <div className="flex flex-wrap items-center gap-3 mt-3">
                                <Badge className={emergency.status === 'active' ? 'bg-red-600' : 'bg-green-600'}>
                                  {emergency.status}
                                </Badge>
                                <span className="text-xs text-gray-500">
                                  {new Date(emergency.createdAt).toLocaleString()}
                                </span>
                              </div>
                            </div>
                            {emergency.status === 'active' && (
                              <Button 
                                size="sm" 
                                className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
                                onClick={() => handleResolveEmergency(emergency.id)}
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Resolve
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-white/10 backdrop-blur border-white/20">
                <CardHeader>
                  <CardTitle className="text-white">User Distribution</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm text-gray-300 mb-2">
                      <span>Elderly</span>
                      <span>{stats.elderly}</span>
                    </div>
                    <Progress value={(stats.elderly / stats.totalUsers) * 100} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm text-gray-300 mb-2">
                      <span>Caregivers</span>
                      <span>{stats.caregivers}</span>
                    </div>
                    <Progress value={(stats.caregivers / stats.totalUsers) * 100} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm text-gray-300 mb-2">
                      <span>Doctors</span>
                      <span>{stats.doctors}</span>
                    </div>
                    <Progress value={(stats.doctors / stats.totalUsers) * 100} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm text-gray-300 mb-2">
                      <span>Admins</span>
                      <span>{stats.admins}</span>
                    </div>
                    <Progress value={(stats.admins / stats.totalUsers) * 100} className="h-2" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/10 backdrop-blur border-white/20">
                <CardHeader>
                  <CardTitle className="text-white">Emergency Statistics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">Total Emergencies</span>
                    <span className="text-2xl font-bold text-white">{stats.totalEmergencies}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">Resolved</span>
                    <span className="text-2xl font-bold text-white">{stats.resolvedEmergencies}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">Resolution Rate</span>
                    <span className="text-2xl font-bold text-white">
                      {stats.totalEmergencies > 0 
                        ? Math.round((stats.resolvedEmergencies / stats.totalEmergencies) * 100) 
                        : 0}%
                    </span>
                  </div>
                  <Progress 
                    value={stats.totalEmergencies > 0 ? (stats.resolvedEmergencies / stats.totalEmergencies) * 100 : 0} 
                    className="h-2 mt-2" 
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* System Health Tab */}
          <TabsContent value="system">
            <Card className="bg-white/10 backdrop-blur border-white/20">
              <CardHeader>
                <CardTitle className="text-white text-xl">System Health</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-5 bg-black/20 rounded-lg text-center">
                    <Database className="h-8 w-8 text-blue-400 mx-auto mb-3" />
                    <p className="text-white font-medium">Database</p>
                    <Badge className={systemHealth.database === 'healthy' ? 'bg-green-600 mt-2' : 'bg-red-600 mt-2'}>
                      {systemHealth.database}
                    </Badge>
                  </div>
                  <div className="p-5 bg-black/20 rounded-lg text-center">
                    <Lock className="h-8 w-8 text-purple-400 mx-auto mb-3" />
                    <p className="text-white font-medium">Authentication</p>
                    <Badge className={systemHealth.auth === 'healthy' ? 'bg-green-600 mt-2' : 'bg-red-600 mt-2'}>
                      {systemHealth.auth}
                    </Badge>
                  </div>
                  <div className="p-5 bg-black/20 rounded-lg text-center">
                    <Globe className="h-8 w-8 text-green-400 mx-auto mb-3" />
                    <p className="text-white font-medium">API</p>
                    <Badge className={systemHealth.api === 'healthy' ? 'bg-green-600 mt-2' : 'bg-red-600 mt-2'}>
                      {systemHealth.api}
                    </Badge>
                  </div>
                  <div className="p-5 bg-black/20 rounded-lg text-center">
                    <Server className="h-8 w-8 text-orange-400 mx-auto mb-3" />
                    <p className="text-white font-medium">Storage</p>
                    <Badge className={systemHealth.storage === 'healthy' ? 'bg-green-600 mt-2' : 'bg-red-600 mt-2'}>
                      {systemHealth.storage}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-gray-400 text-center mt-6">
                  Last checked: {new Date(systemHealth.lastChecked).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Add User Modal */}
      <Dialog open={showAddUserModal} onOpenChange={setShowAddUserModal}>
        <DialogContent className="bg-slate-900 text-white border-white/20 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white text-xl">Add New User</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-white">Full Name *</Label>
              <Input
                placeholder="Enter full name"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                className="bg-white/10 border-white/20 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white">Email *</Label>
              <Input
                type="email"
                placeholder="Enter email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                className="bg-white/10 border-white/20 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white">Password *</Label>
              <Input
                type="password"
                placeholder="Enter password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                className="bg-white/10 border-white/20 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white">Phone Number</Label>
              <Input
                placeholder="Enter phone number"
                value={newUser.phone}
                onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                className="bg-white/10 border-white/20 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white">Role</Label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white"
              >
                <option value="elderly">Elderly</option>
                <option value="caregiver">Caregiver</option>
                <option value="doctor">Doctor</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="flex gap-3 pt-4">
              <Button 
                variant="outline"
                className="border-white/20 text-white hover:bg-white/10 flex-1"
                onClick={() => setShowAddUserModal(false)}
              >
                Cancel
              </Button>
              <Button 
                className="bg-green-600 hover:bg-green-700 text-white flex-1"
                onClick={handleAddUser}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Create User
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* User Edit Modal */}
      <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
        <DialogContent className="bg-slate-900 text-white border-white/20 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Edit User</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xl">
                    {selectedUser.name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-xl font-bold">{selectedUser.name}</h3>
                  <p className="text-gray-400">{selectedUser.email}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-white">Role</Label>
                <select
                  value={selectedUser.role}
                  onChange={(e) => handleUpdateUserRole(selectedUser.uid, e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white"
                >
                  <option value="elderly">Elderly</option>
                  <option value="caregiver">Caregiver</option>
                  <option value="doctor">Doctor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label className="text-white">Account Status</Label>
                <div className="flex items-center gap-3">
                  <Button
                    variant={selectedUser.isActive === false ? 'outline' : 'default'}
                    className={selectedUser.isActive === false 
                      ? 'border-gray-500 text-gray-400 hover:bg-gray-600 hover:text-white' 
                      : 'bg-green-600 hover:bg-green-700 text-white'
                    }
                    onClick={() => handleToggleUserStatus(selectedUser.uid, selectedUser.isActive !== false)}
                  >
                    {selectedUser.isActive === false ? (
                      <ToggleLeft className="h-4 w-4 mr-2" />
                    ) : (
                      <ToggleRight className="h-4 w-4 mr-2" />
                    )}
                    {selectedUser.isActive === false ? 'Activate Account' : 'Deactivate Account'}
                  </Button>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  variant="destructive"
                  className="bg-red-600 hover:bg-red-700 text-white flex-1"
                  onClick={() => handleDeleteUser(selectedUser.uid)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete User
                </Button>
                <Button 
                  variant="outline"
                  className="border-white/20 text-white hover:bg-white/10 flex-1"
                  onClick={() => setShowUserModal(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* User Logs Modal */}
      <Dialog open={showLogsModal} onOpenChange={setShowLogsModal}>
        <DialogContent className="bg-slate-900 text-white border-white/20 max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2 text-xl">
              <Activity className="h-5 w-5 text-blue-400" />
              Activity Logs for {selectedUser?.name}
            </DialogTitle>
            <p className="text-gray-400 text-sm">{selectedUser?.email}</p>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            {selectedUserLogs.length === 0 ? (
              <div className="text-center py-8">
                <Activity className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">No activity logs found for this user</p>
              </div>
            ) : (
              selectedUserLogs.map((log) => (
                <div key={log.id} className="bg-black/20 rounded-lg border border-white/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {getLogLevelBadge(log.level)}
                    <span className="text-sm text-gray-400">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-white font-medium">{log.action}</p>
                  {log.page && (
                    <p className="text-sm text-gray-400 mt-1">Page: {log.page}</p>
                  )}
                  {log.details && (
                    <div className="mt-2 p-2 bg-black/30 rounded">
                      <pre className="text-xs text-gray-300 whitespace-pre-wrap">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminApp;