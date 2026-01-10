
import React, { useState, useEffect } from 'react';
import { api } from '../lib/apiClient';
import { FAQ, Suggestion } from '../types';
import { TrashIcon, PlusIcon, SpinnerIcon } from '../components/icons';

interface ManageSuggestionsPageProps {
    refreshData: () => Promise<void>;
    showToast: (message: string, type: 'success' | 'error') => void;
}

const ManageSuggestionsPage: React.FC<ManageSuggestionsPageProps> = ({ refreshData, showToast }) => {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [faqs, setFaqs] = useState<FAQ[]>([]);
    const [loading, setLoading] = useState(true);

    // New Suggestion Form
    const [newText, setNewText] = useState('');
    const [selectedFaqId, setSelectedFaqId] = useState<number | ''>('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [fetchedSuggestions, fetchedFaqs] = await Promise.all([
                api.getSuggestions(),
                api.getFaqs()
            ]);
            setSuggestions(fetchedSuggestions || []);
            setFaqs(fetchedFaqs || []);
        } catch (error: any) {
            showToast('Failed to load data', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newText.trim() || !selectedFaqId) return;

        setIsSubmitting(true);
        try {
            await api.addSuggestion(newText, Number(selectedFaqId));
            showToast('Suggestion added successfully', 'success');
            setNewText('');
            setSelectedFaqId('');
            loadData(); // Reload to get translations
        } catch (error: any) {
            showToast('Failed to add suggestion', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this suggestion?')) return;
        try {
            await api.deleteSuggestion(id);
            setSuggestions(prev => prev.filter(s => s.id !== id));
            showToast('Suggestion deleted', 'success');
        } catch (error) {
            showToast('Failed to delete suggestion', 'error');
        }
    };

    return (
        <div className="p-6 max-w-6xl mx-auto pb-24">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-text-primary mb-2">Suggestion Chips</h1>
                    <p className="text-text-secondary">Manage quick suggestions for short user queries.</p>
                </div>
            </div>

            {/* Add New Section */}
            <div className="bg-surface p-6 rounded-xl shadow-sm border border-border mb-8 animate-fade-in-up">
                <h2 className="text-xl font-semibold mb-4 text-text-primary">Add New Suggestion</h2>
                <form onSubmit={handleAdd} className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 w-full">
                        <label className="block text-sm font-medium text-text-secondary mb-1">
                            Suggestion Text (English)
                        </label>
                        <input
                            type="text"
                            value={newText}
                            onChange={(e) => setNewText(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                            placeholder="e.g. Braces Cost"
                            required
                        />
                        <p className="text-xs text-text-secondary mt-1">Keep it short (2-3 words). Will be auto-translated.</p>
                    </div>

                    <div className="flex-1 w-full">
                        <label className="block text-sm font-medium text-text-secondary mb-1">
                            Link to FAQ
                        </label>
                        <select
                            value={selectedFaqId}
                            onChange={(e) => setSelectedFaqId(Number(e.target.value))}
                            className="w-full bg-background border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                            required
                        >
                            <option value="">Select an FAQ...</option>
                            {faqs.map(faq => (
                                <option key={faq.id} value={faq.id}>
                                    {faq.question.substring(0, 60)}{faq.question.length > 60 ? '...' : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting || !newText.trim() || !selectedFaqId}
                        className="bg-primary text-background px-6 py-2 rounded-lg font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[120px]"
                    >
                        {isSubmitting ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <><PlusIcon className="w-5 h-5 mr-2" /> Add</>}
                    </button>
                </form>
            </div>

            {/* List Section */}
            <div className="grid gap-4">
                {loading ? (
                    <div className="text-center py-12">
                        <SpinnerIcon className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
                        <p className="text-text-secondary">Loading suggestions...</p>
                    </div>
                ) : suggestions.length === 0 ? (
                    <div className="text-center py-12 bg-surface rounded-xl border border-dashed border-border">
                        <p className="text-text-secondary">No suggestions added yet.</p>
                    </div>
                ) : (
                    <div className="bg-surface rounded-xl shadow-sm border border-border overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-surface-light border-b border-border">
                                <tr>
                                    <th className="text-left py-4 px-6 font-semibold text-text-secondary text-sm">English</th>
                                    <th className="text-left py-4 px-6 font-semibold text-text-secondary text-sm">Urdu</th>
                                    <th className="text-left py-4 px-6 font-semibold text-text-secondary text-sm">Roman Urdu</th>
                                    <th className="text-left py-4 px-6 font-semibold text-text-secondary text-sm">Linked FAQ</th>
                                    <th className="text-right py-4 px-6 font-semibold text-text-secondary text-sm">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {suggestions.map((suggestion) => {
                                    const linkedFaq = faqs.find(f => f.id === suggestion.linked_faq_id);
                                    return (
                                        <tr key={suggestion.id} className="hover:bg-surface-light/50 transition-colors">
                                            <td className="py-4 px-6 text-text-primary font-medium">{suggestion.english_text}</td>
                                            <td className="py-4 px-6 text-text-secondary font-urdu text-right" dir="rtl">{suggestion.urdu_text}</td>
                                            <td className="py-4 px-6 text-text-secondary">{suggestion.roman_text}</td>
                                            <td className="py-4 px-6 text-text-primary">
                                                {linkedFaq ? (
                                                    <div className="text-sm">
                                                        <span className="font-semibold block mb-1">ID: {linkedFaq.id}</span>
                                                        <span className="text-text-secondary text-xs">{linkedFaq.question.substring(0, 40)}...</span>
                                                    </div>
                                                ) : <span className="text-red-500 text-sm">FAQ Not Found</span>}
                                            </td>
                                            <td className="py-4 px-6 text-right">
                                                <button
                                                    onClick={() => handleDelete(suggestion.id)}
                                                    className="p-2 text-text-secondary hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                                                    title="Delete Suggestion"
                                                >
                                                    <TrashIcon className="w-5 h-5" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ManageSuggestionsPage;
