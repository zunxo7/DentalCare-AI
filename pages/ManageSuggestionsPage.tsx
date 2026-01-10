import React, { useState, useEffect } from 'react';
import { api } from '../lib/apiClient';
import type { FAQ, SuggestionGroup, SuggestionChip } from '../types';
import { PlusIcon, TrashIcon, ChipIcon, SpinnerIcon, EditIcon } from '../components/icons';

interface ManageSuggestionsPageProps {
    refreshData?: () => void;
    showToast: (message: string, type: 'success' | 'error') => void;
}

const ManageSuggestionsPage: React.FC<ManageSuggestionsPageProps> = ({ refreshData, showToast }) => {
    const [groups, setGroups] = useState<SuggestionGroup[]>([]);
    const [faqs, setFaqs] = useState<FAQ[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isFormExpanded, setIsFormExpanded] = useState(true);

    // Form State
    const [keywords, setKeywords] = useState('');
    const [chips, setChips] = useState<{ text_en: string; linked_faq_id: string }[]>([
        { text_en: '', linked_faq_id: '' }
    ]);
    const [editingId, setEditingId] = useState<number | null>(null);

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
            const chipData = validChips.map(c => ({
                text_en: c.text_en.trim(),
                linked_faq_id: parseInt(c.linked_faq_id)
            }));

            if (editingId) {
                await api.updateSuggestion({
                    id: editingId,
                    keywords: keywords.trim(),
                    chips: chipData
                });
                showToast('Suggestion Group updated successfully!', 'success');
                setEditingId(null);
            } else {
                await api.addSuggestion({
                    keywords: keywords.trim(),
                    chips: chipData
                });
                showToast('Suggestion Group added successfully!', 'success');
            }

            setKeywords('');
            setChips([{ text_en: '', linked_faq_id: '' }]);
            loadData();
        } catch (error) {
            console.error('Error saving suggestion:', error);
            showToast(`Failed to ${editingId ? 'update' : 'add'} suggestion group`, 'error');
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

    const handleEdit = (group: SuggestionGroup) => {
        setEditingId(group.id);
        setKeywords(group.keywords);
        setChips(group.chips?.map(c => ({
            text_en: c.text_en,
            linked_faq_id: String(c.linked_faq_id)
        })) || [{ text_en: '', linked_faq_id: '' }]);
        setIsFormExpanded(true);
        // Scroll to form
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setKeywords('');
        setChips([{ text_en: '', linked_faq_id: '' }]);
    };

    return (
        <div className="p-4 md:p-8 space-y-6 animate-fade-in-up max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-text-primary mb-1 sm:mb-2">
                        Suggestion Chips
                    </h1>
                    <p className="text-sm text-text-secondary">
                        Manage quick-reply suggestions for short user queries
                    </p>
                </div>
                <button
                    onClick={() => setIsFormExpanded(!isFormExpanded)}
                    className="text-sm text-primary hover:text-primary-light font-medium flex items-center gap-1 sm:hidden"
                >
                    {isFormExpanded ? 'Hide Form' : 'Show Form'}
                </button>
            </div>

            {/* Add New Group Form */}
            <div className={`bg-surface/50 backdrop-blur-sm border border-border/50 rounded-2xl shadow-lg overflow-hidden transition-all duration-300 ${isFormExpanded ? 'p-4 sm:p-6' : 'p-0 h-0 border-0'}`}>
                {isFormExpanded && (
                    <>
                        <h2 className="text-lg sm:text-xl font-semibold mb-4 text-text-primary flex items-center gap-2">
                            <div className={`p-1.5 ${editingId ? 'bg-secondary/10' : 'bg-primary/10'} rounded-lg`}>
                                {editingId ? <EditIcon className="w-4 h-4 text-secondary" /> : <PlusIcon className="w-4 h-4 text-primary" />}
                            </div>
                            {editingId ? 'Edit Group' : 'Add New Group'}
                        </h2>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            {/* Keywords Input */}
                            <div>
                                <label className="block text-sm font-medium text-text-primary mb-2">
                                    Trigger Keywords
                                </label>
                                <input
                                    type="text"
                                    value={keywords}
                                    onChange={(e) => setKeywords(e.target.value)}
                                    placeholder="e.g. brush cleaning toothache"
                                    className="w-full bg-surface-light border border-border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-sm sm:text-base"
                                />
                                <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
                                    Space-separated keywords. When a user types a short query containing any of these, the chips below will appear.
                                </p>
                            </div>

                            {/* Chips List */}
                            <div className="space-y-3">
                                <label className="block text-sm font-medium text-text-primary">
                                    Suggestion Chips
                                </label>
                                <div className="space-y-3">
                                    {chips.map((chip, index) => (
                                        <div key={index} className="flex flex-col sm:flex-row gap-2 sm:gap-3 p-3 bg-surface-light/30 rounded-xl border border-border/30">
                                            <div className="flex-1">
                                                <label className="text-xs text-text-secondary mb-1 block sm:hidden">Chip Text</label>
                                                <input
                                                    type="text"
                                                    value={chip.text_en}
                                                    onChange={(e) => handleChipChange(index, 'text_en', e.target.value)}
                                                    placeholder="Chip Label (English)"
                                                    className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-primary outline-none text-sm"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <label className="text-xs text-text-secondary mb-1 block sm:hidden">Linked FAQ</label>
                                                <select
                                                    value={chip.linked_faq_id}
                                                    onChange={(e) => handleChipChange(index, 'linked_faq_id', e.target.value)}
                                                    className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-primary outline-none text-sm appearance-none"
                                                >
                                                    <option value="">Select FAQ...</option>
                                                    {faqs.map(faq => (
                                                        <option key={faq.id} value={faq.id}>
                                                            #{faq.id}: {faq.question.substring(0, 35)}...
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveChipRow(index)}
                                                className="p-2.5 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors self-end sm:self-center shrink-0"
                                                disabled={chips.length === 1}
                                            >
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={handleAddChipRow}
                                    className="text-sm text-primary hover:text-primary-light font-medium flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-primary/5 transition-colors"
                                >
                                    <PlusIcon className="w-4 h-4" /> Add Another Chip
                                </button>
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                {editingId && (
                                    <button
                                        type="button"
                                        onClick={handleCancelEdit}
                                        className="px-4 py-3 rounded-xl font-semibold transition-all border border-border hover:bg-surface-light text-text-secondary"
                                    >
                                        Cancel
                                    </button>
                                )}
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full sm:w-auto bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-background px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <SpinnerIcon className="w-4 h-4" />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <ChipIcon className="w-4 h-4" />
                                            {editingId ? 'Update Group' : 'Save Group'}
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </>
                )}
            </div>

            {/* Existing Groups List */}
            <div className="bg-surface/50 backdrop-blur-sm border border-border/50 rounded-2xl p-4 sm:p-6 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg sm:text-xl font-semibold text-text-primary flex items-center gap-2">
                        <div className="p-1.5 bg-secondary/10 rounded-lg">
                            <ChipIcon className="w-4 h-4 text-secondary" />
                        </div>
                        Active Groups
                        {!isLoading && groups.length > 0 && (
                            <span className="text-xs font-normal text-text-secondary bg-surface-light px-2 py-0.5 rounded-full">
                                {groups.length}
                            </span>
                        )}
                    </h2>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-12 text-text-secondary gap-2">
                        <SpinnerIcon className="w-5 h-5" />
                        Loading...
                    </div>
                ) : groups.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="inline-block p-4 bg-surface-light/50 rounded-2xl mb-3">
                            <ChipIcon className="w-8 h-8 text-text-secondary/50" />
                        </div>
                        <p className="text-text-secondary">No suggestion groups yet.</p>
                        <p className="text-sm text-text-secondary/70 mt-1">Create your first group above!</p>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {groups.map((group) => (
                            <div
                                key={group.id}
                                className="group bg-surface-light/20 hover:bg-surface-light/40 border border-border/30 hover:border-primary/30 rounded-xl p-4 transition-all duration-200"
                            >
                                <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                                    <div className="flex-1 min-w-0 space-y-3">
                                        {/* Keywords */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary shrink-0">
                                                Keywords:
                                            </span>
                                            <div className="flex flex-wrap gap-1">
                                                {group.keywords.split(/\s+/).filter(kw => kw.trim()).map((kw, i) => (
                                                    <span
                                                        key={i}
                                                        className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-md"
                                                    >
                                                        {kw.trim()}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Chips */}
                                        <div className="flex flex-wrap gap-2">
                                            {group.chips && group.chips.map((chip, idx) => (
                                                <div
                                                    key={idx}
                                                    className="flex items-center gap-2 bg-surface border border-border/50 rounded-lg px-3 py-1.5 text-xs shadow-sm hover:shadow-md transition-shadow"
                                                >
                                                    <ChipIcon className="w-3 h-3 text-secondary shrink-0" />
                                                    <span className="font-medium text-text-primary truncate max-w-[150px] sm:max-w-none">
                                                        {chip.text_en}
                                                    </span>
                                                    <span className="text-text-secondary/40">→</span>
                                                    <span className="text-text-secondary font-mono whitespace-nowrap">
                                                        FAQ #{chip.linked_faq_id}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={() => handleEdit(group)}
                                            className="text-text-secondary hover:text-primary transition-colors p-2 hover:bg-primary/10 rounded-lg opacity-50 group-hover:opacity-100"
                                            title="Edit Group"
                                        >
                                            <EditIcon className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(group.id)}
                                            className="text-text-secondary hover:text-red-500 transition-colors p-2 hover:bg-red-500/10 rounded-lg opacity-50 group-hover:opacity-100"
                                            title="Delete Group"
                                        >
                                            <TrashIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ManageSuggestionsPage;
