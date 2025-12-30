import React, { useState, useEffect } from 'react';
import type { FAQ, DashboardStats } from '../types';
import { api } from '../lib/apiClient';
import { TotalMessagesIcon, UniqueUsersIcon, TotalFaqsIcon, TimeIcon, SpinnerIcon, TrashIcon, RefreshIcon } from '../components/icons';

interface DashboardPageProps {
  faqs: FAQ[];
  stats: DashboardStats | null;
  loading: boolean;
  refreshData: (silent?: boolean) => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}

interface StatCardProps {
    title: string;
    value: string;
    description: string;
    icon: React.ReactNode;
}

const renderFormattedText = (text: string) => {
    const applyPattern = (
        inputNodes: React.ReactNode[],
        regex: RegExp,
        renderFn: (match: string, key: string) => React.ReactNode,
    ): React.ReactNode[] => {
        const output: React.ReactNode[] = [];

        inputNodes.forEach((node, nodeIndex) => {
            if (typeof node !== 'string') {
                output.push(node);
                return;
            }

            const str = node;
            let lastIndex = 0;
            let match: RegExpExecArray | null;

            while ((match = regex.exec(str)) !== null) {
                if (match.index > lastIndex) {
                    output.push(str.slice(lastIndex, match.index));
                }
                const content = match[1];
                output.push(renderFn(content, `${nodeIndex}-${match.index}`));
                lastIndex = match.index + match[0].length;
            }

            if (lastIndex < str.length) {
                output.push(str.slice(lastIndex));
            }
        });

        return output;
    };

    let nodes: React.ReactNode[] = [text];

    nodes = applyPattern(
        nodes,
        /__\*\*(.+?)\*\*__/g,
        (match, key) => (
            <span key={`ub-${key}`} className="font-semibold italic underline">
                {match}
            </span>
        ),
    );

    nodes = applyPattern(
        nodes,
        /\*\*(.+?)\*\*/g,
        (match, key) => (
            <span key={`b-${key}`} className="font-semibold">
                {match}
            </span>
        ),
    );

    nodes = applyPattern(
        nodes,
        /__(.+?)__/g,
        (match, key) => (
            <span key={`u-${key}`} className="underline">
                {match}
            </span>
        ),
    );

    return nodes;
};

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message }: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 animate-fade-in-down" style={{ animationDuration: '0.2s' }}>
      <div className="bg-surface rounded-lg shadow-xl p-6 w-full max-w-md border border-border">
        <h2 className="text-xl font-bold mb-4 text-text-primary">{title}</h2>
        <p className="text-text-secondary mb-6">{message}</p>
        <div className="flex justify-end gap-4">
          <button onClick={onClose} className="px-4 py-2 rounded-md bg-surface-light hover:opacity-80 transition-opacity font-semibold">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-md bg-accent hover:bg-accent-hover text-white transition-colors font-semibold flex items-center gap-2">
            <TrashIcon />
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<StatCardProps> = ({ title, value, description, icon }) => (
    <div className="bg-surface p-6 rounded-xl flex items-center gap-6 border border-border transition-all hover:border-primary/50 hover:shadow-glow-primary hover:-translate-y-1">
        <div className="flex-shrink-0 text-primary">{icon}</div>
        <div>
            <p className="text-text-secondary text-sm font-medium">{title}</p>
            <p className="text-3xl font-bold text-text-primary mt-1">{value}</p>
            <p className="text-text-secondary text-xs mt-1">{description}</p>
        </div>
    </div>
);

