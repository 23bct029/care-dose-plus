// src/components/SetupGuide.tsx - In-app setup guide for push notifications + integrations
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Circle, ExternalLink, Bell, Activity, Copy } from 'lucide-react';
import { registerPushNotifications } from '@/lib/push-notifications';
import { GoogleFitAPI, FitbitAPI } from '@/lib/wearable';

interface SetupGuideProps { userId: string; }

const SetupGuide = ({ userId }: SetupGuideProps) => {
  const [pushStatus, setPushStatus] = useState<'idle'|'loading'|'success'|'error'>('idle');
  const [copied, setCopied] = useState('');

  const handleEnablePush = async () => {
    setPushStatus('loading');
    const token = await registerPushNotifications(userId);
    setPushStatus(token ? 'success' : 'error');
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(''), 2000); });
  };

  const vapidMissing = !import.meta.env.VITE_FIREBASE_VAPID_KEY;
  const googleOk = GoogleFitAPI.isConnected();
  const fitbitOk = FitbitAPI.isConnected();
  const fitbitConfigured = FitbitAPI.isConfigured();

  return (
    <div className="space-y-4">
      {/* Push Notifications */}
      <Card className="bg-white border border-gray-200 shadow-none">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-5 w-5 text-blue-600"/>Push Notifications (FCM)
            </CardTitle>
            <Badge className={Notification.permission === 'granted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>
              {Notification.permission === 'granted' ? '✓ Enabled' : 'Not enabled'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {vapidMissing ? (
            <div className="space-y-3">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm font-semibold text-amber-800 mb-1">⚡ VAPID Key Required</p>
                <p className="text-xs text-amber-700">To enable real push notifications (even when app is closed), follow these steps:</p>
              </div>
              <ol className="space-y-3">
                {[
                  { n:1, text:'Go to Firebase Console', link:'https://console.firebase.google.com/project/caredose-6b966/settings/cloudmessaging', linkText:'Open Firebase Console' },
                  { n:2, text:'Click "Cloud Messaging" tab' },
                  { n:3, text:'Under "Web Push certificates" → click "Add new pair" → "Generate"' },
                  { n:4, text:'Copy the key string that appears' },
                  { n:5, text:'Create or open .env file in your project root' },
                  { n:6, text:'Add this line:', code:'VITE_FIREBASE_VAPID_KEY=paste_your_key_here' },
                  { n:7, text:'Restart the dev server: npm run dev' },
                ].map(s => (
                  <li key={s.n} className="flex items-start gap-3">
                    <span className="h-6 w-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">{s.n}</span>
                    <div className="flex-1">
                      <p className="text-sm text-gray-700">{s.text}</p>
                      {s.link && <a href={s.link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 flex items-center gap-1 mt-1 hover:underline"><ExternalLink className="h-3 w-3"/>{s.linkText}</a>}
                      {s.code && (
                        <div className="flex items-center gap-2 mt-1">
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-800 flex-1">{s.code}</code>
                          <button onClick={() => copy(s.code!, `step${s.n}`)} className="text-blue-500 hover:text-blue-700">
                            {copied === `step${s.n}` ? <CheckCircle className="h-4 w-4 text-emerald-500"/> : <Copy className="h-4 w-4"/>}
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                <CheckCircle className="h-4 w-4"/>VAPID key configured ✓
              </div>
              <Button className={`w-full h-10 font-semibold ${pushStatus === 'success' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
                onClick={handleEnablePush} disabled={pushStatus === 'loading' || pushStatus === 'success'}>
                {pushStatus === 'loading' ? 'Registering...' : pushStatus === 'success' ? '✓ Push Enabled!' : pushStatus === 'error' ? '❌ Failed — Try Again' : '🔔 Enable Push Notifications'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Google Fit */}
      <Card className="bg-white border border-gray-200 shadow-none">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-5 w-5 text-green-600"/>Google Fit</CardTitle>
            <Badge className={googleOk ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}>{googleOk ? '✓ Connected' : 'Not connected'}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {googleOk ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-emerald-700 flex-1">Connected. Heart rate, steps, and SpO₂ will sync automatically.</p>
              <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 shrink-0"
                onClick={() => { GoogleFitAPI.disconnect(); window.location.reload(); }}>Disconnect</Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">Connect to sync heart rate, steps, and sleep data from Google Fit or Wear OS devices.</p>
              <p className="text-xs text-gray-400">Client ID: 773546090775-m6397lr6kkft8rjllv7c7afrjgkn5fki.apps.googleusercontent.com</p>
              <Button className="w-full bg-green-600 hover:bg-green-700 text-white h-10 font-semibold" onClick={() => GoogleFitAPI.connect()}>
                🏃 Connect Google Fit
              </Button>
              <p className="text-xs text-gray-400 text-center">You'll be redirected to Google's sign-in page</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fitbit */}
      <Card className="bg-white border border-gray-200 shadow-none">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">⌚ Fitbit</CardTitle>
            <Badge className={fitbitOk ? 'bg-emerald-100 text-emerald-700' : fitbitConfigured ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}>
              {fitbitOk ? '✓ Connected' : fitbitConfigured ? 'Ready' : 'Setup needed'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {fitbitOk ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-emerald-700 flex-1">Fitbit connected. Heart rate and steps syncing.</p>
              <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50" onClick={() => { FitbitAPI.disconnect(); window.location.reload(); }}>Disconnect</Button>
            </div>
          ) : fitbitConfigured ? (
            <Button className="w-full bg-teal-600 hover:bg-teal-700 text-white h-10 font-semibold" onClick={() => FitbitAPI.connect()}>⌚ Connect Fitbit</Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Register at Fitbit developer portal, then add your Client ID to .env:</p>
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2 text-xs">
                <p className="font-semibold text-gray-700">Registration details for dev.fitbit.com/apps/new :</p>
                {[
                  ['Application Name', 'CareDose+'],
                  ['Description', 'Smart medication management for elderly care'],
                  ['OAuth 2.0 Application Type', 'Personal (fastest for testing)'],
                  ['Callback URL', `${window.location.origin}/fitbit-callback`],
                  ['Default Access Type', 'Read-Only'],
                ].map(([k,v]) => (
                  <div key={k} className="flex items-start gap-2">
                    <span className="text-gray-500 w-40 shrink-0">{k}:</span>
                    <div className="flex items-center gap-1 flex-1">
                      <span className="text-gray-800 font-medium">{v}</span>
                      <button onClick={() => copy(v, k)} className="text-blue-400 hover:text-blue-600 ml-1">
                        {copied === k ? <CheckCircle className="h-3 w-3 text-emerald-500"/> : <Copy className="h-3 w-3"/>}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <a href="https://dev.fitbit.com/apps/new" target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full h-10 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-semibold">
                <ExternalLink className="h-4 w-4"/>Register Fitbit App
              </a>
              <div>
                <p className="text-xs text-gray-500 mb-1">Then add to .env file:</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-gray-100 px-2 py-1.5 rounded flex-1 text-gray-800">VITE_FITBIT_CLIENT_ID=your_client_id</code>
                  <button onClick={() => copy('VITE_FITBIT_CLIENT_ID=', 'fitbit-env')} className="text-blue-500"><Copy className="h-4 w-4"/></button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SetupGuide;
