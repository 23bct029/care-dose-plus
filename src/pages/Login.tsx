import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { logIn, signInWithGoogle, getUserProfile } from '@/lib/firebase-auth';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff } from 'lucide-react';

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
  const routes: Record<string, string> = { caregiver:'/caregiver', doctor:'/doctor', admin:'/admin', elderly:'/elderly' };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) { setError('Please enter your email and password.'); return; }
    setLoading(true); setError('');
    const result = await logIn(email.trim().toLowerCase(), password.trim());
    if (result.error) { setError(result.error); setLoading(false); return; }
    if (!result.user) { setError('Login failed. Please try again.'); setLoading(false); return; }
    const profile = await getUserProfile(result.user.uid);
    if (!profile) { setError('Account not found. Please contact support.'); setLoading(false); return; }
    navigate(routes[profile.role] || '/elderly', { replace: true });
  };

  const handleGoogle = async () => {
    setGoogleLoading(true); setError('');
    const result = await signInWithGoogle(googleRole);
    if (result.error) { setError(result.error); setGoogleLoading(false); return; }
    if (!result.user) { setGoogleLoading(false); return; }
    navigate(routes[result.profile?.role || 'elderly'] || '/elderly', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left panel — brand */}
      <div className="hidden lg:flex lg:w-5/12 bg-teal-700 flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center">
              <span className="text-white font-black text-lg">C+</span>
            </div>
            <span className="text-white font-bold text-xl">CareDose+</span>
          </div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">Smart Medication Management</h1>
          <p className="text-teal-100 text-lg leading-relaxed">
            Keep your loved ones safe with real-time medicine tracking, appointment scheduling, and caregiver coordination.
          </p>
        </div>
        <div className="space-y-4">
          {[
            { icon: '💊', text: 'Medicine reminders & tracking' },
            { icon: '📅', text: 'Doctor appointment management' },
            { icon: '👨‍👩‍👧', text: 'Family caregiver coordination' },
            { icon: '🚨', text: 'Emergency alert system' },
          ].map(f => (
            <div key={f.text} className="flex items-center gap-3">
              <span className="text-xl">{f.icon}</span>
              <span className="text-teal-100 text-sm">{f.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="h-8 w-8 bg-teal-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-sm">C+</span>
            </div>
            <span className="text-gray-900 font-bold text-lg">CareDose+</span>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">Sign in</h2>
          <p className="text-gray-500 text-sm mb-7">Enter your credentials to access your dashboard</p>

          {/* Google Sign-In */}
          {!showRolePick ? (
            <button type="button" onClick={() => setShowRolePick(true)} disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 text-gray-700 font-medium h-11 rounded-lg mb-5 hover:bg-gray-50 transition-colors disabled:opacity-60 shadow-sm">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
          ) : (
            <div className="mb-5 p-4 bg-gray-50 rounded-xl border border-gray-200">
              <p className="text-sm font-medium text-gray-700 mb-3">I'm signing in as a:</p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  {v:'elderly' as const, l:'Patient', e:'🧓'},
                  {v:'caregiver' as const, l:'Caregiver', e:'🤝'},
                  {v:'doctor' as const, l:'Doctor', e:'👨‍⚕️'},
                ].map(r => (
                  <button key={r.v} type="button" onClick={() => setGoogleRole(r.v)}
                    className={`py-2.5 rounded-lg border-2 text-xs font-semibold transition-all ${googleRole===r.v?'border-teal-600 bg-teal-50 text-teal-700':'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
                    <div className="text-lg mb-0.5">{r.e}</div>{r.l}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={handleGoogle} disabled={googleLoading}
                  className="flex-1 h-9 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                  {googleLoading && <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>}
                  Sign in with Google
                </button>
                <button type="button" onClick={() => setShowRolePick(false)} className="px-4 h-9 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Back</button>
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-gray-200"/>
            <span className="text-xs text-gray-400">or</span>
            <div className="flex-1 h-px bg-gray-200"/>
          </div>

          {/* Email form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Email address</Label>
              <Input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"
                required autoComplete="email"
                className="h-11 border-gray-300 bg-white focus:border-teal-500 focus:ring-teal-500 rounded-lg"/>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Password</Label>
              <div className="relative">
                <Input type={showPw?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)}
                  placeholder="Enter your password" required autoComplete="current-password"
                  className="h-11 pr-11 border-gray-300 bg-white focus:border-teal-500 rounded-lg"/>
                <button type="button" onClick={()=>setShowPw(v=>!v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full h-11 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <><span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/>Signing in…</> : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-5">
            New to CareDose+?{' '}
            <Link to="/signup" className="text-teal-600 hover:text-teal-700 font-semibold">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
