import React, { useState, useEffect, useRef } from 'react';
import { SpinnerIcon } from '../../components/icons';

interface IdlePageProps {
  showToast: (message: string, type: 'success' | 'error') => void;
}

const IdlePage: React.FC<IdlePageProps> = ({ showToast }) => {
  const [isActive, setIsActive] = useState(true);
  const [lastPing, setLastPing] = useState<Date | null>(null);
  const [nextPing, setNextPing] = useState<Date | null>(null);
  const [pingCount, setPingCount] = useState(0);
  const [isPinging, setIsPinging] = useState(false);
  const [timeUntilNext, setTimeUntilNext] = useState<string>('Calculating...');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const lastPingTimeRef = useRef<number>(0); // Track last ping timestamp to prevent rapid pings
  const PING_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
  const MIN_PING_INTERVAL_MS = 9 * 60 * 1000; // Minimum 9 minutes between pings

  const pingServer = async (force: boolean = false) => {
    const now = Date.now();
    const timeSinceLastPing = now - lastPingTimeRef.current;

    // Prevent rapid pings - only allow if forced (manual) or if enough time has passed
    if (!force && timeSinceLastPing < MIN_PING_INTERVAL_MS) {
      const minutesRemaining = Math.ceil((MIN_PING_INTERVAL_MS - timeSinceLastPing) / 60000);
      console.log(`[Keep-Alive] Skipping ping - only ${Math.floor(timeSinceLastPing / 1000)}s since last ping. Need to wait ${minutesRemaining} more minutes.`);
      return;
    }

    try {
      setIsPinging(true);
      // Use a simple GET request to keep the server alive
      const response = await fetch('/api/health', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-cache', // Ensure fresh request
      });
      
      if (response.ok) {
        const pingTime = new Date();
        lastPingTimeRef.current = Date.now(); // Update ref immediately
        setLastPing(pingTime);
        setNextPing(new Date(pingTime.getTime() + PING_INTERVAL_MS));
        setPingCount(prev => prev + 1);
        console.log(`[Keep-Alive] Pinged server at ${pingTime.toLocaleTimeString()} (${timeSinceLastPing / 1000}s since last ping)`);
      } else {
        throw new Error(`Server responded with ${response.status}`);
      }
    } catch (error: any) {
      console.error('[Keep-Alive] Error pinging server:', error);
      // Don't show toast for background pings to avoid annoying notifications
      if (document.visibilityState === 'visible') {
        showToast(`Failed to ping server: ${error.message}`, 'error');
      }
    } finally {
      setIsPinging(false);
    }
  };

  useEffect(() => {
    // Disable ALL scrolling when this page is mounted
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyHeight = document.body.style.height;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalHtmlHeight = document.documentElement.style.height;
    
    // Disable scrolling on html and body
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.height = '100vh';
    document.body.style.overflow = 'hidden';
    document.body.style.height = '100vh';
    
    // Also disable scrolling on the main element if it exists
    const mainElement = document.querySelector('main');
    const originalMainOverflow = mainElement ? (mainElement as HTMLElement).style.overflow : '';
    if (mainElement) {
      (mainElement as HTMLElement).style.overflow = 'hidden';
    }

    // Initial ping
    pingServer(true); // Force initial ping

    // Set up interval to ping every 10 minutes
    // Note: Browsers throttle intervals when tab is inactive, but they still run
    // The MIN_PING_INTERVAL check will prevent rapid pings when browser catches up
    intervalRef.current = setInterval(() => {
      pingServer(false); // Regular interval ping
    }, PING_INTERVAL_MS);

    // Handle visibility change (when tab becomes active/inactive)
    // Only update status, don't ping - let the interval handle it
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setIsActive(true);
        // Don't ping here - the interval will handle it, and the MIN_PING_INTERVAL check prevents rapid pings
      } else {
        setIsActive(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      // Restore all scrolling
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.documentElement.style.height = originalHtmlHeight;
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.height = originalBodyHeight;
      
      // Restore main element overflow
      const mainElement = document.querySelector('main');
      if (mainElement && originalMainOverflow !== '') {
        (mainElement as HTMLElement).style.overflow = originalMainOverflow;
      } else if (mainElement) {
        (mainElement as HTMLElement).style.overflow = '';
      }
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const formatTime = (date: Date | null) => {
    if (!date) return 'N/A';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const updateCountdown = () => {
    if (!nextPing) {
      setTimeUntilNext('Calculating...');
      return;
    }
    const now = new Date();
    const diff = nextPing.getTime() - now.getTime();
    
    if (diff <= 0) {
      setTimeUntilNext('Pinging now...');
      return;
    }
    
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    setTimeUntilNext(`${minutes}m ${seconds}s`);
  };

  useEffect(() => {
    // Update countdown every second
    countdownRef.current = setInterval(() => {
      updateCountdown();
    }, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [nextPing]);

  return (
    <div className="h-full overflow-hidden bg-background flex items-center justify-center p-2 sm:p-4 md:p-8">
      <div className="max-w-2xl w-full">
        <div className="bg-surface rounded-xl border border-border p-3 sm:p-4 md:p-6 lg:p-8 w-full">
          <div className="text-center mb-4 sm:mb-6 md:mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary/20 mb-2 sm:mb-3 md:mb-4">
              {isPinging ? (
                <SpinnerIcon className="w-8 h-8 sm:w-10 sm:h-10 text-primary animate-spin" />
              ) : (
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-green-500 animate-pulse" />
              )}
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-text-primary mb-1 sm:mb-2">
              Server Keep-Alive
            </h1>
            <p className="text-xs sm:text-sm text-text-secondary px-2">
              This page keeps your Render server alive by pinging it every 10 minutes
            </p>
          </div>

          <div className="space-y-2 sm:space-y-3 md:space-y-4">
            <div className="bg-surface-light rounded-lg border border-border p-2 sm:p-3 md:p-4">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-text-secondary text-xs sm:text-sm">Status:</span>
                <span className={`font-semibold text-xs sm:text-sm ${isActive ? 'text-green-500' : 'text-yellow-500'}`}>
                  {isActive ? 'Active' : 'Background'}
                </span>
              </div>
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-text-secondary text-xs sm:text-sm">Tab Visibility:</span>
                <span className="font-semibold text-xs sm:text-sm text-text-primary">
                  {document.visibilityState === 'visible' ? 'Visible' : 'Hidden'}
                </span>
              </div>
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-text-secondary text-xs sm:text-sm">Total Pings:</span>
                <span className="font-semibold text-xs sm:text-sm text-text-primary">{pingCount}</span>
              </div>
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-text-secondary text-xs sm:text-sm">Last Ping:</span>
                <span className="font-semibold text-xs sm:text-sm text-text-primary">
                  {formatTime(lastPing)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-secondary text-xs sm:text-sm">Next Ping In:</span>
                <span className="font-semibold text-xs sm:text-sm text-primary">
                  {timeUntilNext}
                </span>
              </div>
            </div>

            <div className="bg-primary/10 rounded-lg border border-primary/30 p-2 sm:p-3 md:p-4">
              <p className="text-xs sm:text-sm text-text-secondary text-center">
                <strong className="text-text-primary">Note:</strong> This page will continue pinging the server
                even when the tab is in the background. Keep this page open to prevent your Render server from spinning down.
              </p>
            </div>

            <button
              onClick={() => pingServer(true)}
              disabled={isPinging}
              className="w-full bg-primary text-background font-bold px-3 py-2 sm:px-4 sm:py-3 rounded-lg hover:bg-primary-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
            >
              {isPinging ? (
                <>
                  <SpinnerIcon className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                  Pinging...
                </>
              ) : (
                'Ping Now'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IdlePage;

