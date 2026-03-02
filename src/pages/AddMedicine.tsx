import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '@/lib/firebase-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Plus, X } from 'lucide-react';

const AddMedicine = () => {
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [instructions, setInstructions] = useState('');
  const [schedule, setSchedule] = useState<string[]>(['09:00']);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const frequencies = [
    { value: 'daily', label: 'Once Daily' },
    { value: 'twice_daily', label: 'Twice Daily' },
    { value: 'thrice_daily', label: 'Thrice Daily' },
    { value: 'weekly', label: 'Once a Week' },
    { value: 'as_needed', label: 'As Needed' }
  ];

  const addTime = () => {
    setSchedule([...schedule, '12:00']);
  };

  const removeTime = (index: number) => {
    setSchedule(schedule.filter((_, i) => i !== index));
  };

  const updateTime = (index: number, value: string) => {
    const newSchedule = [...schedule];
    newSchedule[index] = value;
    setSchedule(newSchedule);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const user = await getCurrentUser();
      if (!user) {
        navigate('/login');
        return;
      }

      const medicinesRef = collection(db, 'medicines');
      await addDoc(medicinesRef, {
        userId: user.uid,
        name,
        dosage,
        frequency,
        instructions,
        schedule,
        startDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      });

      navigate('/medicines');
    } catch (error) {
      console.error('Error adding medicine:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Add New Medicine</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Medicine Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Paracetamol"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dosage">Dosage *</Label>
              <Input
                id="dosage"
                value={dosage}
                onChange={(e) => setDosage(e.target.value)}
                placeholder="e.g., 500mg"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {frequencies.map(freq => (
                    <SelectItem key={freq.value} value={freq.value}>
                      {freq.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Schedule Times</Label>
              {schedule.map((time, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    type="time"
                    value={time}
                    onChange={(e) => updateTime(index, e.target.value)}
                    className="flex-1"
                  />
                  {schedule.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removeTime(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={addTime}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Another Time
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="instructions">Instructions</Label>
              <Textarea
                id="instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g., Take with food"
                rows={3}
              />
            </div>

            <div className="flex gap-4 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/medicines')}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || !name || !dosage}
                className="flex-1"
              >
                {loading ? 'Adding...' : 'Add Medicine'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AddMedicine;