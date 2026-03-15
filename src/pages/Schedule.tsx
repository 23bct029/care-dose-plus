import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '@/lib/firebase-auth';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar, Clock, ArrowLeft, MapPin, Stethoscope, CheckCircle, XCircle, Plus } from 'lucide-react';

const Schedule = () => {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [requestForm, setRequestForm] = useState({ doctorId: '', date: '', time: '09:00', type: 'checkup', notes: '' });
  const navigate = useNavigate();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) { navigate('/login'); return; }
      setUser(currentUser);

      // Load appointments where patient is this user - simple query, sort client-side
      const q = query(collection(db, 'appointments'),
        where('patientId', '==', currentUser.uid));
      const snap = await getDocs(q);
      interface AppItem { id: string; date: string; time: string; [key: string]: any; }
      const apps: AppItem[] = (snap.docs
        .map(d => ({ id: d.id, ...d.data() })) as AppItem[])
        .sort((a, b) => ((a.date||'') + (a.time||'')).localeCompare((b.date||'') + (b.time||'')));
      setAppointments(apps);

      // Load connected doctors
      const connQ = query(collection(db, 'connections'),
        where('users', 'array-contains', currentUser.uid),
        where('status', '==', 'active'));
      const connSnap = await getDocs(connQ);
      const doctorList: any[] = [];
      for (const connDoc of connSnap.docs) {
        const conn = connDoc.data();
        if (conn.relationship?.includes('patient') || conn.relationship === 'doctor-patient') {
          const doctorId = conn.users.find((id: string) => id !== currentUser.uid);
          if (doctorId) {
            const doctorEmail = conn.userEmails?.find((e: string) => e !== currentUser.email);
            doctorList.push({ id: doctorId, email: doctorEmail, name: doctorEmail?.split('@')[0] || 'Doctor' });
          }
        }
      }
      setDoctors(doctorList);
    } catch (error) {
      console.error('Error loading appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestAppointment = async () => {
    if (!requestForm.doctorId || !requestForm.date) return;
    try {
      const doctor = doctors.find(d => d.id === requestForm.doctorId);
      await addDoc(collection(db, 'appointments'), {
        patientId: user.uid,
        patientName: user.displayName || user.email,
        doctorId: requestForm.doctorId,
        doctorName: doctor?.name || 'Doctor',
        date: requestForm.date,
        time: requestForm.time,
        type: requestForm.type,
        notes: requestForm.notes,
        status: 'pending',
        requestedBy: 'patient',
        createdAt: serverTimestamp()
      });
      // Notify doctor
      await addDoc(collection(db, 'notifications'), {
        userId: requestForm.doctorId,
        type: 'appointment_request',
        title: 'Appointment Request',
        message: `${user.displayName || user.email} has requested an appointment on ${requestForm.date} at ${requestForm.time}`,
        read: false,
        createdAt: serverTimestamp()
      });
      setShowRequestModal(false);
      setRequestForm({ doctorId: '', date: '', time: '09:00', type: 'checkup', notes: '' });
      loadData();
    } catch (err) { console.error(err); }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed': return <Badge className="bg-green-100 text-green-800 border border-green-200"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'cancelled': return <Badge className="bg-red-100 text-red-800 border border-red-200"><XCircle className="h-3 w-3 mr-1" />Cancelled</Badge>;
      case 'pending': return <Badge className="bg-amber-100 text-amber-800 border border-amber-200"><Clock className="h-3 w-3 mr-1" />Pending Approval</Badge>;
      default: return <Badge className="bg-blue-100 text-blue-800 border border-blue-200"><Calendar className="h-3 w-3 mr-1" />Scheduled</Badge>;
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const upcoming = appointments.filter(a => a.date >= today && a.status !== 'cancelled');
  const past = appointments.filter(a => a.date < today || a.status === 'cancelled' || a.status === 'completed');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="border border-gray-200">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">My Appointments</h1>
              <p className="text-sm text-gray-500">{upcoming.length} upcoming</p>
            </div>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setShowRequestModal(true)}>
            <Plus className="h-4 w-4 mr-2" />Request Appointment
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {upcoming.length === 0 && past.length === 0 && (
          <Card className="bg-white border border-gray-200">
            <CardContent className="py-16 text-center">
              <Calendar className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-600 mb-2">No Appointments</h3>
              <p className="text-gray-500 mb-6">Request an appointment with your doctor</p>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setShowRequestModal(true)}>
                <Plus className="h-4 w-4 mr-2" />Request Appointment
              </Button>
            </CardContent>
          </Card>
        )}

        {upcoming.length > 0 && (
          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-gray-100">
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />Upcoming Appointments
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-4">
                {upcoming.map(apt => {
                  const aptDate = new Date(apt.date + 'T00:00:00');
                  const isToday = apt.date === today;
                  return (
                    <div key={apt.id} className={`p-4 rounded-xl border-2 transition-all ${isToday ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-4">
                          <div className={`p-3 rounded-full ${isToday ? 'bg-blue-100' : 'bg-gray-100'}`}>
                            <Stethoscope className={`h-6 w-6 ${isToday ? 'text-blue-600' : 'text-gray-500'}`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold text-gray-900">{apt.doctorName || apt.doctor || 'Doctor'}</p>
                              {isToday && <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-medium">Today</span>}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-gray-600">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                {aptDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />{apt.time}
                              </span>
                            </div>
                            {apt.type && <p className="text-xs text-gray-500 mt-1 capitalize">{apt.type.replace('_', ' ')}</p>}
                            {apt.location && (
                              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                <MapPin className="h-3 w-3" />{apt.location}
                              </p>
                            )}
                            {apt.notes && <p className="text-sm text-gray-600 mt-2 italic">{apt.notes}</p>}
                          </div>
                        </div>
                        {getStatusBadge(apt.status)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {past.length > 0 && (
          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-gray-100">
              <CardTitle className="text-gray-700 text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />Past Appointments
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-3">
                {past.map(apt => (
                  <div key={apt.id} className="p-3 rounded-lg border border-gray-200 bg-gray-50 opacity-75">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-700">{apt.doctorName || apt.doctor || 'Doctor'}</p>
                        <p className="text-sm text-gray-500">{new Date(apt.date + 'T00:00:00').toLocaleDateString()} at {apt.time}</p>
                      </div>
                      {getStatusBadge(apt.status)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <Dialog open={showRequestModal} onOpenChange={setShowRequestModal}>
        <DialogContent className="bg-white max-w-md rounded-2xl" aria-describedby="req-desc">
          <DialogHeader>
            <DialogTitle className="text-gray-900 text-xl">Request Appointment</DialogTitle>
          </DialogHeader>
          <div id="req-desc" className="sr-only">Request appointment with doctor</div>
          <div className="space-y-4">
            {doctors.length > 0 ? (
              <div className="space-y-2">
                <Label className="text-gray-700 font-medium">Select Doctor *</Label>
                <select className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900 bg-white"
                  value={requestForm.doctorId}
                  onChange={e => setRequestForm(p => ({ ...p, doctorId: e.target.value }))}>
                  <option value="">-- Select Doctor --</option>
                  {doctors.map(d => <option key={d.id} value={d.id}>Dr. {d.name}</option>)}
                </select>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                No connected doctors. Connect with a doctor from the Connections section first.
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-gray-700 font-medium">Preferred Date *</Label>
                <Input type="date" value={requestForm.date} min={today} onChange={e => setRequestForm(p => ({ ...p, date: e.target.value }))} className="border-gray-300" />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-700 font-medium">Preferred Time</Label>
                <Input type="time" value={requestForm.time} onChange={e => setRequestForm(p => ({ ...p, time: e.target.value }))} className="border-gray-300" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700 font-medium">Type</Label>
              <select className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900 bg-white" value={requestForm.type} onChange={e => setRequestForm(p => ({ ...p, type: e.target.value }))}>
                <option value="checkup">Regular Checkup</option>
                <option value="followup">Follow-up</option>
                <option value="consultation">Consultation</option>
                <option value="emergency">Urgent/Emergency</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700 font-medium">Reason / Notes</Label>
              <Textarea value={requestForm.notes} onChange={e => setRequestForm(p => ({ ...p, notes: e.target.value }))} placeholder="Briefly describe your concern..." rows={3} className="border-gray-300" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 border-gray-300" onClick={() => setShowRequestModal(false)}>Cancel</Button>
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" disabled={!requestForm.doctorId || !requestForm.date} onClick={handleRequestAppointment}>
                Send Request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Schedule;
