
import React, { useState, useRef, useEffect } from 'react';
import type { FAQ, Media } from '../types';
import { api } from '../lib/apiClient';
import { PlusIcon, TrashIcon, EditIcon, SpinnerIcon } from '../components/icons';
import Papa from 'papaparse';

interface ManageFaqsPageProps {
  faqs: FAQ[];
  media: Media[];
  refreshData: () => void;
  loading: boolean;
  showToast: (message: string, type: 'success' | 'error') => void;
}

const FAQModal = ({ faq, media, onClose, refreshData, showToast }: { faq: Partial<FAQ> | null, media: Media[], onClose: () => void, refreshData: () => void, showToast: (message: string, type: 'success' | 'error') => void }) => {
  const [question, setQuestion] = useState(faq?.question || '');
  const [answer, setAnswer] = useState(faq?.answer || '');
  const [intent, setIntent] = useState(faq?.intent || '');
  const [selectedMediaIds, setSelectedMediaIds] = useState<number[]>(faq?.media_ids || []);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingIntent, setIsGeneratingIntent] = useState(false);
  const isEditing = !!faq?.id;

  // Ensure selectedMediaIds and intent syncs with FAQ when FAQ changes
  useEffect(() => {
    if (faq?.media_ids) {
      let ids: any = faq.media_ids;

      // Handle case where media_ids comes as a JSON string
      if (typeof ids === 'string') {
        try {
          ids = JSON.parse(ids);
        } catch (e) {
          console.error("Failed to parse media_ids:", e);
          ids = [];
        }
      }

      if (Array.isArray(ids)) {
        // Filter to only include IDs that exist in the current media list
        const validMediaIds = media.map(m => m.id);
        const filtered = ids.filter((id: number) => validMediaIds.includes(id));
        setSelectedMediaIds(filtered);
      } else {
        setSelectedMediaIds([]);
      }
    } else {
      setSelectedMediaIds([]);
    }
    if (faq?.intent) {
      setIntent(faq.intent);
    } else {
      setIntent('');
    }
  }, [faq?.id, faq?.media_ids, faq?.intent, media]);

  const toggleMediaSelection = (mediaId: number) => {
    setSelectedMediaIds(prev =>
      prev.includes(mediaId)
        ? prev.filter(id => id !== mediaId)
        : [...prev, mediaId]
    );
  };

  const handleGenerateIntent = async () => {
    if (!question.trim()) {
      showToast('Please enter a question first', 'error');
      return;
    }

    setIsGeneratingIntent(true);
    try {
      const result = await api.generateIntent(question);
      setIntent(result.intent);
      showToast('Intent generated successfully', 'success');
    } catch (error: any) {
      console.error('Error generating intent:', error);
      showToast(`Failed to generate intent: ${error.message || 'Unknown error'}`, 'error');
    } finally {
      setIsGeneratingIntent(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!intent.trim()) {
      showToast('Intent is required. Please generate or enter an intent.', 'error');
      return;
    }

    setIsSaving(true);
    const faqData = {
      question,
      answer,
      intent,
      media_ids: selectedMediaIds
    };
    try {
      if (isEditing && faq?.id) {
        await api.updateFaq(faq.id, faqData);
      } else {
        await api.createFaq(faqData);
      }
      refreshData();
      onClose();
    } catch (error: any) {
      console.error("Error saving FAQ:", error);
      showToast(`Error saving FAQ: ${error.message || 'Unknown error'}`, 'error');
    }
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-lg shadow-xl p-6 w-full max-w-xl border border-border max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">{isEditing ? 'Edit FAQ' : 'Add FAQ'}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="question" className="block text-xs font-medium text-text-secondary mb-1">Question</label>
            <input
              id="question"
              type="text"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              className="w-full bg-surface-light border border-border rounded-md py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>
          <div>
            <label htmlFor="intent" className="block text-xs font-medium text-text-secondary mb-1">
              Intent <span className="text-accent">*</span>
            </label>
            <div className="flex gap-2">
              <input
                id="intent"
                type="text"
                value={intent}
                onChange={e => setIntent(e.target.value)}
                placeholder="e.g., braces wire poking cheek"
                className="flex-1 bg-surface-light border border-border rounded-md py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
              <button
                type="button"
                onClick={handleGenerateIntent}
                disabled={isGeneratingIntent || !question.trim()}
                className="px-3 py-1.5 bg-primary/20 text-primary rounded-md hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                title="Generate intent"
              >
                {isGeneratingIntent ? <SpinnerIcon /> : '✨'}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="answer" className="block text-xs font-medium text-text-secondary mb-1">Answer</label>
            <textarea
              id="answer"
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              rows={4}
              className="w-full bg-surface-light border border-border rounded-md py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Media <span className="text-text-secondary/60">({selectedMediaIds.length} selected)</span>
            </label>
            {media.length === 0 ? (
              <p className="text-xs text-text-secondary/70 italic">No media available</p>
            ) : (
              <div className="max-h-32 overflow-y-auto border border-border rounded-md p-2 bg-surface-light">
                <div className="grid grid-cols-1 gap-1">
                  {media.map(m => (
                    <label
                      key={m.id}
                      className={`flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-surface transition-colors text-xs ${selectedMediaIds.includes(m.id) ? 'bg-primary/20' : ''
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedMediaIds.includes(m.id)}
                        onChange={() => toggleMediaSelection(m.id)}
                        className="w-3 h-3 text-primary"
                      />
                      <span className="text-text-primary truncate">{m.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md bg-surface-light hover:opacity-80 transition-opacity text-sm">Cancel</button>
            <button type="submit" disabled={isSaving} className="px-3 py-1.5 rounded-md bg-primary text-background font-bold hover:bg-primary-hover transition-colors flex items-center gap-2 disabled:opacity-50 text-sm">
              {isSaving && <SpinnerIcon />}
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ConfirmDeleteModal = ({ isOpen, onClose, onConfirm, title, message }: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 animate-fade-in-down" style={{ animationDuration: '0.2s' }}>
      <div className="bg-surface rounded-lg shadow-xl p-6 w-full max-w-md border border-border">
        <h2 className="text-xl font-bold mb-4 text-text-primary">{title}</h2>
        <p className="text-text-secondary mb-6">{message}</p>
        <div className="flex justify-end gap-4">
          <button onClick={onClose} className="px-4 py-2 rounded-md bg-surface-light hover:opacity-80 transition-opacity font-semibold">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-md bg-accent hover:bg-accent-hover text-white transition-colors font-semibold flex items-center gap-2">
            <TrashIcon />
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

const parseFaqCsv = (csvText: string): { question: string; answer: string; intent?: string; media_ids?: number[] }[] => {
  const results = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: 'greedy',
  });

  const rows = (results.data || []) as string[][];
  if (rows.length === 0) return [];

  const first = rows[0].map(c => (c ?? '').trim().toLowerCase());
  const hasHeader = first.length >= 2 && first[0] === 'question' && first[1] === 'answer';
  const hasIntent = first.length >= 3 && first[2] === 'intent';
  const hasMediaIds = first.length >= 4 && first[3] === 'media_ids';

  const dataRows = hasHeader ? rows.slice(1) : rows;

  const faqs: { question: string; answer: string; intent?: string; media_ids?: number[] }[] = [];

  for (const row of dataRows) {
    if (!row) continue;

    const question = (row[0] ?? '').trim();
    const answer = (row[1] ?? '').trim();
    const intent = hasIntent ? (row[2] ?? '').trim() : undefined;
    const mediaIdsStr = hasMediaIds ? (row[3] ?? '').trim() : undefined;

    if (!question || !answer) continue;

    let mediaIds: number[] | undefined;
    if (mediaIdsStr) {
      try {
        mediaIds = JSON.parse(mediaIdsStr);
      } catch {
        // Try parsing as comma-separated numbers
        mediaIds = mediaIdsStr.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
      }
    }

    faqs.push({ question, answer, intent, media_ids: mediaIds });
  }

  return faqs;
};


const ManageFaqsPage: React.FC<ManageFaqsPageProps> = ({ faqs, media, refreshData, loading, showToast }) => {
  const [isFaqModalOpen, setIsFaqModalOpen] = useState(false);
  const [selectedFaq, setSelectedFaq] = useState<Partial<FAQ> | null>(null);
  const [deleteModalState, setDeleteModalState] = useState<{ isOpen: boolean; faqId: number | null; isDeleteAll: boolean; }>({ isOpen: false, faqId: null, isDeleteAll: false });
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const openFaqModal = (faq: Partial<FAQ> | null = null) => {
    setSelectedFaq(faq);
    setIsFaqModalOpen(true);
  };

  const closeFaqModal = () => {
    setSelectedFaq(null);
    setIsFaqModalOpen(false);
  };

  const handleDelete = async (faqId: number) => {
    try {
      await api.deleteFaq(faqId);
      showToast('FAQ deleted successfully.', 'success');
      refreshData();
    } catch (error: any) {
      console.error("Error deleting FAQ:", error);
      showToast(`Failed to delete FAQ: ${error.message || 'Unknown error'}`, 'error');
    }
    closeDeleteModal();
  };

  const handleDeleteAll = async () => {
    try {
      await api.deleteAllFaqs();
      showToast('All FAQs have been deleted.', 'success');
      refreshData();
    } catch (error: any) {
      console.error("Error deleting all FAQs:", error);
      showToast(`Failed to delete all FAQs: ${error.message || 'Unknown error'}`, 'error');
    }
    closeDeleteModal();
  };

  const openDeleteModal = (faqId: number) => setDeleteModalState({ isOpen: true, faqId, isDeleteAll: false });
  const openDeleteAllModal = () => setDeleteModalState({ isOpen: true, faqId: null, isDeleteAll: true });
  const closeDeleteModal = () => setDeleteModalState({ isOpen: false, faqId: null, isDeleteAll: false });

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsedFaqs = parseFaqCsv(text);

      if (parsedFaqs.length === 0) {
        showToast('No valid FAQs found in CSV. Make sure it has "question,answer" columns.', 'error');
        event.target.value = '';
        return;
      }

      setIsImporting(true);
      let successCount = 0;
      let failureCount = 0;

      for (const row of parsedFaqs) {
        try {
          // Generate intent if not provided
          let intent = row.intent;
          if (!intent) {
            const intentResult = await api.generateIntent(row.question);
            intent = intentResult.intent;
          }

          await api.createFaq({
            question: row.question,
            answer: row.answer,
            intent: intent,
            media_ids: row.media_ids,
          });

          successCount += 1;
        } catch (err) {
          console.error('Failed to import FAQ row:', err);
          failureCount += 1;
        }
      }

      refreshData();

      const baseMessage = `Imported ${successCount} FAQ${successCount === 1 ? '' : 's'}.`;
      const fullMessage =
        failureCount > 0
          ? `${baseMessage} ${failureCount} row${failureCount === 1 ? '' : 's'} failed.`
          : baseMessage;

      showToast(fullMessage, failureCount > 0 ? 'error' : 'success');
    } catch (error: any) {
      console.error('Error importing FAQs from CSV:', error);
      showToast(`Failed to import FAQs: ${error.message || 'Unknown error'}`, 'error');
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  const handleExportCsv = () => {
    if (faqs.length === 0) {
      showToast('No FAQs to export', 'error');
      return;
    }

    try {
      // Prepare data for CSV export
      const csvData = faqs.map(faq => ({
        question: faq.question,
        answer: faq.answer,
        intent: faq.intent || '',
        media_ids: typeof faq.media_ids === 'string' ? faq.media_ids : (faq.media_ids ? JSON.stringify(faq.media_ids) : ''),
      }));

      // Generate CSV with header, properly escaping special characters
      const csv = Papa.unparse(csvData, {
        header: true,
        columns: ['question', 'answer', 'intent', 'media_ids'],
        quotes: true, // Force quotes to properly escape special characters
        escapeChar: '"', // Use double quotes for escaping
        quoteChar: '"', // Use double quotes for fields
        delimiter: ',',
        newline: '\n',
      });

      // Create blob with UTF-8 BOM for better Excel compatibility
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = `faqs_export_${new Date().toISOString().split('T')[0]}.csv`;
      link.style.display = 'none';

      document.body.appendChild(link);
      link.click();

      // Clean up after a short delay
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);

      showToast(`Exported ${faqs.length} FAQ${faqs.length === 1 ? '' : 's'} to CSV`, 'success');
    } catch (error: any) {
      console.error('Error exporting FAQs to CSV:', error);
      showToast(`Failed to export FAQs: ${error.message || 'Unknown error'}`, 'error');
    }
  };

  return (
    <div className="p-4 md:p-8 bg-background text-text-primary">
      {isFaqModalOpen && <FAQModal faq={selectedFaq} media={media} onClose={closeFaqModal} refreshData={refreshData} showToast={showToast} />}
      <ConfirmDeleteModal
        isOpen={deleteModalState.isOpen}
        onClose={closeDeleteModal}
        onConfirm={() => {
          if (deleteModalState.isDeleteAll) {
            handleDeleteAll();
          } else if (deleteModalState.faqId) {
            handleDelete(deleteModalState.faqId);
          }
        }}
        title={deleteModalState.isDeleteAll ? "Delete All FAQs?" : "Delete FAQ?"}
        message={deleteModalState.isDeleteAll ? `Are you sure you want to delete all ${faqs.length} FAQs? This is irreversible.` : "Are you sure you want to permanently delete this FAQ?"}
      />
      <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold">All FAQs ({faqs.length})</h2>
          <p className="text-text-secondary">Manage your frequently asked questions</p>
        </div>
        <div className="flex flex-wrap gap-2 self-start md:self-center">
          <button
            onClick={() => openFaqModal(null)}
            className="bg-primary text-background font-bold px-3 sm:px-4 py-2 rounded-md hover:bg-primary-hover transition-colors flex items-center gap-2 text-xs sm:text-sm whitespace-nowrap"
          >
            <PlusIcon /> Add FAQ
          </button>
          <button
            onClick={handleImportClick}
            disabled={isImporting}
            className="bg-primary/10 text-primary font-bold px-3 sm:px-4 py-2 rounded-md hover:bg-primary/20 transition-colors flex items-center gap-2 text-xs sm:text-sm disabled:opacity-50 whitespace-nowrap"
          >
            <PlusIcon /> {isImporting ? 'Importing...' : 'Import CSV'}
          </button>
          {faqs.length > 0 && (
            <>
              <button
                onClick={handleExportCsv}
                className="bg-green-500/20 text-green-500 font-bold px-3 sm:px-4 py-2 rounded-md hover:bg-green-500/30 transition-colors flex items-center gap-2 text-xs sm:text-sm whitespace-nowrap"
              >
                Export CSV
              </button>
              <button
                onClick={openDeleteAllModal}
                className="bg-accent text-white px-3 sm:px-4 py-2 rounded-md hover:bg-accent-hover transition-colors flex items-center gap-2 text-xs sm:text-sm font-semibold whitespace-nowrap"
              >
                <TrashIcon /> Delete All
              </button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <input
          type="file"
          accept=".csv,text/csv"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        {loading ? (
          <div className="flex justify-center items-center py-16">
            <SpinnerIcon />
            <span className="ml-2">Loading FAQs...</span>
          </div>
        ) : faqs.length > 0 ? (
          faqs.map(faq => (
            <div key={faq.id} className="bg-surface p-6 rounded-lg flex flex-col md:flex-row justify-between md:items-start border border-border">
              <div className="max-w-4xl mb-4 md:mb-0">
                <h3 className="font-bold text-lg mb-2 text-text-primary">{faq.question}</h3>
                <p className="text-text-secondary text-sm whitespace-pre-wrap leading-relaxed">{faq.answer}</p>
                <p className="text-xs text-text-secondary/70 mt-4">Asked {faq.asked_count} times</p>

              </div>
              <div className="flex gap-2 ml-auto md:ml-4 flex-shrink-0">
                <button onClick={() => openFaqModal(faq)} className="p-2 bg-primary/20 text-primary rounded-md hover:bg-primary/40 transition-colors" aria-label="Edit FAQ"><EditIcon /></button>
                <button onClick={() => openDeleteModal(faq.id)} className="p-2 bg-accent/20 text-accent rounded-md hover:bg-accent/40 transition-colors" aria-label="Delete FAQ"><TrashIcon /></button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-16 bg-surface rounded-lg border border-border">
            <h3 className="text-xl font-semibold">No FAQs Found</h3>
            <p className="text-text-secondary mt-2">Click "Add FAQ" to create your first one.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManageFaqsPage;
