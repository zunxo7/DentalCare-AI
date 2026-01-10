import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../lib/apiClient';
import type { UserWithStats, User, Conversation, ChatMessage, Media, FAQ } from '../types';
import { SpinnerIcon, SearchIcon, BotIcon, UserCircleIcon, ChatIcon, BackIcon, VideoIcon, ImageIcon, ChipIcon } from '../components/icons';

const SUGGESTION_PREFIX = '__FAQ_SUGGESTIONS__';
const SUGGESTION_CHOICE_PREFIX = '__FAQ_SUGGESTION_CHOICE__';

const renderFormattedText = (text: string, isUserMessage: boolean = false) => {
    const boldColorClass = isUserMessage ? 'text-background/90' : 'text-primary';
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
            <span key={`ub-${key}`} className={`font-bold italic underline tracking-wide ${boldColorClass}`}>
                {match}
            </span>
        ),
    );

    nodes = applyPattern(
        nodes,
        /\*\*(.+?)\*\*/g,
        (match, key) => (
            <span key={`b-${key}`} className={`font-bold tracking-wide ${boldColorClass}`}>
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

const UserConversationsPage: React.FC = () => {
    const [users, setUsers] = useState<UserWithStats[]>([]);
    const [allMedia, setAllMedia] = useState<Media[]>([]);
    const [conversationsByUser, setConversationsByUser] = useState<Map<string, Conversation[]>>(new Map());
    const [selectedUser, setSelectedUser] = useState<UserWithStats | null>(null);
    const [expandedConversationId, setExpandedConversationId] = useState<number | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState({ users: true, messages: false });
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState<string | null>(null);

    const fetchAndProcessData = useCallback(async () => {
        setLoading(prev => ({ ...prev, users: true }));
        setError(null);

        try {
            const data = await api.getAdminConversationsWithUsers();

            const userMap = new Map<string, { user: User; convos: Conversation[]; totalMessages: number; totalTimeSpent: number; lastActive: string }>();

            // Process conversations and count messages per user
            for (const convo of data || []) {
                if (!convo.user) continue;
                if (!userMap.has(convo.user.id)) {
                    userMap.set(convo.user.id, { user: convo.user, convos: [], totalMessages: 0, totalTimeSpent: 0, lastActive: convo.user.created_at });
                }
                userMap.get(convo.user.id)!.convos.push(convo);

                // Fetch messages to count and calculate time spent
                try {
                    const messages = await api.getConversationMessages(convo.id);
                    if (messages && messages.length > 0) {
                        const userEntry = userMap.get(convo.user.id)!;

                        // Only count user messages, not bot messages
                        const userMessages = messages.filter(msg => msg.sender === 'user');
                        userEntry.totalMessages += userMessages.length;

                        // Update last active to the most recent user message
                        if (userMessages.length > 0) {
                            const lastUserMsg = userMessages[userMessages.length - 1];
                            const lastMsgTime = new Date(lastUserMsg.created_at).getTime();
                            const currentLastActive = new Date(userEntry.lastActive).getTime();
                            if (lastMsgTime > currentLastActive) {
                                userEntry.lastActive = lastUserMsg.created_at;
                            }
                        }

                        // Calculate actual time spent: sum of gaps between consecutive messages
                        // Cap gaps at 5 minutes (300s) to exclude long breaks
                        if (messages.length > 1) {
                            let timeSpentSeconds = 0;
                            const MAX_GAP_SECONDS = 300; // 5 minutes

                            // Sort messages by timestamp
                            const sortedMessages = [...messages].sort((a, b) =>
                                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                            );

                            for (let i = 1; i < sortedMessages.length; i++) {
                                const prevTime = new Date(sortedMessages[i - 1].created_at).getTime();
                                const currTime = new Date(sortedMessages[i].created_at).getTime();
                                const gapSeconds = Math.round((currTime - prevTime) / 1000);

                                // Only count gaps up to MAX_GAP_SECONDS (active time)
                                if (gapSeconds > 0 && gapSeconds <= MAX_GAP_SECONDS) {
                                    timeSpentSeconds += gapSeconds;
                                }
                            }

                            userEntry.totalTimeSpent += timeSpentSeconds;
                        }
                    }
                } catch { }
            }

            const usersWithStats: UserWithStats[] = Array.from(userMap.values())
                .map(({ user, convos, totalMessages, totalTimeSpent, lastActive }) => ({
                    ...user,
                    message_count: totalMessages,
                    last_active: lastActive,
                    time_spent: totalTimeSpent,
                }))
                .sort(
                    (a, b) =>
                        new Date(b.last_active).getTime() -
                        new Date(a.last_active).getTime(),
                );

            const convosByUserMap = new Map<string, Conversation[]>();
            userMap.forEach((value, key) => {
                convosByUserMap.set(key, value.convos);
            });

            setUsers(usersWithStats);
            setConversationsByUser(convosByUserMap);
            const mediaList = await api.getAllMedia();
            setAllMedia(mediaList || []);
        } catch (err: any) {
            console.error(err);
            setError(`Failed to fetch data: ${err.message || 'Unknown error'}`);
        } finally {
            setLoading(prev => ({ ...prev, users: false }));
        }
    }, []);

    useEffect(() => {
        fetchAndProcessData();
    }, [fetchAndProcessData]);

    const handleSelectUser = (user: UserWithStats) => {
        setSelectedUser(user);
        setExpandedConversationId(null);
        setMessages([]);
    };

    const handleToggleConversation = async (conversationId: number) => {
        if (expandedConversationId === conversationId) {
            setExpandedConversationId(null);
            setMessages([]);
            return;
        }

        setExpandedConversationId(conversationId);
        setLoading(prev => ({ ...prev, messages: true }));
        setMessages([]);

        try {
            const data = await api.getConversationMessages(conversationId);
            setMessages(
                (data || []).map(m => ({
                    ...m,
                    timestamp: new Date(m.created_at).toLocaleString(),
                })),
            );
        } catch (err: any) {
            setError(`Failed to load messages: ${err.message || 'Unknown error'}`);
        } finally {
            setLoading(prev => ({ ...prev, messages: false }));
        }
    };

    const filteredUsers = useMemo(() => {
        return users.filter(user =>
            user.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [users, searchTerm]);

    const selectedUserConversations = selectedUser ? conversationsByUser.get(selectedUser.id) || [] : [];

    const getMessageAttachments = (msg: ChatMessage): { url: string; title: string; type: 'image' | 'video' }[] => {
        if (!msg.mediaUrls) return [];

        return msg.mediaUrls.map(url => {
            const meta = allMedia.find(m => m.url === url);

            return {
                url,
                title: meta?.title || url,
                type: meta?.type || (url.includes("youtube.com") || url.includes("youtu.be") ? "video" : "image"),
            };
        });
    };

    const suggestionChoice = useMemo(() => {
        const choiceMsg = messages.find(m => m.text.startsWith(SUGGESTION_CHOICE_PREFIX));
        if (!choiceMsg) return null;
        try {
            const payload = JSON.parse(choiceMsg.text.slice(SUGGESTION_CHOICE_PREFIX.length));
            if (!payload || typeof payload.question !== 'string') return null;
            return payload.question as string;
        } catch {
            return null;
        }
    }, [messages]);

    return (
        <div className="flex h-[calc(100vh-65px)] bg-background text-text-primary">
            {/* Users List Panel */}
            <aside
                className="w-full md:w-80 lg:w-96 border-r border-border flex-col bg-surface/30 backdrop-blur-sm"
                style={{ display: selectedUser && window.innerWidth < 768 ? 'none' : 'flex' }}
            >
                <div className="p-4 border-b border-border/50 bg-surface/50">
                    <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                        User Conversations
                    </h2>
                    <p className="text-xs text-text-secondary mt-1">Select a user to view chat logs</p>
                    <div className="relative mt-3">
                        <input
                            type="text"
                            placeholder="Search by name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-surface-light/50 backdrop-blur-sm border border-border/50 rounded-xl py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm"
                        />
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"><SearchIcon /></div>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {loading.users ? (
                        <div className="flex justify-center items-center h-full"><SpinnerIcon /></div>
                    ) : filteredUsers.length === 0 ? (
                        <div className="text-center py-10 text-text-secondary text-sm">No users found.</div>
                    ) : (
                        <div className="p-2 space-y-2">
                            {filteredUsers.map(user => {
                                const timeSpent = user.time_spent || 0;
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
                                const timeDisplay = formatTime(timeSpent);
                                const isSelected = selectedUser?.id === user.id;

                                return (
                                    <div
                                        key={user.id}
                                        onClick={() => handleSelectUser(user)}
                                        className={`p-3 rounded-xl cursor-pointer transition-all duration-200 border ${isSelected
                                            ? 'bg-gradient-to-br from-primary/20 to-secondary/20 border-primary'
                                            : 'bg-surface/50 backdrop-blur-sm border-border/30 hover:border-primary/30 hover:bg-surface-light/50'
                                            }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center flex-shrink-0">
                                                <UserCircleIcon className="w-6 h-6 text-primary" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-sm text-text-primary truncate">{user.name}</div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <ChatIcon className="w-3 h-3 text-text-secondary/70" />
                                                    <span className="text-xs text-text-secondary">{user.message_count} {user.message_count === 1 ? 'message' : 'messages'}</span>
                                                    <span className="text-xs text-text-secondary/50">•</span>
                                                    <span className="text-xs text-text-secondary/70">{timeDisplay}</span>
                                                </div>
                                                <div className="text-xs text-text-secondary/60 mt-0.5">
                                                    {new Date(user.last_active).toLocaleDateString()}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </aside>

            {/* Conversation Log Panel */}
            <main className="flex-1 flex flex-col overflow-hidden" style={{ display: !selectedUser && window.innerWidth < 768 ? 'none' : 'flex' }}>
                {selectedUser ? (
                    <>
                        <header className="p-4 border-b border-border/50 bg-surface/80 backdrop-blur-sm flex items-center gap-3 sticky top-0 z-10 flex-shrink-0">
                            <button className="md:hidden p-2 hover:bg-surface-light rounded-full transition-colors flex-shrink-0" onClick={() => setSelectedUser(null)}>
                                <BackIcon />
                            </button>
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center flex-shrink-0">
                                <UserCircleIcon className="w-6 h-6 text-primary" />
                            </div>
                            <div className="min-w-0 flex-1 overflow-hidden">
                                <h3 className="font-bold text-lg truncate">{selectedUser.name}</h3>
                                <p className="text-xs text-text-secondary truncate">{selectedUser.message_count} {selectedUser.message_count === 1 ? 'message' : 'messages'}</p>
                            </div>
                        </header>
                        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-4 md:p-6 space-y-6 bg-gradient-to-b from-background to-surface/10">
                            {selectedUserConversations.length === 0 ? (
                                <div className="text-center py-10 text-text-secondary text-sm">This user has no conversations.</div>
                            ) : (
                                selectedUserConversations.map(convo => (
                                    <div key={convo.id} className="bg-surface/50 backdrop-blur-sm rounded-2xl border border-border/50 overflow-hidden shadow-md hover:border-primary/50 transition-all duration-300 max-w-full">
                                        <div
                                            className="p-4 cursor-pointer flex justify-between items-center hover:bg-surface-light/30 transition-colors"
                                            onClick={() => handleToggleConversation(convo.id)}
                                        >
                                            <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
                                                <ChatIcon className="w-5 h-5 text-primary flex-shrink-0" />
                                                <div className="flex-1 min-w-0 overflow-hidden">
                                                    <p className="font-semibold text-sm truncate">{convo.title || `Conversation #${convo.id}`}</p>
                                                    <p className="text-xs text-text-secondary/70 truncate">{new Date(convo.created_at).toLocaleString()}</p>
                                                </div>
                                            </div>
                                            <div className={`transform transition-transform duration-300 text-primary flex-shrink-0 ml-2 ${expandedConversationId === convo.id ? 'rotate-90' : 'rotate-0'}`}>
                                                &#x276F;
                                            </div>
                                        </div>
                                        {expandedConversationId === convo.id && (
                                            <div className="p-4 border-t border-border/30 space-y-5 bg-background/30 overflow-x-hidden">
                                                {loading.messages ? (
                                                    <div className="flex justify-center items-center py-4">
                                                        <SpinnerIcon />
                                                    </div>
                                                ) : messages.length === 0 ? (
                                                    <div className="text-center py-4 text-text-secondary text-sm">
                                                        No messages in this conversation.
                                                    </div>
                                                ) : (
                                                    messages.map(msg => {
                                                        // FAQ suggestions
                                                        if (msg.text.startsWith(SUGGESTION_PREFIX)) {
                                                            let payload: { message?: string; suggestions?: { id: number; question: string }[] } = {};
                                                            try {
                                                                payload = JSON.parse(msg.text.slice(SUGGESTION_PREFIX.length)) || {};
                                                            } catch { }

                                                            return (
                                                                <div key={msg.id} className="flex items-start gap-3 max-w-full">
                                                                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-surface-light to-surface border border-primary/30 flex items-center justify-center flex-shrink-0 shadow-lg">
                                                                        <BotIcon className="w-6 h-6 text-primary" />
                                                                    </div>

                                                                    <div className="max-w-full sm:max-w-xl p-4 rounded-2xl bg-surface/90 backdrop-blur-sm border border-border/50 hover:border-primary/30 transition-colors shadow-lg text-left min-w-0">
                                                                        <p className="font-semibold text-sm break-words">{payload.message}</p>

                                                                        <div className="mt-3 flex flex-col gap-2">
                                                                            {(payload.suggestions || []).map(s => {
                                                                                const isSelected = suggestionChoice === s.question;

                                                                                return (
                                                                                    <button
                                                                                        key={s.id}
                                                                                        type="button"
                                                                                        disabled
                                                                                        className={`text-left px-4 py-2 rounded-xl border text-sm font-medium cursor-default transition-all break-words
                                                        ${isSelected
                                                                                                ? "border-primary bg-primary/10"
                                                                                                : "border-border/50 bg-surface-light/50"
                                                                                            } text-text-primary`}
                                                                                    >
                                                                                        {s.question}
                                                                                    </button>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }

                                                        // Hide raw selection
                                                        if (msg.text.startsWith(SUGGESTION_CHOICE_PREFIX)) return null;

                                                        // Normal messages
                                                        const attachments = getMessageAttachments(msg);
                                                        const alignRight = msg.sender === "user";

                                                        return (
                                                            <div key={msg.id} className="mb-3 max-w-full">
                                                                {/* Message bubble row */}
                                                                <div className={`flex ${alignRight ? "justify-end" : "justify-start"}`}>
                                                                    <div
                                                                        className={`flex items-end gap-2 max-w-full sm:max-w-[75%] min-w-0 ${alignRight ? "flex-row-reverse" : "flex-row"
                                                                            }`}
                                                                    >
                                                                        {/* Avatar */}
                                                                        <div
                                                                            className={`flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg
                            ${alignRight
                                                                                    ? "bg-primary shadow-md"
                                                                                    : "bg-gradient-to-br from-surface-light to-surface border border-primary/30"
                                                                                }`}
                                                                        >
                                                                            {alignRight ? (
                                                                                <UserCircleIcon className="w-6 h-6 text-background" />
                                                                            ) : (
                                                                                <BotIcon className="w-6 h-6 text-primary" />
                                                                            )}
                                                                        </div>

                                                                        {/* Text bubble */}
                                                                        <div
                                                                            className={`rounded-2xl px-5 py-4 shadow-lg transition-all duration-300 hover:shadow-xl min-w-0 overflow-hidden break-words
                            ${alignRight
                                                                                    ? "bg-primary text-background border border-primary/60"
                                                                                    : "bg-surface/90 backdrop-blur-sm border border-border/50 hover:border-primary/30 text-text-primary"
                                                                                }`}
                                                                        >
                                                                            {/* Text */}
                                                                            <div className={`space-y-1 text-sm sm:text-base ${alignRight ? 'font-bold tracking-wide' : ''}`}>
                                                                                {msg.text.split(/\r?\n/).map((line, idx) => {
                                                                                    const trimmed = line.trim();
                                                                                    if (!trimmed) return <div key={idx} className="h-2" />;

                                                                                    if (trimmed.startsWith("•")) {
                                                                                        return (
                                                                                            <ul key={idx} className="list-disc pl-5">
                                                                                                <li>{renderFormattedText(trimmed.replace(/^•\s*/, ""), alignRight)}</li>
                                                                                            </ul>
                                                                                        );
                                                                                    }

                                                                                    return (
                                                                                        <p key={idx} className="whitespace-pre-wrap">
                                                                                            {renderFormattedText(line, alignRight)}
                                                                                        </p>
                                                                                    );
                                                                                })}

                                                                                {/* Suggestion Chips - from message.suggestions */}
                                                                                {!alignRight && msg.suggestions && msg.suggestions.length > 0 && (
                                                                                    <div className="mt-4 flex flex-col gap-2">
                                                                                        {msg.suggestions.map((suggestion: any, idx: number) => (
                                                                                            <div
                                                                                                key={`${suggestion.linked_faq_id}-${idx}`}
                                                                                                className="w-full bg-surface-light/50 border border-border/50 text-text-primary px-4 py-3 rounded-xl text-left shadow-sm"
                                                                                            >
                                                                                                <span className="text-sm font-medium text-text-primary flex items-center gap-2">
                                                                                                    <ChipIcon className="w-4 h-4 text-white shrink-0" />
                                                                                                    {suggestion.text_en}
                                                                                                </span>
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                )}
                                                                            </div>

                                                                            {/* Timestamp */}
                                                                            <div className={`text-xs mt-2 text-right ${alignRight ? 'text-background/70' : 'text-text-secondary/70'}`}>
                                                                                {new Date(msg.created_at).toLocaleTimeString()}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Media summary row under the bubble */}
                                                                {attachments.length > 0 && (
                                                                    <div className={`mt-2 flex ${alignRight ? "justify-end" : "justify-start"} max-w-full`}>
                                                                        <div
                                                                            className={`flex items-start gap-2 max-w-full sm:max-w-[75%] min-w-0 ${alignRight ? "flex-row-reverse" : ""
                                                                                }`}
                                                                        >
                                                                            {/* Spacer to align under the bubble */}
                                                                            <div className="w-10 h-10 flex-shrink-0" />
                                                                            <div className="rounded-xl bg-surface/70 backdrop-blur-sm border border-border/50 px-3 py-2.5 text-xs shadow-md hover:shadow-lg transition-shadow min-w-0 overflow-hidden">
                                                                                <div className="flex items-center justify-between mb-2 gap-2">
                                                                                    <span className="text-[10px] font-bold uppercase text-primary tracking-wider flex items-center gap-1 flex-shrink-0">
                                                                                        {attachments.some(a => a.type === 'video') ? <VideoIcon className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                                                                                        Media
                                                                                    </span>
                                                                                    <span className="text-[10px] text-text-secondary/70 font-semibold flex-shrink-0">
                                                                                        {attachments.length} {attachments.length !== 1 ? 'items' : 'item'}
                                                                                    </span>
                                                                                </div>
                                                                                <ul className="space-y-1.5">
                                                                                    {attachments.map(item => (
                                                                                        <li
                                                                                            key={item.url}
                                                                                            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-surface-light/50 transition-colors min-w-0"
                                                                                        >
                                                                                            <a
                                                                                                href={item.url}
                                                                                                target="_blank"
                                                                                                rel="noopener noreferrer"
                                                                                                className="flex-1 truncate text-xs text-text-primary hover:text-primary transition-colors font-medium min-w-0"
                                                                                            >
                                                                                                {item.title}
                                                                                            </a>
                                                                                            <span className="text-[9px] uppercase opacity-60 font-bold px-1.5 py-0.5 bg-primary/10 rounded flex-shrink-0 whitespace-nowrap">
                                                                                                {item.type}
                                                                                            </span>
                                                                                        </li>
                                                                                    ))}
                                                                                </ul>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    }))}  {/* END messages.map */}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                ) : (
                    <div className="hidden md:flex flex-1 flex-col justify-center items-center text-center p-8">
                        <div className="relative mb-6">
                            <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl animate-pulse"></div>
                            <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/20 to-secondary/20 border border-primary/30 flex items-center justify-center shadow-glow-primary">
                                <ChatIcon className="w-10 h-10 text-primary" />
                            </div>
                        </div>
                        <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-2">
                            Select a User
                        </h2>
                        <p className="text-text-secondary/70 max-w-sm">
                            Choose a user from the left panel to view their conversation history and chat logs.
                        </p>
                    </div>
                )}

                {error && (
                    <div className="p-4 bg-accent text-white text-center text-sm">
                        {error}
                    </div>
                )}
            </main>
        </div>
    );
};

export default UserConversationsPage;