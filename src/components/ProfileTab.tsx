// src/components/ProfileTab.tsx — Reusable profile tab for all roles
import { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { User, Phone, Shield, Calendar, Info, Activity, AlertCircle, Edit, Save, X } from 'lucide-react';

interface ProfileTabProps {
  user: any;
  profile: any;
  onProfileUpdated: (updated: any) => void;
  roleColor?: string;
}

const BLOOD_GROUPS = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];
const GENDERS = ['Male','Female','Other','Prefer not to say'];

const ProfileTab = ({ user, profile, onProfileUpdated, roleColor = 'blue' }: ProfileTabProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: profile?.name || '',
    phone: profile?.phone || '',
    bloodGroup: profile?.bloodGroup || '',
    age: profile?.age ? String(profile.age) : '',
    gender: profile?.gender || '',
    address: profile?.address || '',
    medicalConditions: profile?.medicalConditions || '',
    allergies: profile?.allergies || '',
    emergencyContact: profile?.emergencyContact || '',
  });

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!user?.uid) return;
    setSaving(true);
    try {
      const data = { ...form, age: form.age ? parseInt(form.age) : null, updatedAt: serverTimestamp() };
      await updateDoc(doc(db, 'users', user.uid), data);
      onProfileUpdated({ ...profile, ...data });
      setIsEditing(false);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const fields = [
    { key: 'name', label: 'Full Name', type: 'text', icon: <User className="h-4 w-4" /> },
    { key: 'phone', label: 'Phone Number', type: 'tel', icon: <Phone className="h-4 w-4" /> },
    { key: 'bloodGroup', label: 'Blood Group', type: 'text', placeholder: 'e.g. A+, O-', icon: <Shield className="h-4 w-4" />, options: BLOOD_GROUPS },
    { key: 'age', label: 'Age', type: 'number', icon: <Calendar className="h-4 w-4" /> },
    { key: 'gender', label: 'Gender', type: 'text', options: GENDERS, icon: <User className="h-4 w-4" /> },
    { key: 'address', label: 'Address', type: 'text', icon: <Info className="h-4 w-4" /> },
    { key: 'medicalConditions', label: 'Medical Conditions', type: 'text', icon: <Activity className="h-4 w-4" /> },
    { key: 'allergies', label: 'Allergies', type: 'text', icon: <AlertCircle className="h-4 w-4" /> },
    { key: 'emergencyContact', label: 'Emergency Contact', type: 'text', placeholder: 'Name: Phone number', icon: <Phone className="h-4 w-4" /> },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5 text-blue-600" />My Profile
          </CardTitle>
          {!isEditing ? (
            <Button variant="outline" size="sm" className={`h-8 border-${roleColor}-300 text-${roleColor}-700 hover:bg-${roleColor}-50`} onClick={() => setIsEditing(true)}>
              <Edit className="h-3.5 w-3.5 mr-1" />Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-8 text-gray-600" onClick={() => setIsEditing(false)}><X className="h-3.5 w-3.5 mr-1" />Cancel</Button>
              <Button size="sm" className={`h-8 bg-${roleColor}-600 text-white hover:bg-${roleColor}-700`} onClick={handleSave} disabled={saving}>
                <Save className="h-3.5 w-3.5 mr-1" />{saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Avatar + name header */}
        <div className="flex items-center gap-4 mb-5 p-4 bg-gray-50 rounded-xl border border-gray-100">
          <Avatar className="h-16 w-16">
            <AvatarFallback className={`bg-${roleColor}-600 text-white text-2xl font-bold`}>{(form.name || profile?.name || 'U').charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="text-xl font-bold text-gray-800">{form.name || profile?.name || 'User'}</h3>
            <p className="text-sm text-gray-500">{user?.email}</p>
            <Badge className={`mt-1 bg-${roleColor}-100 text-${roleColor}-700 border border-${roleColor}-200 text-xs capitalize`}>{profile?.role || 'User'}</Badge>
          </div>
        </div>

        {!isEditing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {fields.map(f => (
              <div key={f.key} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                <div className="mt-0.5 text-gray-400">{f.icon}</div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 font-medium">{f.label}</p>
                  <p className="text-sm text-gray-800 break-words">{(profile as any)?.[f.key] || <span className="text-gray-400 italic">Not set</span>}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fields.map(f => (
              <div key={f.key} className="space-y-1">
                <Label className="text-xs font-semibold text-gray-600">{f.label}</Label>
                {f.options ? (
                  <select value={(form as any)[f.key]} onChange={e => set(f.key, e.target.value)}
                    className="w-full h-9 text-sm border border-gray-300 rounded-md px-3 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select {f.label}</option>
                    {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <Input type={f.type} placeholder={f.placeholder || f.label} value={(form as any)[f.key]}
                    onChange={e => set(f.key, e.target.value)} className="h-9 text-sm border-gray-300" />
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProfileTab;
