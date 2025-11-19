import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { debugFetch } from '../../lib/debugApi';
import ConfirmDeleteModal from './components/ConfirmDeleteModal';

interface LogsPageProps {
  showToast: (message: string, type: 'success' | 'error') => void;
}

const LogsPage: React.FC<LogsPageProps> = ({ showToast }) => {
  const [allLogs, setAllLogs] = useState<any[]>([]); // Store all fetched logs
  const [filterPrefix, setFilterPrefix] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [copiedQueryId, setCopiedQueryId] = useState<string | null>(null);
  const [filterQueryId, setFilterQueryId] = useState<string | null>(null);
  const [showClearLogsModal, setShowClearLogsModal] = useState(false);

  // Extract prefix from log message
  const getPrefix = (message: string): string => {
    const match = message.match(/^\[(\w+)\]/);
    return match ? match[1] : 'LOG';
  };

  // Prefix colors
  const prefixColors: Record<string, string> = {
    FAQ: 'text-blue-400',
    USER: 'text-green-400',
    ADMIN: 'text-purple-400',
    ERROR: 'text-red-400',
    LOG: 'text-cyan-400',
  };

  const prefixBgColors: Record<string, string> = {
    FAQ: 'bg-blue-400/20 border-blue-400/30',
    USER: 'bg-green-400/20 border-green-400/30',
    ADMIN: 'bg-purple-400/20 border-purple-400/30',
    ERROR: 'bg-red-400/20 border-red-400/30',
    LOG: 'bg-cyan-400/20 border-cyan-400/30',
  };

  useEffect(() => {
    const storedQueryId = sessionStorage.getItem('filterQueryId');
    if (storedQueryId) {
      setFilterQueryId(storedQueryId);
      sessionStorage.removeItem('filterQueryId');
    }
  }, []);

  const fetchLogs = async () => {
    try {
      let url = `/api/debug/logs?limit=500`;
      if (filterQueryId) {
        url += `&queryId=${encodeURIComponent(filterQueryId)}`;
      }
      const response = await debugFetch(url);
      const data = await response.json();
      if (data.success) {
        // Store all logs - filtering will be done client-side for instant updates
        setAllLogs(data.logs);
      }
    } catch (error: any) {
      console.error('Error fetching logs:', error);
      showToast('Failed to load logs', 'error');
    }
  };

  const clearLogs = async () => {
    try {
      const response = await debugFetch('/api/debug/clear-logs', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (response.ok) {
        setAllLogs([]);
        showToast('Logs cleared', 'success');
        setShowClearLogsModal(false);
      }
    } catch (error: any) {
      showToast('Failed to clear logs', 'error');
    }
  };

  const copyQueryBlock = (queryId: string | null, queryLogs: any[]) => {
    const logText = queryLogs.map(log => log.message).join('\n');
    navigator.clipboard.writeText(logText);
    setCopiedQueryId(queryId || '');
    setTimeout(() => setCopiedQueryId(null), 2000);
  };

  // Fetch logs when filterQueryId changes or on mount
  useEffect(() => {
    fetchLogs();
    if (autoRefresh) {
      const interval = setInterval(fetchLogs, 2000);
      return () => clearInterval(interval);
    }
  }, [filterQueryId, autoRefresh]);

  // Trigger refresh when filter prefix changes
  useEffect(() => {
    fetchLogs();
  }, [filterPrefix]);

  // Handle filter change - updates immediately
  const handleFilterChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterPrefix(e.target.value);
  }, []);

  // Filter logs immediately when filterPrefix changes (no refetch needed)
  const logs = useMemo(() => {
    if (filterPrefix === 'all') {
      return allLogs;
    }
    return allLogs.filter(log => {
      const prefix = getPrefix(log.message);
      return prefix === filterPrefix;
    });
  }, [allLogs, filterPrefix]);

  // Group logs by time proximity (logs within 5 seconds of each other)
  // Also group FAQ logs by queryId if they have one
  // Memoize this expensive operation so it only runs when filtered logs change
  const logGroups = useMemo(() => {
    if (logs.length === 0) return [];
    
    // For very small lists, skip complex grouping - just create one group per log
    if (logs.length <= 5) {
      return logs.map((log, index) => {
        const time = new Date(log.timestamp || log.created_at).getTime();
        const prefix = getPrefix(log.message);
        return {
          key: `group-${time}-${index}`,
          queryId: prefix === 'FAQ' ? log.query_id : null,
          prefix: prefix,
          logs: [log],
        };
      });
    }
    
    const TIME_WINDOW_MS = 5000; // 5 seconds
    
    // Pre-compute timestamps to avoid repeated Date parsing
    const logsWithTime = logs.map(log => ({
      log,
      time: new Date(log.timestamp || log.created_at).getTime(),
      prefix: getPrefix(log.message),
    }));
    
    // Sort by time (most recent first)
    logsWithTime.sort((a, b) => b.time - a.time);

    const groupedLogs: Array<{ queryId: string | null; prefix: string; logs: any[]; firstTimestamp: number }> = [];
    
    for (const { log, time, prefix } of logsWithTime) {
      const queryId = log.query_id;
      
      // For FAQ logs with queryId, try to find existing group with same queryId
      if (prefix === 'FAQ' && queryId) {
        const existingGroup = groupedLogs.find(g => 
          g.queryId === queryId && 
          Math.abs(g.firstTimestamp - time) <= TIME_WINDOW_MS
        );
        
        if (existingGroup) {
          existingGroup.logs.push(log);
          continue;
        }
      }
      
      // Try to find a group within the time window
      const nearbyGroup = groupedLogs.find(g => 
        Math.abs(g.firstTimestamp - time) <= TIME_WINDOW_MS
      );
      
      if (nearbyGroup) {
        nearbyGroup.logs.push(log);
        // Update firstTimestamp if this log is older (shouldn't happen since sorted, but just in case)
        if (time < nearbyGroup.firstTimestamp) {
          nearbyGroup.firstTimestamp = time;
        }
      } else {
        // Create new group
        groupedLogs.push({
          queryId: prefix === 'FAQ' ? queryId : null,
          prefix: prefix,
          logs: [log],
          firstTimestamp: time
        });
      }
    }

    // Logs are already sorted by time, so we can skip sorting within groups
    return groupedLogs.map((group, index) => ({
      key: `group-${group.firstTimestamp}-${index}`,
      queryId: group.queryId,
      prefix: group.prefix,
      logs: group.logs, // Already sorted from the main sort
    }));
  }, [logs]);

  return (
    <div className="min-h-screen bg-background p-2 sm:p-4 md:p-8">
      <ConfirmDeleteModal
        isOpen={showClearLogsModal}
        onClose={() => setShowClearLogsModal(false)}
        onConfirm={clearLogs}
        title="Clear All Logs?"
        message="Clear all logs? This cannot be undone."
      />
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-text-primary mb-1 sm:mb-2">Debug Logs</h1>
          <p className="text-sm sm:text-base text-text-secondary">View all system logs grouped by query</p>
        </div>

        <div className="bg-surface rounded-xl border border-border p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 mb-4">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <select
                value={filterPrefix}
                onChange={handleFilterChange}
                className="px-3 py-2 rounded-lg bg-surface-light border border-border text-text-primary text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Categories</option>
                <option value="FAQ">FAQ</option>
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
                <option value="ERROR">ERROR</option>
                <option value="LOG">LOG</option>
              </select>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="w-4 h-4 text-primary focus:ring-primary"
                />
                <span className="text-sm sm:text-base text-text-secondary">Auto-refresh</span>
              </label>
            </div>
            <button
              onClick={() => setShowClearLogsModal(true)}
              className="px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-lg bg-accent/20 text-accent border border-accent/30 font-semibold hover:bg-accent/30 transition-colors whitespace-nowrap"
            >
              Clear All Logs
            </button>
          </div>

          {filterQueryId && (
            <div className="mb-4 p-3 bg-primary/10 border border-primary/30 rounded-lg">
              <p className="text-sm text-text-primary">
                Filtered by Query ID: <span className="font-mono font-semibold">{filterQueryId}</span>
                <button
                  onClick={() => {
                    setFilterQueryId(null);
                    fetchLogs();
                  }}
                  className="ml-2 text-primary hover:underline"
                >
                  Clear filter
                </button>
              </p>
            </div>
          )}

          {logGroups.length === 0 ? (
            <div className="text-center py-12 text-text-secondary">
              <p className="text-lg mb-2">No logs found</p>
              <p className="text-sm">{filterQueryId ? 'Try clearing the filter' : 'Logs will appear here as the system runs'}</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              {logGroups.map((group) => (
                <div
                  key={group.key}
                  className="group bg-surface-light rounded-lg border border-border p-3 sm:p-4 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {group.prefix === 'FAQ' && (
                        <span className={`text-xs sm:text-sm font-semibold px-2 py-1 rounded ${prefixBgColors[group.prefix]} ${prefixColors[group.prefix]}`}>
                          FAQ Block
                        </span>
                      )}
                      {(group.prefix === 'LOG' || group.prefix === 'ADMIN' || group.prefix === 'USER') && (
                        <span className={`text-xs sm:text-sm font-semibold px-2 py-1 rounded ${prefixBgColors[group.prefix]} ${prefixColors[group.prefix]}`}>
                          {group.prefix} Block
                        </span>
                      )}
                      {group.queryId && (
                        <span className="text-xs sm:text-sm font-mono font-semibold text-primary">
                          Query ID: {group.queryId}
                        </span>
                      )}
                      <span className="text-xs text-text-secondary">
                        ({group.logs.length} {group.logs.length === 1 ? 'log' : 'logs'})
                      </span>
                    </div>
                    <button
                      onClick={() => copyQueryBlock(group.queryId || group.key, group.logs)}
                      className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity px-2 sm:px-3 py-1 text-xs bg-primary/20 text-primary rounded font-semibold hover:bg-primary/40"
                      title="Copy entire query block"
                    >
                      {copiedQueryId === (group.queryId || group.key) ? '✓ Copied' : 'Copy Block'}
                    </button>
                  </div>
                  <div className="space-y-1">
                    {group.logs.map((log, idx) => {
                      const prefix = getPrefix(log.message);
                      const prefixColor = prefixColors[prefix] || 'text-text-secondary';
                      const prefixBg = prefixBgColors[prefix] || 'bg-surface-light border-border';
                      
                      // Remove the prefix from the message text to avoid duplication
                      let messageWithoutPrefix = log.message.replace(/^\[\w+\]\s*/, '');
                      
                      // Parse FAQ JSON if it's a FAQ log
                      let faqData = null;
                      if (prefix === 'FAQ') {
                        try {
                          faqData = JSON.parse(messageWithoutPrefix);
                        } catch (e) {
                          // Not JSON, use as-is
                        }
                      }
                      
                      return (
                        <div
                          key={idx}
                          className="flex flex-col gap-2 text-sm"
                        >
                          <div className="flex items-start gap-2">
                            {group.prefix !== 'FAQ' && (
                              <span className={`font-semibold ${prefixColor} min-w-[70px]`}>
                                [{prefix}]
                              </span>
                            )}
                            {faqData ? (
                              <div className="flex-1 space-y-2">
                                <div className="bg-surface-light rounded-lg p-3 border border-border">
                                  <div className="space-y-2 text-xs">
                                    <div><span className="font-semibold text-text-secondary">Query:</span> <span className="text-text-primary">{faqData.query}</span></div>
                                    {faqData.language && <div><span className="font-semibold text-text-secondary">Language:</span> <span className="text-text-primary">{faqData.language}</span></div>}
                                    {faqData.queryType && <div><span className="font-semibold text-text-secondary">Type:</span> <span className="text-text-primary">{faqData.queryType}</span></div>}
                                    {faqData.englishQuery && <div><span className="font-semibold text-text-secondary">English Query:</span> <span className="text-text-primary">{faqData.englishQuery}</span></div>}
                                    {faqData.queryTokens && <div><span className="font-semibold text-text-secondary">Tokens:</span> <span className="text-text-primary">{faqData.queryTokens.join(", ")}</span></div>}
                                    {faqData.top3FAQs && faqData.top3FAQs.length > 0 && (
                                      <div>
                                        <span className="font-semibold text-text-secondary">Top 3 FAQs:</span>
                                        <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                                          {faqData.top3FAQs.map((faq: any, i: number) => (
                                            <li key={i} className="text-text-primary">
                                              ID {faq.id} (Score: {faq.score}) - {faq.question.substring(0, 60)}...
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {faqData.selectedFAQ && (
                                      <div className="bg-primary/10 rounded p-2 border border-primary/20">
                                        <div className="font-semibold text-text-secondary mb-1">Selected FAQ:</div>
                                        <div className="text-text-primary"><span className="font-semibold">ID {faqData.selectedFAQ.id}:</span> {faqData.selectedFAQ.question}</div>
                                        {faqData.selectedFAQReason && <div className="text-text-secondary text-xs mt-1">Reason: {faqData.selectedFAQReason}</div>}
                                      </div>
                                    )}
                                    {faqData.mediaIds && faqData.mediaIds.length > 0 && (
                                      <div>
                                        <span className="font-semibold text-text-secondary">Media:</span>
                                        <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                                          {faqData.mediaTitles.map((title: string, i: number) => (
                                            <li key={i} className="text-text-primary">{title}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {faqData.answer && (
                                      <div className="bg-surface rounded p-2 border border-border">
                                        <div className="font-semibold text-text-secondary mb-1">Answer:</div>
                                        <div className="text-text-primary whitespace-pre-wrap">{faqData.answer}</div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <span className="text-text-primary font-mono break-words flex-1">
                                {messageWithoutPrefix}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LogsPage;

