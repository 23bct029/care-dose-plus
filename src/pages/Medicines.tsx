import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '@/lib/firebase-auth';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Pill, Plus, ArrowLeft, Clock, Trash2 } from 'lucide-react';

const Medicines = () => {
  const [medicines, setMedicines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadMedicines();
  }, []);

  const loadMedicines = async () => {
    try {
      const user = await getCurrentUser();
      if (!user) return;

      const medicinesRef = collection(db, 'medicines');
      const q = query(medicinesRef, where('userId', '==', user.uid));
      const querySnapshot = await getDocs(q);
      
      const meds: any[] = [];
      querySnapshot.forEach((doc) => {
        meds.push({ id: doc.id, ...doc.data() });
      });
      setMedicines(meds);
    } catch (error) {
      console.error('Error loading medicines:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this medicine?')) return;
    try {
      await deleteDoc(doc(db, 'medicines', id));
      loadMedicines();
    } catch (error) {
      console.error('Error deleting medicine:', error);
    }
  };

  if (loading) {
    return <div className="p-4 text-center">Loading...</div>;
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button onClick={() => navigate('/medicines/add')}>
          <Plus className="h-4 w-4 mr-2" />
          Add Medicine
        </Button>
      </div>

      <h1 className="text-2xl font-bold mb-6">My Medicines</h1>

      {medicines.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Pill className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">No medicines added yet</p>
            <Button onClick={() => navigate('/medicines/add')}>
              Add Your First Medicine
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {medicines.map((med) => (
            <Card key={med.id}>
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-lg">{med.name}</h3>
                    <p className="text-sm text-gray-600">{med.dosage}</p>
                    <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                      <Clock className="h-3 w-3" />
                      <span>{med.frequency}</span>
                    </div>
                    {med.instructions && (
                      <p className="text-xs text-gray-500 mt-1 italic">"{med.instructions}"</p>
                    )}
                  </div>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={() => handleDelete(med.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Medicines;