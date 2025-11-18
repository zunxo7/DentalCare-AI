

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { HashRouter, Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import type { FAQ, Media, DashboardStats } from './types';
import ChatbotPage from './pages/ChatbotPage';
import DashboardPage from './pages/DashboardPage';
import ManageFaqsPage from './pages/ManageFaqsPage';
import MediaLibraryPage from './pages/MediaLibraryPage';
import UserConversationsPage from './pages/UserConversationsPage';
import AdminLoginPage from './pages/AdminLoginPage';
import { BackIcon, FaqIcon, LogoutIcon, MediaIcon, ChatIcon, MenuIcon, DashboardIcon, SpinnerIcon } from './components/icons';
import { api } from './lib/apiClient';

// FIX: Changed JSX.Element to React.ReactElement to resolve "Cannot find namespace 'JSX'" error.
const ProtectedRoute = ({ children }: { children: React.ReactElement }) => {
    const isAuthenticated = localStorage.getItem('isAdmin') === 'true';
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
        <div className="min-h-screen bg-background font-sans">
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
    const [isAuthenticated, setIsAuthenticated] = useState(localStorage.getItem('isAdmin') === 'true');
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
        if (isAuthenticated) {
            fetchData();
        }
    }, [fetchData, isAuthenticated]);

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
        localStorage.removeItem('isAdmin');
        setIsAuthenticated(false);
        // Using window.location.hash directly ensures the URL changes before the next
        // React render cycle. This prevents a race condition where the ProtectedRoute
        // (on a dashboard page) would redirect to /login before the navigation to /chat
        // could complete.
        window.location.hash = '/chat';
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

    const getPageTitle = () => {
        if (location.pathname.includes('/faqs')) return 'Manage FAQs';
        if (location.pathname.includes('/media')) return 'Media Library';
        if (location.pathname.includes('/conversations')) return 'User Conversations';
        if (location.pathname.includes('/dashboard')) return 'Dashboard';
        return 'Assistant';
    };
    
    const handleBack = () => {
        navigate('/chat');
    };

    const handleMobileNav = (path: string) => {
        navigate(path);
        setIsMobileMenuOpen(false);
    };

    return (
        <div className="flex flex-col h-screen">
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
                    </div>
                    <div className="md:hidden" ref={mobileMenuRef}>
                        <button onClick={() => setIsMobileMenuOpen(prev => !prev)} className="p-2 rounded-full hover:bg-surface-light transition-colors"><MenuIcon /></button>
                        {isMobileMenuOpen && (
                            <div className="absolute top-16 right-4 w-56 bg-surface rounded-lg shadow-xl border border-border z-50 animate-fade-in-down">
                                <ul className="p-2">
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
                    <Route path="/" element={<Navigate to="/chat" replace />} />
                    <Route path="*" element={<Navigate to="/chat" replace />} />
                </Routes>
            </main>
        </div>
    );
};

export default App;
