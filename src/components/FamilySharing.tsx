// src/components/FamilySharing.tsx - Family sharing with permission-based access
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp, getDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Users, Plus, Trash2, Eye, Edit, UserPlus, CheckCircle, X, Calendar, Pill, Shield } from 'lucide-react';

export type FamilyPermission = 'view_medicines' | 'view_appointments' | 'mark_taken' | 'book_appointments' | 'full_access';

export interface FamilyMember {
  id: string;
  patientId: string;
  memberId: string;
  memberName: string;
  memberEmail: string;
  relationship: string;
  permissions: FamilyPermission[];
  status: 'pending' | 'active' | 'revoked';
  addedAt: any;
}

const PERMISSION_LABELS: Record<FamilyPermission, {label:string; icon:any; desc:string}> = {
  view_medicines:      { label:'View Medicines',      icon: Pill,     desc:'See medicine schedule' },
  view_appointments:   { label:'View Appointments',   icon: Calendar, desc:'See upcoming appointments' },
  mark_taken:          { label:'Mark as Taken',       icon: CheckCircle, desc:'Mark medicines as taken on behalf' },
  book_appointments:   { label:'Book Appointments',   icon: Calendar, desc:'Schedule appointments' },
  full_access:         { label:'Full Access',          icon: Shield,   desc:'All permissions' },
};

interface FamilySharingProps {
  patientId: string;
  patientName: string;
  currentUserId: string;
}

const FamilySharing = ({ patientId, patientName, currentUserId }: FamilySharingProps) => {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState('Family');
  const [permissions, setPermissions] = useState<FamilyPermission[]>(['view_medicines', 'view_appointments']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'family_sharing'), where('patientId', '==', patientId));
    const unsub = onSnapshot(q, snap => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })) as FamilyMember[]);
    });
    return () => unsub();
  }, [patientId]);

  const handleAdd = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    try {
      // Find user by email
      const usersSnap = await getDocs(query(collection(db, 'users'), where('email', '==', email.trim().toLowerCase())));
      if (usersSnap.empty) { setError('No user found with this email.'); setLoading(false); return; }
      const memberDoc = usersSnap.docs[0];
      const memberData = memberDoc.data();

      // Check not already added
      const existing = members.find(m => m.memberId === memberDoc.id && m.status !== 'revoked');
      if (existing) { setError('This person already has access.'); setLoading(false); return; }

      await addDoc(collection(db, 'family_sharing'), {
        patientId, memberId: memberDoc.id,
        memberName: memberData.name || email.split('@')[0],
        memberEmail: email.trim().toLowerCase(),
        relationship, permissions,
        status: 'active', addedAt: serverTimestamp(),
        addedBy: currentUserId,
      });

      // Notify the new family member
      await addDoc(collection(db, 'notifications'), {
        userId: memberDoc.id, type: 'family_access_granted',
        message: `You have been granted access to ${patientName}'s care profile as ${relationship}.`,
        read: false, createdAt: serverTimestamp(),
      });

      setEmail(''); setRelationship('Family'); setPermissions(['view_medicines','view_appointments']);
      setShowAddModal(false);
    } catch (e) { setError('Failed to add member.'); }
    finally { setLoading(false); }
  };

  const handleRevoke = async (memberId: string) => {
    if (!confirm('Remove this family member?')) return;
    await updateDoc(doc(db, 'family_sharing', memberId), { status: 'revoked' });
  };

  const togglePermission = (p: FamilyPermission) => {
    setPermissions(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  return (
    <Card className="bg-white border border-gray-200 shadow-none">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5 text-teal-600"/>Family Sharing
            <Badge className="bg-teal-100 text-teal-700 text-xs">{members.filter(m=>m.status==='active').length} active</Badge>
          </CardTitle>
          <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white h-8 px-3 text-xs" onClick={() => setShowAddModal(true)}>
            <UserPlus className="h-3.5 w-3.5 mr-1"/>Add Member
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {members.filter(m => m.status === 'active').length === 0 ? (
          <div className="py-6 text-center">
            <Users className="h-10 w-10 text-gray-300 mx-auto mb-2"/>
            <p className="text-sm text-gray-500">No family members added yet.</p>
            <p className="text-xs text-gray-400 mt-1">Add family members to share care access.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {members.filter(m => m.status === 'active').map(m => (
              <div key={m.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-sm">{m.memberName?.charAt(0)}</div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{m.memberName}</p>
                    <p className="text-xs text-gray-500">{m.memberEmail} · {m.relationship}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {m.permissions.slice(0,3).map(p => (
                        <span key={p} className="text-[10px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded">
                          {PERMISSION_LABELS[p]?.label || p}
                        </span>
                      ))}
                      {m.permissions.length > 3 && <span className="text-[10px] text-gray-400">+{m.permissions.length-3}</span>}
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50 h-8 w-8 p-0" onClick={() => handleRevoke(m.id)}>
                  <Trash2 className="h-3.5 w-3.5"/>
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="bg-white max-w-md" aria-describedby="fs-desc">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-teal-600"/>Add Family Member</DialogTitle></DialogHeader>
          <p id="fs-desc" className="text-sm text-gray-600">Grant a family member access to view or help manage {patientName}'s care.</p>
          <div className="space-y-4">
            {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Email Address *</Label>
              <Input placeholder="family@example.com" value={email} onChange={e => setEmail(e.target.value)} className="border-gray-300 bg-white h-10 text-sm"/>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Relationship</Label>
              <select value={relationship} onChange={e => setRelationship(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm h-10">
                {['Spouse','Parent','Child','Sibling','Relative','Family','Friend','Other'].map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Permissions</Label>
              <div className="space-y-2">
                {(Object.keys(PERMISSION_LABELS) as FamilyPermission[]).map(p => {
                  const cfg = PERMISSION_LABELS[p];
                  const Icon = cfg.icon;
                  const checked = permissions.includes(p);
                  return (
                    <label key={p} className={`flex items-center gap-3 p-2.5 rounded-lg border-2 cursor-pointer transition-colors ${checked?'border-teal-400 bg-teal-50':'border-gray-200 hover:border-gray-300'}`}>
                      <input type="checkbox" className="sr-only" checked={checked} onChange={() => togglePermission(p)}/>
                      <div className={`h-5 w-5 rounded border-2 flex items-center justify-center ${checked?'bg-teal-600 border-teal-600':'border-gray-300'}`}>
                        {checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                      </div>
                      <Icon className={`h-4 w-4 ${checked?'text-teal-600':'text-gray-400'}`}/>
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${checked?'text-teal-800':'text-gray-700'}`}>{cfg.label}</p>
                        <p className="text-xs text-gray-400">{cfg.desc}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-3">
              <Button className="flex-1 bg-teal-600 hover:bg-teal-700 text-white h-10" onClick={handleAdd} disabled={loading || !email}>
                <UserPlus className="h-4 w-4 mr-2"/>{loading ? 'Adding...' : 'Add Member'}
              </Button>
              <Button variant="outline" className="border-gray-300 text-gray-700 h-10 px-4" onClick={() => setShowAddModal(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default FamilySharing;
