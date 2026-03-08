import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { logIn, getUserProfile } from '@/lib/firebase-auth';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Pill, Mail, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setError('Email and password cannot be empty');
      setLoading(false);
      return;
    }

    try {
      // Attempt login
      const result = await logIn(trimmedEmail, trimmedPassword);
      
      if (result.error) {
        setError(result.error);
        await logger.warning('Failed login attempt', { 
          email: trimmedEmail, 
          error: result.error 
        });
        setLoading(false);
        return;
      }

      if (!result.user) {
        setError('Login failed - no user returned');
        setLoading(false);
        return;
      }

      // Log successful login
      await logger.info('User logged in', { 
        email: trimmedEmail,
        userId: result.user.uid 
      });

      // Get user profile from Firestore
      const userProfile = await getUserProfile(result.user.uid);
      console.log('User profile:', userProfile);
      
      if (!userProfile) {
        setError('User profile not found');
        setLoading(false);
        return;
      }

      // Log profile retrieval
      await logger.info('User profile retrieved', { 
        userId: result.user.uid,
        role: userProfile.role 
      });
      
      // Redirect based on role
      if (userProfile.role === 'caregiver') {
        navigate('/caregiver');
      } else if (userProfile.role === 'doctor') {
        navigate('/doctor');
      } else if (userProfile.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/elderly'); // Default for elderly
      }
    } catch (err: any) {
      // Log unexpected error
      await logger.error('Unexpected login error', { 
        email: trimmedEmail, 
        error: err.message 
      });
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white/95 backdrop-blur shadow-2xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full">
              <Pill className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold">Welcome Back</CardTitle>
          <p className="text-gray-600">Sign in to your CareDose+ account</p>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  className="pl-10 border-2 focus:border-blue-500"
                  disabled={loading}
                />
              </div>
            </div>
            
            {/* Password Field */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="pl-10 pr-10 border-2 focus:border-blue-500"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Sign Up Link */}
          <div className="mt-6 text-center">
            <p className="text-gray-600">
              Don't have an account?{' '}
              <Link to="/signup" className="text-blue-600 hover:text-blue-800 font-semibold">
                Sign up
              </Link>
            </p>
          </div>

          {/* Test Accounts (for development) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm font-semibold text-gray-700 mb-2">Test Accounts:</p>
              <div className="space-y-1 text-xs text-gray-600">
                <p>Admin: admin@caredose.com / Admin@123</p>
                <p>Elderly: elderly@caredose.com / Elderly@123</p>
                <p>Caregiver: caregiver@caredose.com / Caregiver@123</p>
                <p>Doctor: doctor@caredose.com / Doctor@123</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;