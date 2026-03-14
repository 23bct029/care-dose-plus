import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { logIn, getUserProfile } from '@/lib/firebase-auth';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Pill, Mail, Lock, AlertCircle, Eye, EyeOff, Shield, Heart, CheckCircle } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const successMessage = (location.state as any)?.message || '';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    if (!trimmedEmail || !trimmedPassword) {
      setError('Email and password are required');
      setLoading(false);
      return;
    }
    try {
      const result = await logIn(trimmedEmail, trimmedPassword);
      if (result.error) { setError(result.error); setLoading(false); return; }
      if (!result.user) { setError('Login failed — please try again'); setLoading(false); return; }
      const userProfile = await getUserProfile(result.user.uid);
      if (!userProfile) { setError('Account profile not found. Please contact support.'); setLoading(false); return; }
      const roleRoutes: Record<string, string> = { caregiver: '/caregiver', doctor: '/doctor', admin: '/admin', elderly: '/elderly' };
      navigate(roleRoutes[userProfile.role] || '/elderly');
    } catch (err: any) {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-indigo-900 to-purple-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>
      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/10 backdrop-blur rounded-2xl mb-4 border border-white/20 shadow-xl">
            <Pill className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight">CareDose<span className="text-blue-300">+</span></h1>
          <p className="text-blue-200/70 mt-2 text-sm">Smart Medication Management</p>
        </div>

        <Card className="bg-white shadow-2xl border-0 rounded-2xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6">
            <h2 className="text-2xl font-bold text-white">Welcome Back</h2>
            <p className="text-blue-100/80 text-sm mt-1">Sign in to your account</p>
          </CardHeader>
          <CardContent className="px-8 py-8">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-gray-700 font-semibold text-sm">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com" required
                    className="pl-10 h-12 border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-500 rounded-xl text-sm"
                    disabled={loading} autoComplete="email" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-gray-700 font-semibold text-sm">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input id="password" type={showPassword ? 'text' : 'password'} value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required
                    className="pl-10 pr-12 h-12 border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-500 rounded-xl text-sm"
                    disabled={loading} autoComplete="current-password" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors" tabIndex={-1}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {successMessage && (
                <Alert className="py-3 rounded-xl border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <AlertDescription className="text-green-700 text-sm">{successMessage}</AlertDescription>
                </Alert>
              )}
              {error && (
                <Alert variant="destructive" className="py-3 rounded-xl border-red-200 bg-red-50">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <AlertDescription className="text-red-700 text-sm">{error}</AlertDescription>
                </Alert>
              )}
              {/* Sign In button - always blue gradient, never white */}
              <button type="submit" disabled={loading}
                className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-base rounded-xl shadow-lg shadow-blue-500/30 transition-all hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-2">
                {loading ? (
                  <><span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in…</>
                ) : 'Sign In'}
              </button>
            </form>
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">New here?</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            <Link to="/signup">
              <button type="button"
                className="w-full h-12 border-2 border-blue-200 bg-white text-blue-700 font-semibold text-sm rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all">
                Create an Account
              </button>
            </Link>
            <div className="flex items-center justify-center gap-5 mt-6 text-xs text-gray-400">
              <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-green-500" />Secure & Private</span>
              <span className="h-3 w-px bg-gray-300" />
              <span className="flex items-center gap-1.5"><Heart className="h-3.5 w-3.5 text-red-400" />Built for Care</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
