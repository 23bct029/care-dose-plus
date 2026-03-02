import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '@/lib/firebase-auth';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, ArrowLeft, CheckCircle, XCircle } from 'lucide-react';

const Schedule = () => {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadAppointments();
  }, []);

  const loadAppointments = async () => {
    try {
      const user = await getCurrentUser();
      if (!user) return;

      const today = new Date().toISOString().split('T')[0];
      const appointmentsRef = collection(db, 'appointments');
      const q = query(
        appointmentsRef,
        where('userId', '==', user.uid),
        where('date', '>=', today)
      );
      const querySnapshot = await getDocs(q);
      
      const apps: any[] = [];
      querySnapshot.forEach((doc) => {
        apps.push({ id: doc.id, ...doc.data() });
      });
      
      // Sort by date and time
      apps.sort((a, b) => {
        if (a.date === b.date) {
          return a.time.localeCompare(b.time);
        }
        return a.date.localeCompare(b.date);
      });
      
      setAppointments(apps);
    } catch (error) {
      console.error('Error loading appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-center">Loading schedule...</div>
    );
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>

      <h1 className="text-2xl font-bold mb-6">Your Schedule</h1>

      {appointments.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No upcoming appointments</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {appointments.map((apt) => (
            <Card key={apt.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Calendar className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{apt.title || 'Appointment'}</h3>
                      <p className="text-sm text-gray-600">Dr. {apt.doctor || 'Unknown'}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Clock className="h-3 w-3 text-gray-500" />
                        <span className="text-sm text-gray-600">
                          {new Date(apt.date).toLocaleDateString()} at {apt.time}
                        </span>
                      </div>
                      {apt.location && (
                        <p className="text-xs text-gray-500 mt-1">{apt.location}</p>
                      )}
                    </div>
                  </div>
                  <Badge variant={apt.status === 'completed' ? 'secondary' : 'default'}>
                    {apt.status || 'Scheduled'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Schedule;