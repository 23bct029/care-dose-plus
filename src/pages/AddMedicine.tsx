// src/pages/AddMedicine.tsx - With stock tracking + refill settings
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '@/lib/firebase-auth';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus, X, Pill, Package, Clock, Info } from 'lucide-react';

const FOOD_TIMINGS = ['Before food', 'After food', 'With food', 'Empty stomach', 'At bedtime', 'As needed'];
const FREQUENCIES = [
  { value:'once',   label:'Once Daily',       times:['09:00'] },
  { value:'twice',  label:'Twice Daily',       times:['09:00','21:00'] },
  { value:'thrice', label:'Three Times Daily', times:['08:00','14:00','20:00'] },
  { value:'four',   label:'Four Times Daily',  times:['08:00','12:00','16:00','20:00'] },
  { value:'weekly', label:'Once a Week',        times:['09:00'] },
  { value:'custom', label:'Custom',             times:[] },
];

const AddMedicine = () => {
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('once');
  const [schedule, setSchedule] = useState<string[]>(['09:00']);
  const [foodTiming, setFoodTiming] = useState('After food');
  const [instructions, setInstructions] = useState('');
  // Stock tracking
  const [trackStock, setTrackStock] = useState(true);
  const [totalQuantity, setTotalQuantity] = useState('30');
  const [refillAt, setRefillAt] = useState('5');
  // Duration
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleFrequencyChange = (val: string) => {
    setFrequency(val);
    const freq = FREQUENCIES.find(f => f.value === val);
    if (freq && freq.times.length > 0) setSchedule([...freq.times]);
  };

  const addTime = () => setSchedule(p => [...p, '12:00']);
  const removeTime = (i: number) => setSchedule(p => p.filter((_, idx) => idx !== i));
  const updateTime = (i: number, v: string) => setSchedule(p => { const n = [...p]; n[i] = v; return n; });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !dosage.trim()) return;
    setLoading(true);
    try {
      const user = await getCurrentUser();
      if (!user) { navigate('/login'); return; }
      const qty = trackStock ? parseInt(totalQuantity) || 30 : undefined;
      await addDoc(collection(db, 'medicines'), {
        userId: user.uid,
        name: name.trim(),
        dosage: dosage.trim(),
        schedule,
        foodTiming,
        instructions: instructions.trim(),
        startDate,
        endDate: endDate || null,
        totalQuantity: qty,
        currentQuantity: qty,
        refillReminderAt: trackStock ? parseInt(refillAt) || 5 : null,
        trackStock,
        createdAt: serverTimestamp(),
      });
      await logger.logWithUser(user.uid, user.email, 'info', 'Medicine added', { name, dosage });
      navigate('/elderly');
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const dosesPerDay = schedule.length;
  const daysSupply = trackStock && totalQuantity ? Math.floor(parseInt(totalQuantity) / Math.max(dosesPerDay, 1)) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-gray-600 h-9 w-9">
            <ArrowLeft className="h-5 w-5"/>
          </Button>
          <div>
            <h1 className="text-base font-bold text-gray-900">Add Medicine</h1>
            <p className="text-xs text-gray-500">Set up your medication schedule</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Basic info */}
          <Card className="bg-white border border-gray-200 shadow-none">
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Pill className="h-5 w-5 text-blue-600"/>Medicine Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <Label className="text-sm font-medium text-gray-700">Medicine Name *</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Paracetamol" className="border-gray-300 bg-white h-10" required/>
                </div>
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <Label className="text-sm font-medium text-gray-700">Dosage *</Label>
                  <Input value={dosage} onChange={e => setDosage(e.target.value)} placeholder="e.g. 500mg" className="border-gray-300 bg-white h-10" required/>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Frequency</Label>
                <div className="grid grid-cols-3 gap-2">
                  {FREQUENCIES.map(f => (
                    <button key={f.value} type="button"
                      className={`py-2 px-3 rounded-lg text-xs font-medium border-2 transition-colors ${frequency===f.value?'border-blue-500 bg-blue-50 text-blue-700':'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                      onClick={() => handleFrequencyChange(f.value)}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-gray-700">Schedule Times</Label>
                  <button type="button" onClick={addTime} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                    <Plus className="h-3 w-3"/>Add time
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {schedule.map((time, i) => (
                    <div key={i} className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1">
                      <Clock className="h-3.5 w-3.5 text-blue-500"/>
                      <input type="time" value={time} onChange={e => updateTime(i, e.target.value)}
                        className="bg-transparent text-sm text-blue-800 font-medium border-none outline-none w-[5.5rem]"/>
                      {schedule.length > 1 && (
                        <button type="button" onClick={() => removeTime(i)} className="text-blue-400 hover:text-red-500">
                          <X className="h-3.5 w-3.5"/>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-700">Food Timing</Label>
                  <select value={foodTiming} onChange={e => setFoodTiming(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 text-sm h-10 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {FOOD_TIMINGS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-gray-700">Start Date</Label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border-gray-300 bg-white h-10 text-sm"/>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">End Date (optional)</Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border-gray-300 bg-white h-10 text-sm" min={startDate}/>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Instructions</Label>
                <Textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Special instructions…" className="border-gray-300 bg-white text-sm resize-none" rows={2}/>
              </div>
            </CardContent>
          </Card>

          {/* Stock tracking */}
          <Card className="bg-white border border-gray-200 shadow-none">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base"><Package className="h-5 w-5 text-orange-500"/>Stock Tracking</CardTitle>
                <button type="button" onClick={() => setTrackStock(t => !t)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${trackStock?'bg-orange-500':'bg-gray-200'}`}>
                  <span className={`inline-block h-4 w-4 bg-white rounded-full transition-transform shadow ${trackStock?'translate-x-6':'translate-x-1'}`}/>
                </button>
              </div>
            </CardHeader>
            {trackStock && (
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-gray-700">Total Tablets/Units</Label>
                    <Input type="number" value={totalQuantity} onChange={e => setTotalQuantity(e.target.value)}
                      placeholder="30" min="1" className="border-gray-300 bg-white h-10 text-sm"/>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-gray-700">Alert when below</Label>
                    <Input type="number" value={refillAt} onChange={e => setRefillAt(e.target.value)}
                      placeholder="5" min="1" className="border-gray-300 bg-white h-10 text-sm"/>
                  </div>
                </div>
                {daysSupply !== null && (
                  <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <Info className="h-4 w-4 text-orange-600 shrink-0"/>
                    <p className="text-sm text-orange-800">
                      {totalQuantity} tablets at {dosesPerDay} dose{dosesPerDay > 1 ? 's' : ''}/day =
                      <strong className="ml-1">{daysSupply} day supply</strong>
                    </p>
                  </div>
                )}
                <p className="text-xs text-gray-500">Your caregiver will be notified when stock drops to {refillAt} days remaining.</p>
              </CardContent>
            )}
          </Card>

          <div className="flex gap-3 pb-6">
            <Button type="button" variant="outline" className="flex-1 border-gray-300 text-gray-700 h-11" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold h-11" disabled={loading || !name || !dosage}>
              <Plus className="h-4 w-4 mr-2"/>{loading ? 'Saving...' : 'Add Medicine'}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default AddMedicine;
