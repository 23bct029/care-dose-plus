import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Download, Calendar } from 'lucide-react';

interface UserLogsProps {
  userId: string;
  userEmail: string;
}

const UserLogs = ({ userId, userEmail }: UserLogsProps) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadUserLogs();
  }, [userId]);

  useEffect(() => {
    filterLogs();
  }, [logs, searchTerm, filter]);

  const loadUserLogs = async () => {
    try {
      const logsRef = collection(db, 'system_logs');
      const q = query(
        logsRef,
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(100)
      );
      const querySnapshot = await getDocs(q);
      
      const userLogs: any[] = [];
      querySnapshot.forEach((doc) => {
        userLogs.push({ id: doc.id, ...doc.data() });
      });
      
      setLogs(userLogs);
      setFilteredLogs(userLogs);
    } catch (error) {
      console.error('Error loading user logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterLogs = () => {
    let filtered = [...logs];

    if (filter !== 'all') {
      filtered = filtered.filter(log => log.level === filter);
    }

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(log => 
        log.action?.toLowerCase().includes(search) ||
        JSON.stringify(log.details)?.toLowerCase().includes(search)
      );
    }

    setFilteredLogs(filtered);
  };

  const exportUserLogs = () => {
    const dataStr = JSON.stringify(filteredLogs, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `logs-${userEmail}-${new Date().toISOString().split('T')[0]}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const getLogLevelBadge = (level: string) => {
    switch(level) {
      case 'error': return <Badge className="bg-red-600 text-white">Error</Badge>;
      case 'warning': return <Badge className="bg-yellow-600 text-white">Warning</Badge>;
      case 'info': return <Badge className="bg-blue-600 text-white">Info</Badge>;
      default: return <Badge className="bg-gray-600 text-white">Log</Badge>;
    }
  };

  if (loading) {
    return <div className="text-center text-gray-400 py-4">Loading logs...</div>;
  }

  return (
    <div className="space-y-3">
      {/* Logs Header */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-white font-medium">Activity Logs</h4>
        <div className="flex gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-2 py-1 bg-purple-600 text-white border border-purple-500 rounded-md text-sm"
          >
            <option value="all">All</option>
            <option value="error">Errors</option>
            <option value="warning">Warnings</option>
            <option value="info">Info</option>
          </select>
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white h-8"
            onClick={exportUserLogs}
          >
            <Download className="h-3 w-3 mr-1" />
            Export
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
        <Input
          placeholder="Search logs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-7 py-1 text-sm bg-white/5 border-white/10 text-white"
        />
      </div>

      {/* Logs List */}
      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {filteredLogs.length === 0 ? (
          <p className="text-center text-gray-400 py-4 text-sm">No logs found</p>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="p-2 bg-black/40 rounded border border-white/10 text-sm">
              <div className="flex items-center gap-2 mb-1">
                {getLogLevelBadge(log.level)}
                <span className="text-xs text-gray-400">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
              </div>
              <p className="text-white text-sm">{log.action}</p>
              {log.page && (
                <p className="text-xs text-gray-500 mt-1">Page: {log.page}</p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Summary */}
      <div className="text-xs text-gray-400 mt-2 pt-2 border-t border-white/10">
        Total: {filteredLogs.length} logs
      </div>
    </div>
  );
};

export default UserLogs;