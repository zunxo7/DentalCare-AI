

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { HashRouter, Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import type { FAQ, Media, DashboardStats } from './types';
import ChatbotPage from './pages/ChatbotPage';
import DashboardPage from './pages/DashboardPage';
import ManageFaqsPage from './pages/ManageFaqsPage';
import MediaLibraryPage from './pages/MediaLibraryPage';
import UserConversationsPage from './pages/UserConversationsPage';
import AdminLoginPage from './pages/AdminLoginPage';
import TablesPage from './pages/debug/TablesPage';
import LogsPage from './pages/debug/LogsPage';
import ReportsPage from './pages/debug/ReportsPage';
import EmbeddingsPage from './pages/debug/EmbeddingsPage';
import IdlePage from './pages/debug/IdlePage';
import { BackIcon, FaqIcon, LogoutIcon, MediaIcon, ChatIcon, MenuIcon, DashboardIcon, SpinnerIcon, TablesIcon, LogsIcon, ReportsIcon, EmbeddingsIcon } from './components/icons';
import { api } from './lib/apiClient';
import { isAdmin, setAdminStatus } from './lib/auth';

// FIX: Changed JSX.Element to React.ReactElement to resolve "Cannot find namespace 'JSX'" error.
const ProtectedRoute = ({ children }: { children: React.ReactElement }) => {
    const isAuthenticated = isAdmin();
    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }
    return children;
};

const Toast = ({ message, type, onClose }: { message: string, type: 'success' | 'error', onClose: () => void }) => (
    <div className={`fixed bottom-5 right-5 bg-surface p-4 rounded-lg shadow-lg border-l-4 ${type === 'success' ? 'border-primary' : 'border-accent'} animate-fade-in-up z-50`}>
        <div className="flex items-center">
            <p className="text-text-primary mr-4">{message}</p>
            <button onClick={onClose} className="text-text-secondary text-2xl leading-none hover:text-text-primary">&times;</button>
        </div>
    </div>
);


const App: React.FC = () => {
    return (
        <div className="bg-background font-sans" style={{ minHeight: '100dvh' }}>
            <HashRouter>
                <AppContent />
            </HashRouter>
        </div>
    );
};

