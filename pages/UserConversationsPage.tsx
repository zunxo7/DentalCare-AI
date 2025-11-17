import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../lib/apiClient';
import type { UserWithStats, User, Conversation, ChatMessage, Media, FAQ } from '../types';
import { SpinnerIcon, SearchIcon, BotIcon, UserCircleIcon, ChatIcon, BackIcon, VideoIcon, ImageIcon } from '../components/icons';

const SUGGESTION_PREFIX = '__FAQ_SUGGESTIONS__';
const SUGGESTION_CHOICE_PREFIX = '__FAQ_SUGGESTION_CHOICE__';

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

            const userMap = new Map<string, { user: User; convos: Conversation[] }>();
            (data || []).forEach(convo => {
                if (!convo.user) return;
                if (!userMap.has(convo.user.id)) {
                    userMap.set(convo.user.id, { user: convo.user, convos: [] });
                }
                userMap.get(convo.user.id)!.convos.push(convo);
            });

            const usersWithStats: UserWithStats[] = Array.from(userMap.values())
                .map(({ user, convos }) => ({
                    ...user,
                    conversation_count: convos.length,
                    last_active: convos[0]?.created_at || user.created_at,
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
            const data = await api.getMessagesForConversation(conversationId);
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
                className="w-full md:w-1/3 min-w-[300px] max-w-[450px] border-r border-border flex-col bg-surface"
                style={{ display: selectedUser && window.innerWidth < 768 ? 'none' : 'flex' }}
            >
                <div className="p-4 border-b border-border">
                    <h2 className="text-lg font-semibold">Users</h2>
                    <p className="text-sm text-text-secondary">Select a user to view their logs.</p>
                    <div className="relative mt-4">
                        <input
                            type="text"
                            placeholder="Search by name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-surface-light border border-border rounded-md py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                        />
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><SearchIcon /></div>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {loading.users ? (
                        <div className="flex justify-center items-center h-full"><SpinnerIcon /></div>
                    ) : filteredUsers.length === 0 ? (
                        <div className="text-center py-10 text-text-secondary">No users found.</div>
                    ) : (
                        <ul>
                            {filteredUsers.map(user => (
                                <li key={user.id} onClick={() => handleSelectUser(user)}
                                    className={`p-4 cursor-pointer transition-colors duration-200 border-l-4 ${selectedUser?.id === user.id ? 'bg-surface-light border-primary' : 'border-transparent hover:bg-surface-light/50'}`}>
                                    <div className="font-semibold text-text-primary">{user.name}</div>
                                    <div className="text-sm text-text-secondary mt-1">
                                        {user.conversation_count} conversations
                                    </div>
                                    <div className="text-xs text-text-secondary/70 mt-1">
                                        Last active: {new Date(user.last_active).toLocaleDateString()}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </aside>

            {/* Conversation Log Panel */}
            <main className="flex-1 flex flex-col" style={{ display: !selectedUser && window.innerWidth < 768 ? 'none' : 'flex' }}>
                {selectedUser ? (
                    <>
                        <header className="p-4 border-b border-border bg-surface/50 flex items-center gap-4">
                             <button className="md:hidden p-2 hover:bg-surface-light rounded-full" onClick={() => setSelectedUser(null)}>
                                <BackIcon />
                             </button>
                             <div className="min-w-0">
                                <h3 className="font-bold text-lg truncate">{selectedUser.name}'s Conversations</h3>
                                <p className="text-sm text-text-secondary">{selectedUserConversations.length} total logs</p>
                            </div>
                        </header>
                        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                             {selectedUserConversations.length === 0 ? (
                                 <div className="text-center py-10 text-text-secondary">This user has no conversations.</div>
                             ) : (
                                selectedUserConversations.map(convo => (
                                    <div key={convo.id} className="bg-surface rounded-lg border border-border">
                                        <div 
                                            className="p-4 cursor-pointer flex justify-between items-center hover:bg-surface-light/50"
                                            onClick={() => handleToggleConversation(convo.id)}
                                        >
                                            <div>
                                                <p className="font-semibold text-sm truncate">{convo.title || `Conversation #${convo.id}`}</p>
                                                <p className="text-xs text-text-secondary">{new Date(convo.created_at).toLocaleString()}</p>
                                            </div>
                                            <span className={`transform transition-transform ${expandedConversationId === convo.id ? 'rotate-90' : 'rotate-0'}`}>
                                                &#x276F;
                                            </span>
                                        </div>
                                        {expandedConversationId === convo.id && (
                                            <div className="p-4 border-t border-border space-y-4 bg-background/50">
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
        } catch {}

        return (
            <div key={msg.id} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-surface-light flex items-center justify-center">
                    <BotIcon className="w-5 h-5 text-text-primary" />
                </div>

                <div className="max-w-xl p-4 rounded-2xl bg-surface border border-border text-left">
                    <p className="font-semibold text-sm">{payload.message}</p>

                    <div className="mt-3 flex flex-col gap-2">
                        {(payload.suggestions || []).map(s => {
                            const isSelected = suggestionChoice === s.question;

                            return (
                                <button
                                    key={s.id}
                                    type="button"
                                    disabled
                                    className={`text-left px-4 py-2 rounded-xl border text-sm font-medium cursor-default
                                        ${isSelected ? "border-[#08d0c7]" : "border-border/70"}
                                        bg-surface-light text-text-primary`}
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
        <div key={msg.id} className="mb-4">
            {/* Message bubble row */}
            <div className={`flex ${alignRight ? "justify-end" : "justify-start"}`}>
                <div
                    className={`flex items-start gap-3 max-w-full sm:max-w-[75%] ${
                        alignRight ? "flex-row-reverse" : "flex-row"
                    }`}
                >
                    {/* Avatar */}
                    <div
                        className={`flex-shrink-0 w-8 h-8 aspect-square rounded-full flex items-center justify-center
                            ${alignRight ? "bg-primary text-background" : "bg-surface-light text-primary"}`}
                    >
                        {alignRight ? (
                            <UserCircleIcon className="w-5 h-5" />
                        ) : (
                            <BotIcon className="w-5 h-5" />
                        )}
                    </div>

                    {/* Text bubble */}
                    <div
                        className={`rounded-2xl px-4 py-3 shadow-sm border
                            ${
                                alignRight
                                    ? "bg-[#08d0c7] text-[#052231] border-transparent"
                                    : "bg-surface border-border text-text-primary"
                            }`}
                    >
                        {/* Text */}
                        <div className="space-y-1 text-sm sm:text-base">
                            {msg.text.split(/\r?\n/).map((line, idx) => {
                                const trimmed = line.trim();
                                if (!trimmed) return <div key={idx} className="h-2" />;

                                if (trimmed.startsWith("�?�")) {
                                    return (
                                        <ul key={idx} className="list-disc pl-5">
                                            <li>{renderFormattedText(trimmed.replace(/^�?�\s*/, ""))}</li>
                                        </ul>
                                    );
                                }

                                return (
                                    <p key={idx} className="whitespace-pre-wrap">
                                        {renderFormattedText(line)}
                                    </p>
                                );
                            })}
                        </div>

                        {/* Timestamp */}
                        <div className="text-xs mt-2 opacity-70 text-right">
                            {new Date(msg.created_at).toLocaleTimeString()}
                        </div>
                    </div>
                </div>
            </div>

            {/* Media summary row under the bubble (titles + type only, no links) */}
            {attachments.length > 0 && (
                <div className={`mt-2 flex ${alignRight ? "justify-end" : "justify-start"}`}>
                    <div
                        className={`flex items-start gap-2 max-w-full sm:max-w-[75%] ${
                            alignRight ? "flex-row-reverse" : ""
                        }`}
                    >
                        {/* Spacer to align under the bubble; no avatar here */}
                        <div className="w-8 h-8 flex-shrink-0" />
                        <div className="rounded-xl bg-surface-light border border-border px-3 py-2 text-xs">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-semibold uppercase text-text-secondary">
                                    Media
                                </span>
                                <span className="text-[10px] text-text-secondary">
                                    {attachments.length} item{attachments.length !== 1 && "s"}
                                </span>
                            </div>
<ul className="space-y-1">
  {attachments.map(item => (
    <li
      key={item.url}
      className="flex items-center justify-between gap-2"
    >
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="truncate text-xs text-primary hover:underline"
      >
        {item.title}
      </a>
      <span className="text-[10px] uppercase opacity-70">
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
                    <div className="hidden md:flex flex-1 flex-col justify-center items-center text-center text-text-secondary p-8">
                        <UserCircleIcon className="w-12 h-12"/>
                        <h2 className="mt-4 text-xl font-semibold">Select a user</h2>
                        <p>Choose a user from the left panel to view their conversation logs.</p>
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