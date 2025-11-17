import React, {
    useState,
    useEffect,
    useRef,
    useCallback,
    useMemo,
    useLayoutEffect,
} from 'react';
import { useNavigate } from 'react-router-dom';
import type { ChatMessage, FAQ, Media, Conversation, User } from '../types';
import { getBotResponse } from '../services/botService';
import { api } from '../lib/apiClient';
import {
    BotIcon,
    SendIcon,
    UserCircleIcon,
    VideoIcon,
    ImageIcon,
    DashboardIcon,
    PlusIcon,
    TrashIcon,
    SpinnerIcon,
    MenuIcon,
} from '../components/icons';

const SIDEBAR_BG = 'bg-[#1A1F2E] border-[#08101a]';

// Kept only so old DB messages with these prefixes can be ignored
const SUGGESTION_PREFIX = '__FAQ_SUGGESTIONS__';
const SUGGESTION_CHOICE_PREFIX = '__FAQ_SUGGESTION_CHOICE__';

type AttachedMediaItem = {
    url: string;
    title: string;
    type: string;
};

type MediaPreviewState = {
    items: AttachedMediaItem[];
    index: number;
};

interface ChatbotPageProps {
    faqs: FAQ[]; // no longer used on frontend – backend does all matching
    media: Media[];
    incrementFaqCount: (faqId: number) => void;
    showToast: (message: string, type: 'success' | 'error') => void;
}

const UserNameModal: React.FC<{ onSubmit: (name: string) => void; isLoading: boolean }> = ({
    onSubmit,
    isLoading,
}) => {
    const [name, setName] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim() && !isLoading) {
            onSubmit(name.trim());
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
            <div className="bg-surface rounded-2xl shadow-xl p-8 w-full max-w-md border border-border animate-fade-in-up">
                <h2 className="text-2xl font-bold mb-2 text-text-primary">Welcome to the Assistant</h2>
                <p className="text-text-secondary mb-6">
                    Please enter your name to begin. Your conversation history will be saved for future
                    visits.
                </p>
                <form onSubmit={handleSubmit}>
                    <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Enter your name"
                        className="w-full bg-surface-light border border-border rounded-lg py-3 px-4 focus:outline-none focus:ring-2 focus:ring-primary transition-all text-text-primary"
                        autoFocus
                    />
                    <button
                        type="submit"
                        className="w-full mt-4 bg-primary text-background font-bold py-3 px-4 rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 flex justify-center items-center"
                        disabled={!name.trim() || isLoading}
                    >
                        {isLoading ? <SpinnerIcon /> : 'Start Chatting'}
                    </button>
                </form>
            </div>
        </div>
    );
};