const AppContent: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const [faqs, setFaqs] = useState<FAQ[]>([]);
    const [media, setMedia] = useState<Media[]>([]);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(isAdmin());
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const mobileMenuRef = useRef<HTMLDivElement>(null);

    const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    }, []);

    const fetchData = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [faqsData, mediaData, statsData] = await Promise.all([
                api.getFaqs(),
                api.getMedia(),
                api.getStats()
            ]);

            setFaqs(faqsData || []);
            setMedia(mediaData || []);
            setStats(statsData || null);

        } catch (error: any) {
            console.error("Error fetching data:", error);
            const errorText = error?.message || "An unknown error occurred.";
            showToast(`Failed to load dashboard data: ${errorText}`, 'error');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        // Always fetch FAQs and media (needed for chatbot to work)
        // Only fetch stats if authenticated (dashboard-only data)
        const loadData = async () => {
            if (!isAuthenticated) {
                // For non-authenticated users, only fetch FAQs and media
                try {
                    setLoading(true);
                    const [faqsData, mediaData] = await Promise.all([
                        api.getFaqs(),
                        api.getMedia()
                    ]);
                    setFaqs(faqsData || []);
                    setMedia(mediaData || []);
                } catch (error: any) {
                    console.error("Error fetching FAQs/media:", error);
                    const errorText = error?.message || "An unknown error occurred.";
                    showToast(`Failed to load FAQs: ${errorText}`, 'error');
                } finally {
                    setLoading(false);
                }
            } else {
                // For authenticated users, fetch everything including stats
                fetchData();
            }
        };
        loadData();
    }, [fetchData, isAuthenticated, showToast]);

    // Close mobile menu if clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
                setIsMobileMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const handleLogout = () => {
        // Set admin status to false without clearing localStorage (preserves userId and userName)
        setAdminStatus(false);
        setIsAuthenticated(false);
        // Navigate to chat page
        navigate('/chat');
    };
    
    const incrementFaqCount = useCallback(async (faqId: number) => {
        try {
            await api.incrementFaqCount(faqId);
            fetchData(true); // Silently refresh data
        } catch (error: any) {
            console.error('Error incrementing FAQ count:', error);
        }
    }, [fetchData]);

    const isDashboard = location.pathname.startsWith('/dashboard');
    const isDebugPage = location.pathname.startsWith('/dashboard/debug');

    const getPageTitle = () => {
        if (location.pathname.includes('/faqs')) return 'Manage FAQs';
        if (location.pathname.includes('/media')) return 'Media Library';
        if (location.pathname.includes('/conversations')) return 'User Conversations';
        if (location.pathname.includes('/debug/tables')) return 'Tables';
        if (location.pathname.includes('/debug/logs')) return 'Logs';
        if (location.pathname.includes('/debug/reports')) return 'Reports';
        if (location.pathname.includes('/debug/embeddings')) return 'Embeddings';
        if (location.pathname.includes('/debug/idle')) return 'Keep-Alive';
        if (location.pathname.includes('/dashboard')) return 'Dashboard';
        return 'Assistant';
    };
    
    const handleBack = () => {
        if (isDebugPage) {
            navigate('/dashboard');
        } else {
            navigate('/chat');
        }
    };

    const handleMobileNav = (path: string) => {
        navigate(path);
        setIsMobileMenuOpen(false);
    };

    return (
        <div className="flex flex-col" style={{ height: '100dvh', minHeight: '100dvh', maxHeight: '100dvh' }}>
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
            {isDashboard && isAuthenticated && (
                 <header className="bg-surface p-4 flex justify-between items-center border-b border-border shadow-md z-10">
                    <div className="flex items-center gap-4">
                        <button onClick={handleBack} className="p-2 rounded-full hover:bg-surface-light transition-colors">
                            <BackIcon />
                        </button>
                        <h1 className="text-xl font-bold text-text-primary">{getPageTitle()}</h1>
                    </div>
                    <div className="hidden md:flex items-center gap-2">
                        {isDebugPage ? (
                            <>
                                {!location.pathname.endsWith('/dashboard') && (
                                    <button
                                        onClick={() => navigate('/dashboard')}
                                        className="bg-surface-light text-text-primary px-4 py-2 rounded-full hover:bg-primary hover:text-background font-semibold transition-colors flex items-center justify-center gap-2 text-sm h-9 lg:min-w-[120px]"
                                    >
                                        <DashboardIcon className="w-4 h-4 flex-shrink-0" /> <span>Dashboard</span>
                                    </button>
                                )}
                                <button onClick={() => navigate('/dashboard/debug/tables')} className={`px-4 py-2 rounded-full font-semibold transition-colors flex items-center justify-center gap-2 text-sm min-w-[100px] h-9 ${
                                  location.pathname.includes('/debug/tables')
                                    ? 'bg-primary text-background'
                                    : 'bg-surface-light text-text-primary hover:bg-primary hover:text-background'
                                }`}>
                                    <TablesIcon className="w-4 h-4 flex-shrink-0" /> <span>Tables</span>
                                </button>
                                <button onClick={() => navigate('/dashboard/debug/logs')} className={`px-4 py-2 rounded-full font-semibold transition-colors flex items-center justify-center gap-2 text-sm min-w-[100px] h-9 ${
                                  location.pathname.includes('/debug/logs')
                                    ? 'bg-primary text-background'
                                    : 'bg-surface-light text-text-primary hover:bg-primary hover:text-background'
                                }`}>
                                    <LogsIcon className="w-4 h-4 flex-shrink-0" /> <span>Logs</span>
                                </button>
                                <button onClick={() => navigate('/dashboard/debug/reports')} className={`px-4 py-2 rounded-full font-semibold transition-colors flex items-center justify-center gap-2 text-sm min-w-[100px] h-9 ${
                                  location.pathname.includes('/debug/reports')
                                    ? 'bg-primary text-background'
                                    : 'bg-surface-light text-text-primary hover:bg-primary hover:text-background'
                                }`}>
                                    <ReportsIcon className="w-4 h-4 flex-shrink-0" /> <span>Reports</span>
                                </button>
                                <button onClick={() => navigate('/dashboard/debug/embeddings')} className={`px-4 py-2 rounded-full font-semibold transition-colors flex items-center justify-center gap-2 text-sm min-w-[120px] h-9 ${
                                  location.pathname.includes('/debug/embeddings')
                                    ? 'bg-primary text-background'
                                    : 'bg-surface-light text-text-primary hover:bg-primary hover:text-background'
                                }`}>
                                    <EmbeddingsIcon className="w-4 h-4 flex-shrink-0" /> <span>Embeddings</span>
                                </button>
                                <button onClick={() => navigate('/dashboard/debug/idle')} className={`px-4 py-2 rounded-full font-semibold transition-colors flex items-center justify-center gap-2 text-sm min-w-[100px] h-9 ${
                                  location.pathname.includes('/debug/idle')
                                    ? 'bg-primary text-background'
                                    : 'bg-surface-light text-text-primary hover:bg-primary hover:text-background'
                                }`}>
                                    <svg 
                                        className="w-4 h-4 flex-shrink-0" 
                                        viewBox="0 0 24 24" 
                                        fill="currentColor" 
                                        stroke="currentColor" 
                                        strokeWidth="2" 
                                        strokeLinecap="round" 
                                        strokeLinejoin="round"
                                    >
                                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                                    </svg>
                                    <span>Keep Alive</span>
                                </button>
                                <button onClick={handleLogout} className="bg-accent text-white px-4 py-2 rounded-full hover:bg-accent-hover transition-colors flex items-center justify-center gap-2 text-sm font-semibold min-w-[100px] h-9"><LogoutIcon className="w-4 h-4 flex-shrink-0" /> <span>Logout</span></button>
                            </>
                        ) : (
                            <>
                                {!location.pathname.endsWith('/dashboard') && (
                                    <button
                                        onClick={() => navigate('/dashboard')}
                                        className={`bg-surface-light text-text-primary px-4 py-2 rounded-full hover:bg-primary hover:text-background font-semibold transition-colors flex items-center justify-center gap-2 text-sm h-9 ${
                                            location.pathname.includes('/conversations') ? '' : 'lg:min-w-[120px]'
                                        }`}
                                    >
                                        <DashboardIcon className="w-4 h-4 flex-shrink-0" /> <span>Dashboard</span>
                                    </button>
                                )}
                                <button onClick={() => navigate('/dashboard/conversations')} className="bg-surface-light text-text-primary px-4 py-2 rounded-full hover:bg-primary hover:text-background font-semibold transition-colors flex items-center justify-center gap-2 text-sm min-w-[140px] h-9"><ChatIcon className="w-4 h-4 flex-shrink-0" /> <span>Conversations</span></button>
                                <button onClick={() => navigate('/dashboard/faqs')} className="bg-surface-light text-text-primary px-4 py-2 rounded-full hover:bg-primary hover:text-background font-semibold transition-colors flex items-center justify-center gap-2 text-sm min-w-[100px] h-9"><FaqIcon className="w-4 h-4 flex-shrink-0" /> <span>FAQs</span></button>
                                <button onClick={() => navigate('/dashboard/media')} className="bg-surface-light text-text-primary px-4 py-2 rounded-full hover:bg-primary hover:text-background font-semibold transition-colors flex items-center justify-center gap-2 text-sm min-w-[100px] h-9"><MediaIcon className="w-4 h-4 flex-shrink-0" /> <span>Media</span></button>
                                <button onClick={handleLogout} className="bg-accent text-white px-4 py-2 rounded-full hover:bg-accent-hover transition-colors flex items-center justify-center gap-2 text-sm font-semibold min-w-[100px] h-9"><LogoutIcon className="w-4 h-4 flex-shrink-0" /> <span>Logout</span></button>
                            </>
                        )}
                    </div>
                    <div className="md:hidden" ref={mobileMenuRef}>
                        <button onClick={() => setIsMobileMenuOpen(prev => !prev)} className="p-2 rounded-full hover:bg-surface-light transition-colors"><MenuIcon /></button>
                        {isMobileMenuOpen && (
                            <div className="absolute top-16 right-4 w-56 bg-surface rounded-lg shadow-xl border border-border z-50 animate-fade-in-down">
                                <ul className="p-2">
                                    {isDebugPage ? (
                                        <>
                                            {!location.pathname.endsWith('/dashboard') && (
                                                <li>
                                                    <button
                                                        onClick={() => handleMobileNav('/dashboard')}
                                                        className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-md hover:bg-surface-light transition-colors"
                                                    >
                                                        <DashboardIcon /> Dashboard
                                                    </button>
                                                </li>
                                            )}
                                            <li><button onClick={() => handleMobileNav('/dashboard/debug/tables')} className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                                              location.pathname.includes('/debug/tables')
                                                ? 'bg-primary/20 text-primary'
                                                : 'hover:bg-surface-light'
                                            }`}><TablesIcon /> Tables</button></li>
                                            <li><button onClick={() => handleMobileNav('/dashboard/debug/logs')} className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                                              location.pathname.includes('/debug/logs')
                                                ? 'bg-primary/20 text-primary'
                                                : 'hover:bg-surface-light'
                                            }`}><LogsIcon /> Logs</button></li>
                                            <li><button onClick={() => handleMobileNav('/dashboard/debug/reports')} className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                                              location.pathname.includes('/debug/reports')
                                                ? 'bg-primary/20 text-primary'
                                                : 'hover:bg-surface-light'
                                            }`}><ReportsIcon /> Reports</button></li>
                                            <li><button onClick={() => handleMobileNav('/dashboard/debug/embeddings')} className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                                              location.pathname.includes('/debug/embeddings')
                                                ? 'bg-primary/20 text-primary'
                                                : 'hover:bg-surface-light'
                                            }`}><EmbeddingsIcon /> Embeddings</button></li>
                                            <li><button onClick={() => handleMobileNav('/dashboard/debug/idle')} className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                                              location.pathname.includes('/debug/idle')
                                                ? 'bg-primary/20 text-primary'
                                                : 'hover:bg-surface-light text-text-primary'
                                            }`}>
                                                <svg 
                                                    className="w-4 h-4 flex-shrink-0" 
                                                    viewBox="0 0 24 24" 
                                                    fill="currentColor" 
                                                    stroke="currentColor" 
                                                    strokeWidth="2" 
                                                    strokeLinecap="round" 
                                                    strokeLinejoin="round"
                                                >
                                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                                                </svg>
                                                Keep Alive
                                            </button></li>
                                            <li className="my-2 border-t border-border"></li>
                                            <li><button onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }} className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-md hover:bg-surface-light text-accent transition-colors"><LogoutIcon /> Logout</button></li>
                                        </>
                                    ) : (
                                        <>
                                            {!location.pathname.endsWith('/dashboard') && (
                                                <li>
                                                    <button
                                                        onClick={() => handleMobileNav('/dashboard')}
                                                        className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-md hover:bg-surface-light transition-colors"
                                                    >
                                                        <DashboardIcon /> Dashboard
                                                    </button>
                                                </li>
                                            )}
                                            <li><button onClick={() => handleMobileNav('/dashboard/conversations')} className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-md hover:bg-surface-light transition-colors"><ChatIcon /> Conversations</button></li>
                                            <li><button onClick={() => handleMobileNav('/dashboard/faqs')} className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-md hover:bg-surface-light transition-colors"><FaqIcon /> FAQs</button></li>
                                            <li><button onClick={() => handleMobileNav('/dashboard/media')} className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-md hover:bg-surface-light transition-colors"><MediaIcon /> Media</button></li>
                                            <li className="my-2 border-t border-border"></li>
                                            <li><button onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }} className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-md hover:bg-surface-light text-accent transition-colors"><LogoutIcon /> Logout</button></li>
                                        </>
                                    )}
                                </ul>
                            </div>
                        )}
                    </div>
                </header>
            )}

            <main className="relative flex-1 overflow-y-auto bg-background">
                <Routes>
                    <Route path="/login" element={<AdminLoginPage onLoginSuccess={() => setIsAuthenticated(true)} />} />
                    <Route path="/chat" element={
                        <ChatbotPage 
                            faqs={faqs}
                            media={media}
                            incrementFaqCount={incrementFaqCount}
                            showToast={showToast}
                        />
                    } />
                    <Route path="/dashboard" element={<ProtectedRoute><DashboardPage faqs={faqs} stats={stats} loading={loading} refreshData={fetchData} showToast={showToast} /></ProtectedRoute>} />
                    <Route path="/dashboard/faqs" element={<ProtectedRoute><ManageFaqsPage faqs={faqs} refreshData={fetchData} loading={loading} showToast={showToast} /></ProtectedRoute>} />
                    <Route path="/dashboard/media" element={<ProtectedRoute><MediaLibraryPage media={media} refreshData={fetchData} loading={loading} showToast={showToast} /></ProtectedRoute>} />
                    <Route path="/dashboard/conversations" element={<ProtectedRoute><UserConversationsPage /></ProtectedRoute>} />
                    <Route path="/dashboard/debug/tables" element={<ProtectedRoute><TablesPage showToast={showToast} /></ProtectedRoute>} />
                    <Route path="/dashboard/debug/logs" element={<ProtectedRoute><LogsPage showToast={showToast} /></ProtectedRoute>} />
                    <Route path="/dashboard/debug/reports" element={<ProtectedRoute><ReportsPage showToast={showToast} /></ProtectedRoute>} />
                    <Route path="/dashboard/debug/embeddings" element={<ProtectedRoute><EmbeddingsPage showToast={showToast} /></ProtectedRoute>} />
                    <Route path="/dashboard/debug/idle" element={<ProtectedRoute><IdlePage showToast={showToast} /></ProtectedRoute>} />
                    <Route path="/dashboard/debug" element={<Navigate to="/dashboard/debug/tables" replace />} />
                    <Route path="/" element={<Navigate to="/chat" replace />} />
                    <Route path="*" element={<Navigate to="/chat" replace />} />
                </Routes>
            </main>
        </div>
    );
};

export default App;
