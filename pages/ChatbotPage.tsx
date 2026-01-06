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
import { api } from '../lib/apiClient';
import { isAdmin, updateUserInfo, getCurrentUserId, getCurrentUserName, clearAuth } from '../lib/auth';

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
    FlagIcon,
    LogoutIcon,
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
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex justify-center items-center p-4">
            <div className="bg-surface/95 backdrop-blur-sm rounded-3xl shadow-2xl shadow-primary/10 p-10 w-full max-w-md border border-border/50 animate-fade-in-up">
                <div className="mb-6 flex justify-center">
                    <div className="bg-gradient-to-br from-primary/20 to-secondary/20 p-4 rounded-2xl border border-primary/30">
                        <span className="text-4xl">🦷</span>
                    </div>
                </div>
                <h2 className="text-3xl font-extrabold mb-3 text-center bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                    Welcome!
                </h2>
                <p className="text-text-secondary/80 mb-8 text-center leading-relaxed">
                    Please enter your name to begin. Your conversation history will be saved for future visits.
                </p>
                <form onSubmit={handleSubmit}>
                    <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Enter your name..."
                        className="w-full bg-surface-light/50 backdrop-blur-sm border border-border/50 rounded-xl py-4 px-5 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary/50 transition-all text-text-primary placeholder:text-text-secondary/50"
                        autoFocus
                    />
                    <button
                        type="submit"
                        className="w-full mt-5 bg-gradient-to-r from-primary to-secondary text-background font-bold py-4 px-4 rounded-xl hover:shadow-glow-primary-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center hover:scale-105"
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
        { icon: "🦷", text: 'How often will I see the orthodontist?' },
        { icon: "🔧", text: 'What do I do if a bracket or a wire comes loose?' },
        { icon: "✨", text: 'Do braces cause discomfort?' },
        { icon: "🪥", text: 'How often should I brush?' },
    ];

    return (
        <div
            className="h-full flex flex-col justify-center items-center text-center px-3 py-2 overflow-hidden"
        >
            <div className="max-w-4xl w-full">
                <div className="mb-4 sm:mb-6 md:mb-8">
                    <div className="mb-3 md:mb-4 inline-block">
                        <div className="relative">
                            <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-pulse"></div>
                            <div className="relative bg-gradient-to-br from-primary/10 to-secondary/10 p-2.5 md:p-4 rounded-2xl md:rounded-3xl border border-primary/30 shadow-glow-primary">
                                <BotIcon className="w-8 h-8 md:w-12 md:h-12 text-primary" />
                            </div>
                        </div>
                    </div>
                    <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-extrabold bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent mb-1.5 md:mb-2 px-2">
                        Welcome to DentalCare AI
                    </h1>
                    <p className="text-xs sm:text-sm md:text-base text-text-secondary/80 mt-1.5 md:mt-3 max-w-2xl mx-auto font-medium px-3">
                        Your intelligent orthodontic assistant is ready to help
                    </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 md:gap-4 max-w-3xl mx-auto">
                    {starterQuestions.map((q, i) => (
                        <button
                            key={i}
                            onClick={() => onQuestionClick(q.text)}
                            className="group text-left p-2.5 sm:p-3 md:p-4 bg-surface/80 backdrop-blur-sm rounded-xl md:rounded-2xl border border-border hover:border-primary/50 hover:bg-surface transition-all duration-300 hover:shadow-glow-primary active:scale-95 md:hover:-translate-y-1"
                        >
                            <div className="flex items-center gap-2.5 sm:gap-3">
                                <div className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-lg md:rounded-xl flex items-center justify-center text-lg sm:text-xl md:text-2xl group-hover:scale-110 transition-transform duration-300">
                                    {q.icon}
                                </div>
                                <p className="text-text-primary font-medium text-xs sm:text-sm md:text-base leading-snug sm:leading-relaxed">
                                    {q.text}
                                </p>
                            </div>
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
    const [reportModalOpen, setReportModalOpen] = useState(false);
    const [reportingMessage, setReportingMessage] = useState<ChatMessage | null>(null);
    const [userQueryForReport, setUserQueryForReport] = useState<string>('');
    const [reportCategories, setReportCategories] = useState<string[]>([]);

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

            // Check for /debug command
            if (userInput.trim().toLowerCase() === '/debug') {
                if (isAdmin()) {
                    navigate('/dashboard/reports');
                } else {
                    // Not admin - redirect to login with return path
                    navigate('/login?redirect=/dashboard/reports');
                }
                if (!messageText) {
                    setInput('');
                }
                return;
            }

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

                // ⬇️ Call Edge Function for bot response (OpenAI key stays server-side)
                const botResponse = await api.getBotResponse({
                    message: userInput,
                    userName: currentUser.name,
                    userId: currentUser.id,
                });

                if (botResponse.faqId) {
                    incrementFaqCount(botResponse.faqId);
                }

                const mediaUrls = botResponse.mediaUrls || [];

                const botMessagePayload = {
                    sender: 'bot' as const,
                    text: botResponse.text,
                    mediaUrls,
                    queryId: botResponse.queryId,
                };
                console.log('[BOT_RESPONSE]', {
                    question: userInput,
                    faqId: botResponse.faqId,
                    mediaUrls,
                });

                if (botResponse.pipelineLogs && botResponse.pipelineLogs.length > 0) {
                    console.group('🤖 BOT PIPELINE DEBUG LOGS');
                    botResponse.pipelineLogs.forEach(log => console.log(log));
                    console.groupEnd();
                }

                addMessageToState(botMessagePayload, currentConversationId!);
                setIsThinking(false);

                await api.createMessage({
                    conversationId: currentConversationId!,
                    sender: botMessagePayload.sender,
                    text: botMessagePayload.text,
                    mediaUrls: botMessagePayload.mediaUrls,
                    queryId: botMessagePayload.queryId,
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
            navigate,
            messages,
        ],
    );

    useEffect(() => {
        const checkUserSession = async () => {
            // Clean up legacy keys
            localStorage.removeItem('ortho_user_id');
            localStorage.removeItem('ortho_chat_user_name');
            localStorage.removeItem('isAdmin');
            localStorage.removeItem('ortho_chat_conversations');

            // Check localStorage directly
            const authData = localStorage.getItem('dentalcare_auth');
            if (!authData) {
                setIsNameModalOpen(true);
                return;
            }

            try {
                const auth = JSON.parse(authData);
                const userId = auth.userId;
                const userName = auth.userName;

                // If no userId/userName, show modal (even if admin)
                if (!userId || !userName) {
                    setIsNameModalOpen(true);
                    return;
                }

                // Verify with server
                try {
                    const user = await api.getUser(String(userId));
                    if (user) {
                        setCurrentUser(user);
                        updateUserInfo(user.id, user.name);

                        // Log login only once per session
                        const sessionLoginKey = `session_login_${user.id}`;
                        if (!sessionStorage.getItem(sessionLoginKey)) {
                            sessionStorage.setItem(sessionLoginKey, 'true');
                            console.log(`[USER] Logged in: ${user.name} (${user.id})`);
                        }

                        loadConversations(user);
                    } else {
                        clearAuth();
                        setIsNameModalOpen(true);
                    }
                } catch (fetchError: any) {
                    // If 404, user doesn't exist - clear auth
                    if (fetchError.message?.includes('404') || fetchError.message?.includes('not found')) {
                        clearAuth();
                        setIsNameModalOpen(true);
                    } else {
                        // Other errors - show modal
                        console.error('Error fetching user:', fetchError);
                        setIsNameModalOpen(true);
                    }
                }
            } catch (error: any) {
                // If 404, user doesn't exist - clear auth
                if (error.message?.includes('404') || error.message?.includes('not found')) {
                    clearAuth();
                    setIsNameModalOpen(true);
                } else {
                    // Other errors - log and show modal
                    console.error('Error in checkUserSession:', error);
                    setIsNameModalOpen(true);
                }
            }
        };
        checkUserSession();
    }, [loadConversations]);


    useEffect(() => {
        const fetchReportCategories = async () => {
            // Fetch report categories for all users (needed for reporting messages)
            try {
                const data = await api.getReportCategories();
                if (data.success) {
                    // Extract just the category names, sorted by order
                    const categoryNames = data.categories
                        .sort((a: any, b: any) => a.order - b.order)
                        .map((c: any) => c.name);
                    setReportCategories(categoryNames);
                }
            } catch (error) {
                console.error('Error fetching report categories:', error);
                // Fallback to default categories
                setReportCategories(['answer_irrelevant', 'media_irrelevant', 'inappropriate']);
            }
        };
        fetchReportCategories();
    }, []);

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
            // Clean up legacy keys
            localStorage.removeItem('ortho_user_id');
            localStorage.removeItem('ortho_chat_user_name');
            localStorage.removeItem('isAdmin');
            localStorage.removeItem('ortho_chat_conversations');
            // Save to auth system only
            updateUserInfo(newUser.id, newUser.name);
            setCurrentUser(newUser);

            // Log new user signup (only once per session)
            const sessionSignupKey = `session_signup_${newUser.id}`;
            if (!sessionStorage.getItem(sessionSignupKey)) {
                sessionStorage.setItem(sessionSignupKey, 'true');
                console.log(`[USER] Signed up: ${newUser.name} (${newUser.id})`);
            }

            // Load conversations immediately after user creation
            await loadConversations(newUser);
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

    const handleReportClick = (message: ChatMessage) => {
        // Find the user message that preceded this bot message
        const messageIndex = messages.findIndex(m => m.id === message.id);
        const userMessage = messageIndex > 0 ? messages[messageIndex - 1] : null;
        const userQueryText = userMessage?.text || '';
        setUserQueryForReport(userQueryText);
        setReportingMessage(message);
        setReportModalOpen(true);
    };

    const handleSubmitReport = async (reportType: string) => {
        if (!reportingMessage || !currentUser) return;

        // Ensure queryId is present - all reports must have a queryId
        let queryId = reportingMessage.queryId;

        // If message doesn't have queryId, try to find it from the conversation
        // Look for the bot message that matches this one (for old messages)
        if (!queryId && reportingMessage.sender === 'bot') {
            // Try to find queryId from logs by matching message text and timestamp
            // For now, we'll require queryId - if missing, show error
            showToast('Cannot submit report: message is missing query ID. Please report a recent message.', 'error');
            return;
        }

        // User messages don't have queryId - find the associated bot message's queryId
        if (!queryId && reportingMessage.sender === 'user') {
            // Find the next bot message in the conversation
            const messageIndex = messages.findIndex(m => m.id === reportingMessage.id);
            const botMessage = messages.slice(messageIndex + 1).find(m => m.sender === 'bot' && m.queryId);
            if (botMessage?.queryId) {
                queryId = botMessage.queryId;
            } else {
                showToast('Cannot submit report: no associated query ID found. Please report a recent message.', 'error');
                return;
            }
        }

        if (!queryId) {
            showToast('Cannot submit report: query ID is required.', 'error');
            return;
        }

        try {
            // Server will query chat_messages table to get user_query and bot_response
            // We only need to send queryId - server will fetch the actual messages
            const reportPayload = {
                userId: currentUser.id,
                queryId: queryId,
                reportType,
            };

            await api.createReport(reportPayload);
            showToast('Report submitted successfully', 'success');
            setReportModalOpen(false);
            setReportingMessage(null);
            setUserQueryForReport('');
        } catch (error: any) {
            showToast(`Failed to submit report: ${error.message}`, 'error');
        }
    };

    const renderMessageContent = (message: ChatMessage) => {
        const isUserMessage = message.sender === 'user';
        const boldColorClass = isUserMessage ? 'text-background/90' : 'text-primary';

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

        return (
            <div>
                <div className={`space-y-1 text-sm sm:text-base ${isUserMessage ? 'font-bold tracking-wide' : ''}`}>
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
        // Ensure mediaUrls is always an array
        let urls: string[] = [];
        if (message.mediaUrls) {
            if (Array.isArray(message.mediaUrls)) {
                urls = message.mediaUrls;
            } else if (typeof message.mediaUrls === 'string') {
                try {
                    urls = JSON.parse(message.mediaUrls);
                } catch {
                    urls = [];
                }
            }
        }

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
            ? 'bg-primary text-background border border-primary/60'
            : 'bg-surface text-text-primary border border-border';
        const detailColor = isUser ? 'text-background/70' : 'text-text-secondary';
        const cardBg = isUser ? 'bg-primary/90' : 'bg-surface-light';
        const iconColor = isUser ? 'text-background' : 'text-text-secondary';

        return (
            <div
                className={`rounded-3xl ${bubbleBase} p-4 shadow-sm ${alignRight ? 'rounded-tr-lg' : 'rounded-tl-lg'
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

    const handleLogout = () => {
        clearAuth();
        setCurrentUser(null);
        setMessages([]);
        setConversations([]);
        setActiveConversationId(null);
        setIsNameModalOpen(true);
        showToast('Logged out successfully', 'success');
    };

    const SidebarContent = () => (
        <div className="flex h-full flex-col">
            <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between mb-3">
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
                        onClick={handleLogout}
                        className="bg-accent text-white px-3 py-1.5 rounded-lg hover:bg-accent-hover transition-colors flex items-center justify-center gap-1.5 text-xs font-semibold flex-shrink-0"
                        title="Logout"
                    >
                        <LogoutIcon className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="whitespace-nowrap">Logout</span>
                    </button>
                </div>
                <button
                    onClick={handleNewChat}
                    className="w-full bg-surface-light text-text-primary px-4 py-2 rounded-full hover:bg-primary hover:text-background font-semibold transition-colors flex items-center justify-center gap-2 text-sm h-9"
                    title="New chat"
                >
                    <PlusIcon className="w-4 h-4 flex-shrink-0" />
                    <span className="whitespace-nowrap">New Chat</span>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {conversations.length > 0 ? (
                    <ul className="space-y-1">
                        {conversations.map(c => (
                            <li
                                key={c.id}
                                className={`group flex items-center justify-between gap-2 rounded-lg px-3 py-2 transition-colors ${activeConversationId === c.id
                                    ? 'bg-primary/10 border border-primary/40'
                                    : 'hover:bg-surface-light border border-transparent'
                                    } ${isThinking || isLoading || isConversationLoading
                                        ? 'opacity-60 cursor-not-allowed hover:bg-surface'
                                        : 'cursor-pointer'
                                    }`}
                                onClick={() => {
                                    if (isThinking || isLoading || isConversationLoading) return;
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
                                        if (isThinking || isLoading || isConversationLoading) return;
                                        handleDeleteConversation(c.id);
                                    }}
                                    disabled={isThinking || isLoading || isConversationLoading}
                                    className="p-1.5 rounded-lg text-text-secondary/70 hover:text-accent hover:bg-accent/10 active:bg-accent/20 transition-all duration-200 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-text-secondary/70 disabled:hover:bg-transparent"
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
        <div className="flex bg-background text-text-primary" style={{ height: '100dvh', minHeight: '100dvh', maxHeight: '100dvh' }}>
            {isNameModalOpen && (
                <UserNameModal onSubmit={handleUserCreate} isLoading={isCreatingUser} />
            )}

            <aside
                className={`hidden md:flex md:w-[280px] lg:w-[320px] xl:w-[340px] md:flex-col ${SIDEBAR_BG}`}
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

                    <div className="flex items-center gap-2 sm:gap-3">
                        <button
                            onClick={() => {
                                const diagrams = media.filter(
                                    m =>
                                        m.type === 'image' &&
                                        (m.title.toLowerCase().includes('diagram') ||
                                            m.title.toLowerCase().includes('parts') ||
                                            m.title.toLowerCase().includes('explanation')),
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
                            className="bg-surface-light text-text-primary px-4 py-2 rounded-full hover:bg-primary hover:text-background font-semibold transition-colors flex items-center justify-center gap-2 text-sm min-w-[100px] h-9"
                        >
                            <ImageIcon className="w-4 h-4 flex-shrink-0" />
                            <span className="whitespace-nowrap">Diagram</span>
                        </button>

                        <button
                            onClick={() => navigate('/dashboard')}
                            className="bg-surface-light text-text-primary px-3 sm:px-4 py-2 rounded-full hover:bg-primary hover:text-background font-semibold transition-colors flex items-center justify-center gap-2 text-sm sm:min-w-[120px] h-9"
                        >
                            <DashboardIcon className="w-4 h-4 flex-shrink-0" />
                            <span className="hidden sm:inline whitespace-nowrap">Dashboard</span>
                        </button>
                    </div>
                </header>

                <div
                    className={`flex-1 ${messages.length > 0 || isLoading
                        ? 'overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-6'
                        : 'overflow-hidden'
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
                                                    className={`flex mb-3 ${alignRight ? 'justify-end' : 'justify-start'
                                                        }`}
                                                >
                                                    <div
                                                        className={`flex items-end gap-2 max-w-full sm:max-w-[75%] ${alignRight
                                                            ? 'flex-row-reverse'
                                                            : 'flex-row'
                                                            }`}
                                                    >
                                                        <div
                                                            className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${alignRight
                                                                ? 'bg-primary shadow-md'
                                                                : 'bg-gradient-to-br from-surface-light to-surface border border-primary/30'
                                                                }`}
                                                        >
                                                            {alignRight ? (
                                                                <UserCircleIcon className="w-6 h-6 text-background" />
                                                            ) : (
                                                                <BotIcon className="w-6 h-6 text-primary" />
                                                            )}
                                                        </div>
                                                        <div
                                                            className={`rounded-2xl px-5 py-4 shadow-lg transition-all duration-300 hover:shadow-xl ${alignRight
                                                                ? 'bg-primary text-background border border-primary/60'
                                                                : 'bg-surface/90 backdrop-blur-sm border border-border/50 hover:border-primary/30'
                                                                }`}
                                                        >
                                                            {renderMessageContent(message)}
                                                            <p
                                                                className={`text-[11px] mt-1 ${alignRight
                                                                    ? 'text-background/70'
                                                                    : 'text-text-secondary/70'
                                                                    }`}
                                                            >
                                                                {message.timestamp}
                                                            </p>
                                                        </div>
                                                        {!alignRight && (
                                                            <button
                                                                onClick={() => handleReportClick(message)}
                                                                className="p-1.5 rounded hover:bg-surface/50 transition-colors flex-shrink-0"
                                                                title="Report message"
                                                            >
                                                                <FlagIcon className="w-4 h-4 text-text-secondary/60 hover:text-primary" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                {attachments.length > 0 && (
                                                    <div
                                                        className={`flex mt-2 mb-4 ${alignRight ? 'justify-end' : 'justify-start'
                                                            }`}
                                                    >
                                                        <div
                                                            className={`flex items-start gap-2 max-w-full sm:max-w-[75%] ${alignRight ? 'flex-row-reverse' : ''
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
                        <div className="flex-1 transition-all duration-300">
                            <div
                                className={`flex items-center bg-background px-4 py-2 transition-all duration-300 ease-in-out overflow-hidden border-2 ${isInputFocused ? 'border-primary' : 'border-transparent'
                                    }`}
                                style={{
                                    borderRadius: isMultiLineInput ? 24 : 9999,
                                    transition: 'border-radius 300ms cubic-bezier(0.4, 0, 0.2, 1), border-color 200ms',
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
                                        transition: 'height 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                                        overflow: 'hidden',
                                    }}
                                    className="flex-1 bg-transparent border-none outline-none resize-none text-sm md:text-base text-text-primary text-left placeholder:text-left leading-normal"
                                    onFocus={() => setIsInputFocused(true)}
                                    onBlur={() => setIsInputFocused(false)}
                                    onKeyDown={handleTextareaKeyDown}
                                />
                                <button
                                    type="submit"
                                    disabled={isLoading || isConversationLoading || !input.trim()}
                                    className="ml-3 inline-flex items-center justify-center rounded-full 
                                    bg-gradient-to-br from-primary to-secondary text-background 
                                    w-11 h-11 shadow-md border border-primary/30
                                    hover:shadow-lg hover:scale-110 active:scale-95
                                    disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
                                    transition-all duration-300"
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

            {/* Report Modal */}
            {reportModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                    onClick={() => {
                        setReportModalOpen(false);
                        setReportingMessage(null);
                        setUserQueryForReport('');
                    }}
                >
                    <div
                        className="max-w-md w-full rounded-2xl bg-surface border border-border shadow-2xl p-6"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className="text-xl font-bold text-text-primary mb-4">Report Message</h3>
                        <p className="text-sm text-text-secondary mb-4">
                            Why are you reporting this message?
                        </p>
                        <div className="space-y-2 mb-4">
                            {reportCategories.map((category) => {
                                const label = category.split('_').map(word =>
                                    word.charAt(0).toUpperCase() + word.slice(1)
                                ).join(' ');
                                return (
                                    <button
                                        key={category}
                                        onClick={() => handleSubmitReport(category)}
                                        className="w-full px-4 py-2 rounded-lg bg-surface-light hover:bg-primary/10 border border-border hover:border-primary/50 text-text-primary font-semibold transition-colors"
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            onClick={() => {
                                setReportModalOpen(false);
                                setReportingMessage(null);
                                setUserQueryForReport('');
                            }}
                            className="w-full px-4 py-2 rounded-lg bg-surface-light hover:bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChatbotPage;


