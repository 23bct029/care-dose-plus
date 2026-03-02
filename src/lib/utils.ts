import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format time for display
export const formatTime = (time: string) => {
  return new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

// Calculate days left in stock
export const calculateStockDays = (currentCount: number, dailyDosage: number) => {
  if (!currentCount || !dailyDosage) return 0;
  return Math.floor(currentCount / dailyDosage);
};

// Check if medicine is due now
export const isMedicineDue = (scheduledTime: string) => {
  const now = new Date();
  const [hours, minutes] = scheduledTime.split(':');
  const scheduled = new Date();
  scheduled.setHours(parseInt(hours), parseInt(minutes), 0);
  
  const diffMinutes = Math.abs(now.getTime() - scheduled.getTime()) / (1000 * 60);
  return diffMinutes <= 30; // Due within 30 minutes
};