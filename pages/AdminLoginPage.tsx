import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LockIcon } from '../components/icons';

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD;

interface AdminLoginPageProps {
    onLoginSuccess: () => void;
}

const AdminLoginPage: React.FC<AdminLoginPageProps> = ({ onLoginSuccess }) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        // If the user is already logged in, redirect them away from the login page.
        if (localStorage.getItem('isAdmin') === 'true') {
            navigate('/dashboard', { replace: true });
        }
    }, [navigate]);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        setTimeout(() => {
            if (password === ADMIN_PASSWORD) {
                localStorage.setItem('isAdmin', 'true');
                onLoginSuccess();
                navigate('/dashboard', { replace: true });
            } else {
                setError('Incorrect password. Please try again.');
            }
            setIsLoading(false);
        }, 500);
    };

    return (
        <div className="flex flex-col justify-center items-center min-h-screen bg-background p-4">
            <div className="w-full max-w-sm mx-auto">
                 <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center bg-primary/10 text-primary w-16 h-16 rounded-full mb-4 border-2 border-primary/20">
                        <LockIcon />
                    </div>
                    <h1 className="text-3xl font-bold text-text-primary">Admin Access</h1>
                    <p className="text-text-secondary mt-2">Enter the admin password to access the dashboard.</p>
                </div>

                <div className="bg-surface p-8 rounded-xl shadow-lg border border-border">
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div>
                            <label htmlFor="password"className="block text-sm font-medium text-text-secondary mb-2">Password</label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-surface-light border border-border rounded-lg py-3 px-4 focus:outline-none focus:ring-2 focus:ring-primary transition-all text-text-primary"
                                required
                            />
                        </div>
                        {error && <p className="text-sm text-accent">{error}</p>}
                        <div>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-primary text-background font-bold py-3 px-4 rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 flex justify-center items-center"
                            >
                                {isLoading ? 'Verifying...' : 'Login'}
                            </button>
                        </div>
                    </form>
                </div>
                <div className="text-center mt-6">
                     <button onClick={() => navigate('/chat')} className="text-sm text-text-secondary hover:text-primary transition-colors">
                        &larr; Back to Chatbot
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AdminLoginPage;