const DashboardPage: React.FC<DashboardPageProps> = ({ faqs, stats, loading, refreshData, showToast }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const mostAskedQuestions = [...faqs].sort((a, b) => b.asked_count - a.asked_count).slice(0, 5);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await refreshData(true);
        } finally {
            setIsRefreshing(false);
        }
    };
    
    const formatTime = (seconds: number) => {
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.round(seconds % 60);
        
        const parts: string[] = [];
        if (d > 0) parts.push(`${d}d`);
        if (h > 0) parts.push(`${h}h`);
        if (m > 0) parts.push(`${m}m`);
        if (s > 0 || parts.length === 0) parts.push(`${s}s`);
        
        return parts.join(' ');
    };

    const handleResetUserData = async () => {
        setIsModalOpen(false);
        try {
            await api.resetAllUserData();

            // Clear user session data from any client browsers
            // Clean up all legacy keys
            localStorage.removeItem('ortho_user_id');
            localStorage.removeItem('ortho_chat_user_name');
            localStorage.removeItem('isAdmin');
            localStorage.removeItem('ortho_chat_conversations');
            // Clear auth system data
            const { clearAuth } = await import('../lib/auth');
            clearAuth();

            showToast("All user data has been successfully reset.", "success");
            refreshData(); // Refresh the stats on the dashboard
        } catch (error: any) {
            console.error("Error resetting user data:", error);
            const errorText = error?.message || "An unknown error occurred.";
            showToast(`Failed to reset user data: ${errorText}`, "error");
        }
    };

    const displayStats = stats || {
        totalMessages: 0,
        uniqueUsers: 0,
        totalFaqs: faqs.length,
        conversationTime: 0,
    };

    return (
        <div className="p-4 md:p-8 bg-background text-text-primary">
            <ConfirmModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onConfirm={handleResetUserData}
                title="Reset All User Data?"
                message="DANGER: This will delete ALL users, conversations, and messages, and reset all FAQ counters. This action is irreversible. Are you sure you want to proceed?"
            />

            <div className="flex justify-end mb-4">
                <button
                    onClick={handleRefresh}
                    disabled={isRefreshing || loading}
                    className="bg-surface-light text-text-primary px-4 py-2 rounded-full hover:bg-primary hover:text-background font-semibold transition-colors flex items-center justify-center gap-2 text-sm h-9 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <RefreshIcon className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatCard title="Total User Messages" value={displayStats.totalMessages.toString()} description="Messages sent by users" icon={<TotalMessagesIcon />} />
                <StatCard title="Unique Users" value={displayStats.uniqueUsers.toString()} description="Unique conversation sessions" icon={<UniqueUsersIcon />} />
                <StatCard title="Total FAQs" value={displayStats.totalFaqs.toString()} description="Questions in database" icon={<TotalFaqsIcon />} />
                <StatCard title="Conversation Time" value={formatTime(displayStats.conversationTime)} description="Est. duration across all users" icon={<TimeIcon />} />
            </div>

            <div className="bg-surface p-6 rounded-xl border border-border">
                <h2 className="text-xl font-bold mb-2">Most Asked Questions</h2>
                <p className="text-sm text-text-secondary mb-6">Top 5 frequently asked questions by users</p>
                <div className="space-y-4">
                    {mostAskedQuestions.map((faq, index) => (
                        <div key={faq.id} className="flex items-center gap-4 p-4 bg-background rounded-lg border border-transparent hover:border-border transition-colors">
                            <div className="flex-shrink-0 w-8 h-8 bg-primary text-background rounded-full flex items-center justify-center font-bold shadow-md">{index + 1}</div>
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-text-primary truncate">
                                    {renderFormattedText(faq.question)}
                                </p>
                                <p className="text-sm text-text-secondary truncate max-w-full overflow-hidden">
                                    {renderFormattedText(faq.answer)}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-2xl text-primary">{faq.asked_count}</p>
                                <p className="text-xs text-text-secondary">times</p>
                            </div>
                        </div>
                    ))}
                     {mostAskedQuestions.length === 0 && (
                        <div className="text-center py-8 text-text-secondary">
                            <p>No questions have been asked yet.</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-8 bg-surface p-6 rounded-xl border border-accent/30">
                <h2 className="text-xl font-bold text-accent">Danger Zone</h2>
                <p className="text-sm text-text-secondary mt-2 mb-6">These actions are irreversible. Please proceed with caution.</p>
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="bg-accent text-white px-4 py-2 rounded-md hover:bg-accent-hover transition-colors flex items-center gap-2 text-sm font-semibold"
                >
                    <TrashIcon /> Reset All User Data
                </button>
            </div>
        </div>
    );
};

export default DashboardPage;
