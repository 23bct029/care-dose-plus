import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getUserProfile, logOut, getAllUsers } from '@/lib/firebase-auth';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, deleteDoc, orderBy, limit, addDoc } from 'firebase/firestore';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import UserLogs from '@/components/UserLogs';
import { 
  Shield, Users, Activity, AlertCircle,
  Clock, Calendar, Bell, Download,
  Filter, Search, Eye, CheckCircle,
  XCircle, RefreshCw, UserCog, Settings,
  Server, Database, Globe, Lock, Key,
  Trash2, Edit, UserPlus, BarChart,
  PieChart, TrendingUp, MapPin, Phone,
  Mail, MessageSquare, Wifi, WifiOff,
  Stethoscope, Heart, LogOut, ChevronDown,
  ChevronUp, Calendar as CalendarIcon
} from 'lucide-react';

const AdminApp = () => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<any[]>([]);
  const [emergencies, setEmergencies] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [expandedUsers, setExpandedUsers] = useState<string[]>([]);
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
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [showDateFilter, setShowDateFilter] = useState(false);

  const navigate = useNavigate();

  // Logger function
  const logUserAction = async (action: string, details?: any) => {
    if (user) {
      await logger.logWithUser(user.uid, user.email, 'info', action, details);
    }
  };

  useEffect(() => {
    loadAdminData();
    
    // Set up real-time health checks
    const healthInterval = setInterval(checkSystemHealth, 30000);
    return () => clearInterval(healthInterval);
  }, []);

  // Log page view when user is loaded
  useEffect(() => {
    if (user) {
      logUserAction('Page viewed', { page: 'AdminDashboard' });
    }
  }, [user]);

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

      await logger.logWithUser(currentUser.uid, currentUser.email, 'info', 'Data loading started', { page: 'AdminDashboard' });

      // Get all users with profiles
      const usersList = await getAllUsers();
      setAllUsers(usersList || []);

      // Get all logs from Firestore
      const logsRef = collection(db, 'system_logs');
      const logsQuery = query(logsRef, orderBy('timestamp', 'desc'), limit(1000));
      const logsSnap = await getDocs(logsQuery);
      
      const logsData: any[] = [];
      logsSnap.forEach((doc) => {
        logsData.push({ id: doc.id, ...doc.data() });
      });
      setLogs(logsData);

      // Get all emergencies
      const emergenciesRef = collection(db, 'emergencies');
      const emergenciesQuery = query(emergenciesRef, orderBy('createdAt', 'desc'));
      const emergenciesSnap = await getDocs(emergenciesQuery);
      
      const emergenciesData: any[] = [];
      emergenciesSnap.forEach((doc) => {
        emergenciesData.push({ id: doc.id, ...doc.data() });
      });
      setEmergencies(emergenciesData);

      // Get all appointments
      const appointmentsRef = collection(db, 'appointments');
      const appointmentsQuery = query(appointmentsRef, orderBy('date', 'desc'), limit(200));
      const appointmentsSnap = await getDocs(appointmentsQuery);
      
      const appointmentsData: any[] = [];
      appointmentsSnap.forEach((doc) => {
        appointmentsData.push({ id: doc.id, ...doc.data() });
      });
      setAppointments(appointmentsData);

      // Get all medicines
      const medicinesRef = collection(db, 'medicines');
      const medicinesSnap = await getDocs(medicinesRef);
      
      const medicinesData: any[] = [];
      medicinesSnap.forEach((doc) => {
        medicinesData.push({ id: doc.id, ...doc.data() });
      });
      setMedicines(medicinesData);

      // Calculate stats
      const today = new Date().toISOString().split('T')[0];
      const activeToday = logsData?.filter((log: any) => 
        log.timestamp?.startsWith(today)
      ).length || 0;

      const resolvedEmergencies = emergenciesData?.filter((e: any) => 
        e.status === 'resolved'
      ).length || 0;

      const userRoles = usersList?.reduce((acc: any, user: any) => {
        if (user.role === 'caregiver') acc.caregivers++;
        else if (user.role === 'elderly') acc.elderly++;
        else if (user.role === 'doctor') acc.doctors++;
        else if (user.role === 'admin') acc.admins++;
        return acc;
      }, { caregivers: 0, elderly: 0, doctors: 0, admins: 0 }) || {};

      setStats({
        totalUsers: usersList?.length || 0,
        activeToday,
        totalEmergencies: emergenciesData?.length || 0,
        resolvedEmergencies,
        totalMedicines: medicinesData?.length || 0,
        totalAppointments: appointmentsData?.length || 0,
        ...userRoles
      });

      await logger.logWithUser(currentUser.uid, currentUser.email, 'info', 'Data loaded successfully', { 
        usersCount: usersList?.length,
        logsCount: logsData.length,
        emergenciesCount: emergenciesData.length
      });

    } catch (error: any) {
      console.error('Error loading admin data:', error);
      if (user) {
        await logger.error('Failed to load admin data', { 
          userId: user.uid,
          error: error.message 
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleUserLogs = (userId: string) => {
    setExpandedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
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

      // Test database
      try {
        const testQuery = await getDocs(query(collection(db, 'system_logs'), limit(1)));
      } catch (dbError) {
        healthCheck.database = 'degraded';
        await logger.warning('Database connection degraded', { error: dbError });
      }

      // Test auth
      try {
        const currentUser = await getCurrentUser();
        if (!currentUser) healthCheck.auth = 'degraded';
      } catch (authError) {
        healthCheck.auth = 'degraded';
        await logger.warning('Auth service degraded', { error: authError });
      }

      setSystemHealth(healthCheck);
    } catch (error) {
      console.error('Health check failed:', error);
      await logger.error('Health check failed', { error });
    }
  };

  const addSystemLog = async (level: string, action: string, details?: any) => {
    try {
      const logsRef = collection(db, 'system_logs');
      await addDoc(logsRef, {
        userId: user?.uid,
        userEmail: user?.email,
        level,
        action,
        details,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error adding log:', error);
    }
  };

  const handleUpdateUserRole = async (userId: string, newRole: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        role: newRole,
        updatedAt: new Date().toISOString()
      });

      await logUserAction('Updated user role', { userId, newRole });
      loadAdminData();
    } catch (error: any) {
      console.error('Error updating user role:', error);
      await logger.error('Failed to update user role', { 
        userId,
        newRole,
        error: error.message 
      });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;

    try {
      const userRef = doc(db, 'users', userId);
      await deleteDoc(userRef);

      await logUserAction('User profile deleted', { userId });
      loadAdminData();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      await logger.error('Failed to delete user', { 
        userId,
        error: error.message 
      });
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

      await logUserAction('Emergency resolved', { emergencyId });
      loadAdminData();
    } catch (error: any) {
      console.error('Error resolving emergency:', error);
      await logger.error('Failed to resolve emergency', { 
        emergencyId,
        error: error.message 
      });
    }
  };

  const handleLogout = async () => {
    try {
      await logUserAction('User logged out');
      await logOut();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const exportLogs = () => {
    const dataStr = JSON.stringify(filteredLogs, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `caredose-logs-${new Date().toISOString().split('T')[0]}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();

    logUserAction('Logs exported', { count: filteredLogs.length });
  };

  const getLogLevelBadge = (level: string) => {
    switch(level) {
      case 'error': return <Badge className="bg-red-100 text-red-800 hover:bg-red-200">Error</Badge>;
      case 'warning': return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">Warning</Badge>;
      case 'info': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">Info</Badge>;
      default: return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-200">Log</Badge>;
    }
  };

  const getHealthIcon = (status: string) => {
    return status === 'healthy' 
      ? <Wifi className="h-4 w-4 text-green-500" />
      : <WifiOff className="h-4 w-4 text-red-500" />;
  };

  const getRoleBadgeColor = (role: string) => {
    switch(role) {
      case 'admin': return 'bg-purple-600';
      case 'doctor': return 'bg-blue-600';
      case 'caregiver': return 'bg-green-600';
      case 'elderly': return 'bg-orange-600';
      default: return 'bg-gray-600';
    }
  };

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
              <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2">
                {getHealthIcon(systemHealth.database)}
                {getHealthIcon(systemHealth.auth)}
                {getHealthIcon(systemHealth.api)}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="bg-purple-600 hover:bg-purple-700 text-white border-purple-500 transition-all hover:scale-105"
                onClick={loadAdminData}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="bg-blue-600 hover:bg-blue-700 text-white border-blue-500 transition-all hover:scale-105"
                onClick={exportLogs}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="text-white hover:bg-white/20 transition-all hover:scale-105">
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <Card className="bg-gradient-to-br from-blue-600 to-blue-700 text-white hover:shadow-lg transition-all cursor-pointer" onClick={() => setSelectedUser(null)}>
            <CardContent className="p-3">
              <Users className="h-4 w-4 text-blue-200 mb-1" />
              <p className="text-lg font-bold text-white">{stats.totalUsers}</p>
              <p className="text-xs text-blue-200">Total Users</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-600 to-green-700 text-white">
            <CardContent className="p-3">
              <Activity className="h-4 w-4 text-green-200 mb-1" />
              <p className="text-lg font-bold text-white">{stats.activeToday}</p>
              <p className="text-xs text-green-200">Active Today</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-pink-600 to-pink-700 text-white">
            <CardContent className="p-3">
              <Heart className="h-4 w-4 text-pink-200 mb-1" />
              <p className="text-lg font-bold text-white">{stats.elderly}</p>
              <p className="text-xs text-pink-200">Elderly</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white">
            <CardContent className="p-3">
              <Users className="h-4 w-4 text-emerald-200 mb-1" />
              <p className="text-lg font-bold text-white">{stats.caregivers}</p>
              <p className="text-xs text-emerald-200">Caregivers</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-600 to-purple-700 text-white">
            <CardContent className="p-3">
              <Stethoscope className="h-4 w-4 text-purple-200 mb-1" />
              <p className="text-lg font-bold text-white">{stats.doctors}</p>
              <p className="text-xs text-purple-200">Doctors</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-600 to-red-700 text-white">
            <CardContent className="p-3">
              <Shield className="h-4 w-4 text-red-200 mb-1" />
              <p className="text-lg font-bold text-white">{stats.admins}</p>
              <p className="text-xs text-red-200">Admins</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-600 to-orange-700 text-white">
            <CardContent className="p-3">
              <AlertCircle className="h-4 w-4 text-orange-200 mb-1" />
              <p className="text-lg font-bold text-white">{stats.totalEmergencies}</p>
              <p className="text-xs text-orange-200">Emergencies</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-teal-600 to-teal-700 text-white">
            <CardContent className="p-3">
              <CheckCircle className="h-4 w-4 text-teal-200 mb-1" />
              <p className="text-lg font-bold text-white">{stats.resolvedEmergencies}</p>
              <p className="text-xs text-teal-200">Resolved</p>
            </CardContent>
          </Card>
        </div>

        {/* User Management Section (Main Focus) */}
        <Card className="bg-white/10 backdrop-blur border-white/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-white text-xl">User Management & Activity Logs</CardTitle>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 bg-white/10 border-white/20 text-white placeholder:text-gray-400 w-64"
                  />
                </div>
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add User
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {allUsers
                .filter(u => u.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            u.email?.toLowerCase().includes(searchTerm.toLowerCase()))
                .map((user) => (
                  <div key={user.uid} className="bg-black/30 rounded-lg border border-white/10 overflow-hidden">
                    {/* User Header */}
                    <div className="p-4 flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
                            {user.name?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-white font-medium text-lg">{user.name}</p>
                          <p className="text-sm text-gray-400">{user.email}</p>
                          <div className="flex gap-2 mt-2">
                            <Badge className={getRoleBadgeColor(user.role)}>{user.role}</Badge>
                            <Badge variant="outline" className="border-white/20 text-gray-300">
                              Joined {new Date(user.createdAt).toLocaleDateString()}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="bg-blue-600 hover:bg-blue-700 text-white border-blue-500"
                          onClick={() => toggleUserLogs(user.uid)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          {expandedUsers.includes(user.uid) ? 'Hide Logs' : 'View Logs'}
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="bg-purple-600 hover:bg-purple-700 text-white border-purple-500"
                          onClick={() => {
                            setSelectedUser(user);
                            setShowUserModal(true);
                          }}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="bg-red-600 hover:bg-red-700 text-white border-red-500"
                          onClick={() => handleDeleteUser(user.uid)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* User Logs Section (Expandable) */}
                    {expandedUsers.includes(user.uid) && (
                      <div className="border-t border-white/10 bg-black/40 p-4">
                        <UserLogs userId={user.uid} userEmail={user.email} />
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        {/* Other Tabs (Minimized) */}
        <Tabs defaultValue="emergencies" className="space-y-4">
          <TabsList className="bg-white/10 border-white/20">
            <TabsTrigger value="emergencies" className="text-white data-[state=active]:bg-white/20">
              Emergency Alerts
            </TabsTrigger>
            <TabsTrigger value="system" className="text-white data-[state=active]:bg-white/20">
              System Health
            </TabsTrigger>
          </TabsList>

          {/* Emergencies Tab */}
          <TabsContent value="emergencies">
            <Card className="bg-white/10 backdrop-blur border-white/20">
              <CardHeader>
                <CardTitle className="text-white">Emergency Alerts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {emergencies.length === 0 ? (
                    <p className="text-center text-gray-400 py-8">No emergency alerts</p>
                  ) : (
                    emergencies.map((emergency) => {
                      const user = allUsers.find(u => u.uid === emergency.userId);
                      return (
                        <div key={emergency.id} className="p-4 bg-black/30 rounded-lg border border-white/10">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="text-white font-medium">
                                {user?.name || 'Unknown User'}
                              </p>
                              <p className="text-sm text-gray-400">{emergency.message || 'Emergency alert'}</p>
                            </div>
                            <Badge className={emergency.status === 'active' ? 'bg-red-600' : 'bg-green-600'}>
                              {emergency.status}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between mt-3 text-sm">
                            <span className="text-gray-400">
                              {new Date(emergency.createdAt).toLocaleString()}
                            </span>
                            {emergency.status === 'active' && (
                              <Button 
                                size="sm" 
                                className="bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => handleResolveEmergency(emergency.id)}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
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

          {/* System Health Tab */}
          <TabsContent value="system">
            <Card className="bg-white/10 backdrop-blur border-white/20">
              <CardHeader>
                <CardTitle className="text-white">System Health</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-black/30 rounded-lg text-center">
                    <Database className="h-8 w-8 text-blue-400 mx-auto mb-2" />
                    <p className="text-white font-medium">Database</p>
                    <Badge className={systemHealth.database === 'healthy' ? 'bg-green-600' : 'bg-red-600'}>
                      {systemHealth.database}
                    </Badge>
                  </div>
                  <div className="p-4 bg-black/30 rounded-lg text-center">
                    <Lock className="h-8 w-8 text-purple-400 mx-auto mb-2" />
                    <p className="text-white font-medium">Authentication</p>
                    <Badge className={systemHealth.auth === 'healthy' ? 'bg-green-600' : 'bg-red-600'}>
                      {systemHealth.auth}
                    </Badge>
                  </div>
                  <div className="p-4 bg-black/30 rounded-lg text-center">
                    <Globe className="h-8 w-8 text-green-400 mx-auto mb-2" />
                    <p className="text-white font-medium">API</p>
                    <Badge className={systemHealth.api === 'healthy' ? 'bg-green-600' : 'bg-red-600'}>
                      {systemHealth.api}
                    </Badge>
                  </div>
                  <div className="p-4 bg-black/30 rounded-lg text-center">
                    <Server className="h-8 w-8 text-orange-400 mx-auto mb-2" />
                    <p className="text-white font-medium">Storage</p>
                    <Badge className={systemHealth.storage === 'healthy' ? 'bg-green-600' : 'bg-red-600'}>
                      {systemHealth.storage}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-gray-400 text-center mt-4">
                  Last checked: {new Date(systemHealth.lastChecked).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* User Detail Modal */}
      <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
        <DialogContent className="max-w-md bg-slate-900 text-white border-white/20">
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

              <Button 
                variant="destructive" 
                className="w-full"
                onClick={() => handleDeleteUser(selectedUser.uid)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete User
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminApp;