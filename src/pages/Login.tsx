import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { logIn, signInWithGoogle, getUserProfile } from '@/lib/firebase-auth';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pill, Mail, Lock, Eye, EyeOff, AlertCircle, Chrome } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [googleRole, setGoogleRole] = useState<'elderly'|'caregiver'|'doctor'>('elderly');
  const [showRolePick, setShowRolePick] = useState(false);
  const navigate = useNavigate();

  const roleRoutes: Record<string, string> = { caregiver:'/caregiver', doctor:'/doctor', admin:'/admin', elderly:'/elderly' };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    const result = await logIn(email.trim().toLowerCase(), password.trim());
    if (result.error) { setError(result.error); setLoading(false); return; }
    if (!result.user) { setError('Login failed — please try again'); setLoading(false); return; }
    const profile = await getUserProfile(result.user.uid);
    if (!profile) { setError('Account not found. Contact support.'); setLoading(false); return; }
    navigate(roleRoutes[profile.role] || '/elderly', { replace: true });
  };

  const handleGoogle = async () => {
    setGoogleLoading(true); setError('');
    const result = await signInWithGoogle(googleRole);
    if (result.error) { setError(result.error); setGoogleLoading(false); return; }
    if (!result.user) { setGoogleLoading(false); return; }
    if (result.isNewUser) { setShowRolePick(false); }
    navigate(roleRoutes[result.profile?.role || 'elderly'] || '/elderly', { replace: true });
  };

  const ROLES = [
    { value: 'elderly' as const, label: 'Patient', emoji: '🧓', color: 'border-blue-400 bg-blue-50 text-blue-800' },
    { value: 'caregiver' as const, label: 'Caregiver', emoji: '🤝', color: 'border-teal-400 bg-teal-50 text-teal-800' },
    { value: 'doctor' as const, label: 'Doctor', emoji: '👨‍⚕️', color: 'border-purple-400 bg-purple-50 text-purple-800' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-teal-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-teal-500/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"/>
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2"/>

      <div className="relative w-full max-w-[420px]">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-18 h-18 bg-teal-500/20 backdrop-blur border border-teal-400/30 rounded-2xl mb-4 p-4">
            <Pill className="h-9 w-9 text-teal-300"/>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">CareDose<span className="text-teal-400">+</span></h1>
          <p className="text-slate-400 mt-2 text-sm">Smart Medication Management</p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-1">Welcome back</h2>
          <p className="text-slate-400 text-sm mb-6">Sign in to continue to your dashboard</p>

          {/* Google Sign-In */}
          {!showRolePick ? (
            <button type="button" onClick={() => setShowRolePick(true)} disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-800 font-semibold h-12 rounded-2xl mb-4 transition-all shadow-lg hover:shadow-xl disabled:opacity-60 border border-gray-200">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
          ) : (
            <div className="mb-4 p-4 bg-white/5 rounded-2xl border border-white/10">
              <p className="text-sm text-white font-medium mb-3 text-center">I am joining as a…</p>
              <div className="flex gap-2 mb-3">
                {ROLES.map(r => (
                  <button key={r.value} type="button" onClick={() => setGoogleRole(r.value)}
                    className={`flex-1 py-2 px-1 rounded-xl border-2 text-xs font-semibold transition-all ${googleRole===r.value?r.color:'border-white/20 bg-white/5 text-slate-400 hover:border-white/30'}`}>
                    <div className="text-xl mb-1">{r.emoji}</div>{r.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={handleGoogle} disabled={googleLoading}
                  className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-800 font-semibold h-10 rounded-xl transition-all border border-gray-200 text-sm disabled:opacity-60">
                  {googleLoading ? <span className="h-4 w-4 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin"/> : 
                  <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>}
                  Sign in with Google
                </button>
                <button type="button" onClick={() => setShowRolePick(false)} className="px-4 h-10 rounded-xl border border-white/20 text-slate-400 hover:bg-white/5 text-sm">Back</button>
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-white/10"/><span className="text-xs text-slate-500">or sign in with email</span><div className="flex-1 h-px bg-white/10"/>
          </div>

          {/* Email form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-sm font-medium">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500"/>
                <Input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email"
                  className="pl-10 h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 rounded-xl focus:border-teal-400 focus:bg-white/10"/>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-sm font-medium">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500"/>
                <Input type={showPw?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password"
                  className="pl-10 pr-12 h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-500 rounded-xl focus:border-teal-400 focus:bg-white/10"/>
                <button type="button" onClick={()=>setShowPw(v=>!v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showPw?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0"/>
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-400 hover:to-blue-500 text-white font-bold rounded-2xl shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-teal-500/30 disabled:opacity-60 disabled:hover:translate-y-0 flex items-center justify-center gap-2">
              {loading ? <><span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Signing in…</> : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-slate-500 text-sm mt-5">
            Don't have an account?{' '}
            <Link to="/signup" className="text-teal-400 hover:text-teal-300 font-semibold">Create one free</Link>
          </p>
        </div>

        <p className="text-center text-slate-600 text-xs mt-4">🔒 Secure · Private · HIPAA-aware</p>
      </div>
    </div>
  );
};

export default Login;
