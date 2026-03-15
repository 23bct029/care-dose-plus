// src/pages/AdminApp.tsx - Professional clean UI, proper colors
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getUserProfile, logOut, getAllUsers } from '@/lib/firebase-auth';
import { db, auth } from '@/lib/firebase';
import { collection, query, getDocs, doc, updateDoc, deleteDoc, setDoc, limit, addDoc, orderBy } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Shield, Users, Activity, AlertCircle, Clock,
  Search, Eye, CheckCircle, XCircle, RefreshCw,
  Trash2, Edit, UserPlus, Phone, LogOut,
  Stethoscope, Heart, Database, Globe, Lock, Server,
  ToggleLeft, ToggleRight, User, Bell, TrendingUp,
  FileText, Settings
} from 'lucide-react';
import EmergencyPopup from '@/components/EmergencyPopup';
import ProfileTab from '@/components/ProfileTab';

interface UserLog { id:string; userId:string; userEmail:string; action:string; level:string; timestamp:string; details?:any; page?:string; }

const ROLE_CONFIG: Record<string,{color:string;bg:string;border:string;dot:string}> = {
  admin:    {color:'text-violet-700', bg:'bg-violet-50',  border:'border-violet-200', dot:'bg-violet-500'},
  doctor:   {color:'text-blue-700',   bg:'bg-blue-50',    border:'border-blue-200',   dot:'bg-blue-500'},
  caregiver:{color:'text-teal-700',   bg:'bg-teal-50',    border:'border-teal-200',   dot:'bg-teal-500'},
  elderly:  {color:'text-amber-700',  bg:'bg-amber-50',   border:'border-amber-200',  dot:'bg-amber-500'},
};

