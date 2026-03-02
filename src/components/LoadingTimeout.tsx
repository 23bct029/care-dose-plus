import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface LoadingTimeoutProps {
  timeout?: number;
  fallbackPath?: string;
  onTimeout?: () => void;
}

const LoadingTimeout = ({ 
  timeout = 5000, 
  fallbackPath = '/dashboard',
  onTimeout 
}: LoadingTimeoutProps) => {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      console.log(`Loading timeout after ${timeout}ms - redirecting to ${fallbackPath}`);
      if (onTimeout) {
        onTimeout();
      } else {
        navigate(fallbackPath);
      }
    }, timeout);

    return () => clearTimeout(timer);
  }, [timeout, fallbackPath, navigate, onTimeout]);

  return null; // This component doesn't render anything
};

export default LoadingTimeout;