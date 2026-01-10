import React, { useState, useEffect } from 'react';
import { api } from '../lib/apiClient';
import type { FAQ, SuggestionGroup, SuggestionChip } from '../types';
import { PlusIcon, TrashIcon, ChipIcon } from '../components/icons';

interface ManageSuggestionsPageProps {
    refreshData?: () => void;
    showToast: (message: string, type: 'success' | 'error') => void;
}

const ManageSuggestionsPage: React.FC<ManageSuggestionsPageProps> = ({ refreshData, showToast }) => {
    const [groups, setGroups] = useState<SuggestionGroup[]>([]);
    const [faqs, setFaqs] = useState<FAQ[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form State
    const [keywords, setKeywords] = useState('');
    const [chips, setChips] = useState<{ text_en: string; linked_faq_id: string }[]>([
        { text_en: '', linked_faq_id: '' }
    ]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [suggestionsData, faqsData] = await Promise.all([
                api.getSuggestions(),
                api.getFaqs()
            ]);
            setGroups(suggestionsData);
            setFaqs(faqsData);
        } catch (error) {
            console.error('Error loading data:', error);
            showToast('Failed to load suggestions', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddChipRow = () => {
        setChips([...chips, { text_en: '', linked_faq_id: '' }]);
    };

    const handleRemoveChipRow = (index: number) => {
        setChips(chips.filter((_, i) => i !== index));
    };

    const handleChipChange = (index: number, field: 'text_en' | 'linked_faq_id', value: string) => {
        const newChips = [...chips];
        newChips[index] = { ...newChips[index], [field]: value };
        setChips(newChips);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!keywords.trim()) {
            showToast('Please enter keywords', 'error');
            return;
        }

        const validChips = chips.filter(c => c.text_en.trim() && c.linked_faq_id);
        if (validChips.length === 0) {
            showToast('Please add at least one valid chip (text + linked FAQ)', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            await api.addSuggestion({
                keywords: keywords.trim(),
                chips: validChips.map(c => ({
                    text_en: c.text_en.trim(),
                    linked_faq_id: parseInt(c.linked_faq_id)
                }))
            });

            showToast('Suggestion Group added successfully!', 'success');
            setKeywords('');
            setChips([{ text_en: '', linked_faq_id: '' }]);
            loadData();
        } catch (error) {
            console.error('Error adding suggestion:', error);
            showToast('Failed to add suggestion group', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('Are you sure you want to delete this group?')) return;
        try {
            await api.deleteSuggestion(id);
            showToast('Suggestion Group deleted', 'success');
            loadData();
        } catch (error) {
            console.error('Error deleting suggestion:', error);
            showToast('Failed to delete suggestion', 'error');
        }
    };

    return (
        <div className="space-y-8 animate-fade-in-up">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                    Manage Suggestion Chips
                </h1>
            </div>

            {/* Add New Group Form */}
            <div className="bg-surface/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6 shadow-lg">
                <h2 className="text-xl font-semibold mb-4 text-text-primary flex items-center gap-2">
                    <PlusIcon className="w-5 h-5 text-primary" />
                    Add New Suggestion Group
                </h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Keywords Input */}
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">
                            Trigger Keywords (comma separated)
                        </label>
                        <input
                            type="text"
                            value={keywords}
                            onChange={(e) => setKeywords(e.target.value)}
                            placeholder="e.g. brush, cleaning, toothache"
                            className="w-full bg-surface-light border border-border rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                        />
                        <p className="text-xs text-text-secondary mt-1">
                            If a user's short query contains any of these words, the chips below will be shown.
                        </p>
                    </div>

                    {/* Chips List */}
                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-text-secondary">
                            Suggestion Chips
                        </label>
                        {chips.map((chip, index) => (
                            <div key={index} className="flex gap-3 items-start">
                                <div className="flex-1">
                                    <input
                                        type="text"
                                        value={chip.text_en}
                                        onChange={(e) => handleChipChange(index, 'text_en', e.target.value)}
                                        placeholder="Chip Label (English)"
                                        className="w-full bg-surface-light border border-border rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary outline-none"
                                    />
                                </div>
                                <div className="flex-1">
                                    <select
                                        value={chip.linked_faq_id}
                                        onChange={(e) => handleChipChange(index, 'linked_faq_id', e.target.value)}
                                        className="w-full bg-surface-light border border-border rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary outline-none"
                                    >
                                        <option value="">Select Linked FAQ...</option>
                                        {faqs.map(faq => (
                                            <option key={faq.id} value={faq.id}>
                                                (ID: {faq.id}) {faq.question.substring(0, 40)}...
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveChipRow(index)}
                                    className="p-2 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                    disabled={chips.length === 1}
                                >
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={handleAddChipRow}
                            className="text-sm text-primary hover:text-primary-light font-medium flex items-center gap-1"
                        >
                            <PlusIcon className="w-4 h-4" /> Add Another Chip
                        </button>
                    </div>

                    <div className="flex justify-end pt-2">
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-xl font-medium transition-colors shadow-lg shadow-primary/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? (
                                <>Processing...</>
                            ) : (
                                <>Save Suggestion Group</>
                            )}
                        </button>
                    </div>
                </form>
            </div>

            {/* Existing Groups List */}
            <div className="bg-surface/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6 shadow-lg">
                <h2 className="text-xl font-semibold mb-4 text-text-primary">Active Suggestion Groups</h2>
                {isLoading ? (
                    <div className="text-center py-8 text-text-secondary">Loading...</div>
                ) : groups.length === 0 ? (
                    <div className="text-center py-8 text-text-secondary italic">No suggestion groups found.</div>
                ) : (
                    <div className="space-y-4">
                        {groups.map((group) => (
                            <div key={group.id} className="bg-surface-light/30 border border-border/50 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-primary/30 transition-colors">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold uppercase tracking-wider text-text-secondary bg-surface-light px-2 py-1 rounded">Keywords</span>
                                        <span className="font-mono text-primary text-sm">{group.keywords}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {group.chips && group.chips.map((chip, idx) => (
                                            <div key={idx} className="flex items-center gap-1.5 bg-surface border border-border rounded-lg px-2 py-1 text-xs text-text-secondary">
                                                <ChipIcon className="w-3 h-3" />
                                                <span className="font-medium text-text-primary">{chip.text_en}</span>
                                                <span className="text-text-secondary/50 mx-1">→</span>
                                                <span>FAQ #{chip.linked_faq_id}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDelete(group.id)}
                                    className="text-text-secondary hover:text-red-500 transition-colors p-2 hover:bg-red-500/10 rounded-lg self-end sm:self-center"
                                    title="Delete Group"
                                >
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ManageSuggestionsPage;
