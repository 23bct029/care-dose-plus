import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '@/lib/firebase-auth';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, deleteDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pill, Plus, ArrowLeft, Clock, Trash2, AlertTriangle, Calendar, Info, RefreshCw } from 'lucide-react';

function estimateRefillStatus(med: any): { daysLeft: number | null; needsRefill: boolean } {
  if (!med.startDate || !med.totalQuantity) return { daysLeft: null, needsRefill: false };
  const dosesPerDay = (med.schedule?.length || 1);
  const startDate = new Date(med.startDate);
  const daysSinceStart = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const dosesUsed = daysSinceStart * dosesPerDay;
  const dosesLeft = Math.max(0, (med.totalQuantity || 30) - dosesUsed);
  const daysLeft = Math.floor(dosesLeft / dosesPerDay);
  return { daysLeft, needsRefill: daysLeft <= 7 };
}

const Medicines = () => {
  const [medicines, setMedicines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => { loadMedicines(); }, []);

  const loadMedicines = async () => {
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) { navigate('/login'); return; }
      setUser(currentUser);
      const medicinesRef = collection(db, 'medicines');
      const q = query(medicinesRef, where('userId', '==', currentUser.uid));
      const querySnapshot = await getDocs(q);
      const meds: any[] = [];
      querySnapshot.forEach((d) => meds.push({ id: d.id, ...d.data() }));
      setMedicines(meds);

      // Check for refill reminders
      for (const med of meds) {
        const { daysLeft, needsRefill } = estimateRefillStatus(med);
        if (needsRefill && !med.refillNotifiedAt) {
          // Send refill notification
          await addDoc(collection(db, 'notifications'), {
            userId: currentUser.uid,
            type: 'refill_reminder',
            title: 'Refill Reminder',
            message: `${med.name} supply is running low (${daysLeft ?? '<7'} days remaining). Please arrange a refill.`,
            read: false,
            createdAt: serverTimestamp()
          });
          // Also notify caregiver
          const connQ = query(collection(db, 'connections'), where('users', 'array-contains', currentUser.uid), where('status', '==', 'active'));
          const connSnap = await getDocs(connQ);
          for (const connDoc of connSnap.docs) {
            const conn = connDoc.data();
            if (conn.relationship?.includes('caregiver')) {
              const caregiverId = conn.users.find((id: string) => id !== currentUser.uid);
              if (caregiverId) {
                await addDoc(collection(db, 'notifications'), {
                  userId: caregiverId,
                  type: 'refill_reminder',
                  title: 'Patient Medicine Refill Needed',
                  message: `${med.name} for your patient is running low (${daysLeft ?? '<7'} days left). Please help arrange a refill.`,
                  read: false,
                  createdAt: serverTimestamp()
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading medicines:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'medicines', id));
      setDeleteId(null);
      loadMedicines();
    } catch (error) {
      console.error('Error deleting medicine:', error);
    }
  };

  const getFoodTimingLabel = (timing?: string) => {
    if (timing === 'before') return 'Before food';
    if (timing === 'after') return 'After food';
    if (timing === 'with') return 'With food';
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="hover:bg-gray-100">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2">
                <Pill className="h-6 w-6 text-blue-600" />
                <h1 className="text-xl font-bold text-gray-800">My Medicines</h1>
              </div>
            </div>
            <Button
              onClick={() => navigate('/medicines/add')}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Medicine
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-4">
        {/* Summary */}
        {medicines.length > 0 && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-full">
                <Info className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-blue-800">{medicines.length} medicine{medicines.length !== 1 ? 's' : ''} registered</p>
                <p className="text-sm text-blue-600">Tap any medicine to view details, or delete with the trash icon</p>
              </div>
            </CardContent>
          </Card>
        )}

        {medicines.length === 0 ? (
          <Card className="border-2 border-dashed border-gray-300">
            <CardContent className="p-10 text-center">
              <div className="p-4 bg-blue-50 rounded-full inline-block mb-4">
                <Pill className="h-12 w-12 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">No Medicines Yet</h3>
              <p className="text-gray-500 mb-5">Add your first medicine to track your schedule</p>
              <Button onClick={() => navigate('/medicines/add')} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Medicine
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {medicines.map((med) => (
              <Card key={med.id} className="hover:shadow-md transition-all border border-gray-200">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="p-2.5 bg-blue-100 rounded-xl shrink-0 mt-0.5">
                        <Pill className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-gray-800 text-lg">{med.name}</h3>
                          <Badge variant="secondary" className="text-xs">{med.dosage}</Badge>
                        </div>

                        {med.schedule && med.schedule.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <Clock className="h-3.5 w-3.5 text-gray-400" />
                            {med.schedule.map((time: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-xs border-blue-200 text-blue-700 bg-blue-50">
                                {time}
                              </Badge>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2 mt-2">
                          {med.frequency && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> {med.frequency}
                            </span>
                          )}
                          {getFoodTimingLabel(med.foodTiming) && (
                            <Badge variant="outline" className="text-xs border-green-200 text-green-700 bg-green-50">
                              🍽️ {getFoodTimingLabel(med.foodTiming)}
                            </Badge>
                          )}
                        </div>

                        {med.instructions && (
                          <p className="text-xs text-gray-500 mt-1.5 italic bg-gray-50 px-2 py-1 rounded">
                            {med.instructions}
                          </p>
                        )}

                        {med.prescribedBy && (
                          <p className="text-xs text-gray-400 mt-1">
                            Prescribed by Dr. {med.prescribedBy}
                          </p>
                        )}

                        {/* Refill reminder */}
                        {(() => {
                          const { daysLeft, needsRefill } = estimateRefillStatus(med);
                          if (daysLeft === null) return null;
                          return needsRefill ? (
                            <div className="mt-2 flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                              <RefreshCw className="h-3 w-3 text-amber-600" />
                              <span className="text-xs text-amber-700 font-medium">⚠ Refill needed — ~{daysLeft} day{daysLeft !== 1 ? 's' : ''} left</span>
                            </div>
                          ) : daysLeft <= 14 ? (
                            <div className="mt-2 flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1">
                              <RefreshCw className="h-3 w-3 text-blue-500" />
                              <span className="text-xs text-blue-600">~{daysLeft} days of supply remaining</span>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                      onClick={() => setDeleteId(med.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm" aria-describedby="delete-med-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Delete Medicine
            </DialogTitle>
          </DialogHeader>
          <p id="delete-med-desc" className="text-gray-600 text-sm">
            Are you sure you want to delete this medicine? Your tracking history will be kept, but this medicine will no longer appear in your schedule.
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => deleteId && handleDelete(deleteId)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Medicines;
