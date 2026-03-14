// src/pages/Signup.tsx - Two-step onboarding: account + medical profile
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signUp } from '@/lib/firebase-auth';
import { db } from '@/lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Pill, Mail, Lock, User, Eye, EyeOff, AlertCircle,
  Heart, Users, Stethoscope, CheckCircle, ArrowLeft,
  ArrowRight, Phone, Shield, MapPin, Activity, ChevronRight
} from 'lucide-react';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];

const Signup = () => {
  // Step 1 state
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<'elderly' | 'caregiver' | 'doctor'>('elderly');

  // Step 2 state — medical profile
  const [phone, setPhone] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');
  const [medicalConditions, setMedicalConditions] = useState('');
  const [allergies, setAllergies] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdUid, setCreatedUid] = useState('');

  const navigate = useNavigate();

  // Step 1: create auth account
  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const n = name.trim(), em = email.trim().toLowerCase(), pw = password.trim();
    if (!n || !em || !pw) { setError('All fields are required'); return; }
    if (pw.length < 6) { setError('Password must be at least 6 characters'); return; }

    setLoading(true);
    try {
      const result = await signUp(em, pw, { name: n, role });
      if (result.error) { setError(result.error); setLoading(false); return; }
      setCreatedUid((result as any).uid || '');
      setStep(2);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: save medical profile then redirect
  const handleStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (createdUid) {
        await updateDoc(doc(db, 'users', createdUid), {
          phone: phone.trim(),
          bloodGroup,
          age: age ? parseInt(age) : null,
          gender,
          address: address.trim(),
          medicalConditions: medicalConditions.trim(),
          allergies: allergies.trim(),
          emergencyContact: emergencyContact.trim(),
          profileCompleted: true,
          updatedAt: serverTimestamp(),
        });
      }
      navigate('/login', { state: { message: 'Account created! Please log in.' } });
    } catch {
      setError('Profile save failed. You can update it later from your dashboard.');
      setTimeout(() => navigate('/login'), 2000);
    } finally {
      setLoading(false);
    }
  };

  const skipStep2 = () => navigate('/login', { state: { message: 'Account created! Please log in.' } });

  const roles = [
    { value: 'elderly' as const, label: 'Patient', desc: 'Track my medications', icon: Heart, grad: 'from-blue-500 to-indigo-600', activeBg: 'bg-blue-50 border-blue-400 text-blue-800' },
    { value: 'caregiver' as const, label: 'Caregiver', desc: 'Support loved ones', icon: Users, grad: 'from-green-500 to-emerald-600', activeBg: 'bg-green-50 border-green-400 text-green-800' },
    { value: 'doctor' as const, label: 'Doctor', desc: 'Manage patients', icon: Stethoscope, grad: 'from-purple-500 to-pink-600', activeBg: 'bg-purple-50 border-purple-400 text-purple-800' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-indigo-900 to-purple-900 flex items-center justify-center p-4">
      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 backdrop-blur rounded-2xl mb-3 border border-white/20 shadow-xl">
            <Pill className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">CareDose<span className="text-blue-300">+</span></h1>
          <p className="text-blue-200/70 mt-1 text-sm">Smart Medication Management</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-3 mb-5">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${step === 1 ? 'bg-white text-blue-700' : 'bg-white/20 text-white'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === 1 ? 'bg-blue-600 text-white' : 'bg-green-500 text-white'}`}>
              {step > 1 ? '✓' : '1'}
            </span>
            Account
          </div>
          <ChevronRight className="h-4 w-4 text-white/40" />
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${step === 2 ? 'bg-white text-blue-700' : 'bg-white/20 text-white/60'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === 2 ? 'bg-blue-600 text-white' : 'bg-white/30 text-white'}`}>2</span>
            Medical Profile
          </div>
        </div>

        <Card className="bg-white shadow-2xl border-0 rounded-2xl overflow-hidden">
          {/* ── STEP 1 ─────────────────────────────── */}
          {step === 1 && (
            <>
              <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5">
                <h2 className="text-xl font-bold text-white">Create Account</h2>
                <p className="text-blue-100/80 text-sm mt-0.5">Step 1 of 2 — Basic information</p>
              </CardHeader>
              <CardContent className="px-6 py-6">
                <form onSubmit={handleStep1} className="space-y-4">
                  {/* Name */}
                  <div className="space-y-1">
                    <Label htmlFor="name" className="text-gray-700 font-semibold text-sm">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input id="name" type="text" value={name} onChange={e => setName(e.target.value)}
                        placeholder="Your full name" required disabled={loading}
                        className="pl-10 h-11 border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-500 rounded-xl text-sm" />
                    </div>
                  </div>

                  {/* Email */}
                  <div className="space-y-1">
                    <Label htmlFor="email" className="text-gray-700 font-semibold text-sm">Email Address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                        placeholder="you@example.com" required disabled={loading} autoComplete="email"
                        className="pl-10 h-11 border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-500 rounded-xl text-sm" />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1">
                    <Label htmlFor="password" className="text-gray-700 font-semibold text-sm">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input id="password" type={showPassword ? 'text' : 'password'} value={password}
                        onChange={e => setPassword(e.target.value)} placeholder="Minimum 6 characters" required
                        disabled={loading} autoComplete="new-password"
                        className="pl-10 pr-11 h-11 border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-500 rounded-xl text-sm" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Role */}
                  <div className="space-y-2">
                    <Label className="text-gray-700 font-semibold text-sm">I am a:</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {roles.map(({ value, label, icon: Icon, grad, activeBg }) => (
                        <button key={value} type="button" onClick={() => setRole(value)} disabled={loading}
                          className={`relative flex flex-col items-center justify-center py-3.5 px-2 rounded-xl border-2 transition-all text-sm font-medium
                            ${role === value ? `${activeBg} shadow-sm` : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                          <div className={`p-2 rounded-lg mb-1.5 bg-gradient-to-br ${grad}`}>
                            <Icon className="h-4 w-4 text-white" />
                          </div>
                          <span className="font-semibold text-xs">{label}</span>
                          {role === value && <CheckCircle className="absolute top-1.5 right-1.5 h-3.5 w-3.5 text-green-500" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {error && (
                    <Alert variant="destructive" className="py-2.5 rounded-xl border-red-200 bg-red-50">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      <AlertDescription className="text-red-700 text-sm">{error}</AlertDescription>
                    </Alert>
                  )}

                  <button type="submit" disabled={loading}
                    className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-sm rounded-xl shadow-lg transition-all hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                    {loading ? (
                      <><span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating Account…</>
                    ) : (
                      <>Continue <ArrowRight className="h-4 w-4" /></>
                    )}
                  </button>
                </form>

                <div className="mt-5 text-center">
                  <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-semibold">
                    <ArrowLeft className="h-3.5 w-3.5" />Already have an account? Sign in
                  </Link>
                </div>
              </CardContent>
            </>
          )}

          {/* ── STEP 2 ─────────────────────────────── */}
          {step === 2 && (
            <>
              <CardHeader className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-5">
                <h2 className="text-xl font-bold text-white">Complete Your Profile</h2>
                <p className="text-green-100/80 text-sm mt-0.5">Step 2 of 2 — Medical information (helps in emergencies)</p>
              </CardHeader>
              <CardContent className="px-6 py-6">
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-700">
                    This information helps caregivers and doctors respond quickly in emergencies.
                    You can skip this and update it later from your profile tab.
                  </p>
                </div>

                <form onSubmit={handleStep2} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Phone */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1"><Phone className="h-3 w-3" />Phone</Label>
                      <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                        placeholder="+91 99999 99999" disabled={loading}
                        className="h-9 text-sm border-gray-200 bg-gray-50 focus:bg-white rounded-lg" />
                    </div>
                    {/* Age */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1"><User className="h-3 w-3" />Age</Label>
                      <Input type="number" value={age} onChange={e => setAge(e.target.value)}
                        placeholder="e.g. 65" min="1" max="120" disabled={loading}
                        className="h-9 text-sm border-gray-200 bg-gray-50 focus:bg-white rounded-lg" />
                    </div>
                    {/* Blood Group */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1"><Shield className="h-3 w-3" />Blood Group</Label>
                      <select value={bloodGroup} onChange={e => setBloodGroup(e.target.value)} disabled={loading}
                        className="w-full h-9 text-sm border border-gray-200 rounded-lg px-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                        <option value="">Select</option>
                        {BLOOD_GROUPS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    {/* Gender */}
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1"><User className="h-3 w-3" />Gender</Label>
                      <select value={gender} onChange={e => setGender(e.target.value)} disabled={loading}
                        className="w-full h-9 text-sm border border-gray-200 rounded-lg px-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                        <option value="">Select</option>
                        {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Address */}
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1"><MapPin className="h-3 w-3" />Address</Label>
                    <Input type="text" value={address} onChange={e => setAddress(e.target.value)}
                      placeholder="Home address" disabled={loading}
                      className="h-9 text-sm border-gray-200 bg-gray-50 focus:bg-white rounded-lg" />
                  </div>

                  {/* Medical Conditions */}
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1"><Activity className="h-3 w-3" />Medical Conditions</Label>
                    <Input type="text" value={medicalConditions} onChange={e => setMedicalConditions(e.target.value)}
                      placeholder="e.g. Diabetes, Hypertension" disabled={loading}
                      className="h-9 text-sm border-gray-200 bg-gray-50 focus:bg-white rounded-lg" />
                  </div>

                  {/* Allergies */}
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" />Allergies</Label>
                    <Input type="text" value={allergies} onChange={e => setAllergies(e.target.value)}
                      placeholder="e.g. Penicillin, Peanuts" disabled={loading}
                      className="h-9 text-sm border-gray-200 bg-gray-50 focus:bg-white rounded-lg" />
                  </div>

                  {/* Emergency Contact */}
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                      <Phone className="h-3 w-3 text-red-500" />
                      <span className="text-red-600">Emergency Contact</span>
                    </Label>
                    <Input type="text" value={emergencyContact} onChange={e => setEmergencyContact(e.target.value)}
                      placeholder="Name: +91 99999 99999" disabled={loading}
                      className="h-9 text-sm border-red-200 bg-red-50 focus:bg-white focus:border-red-400 rounded-lg" />
                  </div>

                  {error && (
                    <Alert variant="destructive" className="py-2.5 rounded-xl border-red-200 bg-red-50">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      <AlertDescription className="text-red-700 text-sm">{error}</AlertDescription>
                    </Alert>
                  )}

                  <button type="submit" disabled={loading}
                    className="w-full h-11 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold text-sm rounded-xl shadow-lg transition-all hover:-translate-y-0.5 disabled:opacity-60 flex items-center justify-center gap-2">
                    {loading ? (
                      <><span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving Profile…</>
                    ) : (
                      <><CheckCircle className="h-4 w-4" />Complete Setup</>
                    )}
                  </button>

                  <button type="button" onClick={skipStep2} disabled={loading}
                    className="w-full h-9 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors">
                    Skip for now — I'll complete this later
                  </button>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Signup;
