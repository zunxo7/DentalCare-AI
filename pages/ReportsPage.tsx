import React, { useState, useEffect } from 'react';
import { SpinnerIcon, TrashIcon, DragHandleIcon, RefreshIcon } from '../components/icons';
import { api } from '../lib/apiClient';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';

interface ReportsPageProps {
    showToast: (message: string, type: 'success' | 'error') => void;
}

const ReportsPage: React.FC<ReportsPageProps> = ({ showToast }) => {
    const [reports, setReports] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [categories, setCategories] = useState<Array<{ name: string; order: number }>>([]);
    const [newCategoryName, setNewCategoryName] = useState<string>('');
    const [loadingCategories, setLoadingCategories] = useState(false);
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [deleteModalState, setDeleteModalState] = useState<{ isOpen: boolean; reportId: number | null; isDeleteAll: boolean }>({ isOpen: false, reportId: null, isDeleteAll: false });
    const [deleteCategoryModalState, setDeleteCategoryModalState] = useState<{ isOpen: boolean; categoryName: string | null }>({ isOpen: false, categoryName: null });

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString();
    };

    const fetchReports = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const data = await api.getReports();
            if (data.success) {
                setReports(data.reports);
            }
        } catch (error: any) {
            console.error('Error fetching reports:', error);
            if (!silent) {
                showToast('Failed to load reports', 'error');
            }
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const fetchCategories = async () => {
        setLoadingCategories(true);
        try {
            // Use public endpoint for fetching (or add admin one if needed, but public is fine for now as it only returns names)
            const data = await api.getReportCategories();
            if (data.success) {
                setCategories(data.categories.sort((a: any, b: any) => a.order - b.order));
            }
        } catch (error: any) {
            console.error('Error fetching categories:', error);
        } finally {
            setLoadingCategories(false);
        }
    };

    useEffect(() => {
        fetchReports();
        fetchCategories();
    }, []);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await fetchReports(true);
        } finally {
            setIsRefreshing(false);
        }
    };

    const addCategory = async () => {
        if (!newCategoryName.trim()) {
            showToast('Category name cannot be empty', 'error');
            return;
        }

        if (categories.some(c => c.name === newCategoryName.trim().toLowerCase())) {
            showToast('Category already exists', 'error');
            return;
        }

        try {
            await api.addReportCategory(newCategoryName.trim());
            setNewCategoryName('');
            fetchCategories();
            showToast('Category added successfully', 'success');
        } catch (error: any) {
            showToast(`Failed to add category: ${error.message}`, 'error');
        }
    };

    const deleteCategory = async (categoryName: string) => {
        try {
            await api.deleteReportCategory(categoryName);
            fetchCategories();
            showToast('Category deleted successfully', 'success');
            setDeleteCategoryModalState({ isOpen: false, categoryName: null });
        } catch (error: any) {
            showToast(`Failed to delete category: ${error.message}`, 'error');
        }
    };

    const getReportTypeLabel = (type: string) => {
        if (!type) return 'Unknown';
        return type.split('_').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    };

    const [draggedCategory, setDraggedCategory] = useState<string | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const handleDragStart = (categoryName: string) => {
        setDraggedCategory(categoryName);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        setDragOverIndex(index);
    };

    const handleDragLeave = () => {
        setDragOverIndex(null);
    };

    const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault();
        setDragOverIndex(null);

        if (!draggedCategory) return;

        const sourceIndex = categories.findIndex(c => c.name === draggedCategory);
        if (sourceIndex === -1 || sourceIndex === targetIndex) {
            setDraggedCategory(null);
            return;
        }

        const newCategories = [...categories];
        const [removed] = newCategories.splice(sourceIndex, 1);
        newCategories.splice(targetIndex, 0, removed);
        setCategories(newCategories);

        try {
            await api.reorderReportCategories(draggedCategory, sourceIndex, targetIndex);
            fetchCategories();
        } catch (error: any) {
            fetchCategories();
            showToast(`Failed to reorder category: ${error.message}`, 'error');
        } finally {
            setDraggedCategory(null);
        }
    };

    const getReportTypeColor = (type: string) => {
        const colors = [
            'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
            'bg-primary/20 text-primary border-primary/30',
            'bg-accent/20 text-accent border-accent/30',
            'bg-blue-500/20 text-blue-500 border-blue-500/30',
            'bg-green-500/20 text-green-500 border-green-500/30',
            'bg-purple-500/20 text-purple-500 border-purple-500/30',
        ];
        const index = categories.findIndex(c => c.name === type);
        return colors[index % colors.length] || 'bg-surface-light text-text-secondary border-border';
    };

    const handleUpdateStatus = async (reportId: number, status: 'resolved' | 'active') => {
        try {
            await api.updateReportStatus(reportId, status);
            fetchReports();
            showToast(`Report marked as ${status}`, 'success');
        } catch (error: any) {
            showToast(`Failed to update report: ${error.message}`, 'error');
        }
    };

    const handleDeleteReport = async (reportId: number) => {
        try {
            await api.deleteReport(reportId);
            fetchReports();
            showToast('Report deleted', 'success');
            setDeleteModalState({ isOpen: false, reportId: null, isDeleteAll: false });
        } catch (error: any) {
            showToast(`Failed to delete report: ${error.message}`, 'error');
        }
    };

    const handleClearAllReports = async () => {
        try {
            await api.deleteReports();
            fetchReports();
            showToast('All reports cleared', 'success');
            setDeleteModalState({ isOpen: false, reportId: null, isDeleteAll: false });
        } catch (error: any) {
            showToast(`Failed to clear reports: ${error.message}`, 'error');
        }
    };


    return (
        <div className="min-h-screen bg-background p-2 sm:p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                <div className="mb-4 sm:mb-6">
                    <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-text-primary mb-1 sm:mb-2">User Reports</h1>
                    <p className="text-sm sm:text-base text-text-secondary">View and manage user reports</p>
                </div>

                <div className="bg-surface rounded-xl border border-border p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 mb-3 sm:mb-4">
                        <h2 className="text-lg sm:text-xl font-bold text-text-primary">Reports</h2>
                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                onClick={handleRefresh}
                                disabled={isRefreshing || loading}
                                className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg bg-surface-light text-text-primary border border-border font-semibold hover:bg-primary hover:text-background transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <RefreshIcon className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                                <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                            </button>
                            <button
                                onClick={() => setShowCategoryModal(true)}
                                className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg bg-primary text-background font-semibold hover:bg-primary-hover transition-colors whitespace-nowrap"
                            >
                                Edit Categories
                            </button>
                            <button
                                onClick={() => setDeleteModalState({ isOpen: true, reportId: null, isDeleteAll: true })}
                                className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg bg-accent/20 text-accent border border-accent/30 font-semibold hover:bg-accent/30 transition-colors whitespace-nowrap"
                            >
                                Clear All Reports
                            </button>
                        </div>
                    </div>

                    <ConfirmDeleteModal
                        isOpen={deleteModalState.isOpen}
                        onClose={() => setDeleteModalState({ isOpen: false, reportId: null, isDeleteAll: false })}
                        onConfirm={() => {
                            if (deleteModalState.isDeleteAll) {
                                handleClearAllReports();
                            } else if (deleteModalState.reportId) {
                                handleDeleteReport(deleteModalState.reportId);
                            }
                        }}
                        title={deleteModalState.isDeleteAll ? "Clear All Reports?" : "Delete Report?"}
                        message={deleteModalState.isDeleteAll ? `Are you sure you want to delete all ${reports.length} reports? This action cannot be undone.` : "Are you sure you want to permanently delete this report? This cannot be undone."}
                    />

                    <ConfirmDeleteModal
                        isOpen={deleteCategoryModalState.isOpen}
                        onClose={() => setDeleteCategoryModalState({ isOpen: false, categoryName: null })}
                        onConfirm={() => {
                            if (deleteCategoryModalState.categoryName) {
                                deleteCategory(deleteCategoryModalState.categoryName);
                            }
                        }}
                        title="Delete Category?"
                        message={`Delete category "${deleteCategoryModalState.categoryName}"? This will not affect existing reports.`}
                    />

                    {showCategoryModal && (
                        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCategoryModal(false)}>
                            <div className="bg-surface rounded-xl border border-border max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                                <div className="p-4 sm:p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg sm:text-xl font-semibold text-text-primary">Report Categories</h3>
                                        <button
                                            onClick={() => setShowCategoryModal(false)}
                                            className="text-text-secondary hover:text-text-primary transition-colors"
                                        >
                                            ✕
                                        </button>
                                    </div>

                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4">
                                        <input
                                            type="text"
                                            value={newCategoryName}
                                            onChange={(e) => setNewCategoryName(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                                            placeholder="New category name"
                                            className="flex-1 px-3 py-2 text-sm sm:text-base rounded-lg bg-surface-light border border-border text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                                        />
                                        <button
                                            onClick={addCategory}
                                            disabled={loadingCategories}
                                            className="px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-lg bg-primary text-background font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50"
                                        >
                                            Add Category
                                        </button>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {categories.map((cat, index) => (
                                            <div
                                                key={cat.name}
                                                draggable
                                                onDragStart={() => handleDragStart(cat.name)}
                                                onDragOver={(e) => handleDragOver(e, index)}
                                                onDragLeave={handleDragLeave}
                                                onDrop={(e) => handleDrop(e, index)}
                                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-surface cursor-move transition-all ${draggedCategory === cat.name ? 'opacity-50' : ''
                                                    } ${dragOverIndex === index ? 'border-primary bg-primary/10' : 'border-border'
                                                    }`}
                                            >
                                                <DragHandleIcon className="w-4 h-4 text-text-secondary/50 flex-shrink-0" />
                                                <span className={`text-xs font-semibold ${getReportTypeColor(cat.name)} px-2 py-1 rounded border whitespace-nowrap`}>
                                                    {getReportTypeLabel(cat.name)}
                                                </span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDeleteCategoryModalState({ isOpen: true, categoryName: cat.name });
                                                    }}
                                                    className="text-text-secondary hover:text-accent transition-colors flex-shrink-0"
                                                    title="Delete category"
                                                >
                                                    <TrashIcon className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {reports.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-text-secondary">No reports yet.</p>
                        </div>
                    ) : (
                        <div className="space-y-3 sm:space-y-4">
                            {reports.map((report) => {
                                const isResolved = report.status === 'resolved';
                                return (
                                    <div
                                        key={report.id}
                                        className={`bg-surface-light rounded-lg border p-3 sm:p-4 transition-all ${isResolved
                                            ? 'opacity-60 border-border/50'
                                            : 'border-border hover:border-primary/30'
                                            }`}
                                    >
                                        <div className="flex flex-col gap-3">
                                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                                <div className={`flex flex-wrap items-center gap-2 flex-1 ${isResolved ? 'line-through' : ''}`}>
                                                    <span className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${getReportTypeColor(report.report_type)} whitespace-nowrap`}>
                                                        {getReportTypeLabel(report.report_type)}
                                                    </span>
                                                    <span className="text-xs text-text-secondary/70">
                                                        {formatDate(report.created_at)}
                                                    </span>
                                                    {report.user_name && (
                                                        <span className="text-xs text-text-secondary/70">
                                                            User: {report.user_name}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleUpdateStatus(report.id, isResolved ? 'active' : 'resolved');
                                                        }}
                                                        className="px-3 py-1.5 text-xs rounded-lg border font-semibold transition-colors whitespace-nowrap bg-green-500/20 text-green-500 border-green-500/30 hover:bg-green-500/30"
                                                    >
                                                        {isResolved ? 'Resolved ✓' : 'Resolved'}
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setDeleteModalState({ isOpen: true, reportId: report.id, isDeleteAll: false });
                                                        }}
                                                        className="px-3 py-1.5 text-xs rounded-lg bg-accent/20 text-accent border border-accent/30 font-semibold hover:bg-accent/30 transition-colors whitespace-nowrap"
                                                    >
                                                        Clear
                                                    </button>
                                                </div>
                                            </div>

                                            {/* User Query and Bot Response */}
                                            {(report.user_query || report.bot_response) && (
                                                <div className="mt-2 space-y-2 pt-2 border-t border-border/50">
                                                    {report.user_query && (
                                                        <div>
                                                            <div className="text-xs font-semibold text-text-secondary mb-1">User Query:</div>
                                                            <div className="text-sm text-text-primary bg-surface rounded-md p-2 border border-border">
                                                                {report.user_query}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {report.bot_response && (
                                                        <div>
                                                            <div className="text-xs font-semibold text-text-secondary mb-1">Bot Response:</div>
                                                            <div className="text-sm text-text-primary bg-surface rounded-md p-2 border border-border">
                                                                {report.bot_response}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReportsPage;
