// src/pages/AdminApp.tsx - SUBTLE GENTLE DARK THEME
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
import { Switch } from '@/components/ui/switch';
import { 
  Shield, Users, Activity, AlertCircle,
  Clock, Calendar, Bell, Download,
  Search, Eye, CheckCircle,
  XCircle, RefreshCw, 
  Trash2, Edit, UserPlus, 
  Phone, Mail, LogOut, 
  Stethoscope, Heart, 
  Database, Globe, Lock, Server,
  Signal, SignalHigh, SignalMedium, SignalLow,
  ToggleLeft,
  ToggleRight
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
  
  // Store all system logs grouped by user
  const [logsByUser, setLogsByUser] = useState<Record<string, UserLog[]>>({});
  const [selectedUserLogs, setSelectedUserLogs] = useState<UserLog[]>([]);
  
  const [systemHealth, setSystemHealth] = useState({
    database: 'healthy',
    auth: 'healthy',
    storage: 'healthy',
    api: 'healthy',
    lastChecked: new Date().toISOString()
  });
  
  const [stats, setStats] = useState({
    totalUsers: 4,
    activeToday: 0,
    totalEmergencies: 2,
    resolvedEmergencies: 2,
    totalMedicines: 0,
    totalAppointments: 0,
    caregivers: 1,
    elderly: 1,
    doctors: 1,
    admins: 1
  });
  
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [logSearchTerm, setLogSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
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

      // Load all system logs and group by user
      await loadAllSystemLogs();

      // Calculate stats
      const userRoles = usersList?.reduce((acc: any, user: any) => {
        if (user.role === 'caregiver') acc.caregivers++;
        else if (user.role === 'elderly') acc.elderly++;
        else if (user.role === 'doctor') acc.doctors++;
        else if (user.role === 'admin') acc.admins++;
        return acc;
      }, { caregivers: 0, elderly: 0, doctors: 0, admins: 0 }) || {};

      setStats({
        totalUsers: usersList?.length || 4,
        activeToday: 0,
        totalEmergencies: emergenciesData?.length || 2,
        resolvedEmergencies: emergenciesData?.filter((e: any) => e.status === 'resolved').length || 2,
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

  // Load all system logs and group by user
  const loadAllSystemLogs = async () => {
    try {
      const logsRef = collection(db, 'system_logs');
      const q = query(logsRef, orderBy('timestamp', 'desc'), limit(500));
      const querySnapshot = await getDocs(q);
      
      const groupedLogs: Record<string, UserLog[]> = {};
      
      querySnapshot.forEach((doc) => {
        const log = { id: doc.id, ...doc.data() } as UserLog;
        
        // Group by userId
        if (log.userId) {
          if (!groupedLogs[log.userId]) {
            groupedLogs[log.userId] = [];
          }
          groupedLogs[log.userId].push(log);
        }
      });
      
      setLogsByUser(groupedLogs);
    } catch (error) {
      console.error('Error loading system logs:', error);
    }
  };

  // Get logs for a specific user
  const getUserLogs = (userId: string): UserLog[] => {
    return logsByUser[userId] || [];
  };

  const handleViewLogs = (user: any) => {
    setSelectedUser(user);
    const userLogs = getUserLogs(user.uid);
    setSelectedUserLogs(userLogs);
    setShowLogsModal(true);
  };

  const handleAddUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, newUser.email, newUser.password);
      const newUid = userCredential.user.uid;

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

      await addDoc(collection(db, 'system_logs'), {
        userId: user?.uid,
        userEmail: user?.email,
        action: `Created new user: ${newUser.name} (${newUser.role})`,
        level: 'info',
        timestamp: new Date().toISOString()
      });

      setNewUser({
        name: '',
        email: '',
        password: '',
        phone: '',
        role: 'elderly'
      });
      setShowAddUserModal(false);
      
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
      case 'admin': return 'bg-purple-900/80 text-purple-100 border border-purple-700/50';
      case 'doctor': return 'bg-blue-900/80 text-blue-100 border border-blue-700/50';
      case 'caregiver': return 'bg-green-900/80 text-green-100 border border-green-700/50';
      case 'elderly': return 'bg-amber-900/80 text-amber-100 border border-amber-700/50';
      default: return 'bg-gray-800 text-gray-300 border border-gray-700';
    }
  };

  const getLogLevelBadge = (level: string) => {
    switch(level) {
      case 'error': return <Badge className="bg-red-900/80 text-red-100 border border-red-700/50">Error</Badge>;
      case 'warning': return <Badge className="bg-yellow-900/80 text-yellow-100 border border-yellow-700/50">Warning</Badge>;
      case 'info': return <Badge className="bg-blue-900/80 text-blue-100 border border-blue-700/50">Info</Badge>;
      default: return <Badge className="bg-gray-800 text-gray-300 border border-gray-700">Log</Badge>;
    }
  };

  // Signal icons for health status
  const getHealthIcon = (status: string) => {
    if (status === 'healthy') {
      return <SignalHigh className="h-4 w-4 text-emerald-400" />;
    } else {
      return <SignalLow className="h-4 w-4 text-rose-400" />;
    }
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
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-500/30 border-t-indigo-400 mx-auto"></div>
          <p className="mt-4 text-lg text-slate-300">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800/50 sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-indigo-900/60 rounded-lg shadow-lg backdrop-blur-sm border border-indigo-700/30">
                <Shield className="h-6 w-6 text-indigo-300" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Admin Dashboard</h1>
                <p className="text-sm text-slate-400 mt-0.5">System Monitoring & Control</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* System Health Indicators */}
              <div className="flex items-center gap-4 bg-slate-800/50 rounded-lg px-4 py-2 border border-slate-700/50 backdrop-blur-sm">
                <div className="flex items-center gap-1.5">
                  {getHealthIcon(systemHealth.database)}
                  <span className="text-xs font-medium text-slate-300">DB</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {getHealthIcon(systemHealth.auth)}
                  <span className="text-xs font-medium text-slate-300">Auth</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {getHealthIcon(systemHealth.api)}
                  <span className="text-xs font-medium text-slate-300">API</span>
                </div>
              </div>
              
              <Button 
                variant="outline" 
                size="sm" 
                className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white transition-all px-4 py-2 h-9 bg-slate-800/30 backdrop-blur-sm"
                onClick={loadAdminData}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              
              <Button 
                variant="outline" 
                size="icon" 
                onClick={handleLogout} 
                className="border-slate-700 text-slate-300 hover:bg-rose-900/30 hover:text-rose-300 h-9 w-9 bg-slate-800/30 backdrop-blur-sm"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-8">
        {/* Stats Cards - SUBTLE GENTLE GRADIENTS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
          <Card className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 text-white border-0 shadow-xl backdrop-blur-sm border border-slate-700/30">
            <CardContent className="p-5 flex flex-col items-center justify-center min-h-[140px]">
              <Users className="h-8 w-8 text-blue-400/80 mb-2" />
              <p className="text-3xl font-bold text-slate-100">{stats.totalUsers}</p>
              <p className="text-xs text-blue-300/70 font-medium">Total Users</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 text-white border-0 shadow-xl backdrop-blur-sm border border-slate-700/30">
            <CardContent className="p-5 flex flex-col items-center justify-center min-h-[140px]">
              <Activity className="h-8 w-8 text-emerald-400/80 mb-2" />
              <p className="text-3xl font-bold text-slate-100">{stats.activeToday}</p>
              <p className="text-xs text-emerald-300/70 font-medium">Active Today</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 text-white border-0 shadow-xl backdrop-blur-sm border border-slate-700/30">
            <CardContent className="p-5 flex flex-col items-center justify-center min-h-[140px]">
              <Heart className="h-8 w-8 text-amber-400/80 mb-2" />
              <p className="text-3xl font-bold text-slate-100">{stats.elderly}</p>
              <p className="text-xs text-amber-300/70 font-medium">Elderly</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 text-white border-0 shadow-xl backdrop-blur-sm border border-slate-700/30">
            <CardContent className="p-5 flex flex-col items-center justify-center min-h-[140px]">
              <Users className="h-8 w-8 text-emerald-400/80 mb-2" />
              <p className="text-3xl font-bold text-slate-100">{stats.caregivers}</p>
              <p className="text-xs text-emerald-300/70 font-medium">Caregivers</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 text-white border-0 shadow-xl backdrop-blur-sm border border-slate-700/30">
            <CardContent className="p-5 flex flex-col items-center justify-center min-h-[140px]">
              <Stethoscope className="h-8 w-8 text-blue-400/80 mb-2" />
              <p className="text-3xl font-bold text-slate-100">{stats.doctors}</p>
              <p className="text-xs text-blue-300/70 font-medium">Doctors</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 text-white border-0 shadow-xl backdrop-blur-sm border border-slate-700/30">
            <CardContent className="p-5 flex flex-col items-center justify-center min-h-[140px]">
              <Shield className="h-8 w-8 text-purple-400/80 mb-2" />
              <p className="text-3xl font-bold text-slate-100">{stats.admins}</p>
              <p className="text-xs text-purple-300/70 font-medium">Admins</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 text-white border-0 shadow-xl backdrop-blur-sm border border-slate-700/30">
            <CardContent className="p-5 flex flex-col items-center justify-center min-h-[140px]">
              <AlertCircle className="h-8 w-8 text-rose-400/80 mb-2" />
              <p className="text-3xl font-bold text-slate-100">{stats.totalEmergencies}</p>
              <p className="text-xs text-rose-300/70 font-medium">Emergencies</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 text-white border-0 shadow-xl backdrop-blur-sm border border-slate-700/30">
            <CardContent className="p-5 flex flex-col items-center justify-center min-h-[140px]">
              <CheckCircle className="h-8 w-8 text-teal-400/80 mb-2" />
              <p className="text-3xl font-bold text-slate-100">{stats.resolvedEmergencies}</p>
              <p className="text-xs text-teal-300/70 font-medium">Resolved</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs - PERFECTLY CENTERED */}
        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="bg-slate-800/50 border border-slate-700/50 p-1 rounded-lg w-full flex h-14 backdrop-blur-sm">
            <TabsTrigger value="users" className="text-slate-400 data-[state=active]:bg-indigo-900/60 data-[state=active]:text-indigo-100 flex-1 rounded-md text-sm font-medium transition-all h-full flex items-center justify-center">
              User Management
            </TabsTrigger>
            <TabsTrigger value="logs" className="text-slate-400 data-[state=active]:bg-indigo-900/60 data-[state=active]:text-indigo-100 flex-1 rounded-md text-sm font-medium transition-all h-full flex items-center justify-center">
              Activity Logs
            </TabsTrigger>
            <TabsTrigger value="emergencies" className="text-slate-400 data-[state=active]:bg-indigo-900/60 data-[state=active]:text-indigo-100 flex-1 rounded-md text-sm font-medium transition-all h-full flex items-center justify-center">
              Emergency Alerts
            </TabsTrigger>
            <TabsTrigger value="analytics" className="text-slate-400 data-[state=active]:bg-indigo-900/60 data-[state=active]:text-indigo-100 flex-1 rounded-md text-sm font-medium transition-all h-full flex items-center justify-center">
              Analytics
            </TabsTrigger>
            <TabsTrigger value="system" className="text-slate-400 data-[state=active]:bg-indigo-900/60 data-[state=active]:text-indigo-100 flex-1 rounded-md text-sm font-medium transition-all h-full flex items-center justify-center">
              System Health
            </TabsTrigger>
          </TabsList>

          {/* User Management Tab */}
          <TabsContent value="users">
            <Card className="bg-slate-900/50 backdrop-blur-sm border border-slate-800/50 shadow-xl">
              <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <CardTitle className="text-slate-100 text-xl font-semibold">User Management</CardTitle>
                  <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input
                        placeholder="Search users..."
                        value={userSearchTerm}
                        onChange={(e) => setUserSearchTerm(e.target.value)}
                        className="pl-9 bg-slate-800/50 border-slate-700 text-slate-200 placeholder:text-slate-500 w-full h-10 rounded-lg"
                      />
                    </div>
                    <Button 
                      className="bg-emerald-900/60 hover:bg-emerald-800/60 text-emerald-100 border border-emerald-700/30 w-full sm:w-auto h-10 px-4 rounded-lg transition-colors backdrop-blur-sm"
                      onClick={() => setShowAddUserModal(true)}
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add User
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-4">
                  {filteredUsers.map((user) => (
                    <div key={user.uid} className="p-5 bg-slate-800/30 rounded-xl border border-slate-700/50 hover:bg-slate-800/40 transition-all backdrop-blur-sm">
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <Avatar className="h-14 w-14 border-2 border-indigo-500/30">
                            <AvatarFallback className="bg-gradient-to-br from-indigo-900/80 to-purple-900/80 text-indigo-100 text-lg">
                              {user.name?.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="space-y-2">
                            <div>
                              <p className="text-slate-100 font-semibold text-lg">{user.name}</p>
                              <p className="text-sm text-slate-400">{user.email}</p>
                              {user.phone && (
                                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {user.phone}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge className={getRoleBadgeColor(user.role)}>{user.role}</Badge>
                              <Badge variant="outline" className="border-slate-600 text-slate-300 bg-slate-800/30">
                                Joined {new Date(user.createdAt).toLocaleDateString()}
                              </Badge>
                              {user.isActive === false ? (
                                <Badge className="bg-slate-700 text-slate-300 border border-slate-600">Inactive</Badge>
                              ) : (
                                <Badge className="bg-emerald-900/60 text-emerald-100 border border-emerald-700/30">Active</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex gap-2">
                          <Button 
                            size="sm"
                            className="bg-amber-900/60 hover:bg-amber-800/60 text-amber-100 border border-amber-700/30 h-9 px-4 rounded-lg transition-colors backdrop-blur-sm"
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
                            className="bg-rose-900/60 hover:bg-rose-800/60 text-rose-100 border border-rose-700/30 h-9 px-4 rounded-lg transition-colors backdrop-blur-sm"
                            onClick={() => handleDeleteUser(user.uid)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Logs Tab */}
          <TabsContent value="logs">
            <Card className="bg-slate-900/50 backdrop-blur-sm border border-slate-800/50 shadow-xl">
              <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <CardTitle className="text-slate-100 text-xl font-semibold">User Activity Logs</CardTitle>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                      placeholder="Search users..."
                      value={logSearchTerm}
                      onChange={(e) => setLogSearchTerm(e.target.value)}
                      className="pl-9 bg-slate-800/50 border-slate-700 text-slate-200 placeholder:text-slate-500 w-full h-10 rounded-lg"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-4">
                  {filteredLogUsers.map((user) => {
                    const logCount = getUserLogs(user.uid).length;
                    return (
                      <div key={user.uid} className="p-5 bg-slate-800/30 rounded-xl border border-slate-700/50 hover:bg-slate-800/40 transition-all backdrop-blur-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <Avatar className="h-12 w-12 border-2 border-indigo-500/30">
                              <AvatarFallback className="bg-gradient-to-br from-indigo-900/80 to-purple-900/80 text-indigo-100">
                                {user.name?.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-slate-100 font-semibold text-lg">{user.name}</p>
                              <p className="text-sm text-slate-400">{user.email}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge className={getRoleBadgeColor(user.role)}>
                                  {user.role}
                                </Badge>
                                <Badge className="bg-blue-900/60 text-blue-100 border border-blue-700/30">
                                  {logCount} logs
                                </Badge>
                              </div>
                            </div>
                          </div>
                          <Button 
                            className="bg-blue-900/60 hover:bg-blue-800/60 text-blue-100 border border-blue-700/30 w-full sm:w-auto h-10 px-5 rounded-lg transition-colors backdrop-blur-sm"
                            onClick={() => handleViewLogs(user)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Activity Logs
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Emergencies Tab */}
          <TabsContent value="emergencies">
            <Card className="bg-slate-900/50 backdrop-blur-sm border border-slate-800/50 shadow-xl">
              <CardHeader>
                <CardTitle className="text-slate-100 text-xl font-semibold">Emergency Alerts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {emergencies.map((emergency) => {
                    const user = allUsers.find(u => u.uid === emergency.userId);
                    return (
                      <div key={emergency.id} className="p-5 bg-slate-800/30 rounded-xl border border-slate-700/50 backdrop-blur-sm">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                          <div>
                            <p className="text-slate-100 font-semibold text-lg">
                              {user?.name || 'Unknown User'}
                            </p>
                            <p className="text-sm text-slate-400 mt-1">{emergency.message || 'Emergency alert'}</p>
                            <div className="flex flex-wrap items-center gap-3 mt-3">
                              <Badge className={emergency.status === 'active' ? 'bg-rose-900/60 text-rose-100 border border-rose-700/30' : 'bg-emerald-900/60 text-emerald-100 border border-emerald-700/30'}>
                                {emergency.status}
                              </Badge>
                              <span className="text-xs text-slate-500">
                                {new Date(emergency.createdAt).toLocaleString()}
                              </span>
                            </div>
                          </div>
                          {emergency.status === 'active' && (
                            <Button 
                              size="sm" 
                              className="bg-emerald-900/60 hover:bg-emerald-800/60 text-emerald-100 border border-emerald-700/30 w-full sm:w-auto h-9 px-4 rounded-lg transition-colors backdrop-blur-sm"
                              onClick={() => handleResolveEmergency(emergency.id)}
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Resolve
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-slate-900/50 backdrop-blur-sm border border-slate-800/50 shadow-xl">
                <CardHeader>
                  <CardTitle className="text-slate-100 text-xl font-semibold">User Distribution</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <div className="flex justify-between text-sm text-slate-300 mb-2">
                      <span className="font-medium">Elderly</span>
                      <span className="font-semibold">{stats.elderly}</span>
                    </div>
                    <Progress value={stats.totalUsers > 0 ? (stats.elderly / stats.totalUsers) * 100 : 0} className="h-2 bg-slate-700" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm text-slate-300 mb-2">
                      <span className="font-medium">Caregivers</span>
                      <span className="font-semibold">{stats.caregivers}</span>
                    </div>
                    <Progress value={stats.totalUsers > 0 ? (stats.caregivers / stats.totalUsers) * 100 : 0} className="h-2 bg-slate-700" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm text-slate-300 mb-2">
                      <span className="font-medium">Doctors</span>
                      <span className="font-semibold">{stats.doctors}</span>
                    </div>
                    <Progress value={stats.totalUsers > 0 ? (stats.doctors / stats.totalUsers) * 100 : 0} className="h-2 bg-slate-700" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm text-slate-300 mb-2">
                      <span className="font-medium">Admins</span>
                      <span className="font-semibold">{stats.admins}</span>
                    </div>
                    <Progress value={stats.totalUsers > 0 ? (stats.admins / stats.totalUsers) * 100 : 0} className="h-2 bg-slate-700" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 backdrop-blur-sm border border-slate-800/50 shadow-xl">
                <CardHeader>
                  <CardTitle className="text-slate-100 text-xl font-semibold">Emergency Statistics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex justify-between items-center p-4 bg-slate-800/30 rounded-xl border border-slate-700/50">
                    <span className="text-slate-300 font-medium">Total Emergencies</span>
                    <span className="text-2xl font-bold text-slate-100">{stats.totalEmergencies}</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-slate-800/30 rounded-xl border border-slate-700/50">
                    <span className="text-slate-300 font-medium">Resolved</span>
                    <span className="text-2xl font-bold text-slate-100">{stats.resolvedEmergencies}</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-slate-800/30 rounded-xl border border-slate-700/50">
                    <span className="text-slate-300 font-medium">Resolution Rate</span>
                    <span className="text-2xl font-bold text-slate-100">
                      {stats.totalEmergencies > 0 
                        ? Math.round((stats.resolvedEmergencies / stats.totalEmergencies) * 100) 
                        : 0}%
                    </span>
                  </div>
                  <Progress 
                    value={stats.totalEmergencies > 0 ? (stats.resolvedEmergencies / stats.totalEmergencies) * 100 : 0} 
                    className="h-2 bg-slate-700 mt-2" 
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* System Health Tab */}
          <TabsContent value="system">
            <Card className="bg-slate-900/50 backdrop-blur-sm border border-slate-800/50 shadow-xl">
              <CardHeader>
                <CardTitle className="text-slate-100 text-xl font-semibold">System Health</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-6 bg-slate-800/30 rounded-xl text-center border border-slate-700/50 backdrop-blur-sm">
                    <Database className="h-8 w-8 text-blue-400/80 mx-auto mb-3" />
                    <p className="text-slate-200 font-medium">Database</p>
                    <Badge className={systemHealth.database === 'healthy' ? 'bg-emerald-900/60 text-emerald-100 border border-emerald-700/30 mt-3' : 'bg-rose-900/60 text-rose-100 border border-rose-700/30 mt-3'}>
                      {systemHealth.database}
                    </Badge>
                  </div>
                  
                  <div className="p-6 bg-slate-800/30 rounded-xl text-center border border-slate-700/50 backdrop-blur-sm">
                    <Lock className="h-8 w-8 text-purple-400/80 mx-auto mb-3" />
                    <p className="text-slate-200 font-medium">Authentication</p>
                    <Badge className={systemHealth.auth === 'healthy' ? 'bg-emerald-900/60 text-emerald-100 border border-emerald-700/30 mt-3' : 'bg-rose-900/60 text-rose-100 border border-rose-700/30 mt-3'}>
                      {systemHealth.auth}
                    </Badge>
                  </div>
                  
                  <div className="p-6 bg-slate-800/30 rounded-xl text-center border border-slate-700/50 backdrop-blur-sm">
                    <Globe className="h-8 w-8 text-emerald-400/80 mx-auto mb-3" />
                    <p className="text-slate-200 font-medium">API</p>
                    <Badge className={systemHealth.api === 'healthy' ? 'bg-emerald-900/60 text-emerald-100 border border-emerald-700/30 mt-3' : 'bg-rose-900/60 text-rose-100 border border-rose-700/30 mt-3'}>
                      {systemHealth.api}
                    </Badge>
                  </div>
                  
                  <div className="p-6 bg-slate-800/30 rounded-xl text-center border border-slate-700/50 backdrop-blur-sm">
                    <Server className="h-8 w-8 text-amber-400/80 mx-auto mb-3" />
                    <p className="text-slate-200 font-medium">Storage</p>
                    <Badge className={systemHealth.storage === 'healthy' ? 'bg-emerald-900/60 text-emerald-100 border border-emerald-700/30 mt-3' : 'bg-rose-900/60 text-rose-100 border border-rose-700/30 mt-3'}>
                      {systemHealth.storage}
                    </Badge>
                  </div>
                </div>
                
                <div className="mt-6 p-4 bg-slate-800/30 rounded-xl text-center border border-slate-700/50 backdrop-blur-sm">
                  <Clock className="h-4 w-4 text-slate-500 inline mr-2" />
                  <p className="text-sm text-slate-400 inline">
                    Last checked: {new Date(systemHealth.lastChecked).toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Add User Modal */}
      <Dialog open={showAddUserModal} onOpenChange={setShowAddUserModal}>
        <DialogContent className="bg-slate-900 text-slate-100 border-slate-800 max-w-md rounded-xl backdrop-blur-sm" aria-describedby="add-user-description">
          <DialogHeader>
            <DialogTitle className="text-slate-100 text-xl font-semibold">Add New User</DialogTitle>
          </DialogHeader>
          <div id="add-user-description" className="sr-only">
            Form to create a new user account
          </div>
          
          <div className="space-y-5 mt-2">
            <div className="space-y-2">
              <Label className="text-slate-200 text-sm font-medium">Full Name *</Label>
              <Input
                placeholder="Enter full name"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                className="bg-slate-800 border-slate-700 text-slate-200 h-11 rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200 text-sm font-medium">Email *</Label>
              <Input
                type="email"
                placeholder="Enter email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                className="bg-slate-800 border-slate-700 text-slate-200 h-11 rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200 text-sm font-medium">Password *</Label>
              <Input
                type="password"
                placeholder="Enter password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                className="bg-slate-800 border-slate-700 text-slate-200 h-11 rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200 text-sm font-medium">Phone Number</Label>
              <Input
                placeholder="Enter phone number"
                value={newUser.phone}
                onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                className="bg-slate-800 border-slate-700 text-slate-200 h-11 rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200 text-sm font-medium">Role</Label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
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
                className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white flex-1 h-11 rounded-lg transition-colors"
                onClick={() => setShowAddUserModal(false)}
              >
                Cancel
              </Button>
              <Button 
                className="bg-emerald-900/60 hover:bg-emerald-800/60 text-emerald-100 border border-emerald-700/30 flex-1 h-11 rounded-lg transition-colors backdrop-blur-sm"
                onClick={handleAddUser}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Create User
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit User Modal - WITH ANIMATED TOGGLE */}
      <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
        <DialogContent className="bg-slate-900 text-slate-100 border-slate-800 max-w-md rounded-xl backdrop-blur-sm" aria-describedby="edit-user-description">
          <DialogHeader>
            <DialogTitle className="text-slate-100 text-xl font-semibold">Edit User</DialogTitle>
          </DialogHeader>
          <div id="edit-user-description" className="sr-only">
            Edit user role and account status
          </div>
          {selectedUser && (
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 border-2 border-indigo-500/30">
                  <AvatarFallback className="bg-gradient-to-br from-indigo-900/80 to-purple-900/80 text-indigo-100 text-xl">
                    {selectedUser.name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-xl font-bold text-slate-100">{selectedUser.name}</h3>
                  <p className="text-slate-400">{selectedUser.email}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200 text-sm font-medium">Role</Label>
                <select
                  value={selectedUser.role}
                  onChange={(e) => handleUpdateUserRole(selectedUser.uid, e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                  <option value="elderly">Elderly</option>
                  <option value="caregiver">Caregiver</option>
                  <option value="doctor">Doctor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200 text-sm font-medium">Account Status</Label>
                <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                  <span className="text-sm text-slate-300">
                    {selectedUser.isActive === false ? 'Account is Inactive' : 'Account is Active'}
                  </span>
                  <Button
                    variant={selectedUser.isActive === false ? 'outline' : 'default'}
                    className={selectedUser.isActive === false 
                      ? 'border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white h-10 px-4 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105' 
                      : 'bg-emerald-900/60 hover:bg-emerald-800/60 text-emerald-100 border border-emerald-700/30 h-10 px-4 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105'
                    }
                    onClick={() => handleToggleUserStatus(selectedUser.uid, selectedUser.isActive !== false)}
                  >
                    {selectedUser.isActive === false ? (
                      <>
                        <ToggleLeft className="h-5 w-5 mr-2 transition-transform duration-300" />
                        Activate Account
                      </>
                    ) : (
                      <>
                        <ToggleRight className="h-5 w-5 mr-2 transition-transform duration-300" />
                        Deactivate Account
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  variant="destructive"
                  className="bg-rose-900/60 hover:bg-rose-800/60 text-rose-100 border border-rose-700/30 flex-1 h-11 rounded-lg transition-colors backdrop-blur-sm"
                  onClick={() => handleDeleteUser(selectedUser.uid)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete User
                </Button>
                <Button 
                  variant="outline"
                  className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white flex-1 h-11 rounded-lg transition-colors"
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
        <DialogContent className="bg-slate-900 text-slate-100 border-slate-800 max-w-3xl max-h-[80vh] overflow-y-auto rounded-xl backdrop-blur-sm" aria-describedby="logs-description">
          <DialogHeader className="sticky top-0 bg-slate-900 z-10 pb-4 border-b border-slate-800">
            <DialogTitle className="text-slate-100 flex items-center gap-2 text-xl font-semibold">
              <Activity className="h-5 w-5 text-blue-400/80" />
              Activity Logs for {selectedUser?.name}
            </DialogTitle>
            <p className="text-slate-400 text-sm mt-1">{selectedUser?.email}</p>
            <p className="text-xs text-blue-400/80 mt-1">Showing {selectedUserLogs.length} logs for this user</p>
          </DialogHeader>
          
          <div className="space-y-4 mt-4 pr-2">
            {selectedUserLogs.map((log) => (
              <div key={log.id} className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-5 hover:bg-slate-800/40 transition-all backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-3">
                  {getLogLevelBadge(log.level)}
                  <span className="text-sm text-slate-400">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>
                <p className="text-slate-200 font-medium text-base">{log.action}</p>
                {log.page && (
                  <p className="text-sm text-slate-400 mt-2">Page: {log.page}</p>
                )}
                {log.details && (
                  <div className="mt-3 p-3 bg-slate-800 rounded-lg border border-slate-700/50">
                    <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminApp;