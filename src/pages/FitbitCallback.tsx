// src/pages/FitbitCallback.tsx - Handles Fitbit OAuth redirect
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FitbitAPI } from '@/lib/wearable';
import { CheckCircle, XCircle } from 'lucide-react';

const FitbitCallback = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const navigate = useNavigate();

  useEffect(() => {
    const token = FitbitAPI.extractTokenFromCallback();
    if (token) {
      setStatus('success');
      setTimeout(() => navigate(-1), 2000);
    } else {
      setStatus('error');
      setTimeout(() => navigate(-1), 3000);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
        <div className={`h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4 ${status === 'success' ? 'bg-blue-100' : status === 'error' ? 'bg-red-100' : 'bg-blue-100'}`}>
          {status === 'loading' && <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"/>}
          {status === 'success' && <CheckCircle className="h-8 w-8 text-blue-600"/>}
          {status === 'error' && <XCircle className="h-8 w-8 text-red-600"/>}
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          {status === 'loading' ? 'Connecting Fitbit...' : status === 'success' ? 'Fitbit Connected!' : 'Connection Failed'}
        </h2>
        <p className="text-gray-500 text-sm">
          {status === 'success' ? 'Your Fitbit data will now sync.' : status === 'error' ? 'Please try again or check your Client ID in .env.' : 'Processing...'}
        </p>
      </div>
    </div>
  );
};

export default FitbitCallback;