const ChatEmptyState: React.FC<{ onQuestionClick: (question: string) => void }> = ({
    onQuestionClick,
}) => {
    const starterQuestions = [
        'How often will I see the orthodontist?',
        'What do I do if a bracket or a wire comes loose?',
        'Do braces cause discomfort?',
        'How often should I brush?',
    ];

    return (
        <div
            className="flex flex-col justify-center items-center 
    min-h-[calc(100vh-80px)]
    text-center animate-fade-in-up px-4"
        >
            <div className="max-w-3xl w-full">
                <div className="mb-12">
                    <h1 className="text-4xl md:text-5xl font-bold text-text-primary">
                        Welcome to Dental Care
                    </h1>
                    <p className="text-lg text-text-secondary mt-4 max-w-xl mx-auto">
                        Ask me anything about our dental services or procedures.
                    </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {starterQuestions.map((q, i) => (
                        <button
                            key={i}
                            onClick={() => onQuestionClick(q)}
                            className="text-left p-5 bg-surface rounded-xl border border-border hover:bg-surface-light hover:border-primary transition-all duration-200 text-text-primary"
                        >
                            {q}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

const ChatbotPage: React.FC<ChatbotPageProps> = ({ faqs, media, incrementFaqCount, showToast }) => {
    const navigate = useNavigate();

    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isCreatingUser, setIsCreatingUser] = useState(false);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [isNameModalOpen, setIsNameModalOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isConversationLoading, setIsConversationLoading] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [activeMediaPreview, setActiveMediaPreview] = useState<MediaPreviewState | null>(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    const [inputHeight, setInputHeight] = useState<number | undefined>(32);
    const [isInputFocused, setIsInputFocused] = useState(false);
    const initialLoadComplete = useRef(false);

    const scrollToBottom = useCallback(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    useLayoutEffect(() => {
        const minHeight = 32;
        const maxHeight = 160;
        const el = inputRef.current;
        if (!el) return;

        if (input === '') {
            setInputHeight(minHeight);
            el.style.height = `${minHeight}px`;
            return;
        }

        if (!input.includes('\n')) {
            setInputHeight(minHeight);
            el.style.height = `${minHeight}px`;
            return;
        }

        el.style.height = 'auto';
        const next = Math.min(maxHeight, Math.max(minHeight, el.scrollHeight));
        setInputHeight(next);
    }, [input]);

    const addMessageToState = (
        message: Omit<ChatMessage, 'id' | 'created_at' | 'conversation_id' | 'timestamp'>,
        convId: number,
        replace = false,
    ) => {
        const newMessage: ChatMessage = {
            id: Date.now() + Math.random(),
            conversation_id: convId,
            ...message,
            timestamp: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
            }),
            created_at: new Date().toISOString(),
        };
        if (replace) {
            setMessages([newMessage]);
        } else {
            setMessages(prev => [...prev, newMessage]);
        }
        return newMessage;
    };

    const handleNewChat = useCallback(() => {
        setActiveConversationId(null);
        setMessages([]);
        if (window.innerWidth < 768) setIsSidebarOpen(false);
    }, []);

    const handleSelectConversation = useCallback(
        async (id: number) => {
            if (isThinking) return;

            setActiveConversationId(id);
            setIsConversationLoading(true);
            try {
                const data = await api.getConversationMessages(id);
                setMessages(data);
            } catch (error) {
                console.error('Error loading messages:', error);
                showToast('Could not load messages for this conversation.', 'error');
            } finally {
                setIsConversationLoading(false);
                if (window.innerWidth < 768) setIsSidebarOpen(false);
            }
        },
        [isThinking, showToast],
    );

    const loadConversations = useCallback(
        async (user: User) => {
            if (!user) return;
            try {
                const data = await api.getUserConversations(user.id);
                const conversationsWithTitles = data.map(convo => ({
                    ...convo,
                    title:
                        convo.title || `Chat from ${new Date(convo.created_at).toLocaleDateString()}`,
                }));
                setConversations(conversationsWithTitles);

                if (!initialLoadComplete.current) {
                    if (conversationsWithTitles.length > 0) {
                        handleSelectConversation(conversationsWithTitles[0].id);
                    } else {
                        handleNewChat();
                    }
                    initialLoadComplete.current = true;
                }
            } catch (error: any) {
                console.error('Error loading conversations:', error);
                showToast(
                    `Could not load conversations: ${error.message || 'Unknown error'}`,
                    'error',
                );
            }
        },
        [handleNewChat, handleSelectConversation, showToast],
    );

    const handleSend = useCallback(
        async (messageText?: string) => {
            if (isConversationLoading) return;
            const userInput = messageText || input;
            if (userInput.trim() === '' || isLoading || !currentUser) return;

            if (!messageText) {
                setInput('');
            }

            let currentConversationId = activeConversationId;
            const userMessagePayload = { sender: 'user' as const, text: userInput };

            try {
                if (!currentConversationId) {
                    setIsLoading(true);
                    const tempUserMsg = addMessageToState(
                        userMessagePayload,
                        0,
                        messages.length === 0,
                    );

                    const newConversation = await api.createConversation(
                        currentUser.id,
                        userInput,
                    );
                    currentConversationId = newConversation.id;

                    setConversations(prev => [newConversation, ...prev]);
                    setActiveConversationId(currentConversationId);

                    setMessages(prev =>
                        prev.map(m =>
                            m.id === tempUserMsg.id
                                ? { ...m, conversation_id: currentConversationId! }
                                : m,
                        ),
                    );

                    await api.createMessage({
                        conversationId: currentConversationId,
                        sender: userMessagePayload.sender,
                        text: userMessagePayload.text,
                    });
                } else {
                    addMessageToState(userMessagePayload, currentConversationId);
                    await api.createMessage({
                        conversationId: currentConversationId,
                        sender: userMessagePayload.sender,
                        text: userMessagePayload.text,
                    });
                }

                setIsLoading(true);
                setIsThinking(true);

                // ⬇️ Backend now does ALL matching + media selection
                const botResponse = await getBotResponse(userInput, currentUser.name, faqs, media);

                if (botResponse.faqId) {
                    incrementFaqCount(botResponse.faqId);
                }

                const mediaUrls = botResponse.mediaUrls || [];

                const botMessagePayload = {
                    sender: 'bot' as const,
                    text: botResponse.text,
                    mediaUrls,
                };
                console.log('[BOT_RESPONSE]', {
                    question: userInput,
                    faqId: botResponse.faqId,
                    mediaUrls,
                });

                addMessageToState(botMessagePayload, currentConversationId!);
                setIsThinking(false);

                await api.createMessage({
                    conversationId: currentConversationId!,
                    sender: botMessagePayload.sender,
                    text: botMessagePayload.text,
                    mediaUrls: botMessagePayload.mediaUrls,
                });
            } catch (error: any) {
                console.error('Error sending message:', error);
                setIsThinking(false);
                showToast(
                    `Could not send message: ${error.message || 'Unknown error'}`,
                    'error',
                );
            } finally {
                setIsLoading(false);
            }
        },
        [
            activeConversationId,
            currentUser,
            incrementFaqCount,
            input,
            isLoading,
            isConversationLoading,
            messages.length,
            showToast,
        ],
    );

    useEffect(() => {
        const checkUserSession = async () => {
            const userId = localStorage.getItem('ortho_user_id');
            if (userId) {
                try {
                    const user = await api.getUser(userId);
                    if (user) {
                        setCurrentUser(user);
                        loadConversations(user);
                    } else {
                        localStorage.removeItem('ortho_user_id');
                        setIsNameModalOpen(true);
                    }
                } catch {
                    localStorage.removeItem('ortho_user_id');
                    setIsNameModalOpen(true);
                }
            } else {
                setIsNameModalOpen(true);
            }
        };
        checkUserSession();
    }, [loadConversations]);

    const handleDeleteConversation = async (id: number) => {
        const originalConversations = [...conversations];
        const newConversations = conversations.filter(c => c.id !== id);
        setConversations(newConversations);

        if (activeConversationId === id) {
            if (newConversations.length > 0) {
                handleSelectConversation(newConversations[0].id);
            } else {
                handleNewChat();
            }
        }

        try {
            await api.softDeleteConversation(id);
            showToast('Chat deleted successfully.', 'success');
        } catch (error: any) {
            setConversations(originalConversations);
            showToast(
                `Could not delete chat: ${error.message || 'Unknown error'}`,
                'error',
            );
        }
    };

    const handleUserCreate = async (name: string) => {
        setIsCreatingUser(true);
        try {
            const newUser = await api.createUser(name);
            localStorage.setItem('ortho_user_id', newUser.id);
            setCurrentUser(newUser);
        } catch (error: any) {
            showToast(
                `Could not create user: ${error.message || 'Unknown error'}`,
                'error',
            );
        }
        setIsNameModalOpen(false);
        setIsCreatingUser(false);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
    };

    const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isConversationLoading) handleSend();
        }
    };

    const activeConversation = useMemo(
        () => conversations.find(c => c.id === activeConversationId) || null,
        [conversations, activeConversationId],
    );

    const activeConversationTitle = activeConversation?.title || 'New Chat';
    const isMultiLineInput = input.includes('\n');

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

    const sanitizeMediaText = (text: string, hasMedia: boolean) => {
        if (!hasMedia) return text;
        let cleaned = text;
        cleaned = cleaned.replace(/^(I['’`]?m sorry[^.]*\.)\s*/i, '');
        cleaned = cleaned.replace(/^(I can('?t|not) [^.]*\.)\s*/i, '');
        cleaned = cleaned.trim();
        if (!cleaned) {
            return 'Here are some helpful resources:';
        }
        return cleaned;
    };

    const getYoutubeId = (url: string): string | null => {
        try {
            const u = new URL(url);
            if (u.hostname.includes('youtube.com')) {
                return u.searchParams.get('v');
            }
            if (u.hostname === 'youtu.be') {
                return u.pathname.slice(1) || null;
            }
            return null;
        } catch {
            return null;
        }
    };

    const renderMessageContent = (message: ChatMessage) => {
        return (
            <div>
                <div className="space-y-1 text-sm sm:text-base">
                    {sanitizeMediaText(message.text, !!message.mediaUrls?.length)
                        .split(/\r?\n/)
                        .map((line, idx) => {
                            const trimmed = line.trim();
                            if (!trimmed) {
                                return <div key={`br-${idx}`} className="h-2" />;
                            }
                            if (trimmed.startsWith('•')) {
                                const content = trimmed.replace(/^•\s*/, '');
                                return (
                                    <ul key={`ul-${idx}`} className="list-disc pl-5">
                                        <li>{renderFormattedText(content)}</li>
                                    </ul>
                                );
                            }
                            return (
                                <p key={`p-${idx}`} className="whitespace-pre-wrap">
                                    {renderFormattedText(line)}
                                </p>
                            );
                        })}
                </div>
            </div>
        );
    };

    const getMessageAttachments = (message: ChatMessage): AttachedMediaItem[] => {
        const urls = message.mediaUrls || [];

        return urls.map(url => {
            const meta = media.find(m => m.url === url);

            return {
                url,
                title: meta?.title || url,
                type:
                    meta?.type ||
                    (/\.(mp4|mov|webm)$/i.test(url)
                        ? 'video'
                        : /\.(png|jpg|jpeg|gif)$/i.test(url)
                        ? 'image'
                        : 'unknown'),
            };
        });
    };

    const MediaAttachmentBubble: React.FC<{
        attachments: AttachedMediaItem[];
        alignRight: boolean;
        isUser: boolean;
    }> = ({ attachments, alignRight, isUser }) => {
        if (attachments.length === 0) return null;
        const bubbleBase = isUser
            ? 'bg-[#08d0c7] text-[#052231] border border-transparent'
            : 'bg-surface text-text-primary border border-border';
        const detailColor = isUser ? 'text-[#052231]/70' : 'text-text-secondary';
        const cardBg = isUser ? 'bg-[#07b6ad]' : 'bg-surface-light';
        const iconColor = isUser ? 'text-[#052231]' : 'text-text-secondary';

        return (
            <div
                className={`rounded-3xl ${bubbleBase} p-4 shadow-sm ${
                    alignRight ? 'rounded-tr-lg' : 'rounded-tl-lg'
                }`}
            >
                <div className="flex items-center justify-between mb-4">
                    <p className={`text-[11px] font-semibold uppercase tracking-wide ${detailColor}`}>
                        Media
                    </p>
                    <span className={`text-[10px] ${detailColor}`}>
                        {attachments.length} item{attachments.length !== 1 && 's'}
                    </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {attachments.map((item, index) => {
                        const youtubeId = item.type === 'video' ? getYoutubeId(item.url) : null;
                        const thumbnailUrl = youtubeId
                            ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
                            : item.url;

                        return (
                            <button
                                key={item.url}
                                type="button"
                                onClick={() => {
                                    setIsPreviewLoading(true);
                                    setActiveMediaPreview({
                                        items: attachments,
                                        index,
                                    });
                                }}
                                className="group overflow-hidden rounded-2xl bg-surface border border-border/60 hover:border-primary/70 hover:shadow-glow-primary transition-all duration-200 text-left"
                            >
                                <div className="relative w-full aspect-video overflow-hidden">
                                    <img
                                        src={thumbnailUrl}
                                        alt={item.title}
                                        className="h-full w-full object-cover group-hover:scale-105 transition"
                                    />
                                    {item.type === 'video' && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                            <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center text-white font-semibold shadow-lg">
                                                ▶
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div
                                    className={`px-3 py-2 flex items-center justify-between ${cardBg}`}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        {item.type === 'video' ? (
                                            <VideoIcon className={`w-4 h-4 ${iconColor}`} />
                                        ) : (
                                            <ImageIcon className={`w-4 h-4 ${iconColor}`} />
                                        )}
                                        <span className="text-xs font-medium text-text-primary truncate">
                                            {item.title}
                                        </span>
                                    </div>
                                    <span
                                        className={`text-[9px] font-semibold uppercase ${detailColor}`}
                                    >
                                        {item.type}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };

    const SidebarContent = () => (
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2 min-w-0 w-0 flex-1">
                    <UserCircleIcon className="w-6 h-6 flex-shrink-0" />
                    <div className="min-w-0">
                        <p className="text-sm text-text-secondary">Logged in as</p>
                        <p className="font-semibold text-text-primary text-sm truncate">
                            {currentUser?.name || 'Guest'}
                        </p>
                    </div>
                </div>
                <button
                    onClick={handleNewChat}
                    className="p-2 rounded-full bg-primary text-background hover:bg-primary-hover transition-colors"
                    title="New chat"
                >
                    <PlusIcon className="w-4 h-4" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {conversations.length > 0 ? (
                    <ul className="space-y-1">
                        {conversations.map(c => (
                            <li
                                key={c.id}
                                className={`group flex items-center justify-between gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                                    activeConversationId === c.id
                                        ? 'bg-primary/10 border border-primary/40'
                                        : 'hover:bg-surface-light border border-transparent'
                                } ${
                                    isThinking
                                        ? 'opacity-60 cursor-not-allowed hover:bg-surface'
                                        : ''
                                }`}
                                onClick={() => {
                                    if (isThinking || isConversationLoading) return;
                                    handleSelectConversation(c.id);
                                }}
                            >
                                <div className="flex items-center gap-2 min-w-0 w-0 flex-1">
                                    <div className="flex flex-col min-w-0 max-w-full">
                                        <span className="text-sm font-medium text-text-primary truncate">
                                            {c.title || 'Untitled chat'}
                                        </span>
                                        <span className="text-[11px] text-text-secondary truncate">
                                            {new Date(c.created_at).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={e => {
                                        e.stopPropagation();
                                        handleDeleteConversation(c.id);
                                    }}
                                    className="p-1 text-text-secondary hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="p-4 text-center text-text-secondary text-sm">
                        No chats yet. Start a new one!
                    </div>
                )}
            </div>
        </div>
    );

    const closeMediaPreview = () => {
        setIsPreviewLoading(false);
        setActiveMediaPreview(null);
    };

    const goToPreview = (delta: number) => {
        if (!activeMediaPreview) return;
        const len = activeMediaPreview.items.length;
        if (len === 0) return;
        const nextIndex = (activeMediaPreview.index + delta + len) % len;
        setActiveMediaPreview({
            ...activeMediaPreview,
            index: nextIndex,
        });
        setIsPreviewLoading(true);
    };

    return (
        <div className="flex h-screen bg-background text-text-primary">
            {isNameModalOpen && (
                <UserNameModal onSubmit={handleUserCreate} isLoading={isCreatingUser} />
            )}

            <aside
                className={`hidden md:flex md:w-80 lg:w-96 xl:w-[380px] md:flex-col ${SIDEBAR_BG}`}
            >
                <SidebarContent />
            </aside>

            {isSidebarOpen && (
                <div className="fixed inset-0 z-40 md:hidden">
                    <div
                        className="absolute inset-0 bg-black/60"
                        onClick={() => setIsSidebarOpen(false)}
                    />
                    <div
                        className={`relative h-full w-4/5 max-w-xs shadow-xl slide-in-left ${SIDEBAR_BG}`}
                    >
                        <SidebarContent />
                    </div>
                </div>
            )}

            <div className="flex flex-col flex-1 h-full">
                <header className="bg-surface/80 backdrop-blur-sm p-4 flex justify-between items-center border-b border-border sticky top-0 z-10">
                    <div className="flex items-center gap-2 min-w-0 w-0 flex-1">
                        <button
                            onClick={() => setIsSidebarOpen(prev => !prev)}
                            className="p-2 rounded-full hover:bg-surface-light md:hidden"
                        >
                            <MenuIcon />
                        </button>

                        <h1 className="text-xl font-bold truncate pr-4 flex-1">
                            {activeConversationTitle}
                        </h1>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => {
                                const diagrams = media.filter(
                                    m =>
                                        m.type === 'image' &&
                                        m.keywords?.some(kw =>
                                            ['diagram', 'parts of braces', 'braces parts', 'orthodontics'].includes(
                                                kw.toLowerCase(),
                                            ),
                                        ),
                                );

                                if (diagrams.length < 1) {
                                    showToast('No diagram images found.', 'error');
                                    return;
                                }

                                setActiveMediaPreview({
                                    items: diagrams.map(d => ({
                                        url: d.url,
                                        title: d.title,
                                        type: 'image',
                                    })),
                                    index: 0,
                                });
                            }}
                            className="bg-primary text-background px-4 py-2.5 rounded-full 
min-w-[120px] sm:min-w-[140px]
hover:bg-primary-hover transition-colors 
flex items-center justify-center gap-2 text-sm font-semibold h-10"
                        >
                            <ImageIcon className="w-4 h-4 flex-shrink-0" />
                            <span className="inline whitespace-nowrap">Diagram</span>
                        </button>

                        <button
                            onClick={() => navigate('/dashboard')}
                            className="bg-primary text-background px-4 py-2.5 rounded-full hover:bg-primary-hover transition-colors flex items-center justify-center gap-2 text-sm font-semibold sm:min-w-[140px] h-10"
                        >
                            <DashboardIcon className="w-4 h-4 flex-shrink-0" />
                            <span className="hidden sm:inline whitespace-nowrap">Dashboard</span>
                        </button>
                    </div>
                </header>

                <div
                    className={`flex-1 overflow-y-auto custom-scrollbar ${
                        messages.length > 0 || isLoading ? 'p-4 md:p-6 space-y-6' : ''
                    }`}
                >
                    {isConversationLoading && (
                        <div className="flex justify-center my-2 animate-fade-in-up">
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary/10 text-primary font-bold text-xs md:text-sm transition-colors">
                                <div className="w-3.5 h-3.5 rounded-full border-2 border-primary/70 border-t-transparent animate-spin" />
                                <span>Loading chat...</span>
                            </div>
                        </div>
                    )}
                    {currentUser ? (
                        <>
                            {messages.length === 0 && !isLoading ? (
                                <ChatEmptyState onQuestionClick={handleSend} />
                            ) : (
                                <>
                                    {messages.map(message => {
                                        // hide old suggestion metadata messages if they exist in DB
                                        if (
                                            message.text.startsWith(SUGGESTION_PREFIX) ||
                                            message.text.startsWith(SUGGESTION_CHOICE_PREFIX)
                                        ) {
                                            return null;
                                        }

                                        const attachments = getMessageAttachments(message);
                                        const alignRight = message.sender === 'user';

                                        return (
                                            <div key={message.id}>
                                                <div
                                                    className={`flex mb-3 ${
                                                        alignRight ? 'justify-end' : 'justify-start'
                                                    }`}
                                                >
                                                    <div
                                                        className={`flex items-end gap-2 max-w-full sm:max-w-[75%] ${
                                                            alignRight
                                                                ? 'flex-row-reverse'
                                                                : 'flex-row'
                                                        }`}
                                                    >
                                                        <div
                                                            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                                                alignRight
                                                                    ? 'bg-primary text-background'
                                                                    : 'bg-surface-light text-primary'
                                                            }`}
                                                        >
                                                            {alignRight ? (
                                                                <UserCircleIcon className="w-5 h-5" />
                                                            ) : (
                                                                <BotIcon className="w-5 h-5" />
                                                            )}
                                                        </div>
                                                        <div
                                                            className={`rounded-2xl px-4 py-3 shadow-sm border ${
                                                                alignRight
                                                                    ? 'bg-[#08d0c7] text-[#052231] border-transparent'
                                                                    : 'bg-surface border-border'
                                                            }`}
                                                        >
                                                            {renderMessageContent(message)}
                                                            <p
                                                                className={`text-[11px] mt-1 ${
                                                                    alignRight
                                                                        ? 'text-[#052231]/70'
                                                                        : 'text-text-secondary/70'
                                                                }`}
                                                            >
                                                                {message.timestamp}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                                {attachments.length > 0 && (
                                                    <div
                                                        className={`flex mt-2 mb-4 ${
                                                            alignRight ? 'justify-end' : 'justify-start'
                                                        }`}
                                                    >
                                                        <div
                                                            className={`flex items-start gap-2 max-w-full sm:max-w-[75%] ${
                                                                alignRight ? 'flex-row-reverse' : ''
                                                            }`}
                                                        >
                                                            <div className="w-8 h-8 flex-shrink-0" />
                                                            <MediaAttachmentBubble
                                                                attachments={attachments}
                                                                alignRight={alignRight}
                                                                isUser={alignRight}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {isThinking && (
                                        <div className="flex justify-start mb-3 animate-fade-in-up">
                                            <div className="inline-flex items-center gap-2 rounded-2xl px-3 py-1.5 bg-surface border border-border text-text-secondary text-[11px]">
                                                <div className="w-4 h-4 rounded-full border-2 border-text-secondary border-t-transparent animate-spin" />
                                                <span>Thinking...</span>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </>
                            )}
                        </>
                    ) : (
                        <div className="flex items-center justify-center h-full">
                            <SpinnerIcon />
                        </div>
                    )}
                </div>

                <div className="border-t border-border bg-surface p-3 md:p-4">
                    <form
                        className="max-w-4xl mx-auto flex items-center"
                        onSubmit={e => {
                            e.preventDefault();
                            if (!isConversationLoading) handleSend();
                        }}
                    >
                        <div className="flex-1 transition-all duration-200">
                            <div
                                className={`flex items-center bg-background px-4 py-2 transition-all duration-300 ease-out overflow-hidden border-2 ${
                                    isInputFocused ? 'border-primary' : 'border-transparent'
                                }`}
                                style={{
                                    borderRadius: isMultiLineInput ? 24 : 9999,
                                }}
                            >
                                <textarea
                                    ref={inputRef}
                                    value={input}
                                    onChange={handleInputChange}
                                    placeholder="Type your message..."
                                    rows={1}
                                    style={{
                                        height: inputHeight ? `${inputHeight}px` : undefined,
                                        transition: 'height 220ms ease-in-out',
                                        overflow: 'hidden',
                                    }}
                                    className="flex-1 bg-transparent border-none outline-none resize-none text-sm md:text-base text-text-primary"
                                    onFocus={() => setIsInputFocused(true)}
                                    onBlur={() => setIsInputFocused(false)}
                                    onKeyDown={handleTextareaKeyDown}
                                />
                                <button
                                    type="submit"
                                    disabled={isLoading || isConversationLoading || !input.trim()}
                                    className="ml-3 inline-flex items-center justify-center rounded-full bg-primary text-background w-11 h-11 hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <SendIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>

            {activeMediaPreview && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                    onClick={closeMediaPreview}
                >
                    <div
                        className="max-w-4xl w-full rounded-3xl bg-surface border border-border shadow-2xl overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="relative w-full aspect-video bg-black">
                            {(() => {
                                const current =
                                    activeMediaPreview.items[activeMediaPreview.index];
                                if (current.type === 'video') {
                                    const youtubeId = getYoutubeId(current.url);
                                    if (youtubeId) {
                                        return (
                                            <iframe
                                                src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1`}
                                                title={current.title}
                                                className="h-full w-full"
                                                loading="lazy"
                                                onLoad={() => setIsPreviewLoading(false)}
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                allowFullScreen
                                            />
                                        );
                                    }
                                    return (
                                        <video
                                            src={current.url}
                                            controls
                                            className="h-full w-full object-contain bg-black"
                                            onLoadedData={() => setIsPreviewLoading(false)}
                                        />
                                    );
                                }
                                return (
                                    <img
                                        src={current.url}
                                        alt={current.title}
                                        className="h-full w-full object-contain"
                                        onLoad={() => setIsPreviewLoading(false)}
                                    />
                                );
                            })()}
                        </div>
                        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                            <p className="text-sm font-semibold text-text-primary truncate">
                                {activeMediaPreview.items[activeMediaPreview.index].title}
                            </p>
                            <div className="flex items-center gap-2">
                                {activeMediaPreview.items.length > 1 && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => goToPreview(-1)}
                                            className="p-1.5 rounded-full text-text-secondary hover:text-text-primary hover:bg-surface-light transition"
                                            aria-label="Previous media"
                                        >
                                            <svg
                                                className="w-4 h-4"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            >
                                                <path d="M15 6l-6 6l6 6" />
                                            </svg>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => goToPreview(1)}
                                            className="p-1.5 rounded-full text-text-secondary hover:text-text-primary hover:bg-surface-light transition"
                                            aria-label="Next media"
                                        >
                                            <svg
                                                className="w-4 h-4"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            >
                                                <path d="M9 6l6 6l-6 6" />
                                            </svg>
                                        </button>
                                    </>
                                )}
                                <button
                                    type="button"
                                    onClick={closeMediaPreview}
                                    className="text-text-secondary hover:text-text-primary text-sm font-semibold"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChatbotPage;