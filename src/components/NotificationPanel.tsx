import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, limit } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Bell, X, CheckCircle, Pill, Calendar,
  AlertCircle, MessageSquare, FileText,
  Package, Heart, Stethoscope, Clock
} from 'lucide-react';

interface NotificationPanelProps {
  userId: string;
  userRole: string;
}

const NotificationPanel = ({ userId, userRole }: NotificationPanelProps) => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!userId) return;

    // Real-time listener for notifications
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newNotifications = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setNotifications(newNotifications);
      setUnreadCount(newNotifications.filter((n: any) => !n.read).length);
    }, (error) => {
      console.error('Error fetching notifications:', error);
    });

    return () => unsubscribe();
  }, [userId]);

  const markAsRead = async (notificationId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        read: true
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.read);
    for (const notification of unread) {
      await markAsRead(notification.id);
    }
  };

  const handleNotificationClick = (notification: any) => {
    markAsRead(notification.id);
    
    // Navigate based on notification type
    switch(notification.type) {
      case 'reminder':
      case 'missed_dose':
        navigate('/elderly');
        break;
      case 'appointment':
        navigate('/schedule');
        break;
      case 'prescription':
        navigate('/medicines');
        break;
      case 'emergency':
        navigate('/emergency');
        break;
      case 'message':
        // Could navigate to messages
        break;
    }
    
    setShowPanel(false);
  };

  const getNotificationIcon = (type: string) => {
    switch(type) {
      case 'reminder': return <Clock className="h-4 w-4 text-blue-500" />;
      case 'missed_dose': return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'appointment': return <Calendar className="h-4 w-4 text-purple-500" />;
      case 'prescription': return <FileText className="h-4 w-4 text-green-500" />;
      case 'emergency': return <Heart className="h-4 w-4 text-red-600 animate-pulse" />;
      case 'message': return <MessageSquare className="h-4 w-4 text-blue-500" />;
      case 'low_stock': return <Package className="h-4 w-4 text-yellow-500" />;
      default: return <Bell className="h-4 w-4 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch(priority) {
      case 'emergency': return 'bg-red-100 border-red-300 animate-pulse';
      case 'high': return 'bg-orange-50 border-orange-200';
      case 'medium': return 'bg-blue-50 border-blue-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative hover:bg-gray-100 transition-all"
        onClick={() => setShowPanel(!showPanel)}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-red-600 hover:bg-red-700 text-white text-xs animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </Button>

      {showPanel && (
        <Card className="absolute right-0 mt-2 w-96 max-h-[32rem] overflow-hidden flex flex-col z-50 shadow-xl border-2">
          {/* Header */}
          <div className="p-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white flex justify-between items-center">
            <h3 className="font-semibold flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifications
              {unreadCount > 0 && (
                <Badge className="bg-white text-blue-600 ml-2">
                  {unreadCount} new
                </Badge>
              )}
            </h3>
            <div className="flex gap-1">
              {unreadCount > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 text-white hover:bg-white/20"
                  onClick={markAllAsRead}
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Mark all read
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 text-white hover:bg-white/20"
                onClick={() => setShowPanel(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Notification List */}
          <div className="overflow-y-auto max-h-96 p-2 bg-gray-50">
            {notifications.length === 0 ? (
              <div className="text-center py-8 px-4">
                <Bell className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No notifications</p>
                <p className="text-xs text-gray-400 mt-1">You're all caught up!</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-3 mb-2 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${
                    notif.read 
                      ? 'bg-white border-gray-200 opacity-75' 
                      : getPriorityColor(notif.priority)
                  }`}
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 mt-1">
                      {getNotificationIcon(notif.type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <h4 className={`font-medium ${notif.read ? 'text-gray-700' : 'text-gray-900'}`}>
                          {notif.title}
                        </h4>
                        {!notif.read && (
                          <span className="h-2 w-2 bg-blue-600 rounded-full animate-pulse"></span>
                        )}
                      </div>
                      <p className={`text-sm mt-1 ${notif.read ? 'text-gray-500' : 'text-gray-700'}`}>
                        {notif.message}
                      </p>
                      <p className="text-xs text-gray-400 mt-2">
                        {new Date(notif.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-2 border-t bg-white text-center">
              <Button 
                variant="link" 
                size="sm" 
                className="text-blue-600"
                onClick={() => {
                  // Could navigate to full notifications page
                  setShowPanel(false);
                }}
              >
                View all notifications
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default NotificationPanel;