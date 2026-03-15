// src/components/WearableWidget.tsx - Real Google Fit + Fitbit integration
import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Activity, Heart, Moon, Zap, Smartphone, RefreshCw, Wifi, WifiOff, Link, Unlink } from 'lucide-react';
import { saveHealthData, getHealthData, GoogleFitAPI, FitbitAPI, setupFallDetection } from '@/lib/wearable';

interface WearableWidgetProps {
  userId: string;
  onFallDetected?: () => void;
  compact?: boolean;
}

const WearableWidget = ({ userId, onFallDetected, compact = false }: WearableWidgetProps) => {
  const [latest, setLatest] = useState<any>(null);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({ heartRate: '', steps: '', bloodOxygen: '', sleepHours: '' });
  const [fallActive, setFallActive] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [fitbitConnected, setFitbitConnected] = useState(false);
  const fallCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const data = getHealthData(userId, 1);
    if (data.length) setLatest(data[data.length - 1]);
    setGoogleConnected(GoogleFitAPI.isConnected());
    setFitbitConnected(FitbitAPI.isConnected());
  }, [userId]);

  const syncLiveData = async () => {
    setSyncing(true);
    try {
      let hr: number | null = null;
      let steps: number | null = null;
      let spo2: number | null = null;
      let source: 'google_fit' | 'fitbit' | 'manual' = 'manual';

      if (googleConnected) {
        [hr, steps, spo2] = await Promise.all([
          GoogleFitAPI.getHeartRate(),
          GoogleFitAPI.getSteps(),
          GoogleFitAPI.getBloodOxygen(),
        ]);
        source = 'google_fit';
      } else if (fitbitConnected) {
        [hr, steps] = await Promise.all([FitbitAPI.getHeartRate(), FitbitAPI.getSteps()]);
        source = 'fitbit';
      }

      if (hr || steps || spo2) {
        const entry = saveHealthData(userId, { heartRate: hr||undefined, steps: steps||undefined, bloodOxygen: spo2||undefined, source });
        setLatest(entry);
      }
    } catch (e) {
      console.error('Sync failed:', e);
    }
    setSyncing(false);
  };

  const toggleFall = () => {
    if (fallActive && fallCleanupRef.current) {
      fallCleanupRef.current(); fallCleanupRef.current = null; setFallActive(false);
    } else {
      fallCleanupRef.current = setupFallDetection(() => { if (onFallDetected) onFallDetected(); });
      setFallActive(true);
    }
  };

  const handleManualSave = () => {
    const entry = saveHealthData(userId, {
      heartRate:   manual.heartRate   ? parseInt(manual.heartRate)     : undefined,
      steps:       manual.steps       ? parseInt(manual.steps)         : undefined,
      bloodOxygen: manual.bloodOxygen ? parseFloat(manual.bloodOxygen) : undefined,
      sleepHours:  manual.sleepHours  ? parseFloat(manual.sleepHours)  : undefined,
      source: 'manual',
    });
    setLatest(entry);
    setManual({ heartRate: '', steps: '', bloodOxygen: '', sleepHours: '' });
    setShowManual(false);
  };

  const vitals = [
    { key: 'heartRate',   label: 'Heart Rate',  unit: 'bpm', icon: <Heart className="h-4 w-4 text-red-500"/>,    range: [60, 100] },
    { key: 'steps',       label: 'Steps',        unit: '',    icon: <Activity className="h-4 w-4 text-blue-500"/>, range: [5000, 15000] },
    { key: 'bloodOxygen', label: 'Blood O₂',    unit: '%',   icon: <Zap className="h-4 w-4 text-purple-500"/>,   range: [95, 100] },
    { key: 'sleepHours',  label: 'Sleep',        unit: 'hrs', icon: <Moon className="h-4 w-4 text-indigo-500"/>,  range: [7, 9] },
  ];

  const isAnyConnected = googleConnected || fitbitConnected;

  if (compact && !latest && !isAnyConnected) return null;

  return (
    <Card className="bg-white border border-gray-200 shadow-none">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Activity className="h-4 w-4 text-blue-600"/>Health Vitals
            {isAnyConnected && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <Wifi className="h-2.5 w-2.5"/>
                {googleConnected ? 'Google Fit' : 'Fitbit'}
              </span>
            )}
          </CardTitle>
          <div className="flex gap-1.5">
            {isAnyConnected && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-blue-600 hover:bg-blue-50" onClick={syncLiveData} disabled={syncing}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncing ? 'animate-spin' : ''}`}/>{syncing ? 'Syncing...' : 'Sync'}
              </Button>
            )}
            <Button size="sm" variant="ghost" className={`h-7 px-2 text-xs ${fallActive ? 'text-orange-600 bg-orange-50' : 'text-gray-500'}`} onClick={toggleFall}>
              🛡️ {fallActive ? 'On' : 'Fall'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-gray-500" onClick={() => setShowManual(s => !s)}>
              <Smartphone className="h-3.5 w-3.5 mr-1"/>Log
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Vitals grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {vitals.map(v => {
            const val = latest?.[v.key];
            const isLow = val != null && val < v.range[0];
            const isHigh = val != null && val > v.range[1];
            const bad = isLow || isHigh;
            return (
              <div key={v.key} className={`p-2.5 rounded-xl border text-center ${!val ? 'bg-gray-50 border-gray-100' : bad ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-100'}`}>
                <div className="flex justify-center mb-1">{v.icon}</div>
                <p className={`text-lg font-bold ${!val ? 'text-gray-400' : bad ? 'text-red-600' : 'text-emerald-700'}`}>
                  {val != null ? val : '—'}<span className="text-xs font-normal ml-0.5">{v.unit}</span>
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">{v.label}</p>
                {bad && val != null && <p className="text-[9px] text-red-500 font-semibold mt-0.5">{isLow ? 'LOW' : 'HIGH'}</p>}
              </div>
            );
          })}
        </div>

        {latest && (
          <p className="text-[10px] text-gray-400 text-center">
            Last synced: {new Date(latest.timestamp).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})} · Source: {latest.source?.replace('_',' ')}
          </p>
        )}

        {/* Manual entry */}
        {showManual && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-3">
            <p className="text-xs font-semibold text-blue-700">Log Manually</p>
            <div className="grid grid-cols-2 gap-2">
              {vitals.map(v => (
                <div key={v.key} className="space-y-1">
                  <Label className="text-xs text-gray-600">{v.label}{v.unit ? ` (${v.unit})` : ''}</Label>
                  <Input type="number" placeholder="—" value={(manual as any)[v.key]}
                    onChange={e => setManual(p => ({ ...p, [v.key]: e.target.value }))}
                    className="bg-white border-gray-300 h-8 text-sm"/>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-4 text-xs" onClick={handleManualSave}>Save</Button>
              <Button size="sm" variant="outline" className="border-gray-300 text-gray-600 h-8 px-3 text-xs" onClick={() => setShowManual(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Device connections */}
        {!compact && (
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500">Connect a wearable device</p>

            {/* Google Fit */}
            <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex items-center gap-2">
                <span className="text-base">🏃</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">Google Fit</p>
                  <p className="text-xs text-gray-400">{googleConnected ? 'Connected — heart rate, steps, SpO₂' : 'Sync from Google Fit / Wear OS'}</p>
                </div>
              </div>
              {googleConnected ? (
                <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 h-8 px-3 text-xs"
                  onClick={() => { GoogleFitAPI.disconnect(); setGoogleConnected(false); }}>
                  <Unlink className="h-3.5 w-3.5 mr-1"/>Disconnect
                </Button>
              ) : (
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-3 text-xs"
                  onClick={() => GoogleFitAPI.connect()}>
                  <Link className="h-3.5 w-3.5 mr-1"/>Connect
                </Button>
              )}
            </div>

            {/* Fitbit */}
            <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex items-center gap-2">
                <span className="text-base">⌚</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">Fitbit</p>
                  <p className="text-xs text-gray-400">
                    {fitbitConnected ? 'Connected — heart rate, steps' :
                     FitbitAPI.isConfigured() ? 'Sync from Fitbit device' : 'Setup required — see .env.example'}
                  </p>
                </div>
              </div>
              {fitbitConnected ? (
                <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 h-8 px-3 text-xs"
                  onClick={() => { FitbitAPI.disconnect(); setFitbitConnected(false); }}>
                  <Unlink className="h-3.5 w-3.5 mr-1"/>Disconnect
                </Button>
              ) : (
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white h-8 px-3 text-xs"
                  onClick={() => FitbitAPI.connect()}>
                  <Link className="h-3.5 w-3.5 mr-1"/>{FitbitAPI.isConfigured() ? 'Connect' : 'Setup first'}
                </Button>
              )}
            </div>

            {/* Apple Health note */}
            <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-200 opacity-60">
              <div className="flex items-center gap-2">
                <span className="text-base">🍎</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">Apple Health</p>
                  <p className="text-xs text-gray-400">Available in iOS app (React Native)</p>
                </div>
              </div>
              <span className="text-xs bg-gray-200 text-gray-500 px-2 py-1 rounded-full">iOS only</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WearableWidget;
