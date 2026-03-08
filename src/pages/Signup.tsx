import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signUp } from '@/lib/firebase-auth';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Pill, 
  Mail, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  AlertCircle,
  Heart,
  Users,
  Stethoscope 
} from 'lucide-react';

const Signup = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<'elderly' | 'caregiver' | 'doctor'>('elderly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedName || !trimmedEmail || !trimmedPassword) {
      setError('All fields are required');
      setLoading(false);
      return;
    }

    if (trimmedPassword.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      const result = await signUp(trimmedEmail, trimmedPassword, {
        name: trimmedName,
        role: role
      });

      if (result.error) {
        setError(result.error);
        await logger.warning('Failed signup attempt', { 
          email: trimmedEmail, 
          role: role,
          error: result.error 
        });
        setLoading(false);
        return;
      }

      if (!result.user) {
        setError('Signup failed - no user returned');
        setLoading(false);
        return;
      }

      // Log successful signup
      await logger.info('New user signed up', { 
        email: trimmedEmail, 
        role: role,
        userId: result.user.uid 
      });

      setSuccess('Account created successfully! Redirecting to login...');
      
      // Clear form
      setName('');
      setEmail('');
      setPassword('');
      setRole('elderly');
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login');
      }, 3000);

    } catch (err: any) {
      await logger.error('Unexpected signup error', { 
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
          <CardTitle className="text-3xl font-bold">Create Account</CardTitle>
          <p className="text-gray-600">Join CareDose+ today</p>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            {/* Name Field */}
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  required
                  className="pl-10 border-2 focus:border-blue-500"
                  disabled={loading}
                />
              </div>
            </div>

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
                  placeholder="Minimum 6 characters"
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
              <p className="text-xs text-gray-500 mt-1">Password must be at least 6 characters</p>
            </div>

            {/* Role Selection */}
            <div className="space-y-2">
              <Label>I am a:</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={role === 'elderly' ? 'default' : 'outline'}
                  onClick={() => setRole('elderly')}
                  className={`flex flex-col items-center py-4 h-auto ${
                    role === 'elderly' ? 'bg-gradient-to-r from-blue-600 to-indigo-600' : ''
                  }`}
                  disabled={loading}
                >
                  <Heart className={`h-5 w-5 mb-1 ${role === 'elderly' ? 'text-white' : 'text-gray-600'}`} />
                  <span className="text-xs">Elderly</span>
                </Button>

                <Button
                  type="button"
                  variant={role === 'caregiver' ? 'default' : 'outline'}
                  onClick={() => setRole('caregiver')}
                  className={`flex flex-col items-center py-4 h-auto ${
                    role === 'caregiver' ? 'bg-gradient-to-r from-green-600 to-emerald-600' : ''
                  }`}
                  disabled={loading}
                >
                  <Users className={`h-5 w-5 mb-1 ${role === 'caregiver' ? 'text-white' : 'text-gray-600'}`} />
                  <span className="text-xs">Caregiver</span>
                </Button>

                <Button
                  type="button"
                  variant={role === 'doctor' ? 'default' : 'outline'}
                  onClick={() => setRole('doctor')}
                  className={`flex flex-col items-center py-4 h-auto ${
                    role === 'doctor' ? 'bg-gradient-to-r from-purple-600 to-pink-600' : ''
                  }`}
                  disabled={loading}
                >
                  <Stethoscope className={`h-5 w-5 mb-1 ${role === 'doctor' ? 'text-white' : 'text-gray-600'}`} />
                  <span className="text-xs">Doctor</span>
                </Button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating Account...' : 'Sign Up'}
            </Button>
          </form>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Success Alert */}
          {success && (
            <Alert className="mt-4 bg-green-50 border-green-500 text-green-700">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          {/* Login Link */}
          <div className="mt-6 text-center">
            <p className="text-gray-600">
              Already have an account?{' '}
              <Link to="/login" className="text-blue-600 hover:text-blue-800 font-semibold">
                Sign in
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Signup;