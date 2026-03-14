import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { getCurrentUser } from '@/lib/firebase-auth';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Pill, CheckCircle, XCircle, Loader, AlertCircle, LogIn } from 'lucide-react';

const AcceptInvite = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'not_logged_in'>('loading');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const invitationId = searchParams.get('id') || searchParams.get('invitation');

  useEffect(() => {
    const handleInvite = async () => {
      try {
        const user = await getCurrentUser();

        if (!user) {
          setStatus('not_logged_in');
          setMessage('Please log in to accept this invitation.');
          return;
        }

        if (!invitationId) {
          setStatus('error');
          setMessage('Invalid invitation link. Please ask to be re-invited.');
          return;
        }

        const invRef = doc(db, 'invitations', invitationId);
        const invSnap = await getDoc(invRef);

        if (!invSnap.exists()) {
          setStatus('error');
          setMessage('This invitation no longer exists or has already been used.');
          return;
        }

        const invitation = invSnap.data();

        if (invitation.status !== 'pending') {
          setStatus('error');
          setMessage(`This invitation has already been ${invitation.status}.`);
          return;
        }

        if (invitation.toUserId !== user.uid) {
          setStatus('error');
          setMessage('This invitation is for a different account.');
          return;
        }

        // Accept invitation
        await updateDoc(invRef, { status: 'accepted', acceptedAt: serverTimestamp() });

        // Create connection
        const connectionId = [invitation.fromUserId, invitation.toUserId].sort().join('_');
        await setDoc(doc(db, 'connections', connectionId), {
          users: [invitation.fromUserId, invitation.toUserId],
          userEmails: [invitation.fromUserEmail, invitation.toEmail],
          relationship: invitation.relationship,
          status: 'active',
          createdAt: serverTimestamp(),
          initiatedBy: invitation.fromUserId,
        });

        // Notify sender
        await addDoc(collection(db, 'notifications'), {
          userId: invitation.fromUserId,
          type: 'invitation_accepted',
          fromUserId: user.uid,
          fromUserName: user.displayName || user.email,
          message: `${user.displayName || user.email} accepted your connection request`,
          read: false,
          createdAt: serverTimestamp(),
        });

        setStatus('success');
        setMessage('Connection accepted! Redirecting to your dashboard…');
        setTimeout(() => navigate('/elderly'), 3000);
      } catch (err: any) {
        setStatus('error');
        setMessage('Something went wrong. Please try again or contact support.');
        console.error('AcceptInvite error:', err);
      }
    };

    handleInvite();
  }, [invitationId, navigate]);

  const statusConfig = {
    loading: { icon: Loader, color: 'text-blue-600', bg: 'bg-blue-50', spin: true, title: 'Processing Invitation…' },
    success: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', spin: false, title: 'Invitation Accepted!' },
    error: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', spin: false, title: 'Invitation Error' },
    not_logged_in: { icon: LogIn, color: 'text-orange-600', bg: 'bg-orange-50', spin: false, title: 'Login Required' },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-indigo-900 to-purple-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl mb-4 border border-white/20">
            <Pill className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">CareDose<span className="text-blue-300">+</span></h1>
        </div>

        <Card className="bg-white shadow-2xl border-0 rounded-2xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6">
            <h2 className="text-xl font-bold text-white">Connection Invitation</h2>
          </CardHeader>
          <CardContent className="px-8 py-10">
            <div className={`${config.bg} rounded-2xl p-8 text-center`}>
              <Icon className={`h-16 w-16 ${config.color} mx-auto mb-4 ${config.spin ? 'animate-spin' : ''}`} />
              <h3 className={`text-xl font-bold ${config.color} mb-3`}>{config.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{message}</p>

              {status === 'not_logged_in' && (
                <div className="mt-6">
                  <Link to={`/login?redirect=/accept-invite${invitationId ? `?id=${invitationId}` : ''}`}>
                    <button className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all">
                      Sign In to Accept
                    </button>
                  </Link>
                  <Link to="/signup" className="block mt-3 text-sm text-blue-600 hover:underline font-medium">
                    Don't have an account? Sign up
                  </Link>
                </div>
              )}

              {status === 'error' && (
                <Link to="/login" className="inline-block mt-6">
                  <button className="h-10 px-6 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors text-sm">
                    Go to Login
                  </button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AcceptInvite;