const AdminApp = () => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [logsByUser, setLogsByUser] = useState<Record<string,UserLog[]>>({});
  const [selectedUserLogs, setSelectedUserLogs] = useState<UserLog[]>([]);
  const [systemHealth, setSystemHealth] = useState({ database:'healthy', auth:'healthy', api:'healthy', storage:'healthy', lastChecked:new Date().toISOString() });
  const [stats, setStats] = useState({ totalUsers:0, activeToday:0, totalEmergencies:0, resolvedEmergencies:0, caregivers:0, elderly:0, doctors:0, admins:0 });
  const [userSearch, setUserSearch] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [emergencies, setEmergencies] = useState<any[]>([]);
  const [newUser, setNewUser] = useState({ name:'', email:'', password:'', phone:'', role:'elderly' });
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
    const h = setInterval(checkHealth, 30000);
    return () => clearInterval(h);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const cu = await getCurrentUser();
      if (!cu) { navigate('/login'); return; }
      setUser(cu);
      setProfile(await getUserProfile(cu.uid));
      const users = await getAllUsers() || [];
      setAllUsers(users);

      const eSnap = await getDocs(query(collection(db,'emergencies'), limit(200)));
      const eData = eSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a:any,b:any)=>(b.timestamp?.toMillis?.()||0)-(a.timestamp?.toMillis?.()||0));
      setEmergencies(eData);

      await loadLogs();

      const roles = users.reduce((acc:any,u:any) => { acc[u.role]=(acc[u.role]||0)+1; return acc; },{});
      setStats({ totalUsers:users.length, activeToday:0, totalEmergencies:eData.length, resolvedEmergencies:eData.filter((e:any)=>e.status==='resolved').length, caregivers:roles.caregiver||0, elderly:roles.elderly||0, doctors:roles.doctor||0, admins:roles.admin||0 });
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadLogs = async () => {
    try {
      const snap = await getDocs(query(collection(db,'system_logs'), limit(500)));
      const grouped: Record<string,UserLog[]> = {};
      snap.forEach(d => {
        const log = {id:d.id,...d.data()} as UserLog;
        if (log.userId) { if (!grouped[log.userId]) grouped[log.userId]=[]; grouped[log.userId].push(log); }
      });
      setLogsByUser(grouped);
    } catch {}
  };

  const handleAddUser = async () => {
    if (!newUser.name||!newUser.email||!newUser.password) { alert('Please fill all required fields'); return; }
    try {
      const cred = await createUserWithEmailAndPassword(auth, newUser.email, newUser.password);
      await setDoc(doc(db,'users',cred.user.uid), { uid:cred.user.uid, name:newUser.name, email:newUser.email, phone:newUser.phone||'', role:newUser.role, isActive:true, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() });
      await addDoc(collection(db,'system_logs'), { userId:user?.uid, userEmail:user?.email, action:`Created user: ${newUser.name} (${newUser.role})`, level:'info', timestamp:new Date().toISOString() });
      setNewUser({name:'',email:'',password:'',phone:'',role:'elderly'});
      setShowAddModal(false);
      loadData();
    } catch(e:any) { alert('Error: '+e.message); }
  };

  const handleDeleteUser = async (uid: string) => {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db,'users',uid));
      setAllUsers(prev=>prev.filter(u=>u.uid!==uid));
    } catch(e:any) { alert('Error: '+e.message); }
  };

  const handleToggleStatus = async (uid: string, current: boolean) => {
    await updateDoc(doc(db,'users',uid), { isActive:!current, updatedAt:new Date().toISOString() });
    setAllUsers(prev=>prev.map(u=>u.uid===uid?{...u,isActive:!current}:u));
    if (selectedUser?.uid===uid) setSelectedUser((prev:any)=>({...prev,isActive:!current}));
  };

  const handleUpdateRole = async (uid: string, role: string) => {
    await updateDoc(doc(db,'users',uid), { role, updatedAt:new Date().toISOString() });
    setAllUsers(prev=>prev.map(u=>u.uid===uid?{...u,role}:u));
    if (selectedUser?.uid===uid) setSelectedUser((prev:any)=>({...prev,role}));
  };

  const handleResolveEmergency = async (id: string) => {
    await updateDoc(doc(db,'emergencies',id), { status:'resolved', resolvedAt:new Date().toISOString(), resolvedBy:user?.uid });
    setEmergencies(prev=>prev.map(e=>e.id===id?{...e,status:'resolved'}:e));
  };

  const checkHealth = async () => {
    const h:any = { database:'healthy', auth:'healthy', api:'healthy', storage:'healthy', lastChecked:new Date().toISOString() };
    try { await getDocs(query(collection(db,'system_logs'),limit(1))); } catch { h.database='degraded'; }
    try { const cu=await getCurrentUser(); if (!cu) h.auth='degraded'; } catch { h.auth='degraded'; }
    setSystemHealth(h);
  };

  const handleLogout = async () => { await logOut(); navigate('/login'); };

  const filteredUsers = allUsers.filter(u=>u.name?.toLowerCase().includes(userSearch.toLowerCase())||u.email?.toLowerCase().includes(userSearch.toLowerCase()));
  const filteredLogUsers = allUsers.filter(u=>u.name?.toLowerCase().includes(logSearch.toLowerCase())||u.email?.toLowerCase().includes(logSearch.toLowerCase()));

  const rc = (role: string) => ROLE_CONFIG[role]||ROLE_CONFIG.elderly;

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-14 w-14 border-4 border-teal-600 border-t-transparent mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading admin dashboard...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar + Content layout */}
      <div className="flex min-h-screen">

        {/* Left sidebar */}
        <aside className="w-64 bg-gray-900 text-white flex flex-col shrink-0 hidden lg:flex">
          {/* Brand */}
          <div className="px-6 py-5 border-b border-gray-700">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-teal-500 flex items-center justify-center"><Shield className="h-5 w-5 text-white"/></div>
              <div>
                <p className="font-bold text-white">CareDose+</p>
                <p className="text-xs text-gray-400">Admin Console</p>
              </div>
            </div>
          </div>

          {/* Admin info */}
          <div className="px-6 py-4 border-b border-gray-700">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-violet-600 flex items-center justify-center font-bold text-sm">{profile?.name?.charAt(0)||'A'}</div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{profile?.name||'Admin'}</p>
                <p className="text-xs text-gray-400 truncate">{user?.email}</p>
              </div>
            </div>
          </div>

          {/* System Health */}
          <div className="px-6 py-4 border-b border-gray-700">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">System Status</p>
            {[['Database',systemHealth.database],['Auth',systemHealth.auth],['API',systemHealth.api]].map(([name,status])=>(
              <div key={name} className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-300">{name}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status==='healthy'?'bg-emerald-900 text-emerald-300':'bg-red-900 text-red-300'}`}>{status}</span>
              </div>
            ))}
          </div>

          {/* Stats summary */}
          <div className="px-6 py-4 space-y-3 flex-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Overview</p>
            {[
              {label:'Total Users',value:stats.totalUsers,icon:<Users className="h-4 w-4"/>},
              {label:'Emergencies',value:stats.totalEmergencies,icon:<AlertCircle className="h-4 w-4"/>},
              {label:'Elderly',value:stats.elderly,icon:<Heart className="h-4 w-4"/>},
              {label:'Doctors',value:stats.doctors,icon:<Stethoscope className="h-4 w-4"/>},
              {label:'Caregivers',value:stats.caregivers,icon:<Users className="h-4 w-4"/>},
            ].map(s=>(
              <div key={s.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-gray-400">{s.icon}<span className="text-sm">{s.label}</span></div>
                <span className="text-sm font-semibold text-white">{s.value}</span>
              </div>
            ))}
          </div>

          {/* Bottom actions */}
          <div className="px-6 py-4 border-t border-gray-700 space-y-2">
            <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white text-sm transition-colors" onClick={loadData}>
              <RefreshCw className="h-4 w-4"/>Refresh Data
            </button>
            <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-gray-400 hover:bg-red-900 hover:text-red-300 text-sm transition-colors" onClick={handleLogout}>
              <LogOut className="h-4 w-4"/>Sign Out
            </button>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar (mobile) */}
          <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between lg:hidden sticky top-0 z-30">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-teal-600 flex items-center justify-center"><Shield className="h-4 w-4 text-white"/></div>
              <span className="font-bold text-gray-900">CareDose+ Admin</span>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-600" onClick={loadData}><RefreshCw className="h-4 w-4"/></Button>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-600" onClick={handleLogout}><LogOut className="h-4 w-4"/></Button>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6 space-y-6">
            {/* Page header */}
            <div className="hidden lg:flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
                <p className="text-sm text-gray-500 mt-1">Manage users, monitor system, review activity</p>
              </div>
              <Button className="bg-teal-600 hover:bg-teal-700 text-white h-10 px-5" onClick={()=>setShowAddModal(true)}>
                <UserPlus className="h-4 w-4 mr-2"/>Add User
              </Button>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                {label:'Total Users',value:stats.totalUsers,icon:<Users className="h-6 w-6 text-blue-600"/>,bg:'bg-blue-50',border:'border-blue-100'},
                {label:'Emergencies',value:stats.totalEmergencies,icon:<AlertCircle className="h-6 w-6 text-red-600"/>,bg:'bg-red-50',border:'border-red-100'},
                {label:'Resolved',value:stats.resolvedEmergencies,icon:<CheckCircle className="h-6 w-6 text-emerald-600"/>,bg:'bg-emerald-50',border:'border-emerald-100'},
                {label:'Active Today',value:stats.activeToday,icon:<Activity className="h-6 w-6 text-teal-600"/>,bg:'bg-teal-50',border:'border-teal-100'},
              ].map(s=>(
                <Card key={s.label} className={`${s.bg} border ${s.border} shadow-none`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500 font-medium">{s.label}</p>
                        <p className="text-3xl font-bold text-gray-900 mt-1">{s.value}</p>
                      </div>
                      <div className="p-2 rounded-xl bg-white shadow-sm">{s.icon}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Role breakdown */}
            <Card className="bg-white border border-gray-200 shadow-none">
              <CardHeader className="pb-3"><CardTitle className="text-base font-semibold text-gray-900">User Distribution</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    {role:'elderly',label:'Elderly',value:stats.elderly},
                    {role:'caregiver',label:'Caregivers',value:stats.caregivers},
                    {role:'doctor',label:'Doctors',value:stats.doctors},
                    {role:'admin',label:'Admins',value:stats.admins},
                  ].map(s=>(
                    <div key={s.role} className={`p-4 rounded-xl border ${rc(s.role).bg} ${rc(s.role).border}`}>
                      <div className={`h-2 w-2 rounded-full ${rc(s.role).dot} mb-2`}></div>
                      <p className={`text-2xl font-bold ${rc(s.role).color}`}>{s.value}</p>
                      <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                    </div>
                  ))}
                </div>
                {stats.totalUsers>0&&(
                  <div className="mt-4">
                    <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
                      {[{v:stats.elderly,c:'bg-amber-400'},{v:stats.caregivers,c:'bg-teal-400'},{v:stats.doctors,c:'bg-blue-400'},{v:stats.admins,c:'bg-violet-400'}].map((s,i)=>(
                        s.v>0&&<div key={i} className={`${s.c} rounded-full`} style={{width:`${(s.v/stats.totalUsers)*100}%`}}/>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Main tabs */}
            <Tabs defaultValue="users">
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="users">👥 Users</TabsTrigger>
                <TabsTrigger value="logs">📋 Activity</TabsTrigger>
                <TabsTrigger value="emergencies">🚨 Emergencies</TabsTrigger>
                <TabsTrigger value="system">⚙️ System</TabsTrigger>
                <TabsTrigger value="profile">👤 Profile</TabsTrigger>
              </TabsList>

              {/* ── USERS ── */}
              <TabsContent value="users" className="mt-4">
                <Card className="bg-white border border-gray-200 shadow-none">
                  <CardHeader className="pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <CardTitle className="text-base font-semibold text-gray-900">All Users ({filteredUsers.length})</CardTitle>
                      <div className="flex gap-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"/>
                          <Input placeholder="Search users…" value={userSearch} onChange={e=>setUserSearch(e.target.value)} className="pl-9 w-64 border-gray-300 bg-white h-9"/>
                        </div>
                        <Button className="bg-teal-600 hover:bg-teal-700 text-white h-9 px-4 text-sm" onClick={()=>setShowAddModal(true)}>
                          <UserPlus className="h-4 w-4 mr-1.5"/>Add User
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-gray-100">
                      {filteredUsers.map(u=>(
                        <div key={u.uid} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors">
                          <div className="flex items-center gap-4 min-w-0">
                            <div className={`h-10 w-10 rounded-full ${rc(u.role).bg} ${rc(u.role).border} border-2 flex items-center justify-center font-bold ${rc(u.role).color} text-sm shrink-0`}>{u.name?.charAt(0)}</div>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 truncate">{u.name}</p>
                              <p className="text-xs text-gray-500 truncate">{u.email}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${rc(u.role).bg} ${rc(u.role).color} ${rc(u.role).border}`}>{u.role}</span>
                                {u.isActive===false?<span className="text-xs text-gray-400 px-2 py-0.5 rounded-full bg-gray-100">Inactive</span>:<span className="text-xs text-emerald-700 px-2 py-0.5 rounded-full bg-emerald-50">Active</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button size="sm" variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100 h-8 px-3 text-xs" onClick={()=>{setSelectedUser(u);setShowUserModal(true);}}>
                              <Edit className="h-3.5 w-3.5 mr-1"/>Edit
                            </Button>
                            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-3 text-xs" onClick={()=>{setSelectedUser(u);setSelectedUserLogs(logsByUser[u.uid]||[]);setShowLogsModal(true);}}>
                              <Eye className="h-3.5 w-3.5 mr-1"/>Logs
                            </Button>
                            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white h-8 px-3 text-xs" onClick={()=>handleDeleteUser(u.uid)}>
                              <Trash2 className="h-3.5 w-3.5"/>
                            </Button>
                          </div>
                        </div>
                      ))}
                      {filteredUsers.length===0&&<div className="py-12 text-center text-gray-500">No users found</div>}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── ACTIVITY LOGS ── */}
              <TabsContent value="logs" className="mt-4">
                <Card className="bg-white border border-gray-200 shadow-none">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-base font-semibold text-gray-900">Activity Logs</CardTitle>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"/>
                        <Input placeholder="Filter by user…" value={logSearch} onChange={e=>setLogSearch(e.target.value)} className="pl-9 w-56 border-gray-300 bg-white h-9"/>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-gray-100">
                      {filteredLogUsers.map(u=>{
                        const lc = (logsByUser[u.uid]||[]).length;
                        return (
                          <div key={u.uid} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50">
                            <div className="flex items-center gap-4 min-w-0">
                              <div className={`h-10 w-10 rounded-full ${rc(u.role).bg} border-2 ${rc(u.role).border} flex items-center justify-center font-bold ${rc(u.role).color} text-sm shrink-0`}>{u.name?.charAt(0)}</div>
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 truncate">{u.name}</p>
                                <p className="text-xs text-gray-500 truncate">{u.email}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={`text-xs px-2 py-0.5 rounded-full border ${rc(u.role).bg} ${rc(u.role).color} ${rc(u.role).border}`}>{u.role}</span>
                                  <span className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">{lc} log{lc!==1?'s':''}</span>
                                </div>
                              </div>
                            </div>
                            <Button className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-4 text-sm" onClick={()=>{setSelectedUser(u);setSelectedUserLogs(logsByUser[u.uid]||[]);setShowLogsModal(true);}}>
                              <Eye className="h-4 w-4 mr-2"/>View Logs
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── EMERGENCIES ── */}
              <TabsContent value="emergencies" className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-gray-900">Emergency Alerts ({emergencies.length})</h2>
                  <Button className="bg-red-600 hover:bg-red-700 text-white h-9 px-4 text-sm" onClick={()=>window.location.href='tel:911'}><Phone className="h-4 w-4 mr-2"/>Call 911</Button>
                </div>
                {emergencies.length===0?(
                  <Card className="bg-white border border-gray-200 shadow-none"><CardContent className="py-12 text-center text-gray-500">No emergencies recorded</CardContent></Card>
                ):emergencies.map(em=>{
                  const u=allUsers.find(u=>u.uid===em.userId);
                  return (
                    <Card key={em.id} className={`border shadow-none ${em.status==='active'?'bg-red-50 border-red-200':'bg-gray-50 border-gray-200'}`}>
                      <CardContent className="p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <AlertCircle className={`h-5 w-5 mt-0.5 shrink-0 ${em.status==='active'?'text-red-500 animate-pulse':'text-gray-400'}`}/>
                            <div>
                              <p className="font-semibold text-gray-900">{u?.name||em.userName||'Unknown'}</p>
                              <p className={`text-sm font-medium ${em.status==='active'?'text-red-700':'text-gray-500'}`}>{em.type?.toUpperCase()||'EMERGENCY'}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge className={em.status==='active'?'bg-red-600 text-white text-xs':'bg-gray-400 text-white text-xs'}>{em.status}</Badge>
                                <span className="text-xs text-gray-400">{em.createdAt||em.timestamp?.toDate?.()?.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                          {em.status==='active'&&<Button className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 px-4 text-sm" onClick={()=>handleResolveEmergency(em.id)}><CheckCircle className="h-4 w-4 mr-2"/>Resolve</Button>}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </TabsContent>

              {/* ── SYSTEM ── */}
              <TabsContent value="system" className="mt-4 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    {name:'Database',icon:<Database className="h-8 w-8"/>,status:systemHealth.database,color:'text-blue-600',bg:'bg-blue-50'},
                    {name:'Auth',icon:<Lock className="h-8 w-8"/>,status:systemHealth.auth,color:'text-violet-600',bg:'bg-violet-50'},
                    {name:'API',icon:<Globe className="h-8 w-8"/>,status:systemHealth.api,color:'text-teal-600',bg:'bg-teal-50'},
                    {name:'Storage',icon:<Server className="h-8 w-8"/>,status:systemHealth.storage,color:'text-amber-600',bg:'bg-amber-50'},
                  ].map(s=>(
                    <Card key={s.name} className="bg-white border border-gray-200 shadow-none">
                      <CardContent className="p-5 text-center">
                        <div className={`h-14 w-14 ${s.bg} rounded-xl flex items-center justify-center mx-auto mb-3 ${s.color}`}>{s.icon}</div>
                        <p className="font-semibold text-gray-900">{s.name}</p>
                        <Badge className={`mt-2 text-xs ${s.status==='healthy'?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-700'}`}>{s.status}</Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Card className="bg-white border border-gray-200 shadow-none">
                  <CardContent className="p-5 flex items-center justify-between">
                    <p className="text-sm text-gray-500">Last health check: {new Date(systemHealth.lastChecked).toLocaleString()}</p>
                    <Button variant="outline" className="border-gray-300 text-gray-700 h-9 px-4 text-sm" onClick={checkHealth}><RefreshCw className="h-4 w-4 mr-2"/>Check Now</Button>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── PROFILE ── */}
              <TabsContent value="profile" className="mt-4">
                <ProfileTab user={user} profile={profile} onProfileUpdated={u=>setProfile(u)} roleColor="violet"/>
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>

      {user&&<EmergencyPopup userId={user.uid}/>}

      {/* Add User Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="bg-white max-w-md" aria-describedby="add-desc">
          <DialogHeader><DialogTitle className="text-gray-900">Add New User</DialogTitle></DialogHeader>
          <p id="add-desc" className="sr-only">Create a new user account</p>
          <div className="space-y-4 mt-2">
            {[
              {key:'name',label:'Full Name *',type:'text',ph:'Enter full name'},
              {key:'email',label:'Email *',type:'email',ph:'Enter email'},
              {key:'password',label:'Password *',type:'password',ph:'Min. 6 characters'},
              {key:'phone',label:'Phone',type:'tel',ph:'+1 (555) 000-0000'},
            ].map(f=>(
              <div key={f.key} className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">{f.label}</Label>
                <Input type={f.type} placeholder={f.ph} value={(newUser as any)[f.key]} onChange={e=>setNewUser(p=>({...p,[f.key]:e.target.value}))} className="border-gray-300 bg-white h-10"/>
              </div>
            ))}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Role</Label>
              <select value={newUser.role} onChange={e=>setNewUser(p=>({...p,role:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 text-sm h-10 focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="elderly">Elderly Patient</option>
                <option value="caregiver">Caregiver</option>
                <option value="doctor">Doctor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-100 h-10" onClick={()=>setShowAddModal(false)}>Cancel</Button>
              <Button className="flex-1 bg-teal-600 hover:bg-teal-700 text-white h-10" onClick={handleAddUser}><UserPlus className="h-4 w-4 mr-2"/>Create User</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
        <DialogContent className="bg-white max-w-md" aria-describedby="edit-desc">
          <DialogHeader><DialogTitle className="text-gray-900">Edit User</DialogTitle></DialogHeader>
          <p id="edit-desc" className="sr-only">Edit user account</p>
          {selectedUser&&(
            <div className="space-y-5">
              <div className={`flex items-center gap-4 p-4 rounded-xl border ${rc(selectedUser.role).bg} ${rc(selectedUser.role).border}`}>
                <div className={`h-14 w-14 rounded-full border-2 ${rc(selectedUser.role).border} flex items-center justify-center font-bold text-xl ${rc(selectedUser.role).color}`}>{selectedUser.name?.charAt(0)}</div>
                <div><p className="font-bold text-gray-900 text-lg">{selectedUser.name}</p><p className="text-sm text-gray-500">{selectedUser.email}</p></div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Role</Label>
                <select value={selectedUser.role} onChange={e=>handleUpdateRole(selectedUser.uid,e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 text-sm h-10">
                  <option value="elderly">Elderly Patient</option>
                  <option value="caregiver">Caregiver</option>
                  <option value="doctor">Doctor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div>
                  <p className="font-medium text-gray-900 text-sm">Account Status</p>
                  <p className="text-xs text-gray-500 mt-0.5">{selectedUser.isActive===false?'Account is inactive':'Account is active'}</p>
                </div>
                <Button
                  className={selectedUser.isActive===false?'bg-emerald-600 hover:bg-emerald-700 text-white h-9 px-4 text-sm':'bg-gray-200 hover:bg-gray-300 text-gray-700 h-9 px-4 text-sm'}
                  onClick={()=>handleToggleStatus(selectedUser.uid, selectedUser.isActive!==false)}>
                  {selectedUser.isActive===false?<><ToggleLeft className="h-4 w-4 mr-2"/>Activate</>:<><ToggleRight className="h-4 w-4 mr-2"/>Deactivate</>}
                </Button>
              </div>
              <div className="flex gap-3">
                <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white h-10" onClick={()=>{handleDeleteUser(selectedUser.uid);setShowUserModal(false);}}>
                  <Trash2 className="h-4 w-4 mr-2"/>Delete User
                </Button>
                <Button variant="outline" className="flex-1 border-gray-300 text-gray-700 h-10" onClick={()=>setShowUserModal(false)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Logs Modal */}
      <Dialog open={showLogsModal} onOpenChange={setShowLogsModal}>
        <DialogContent className="bg-white max-w-2xl max-h-[82vh] flex flex-col" aria-describedby="logs-desc">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-gray-900 flex items-center gap-2"><FileText className="h-5 w-5 text-blue-600"/>Logs — {selectedUser?.name}</DialogTitle>
            <p id="logs-desc" className="text-sm text-gray-500">{selectedUser?.email} · {selectedUserLogs.length} records</p>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto mt-3 space-y-2 min-h-0">
            {selectedUserLogs.length===0?(
              <div className="py-12 text-center"><FileText className="h-10 w-10 text-gray-300 mx-auto mb-3"/><p className="text-gray-500">No activity logs found.</p></div>
            ):selectedUserLogs.map(log=>(
              <div key={log.id} className={`p-3 rounded-lg border ${log.level==='error'?'bg-red-50 border-red-100':log.level==='warning'?'bg-amber-50 border-amber-100':'bg-gray-50 border-gray-100'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Badge className={`text-xs ${log.level==='error'?'bg-red-600 text-white':log.level==='warning'?'bg-amber-500 text-white':'bg-blue-600 text-white'}`}>{log.level}</Badge>
                  <span className="text-xs text-gray-400">{new Date(log.timestamp).toLocaleString()}</span>
                </div>
                <p className="text-sm text-gray-800 font-medium">{log.action}</p>
                {log.page&&<p className="text-xs text-gray-400 mt-0.5">Page: {log.page}</p>}
              </div>
            ))}
          </div>
          <div className="shrink-0 pt-4 border-t border-gray-100 mt-4">
            <Button className="w-full bg-gray-900 hover:bg-gray-800 text-white h-10" onClick={()=>setShowLogsModal(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminApp;
