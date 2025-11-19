import React, { useState, useEffect } from 'react';
import { SpinnerIcon } from '../../components/icons';
import { debugFetch } from '../../lib/debugApi';

interface EmbeddingsPageProps {
  showToast: (message: string, type: 'success' | 'error') => void;
}

const EmbeddingsPage: React.FC<EmbeddingsPageProps> = ({ showToast }) => {
  const [faqs, setFaqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingEmbedding, setRefreshingEmbedding] = useState<number | 'all' | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchTables = async () => {
    setLoading(true);
    try {
      const response = await debugFetch('/api/debug/tables');
      const data = await response.json();
      setFaqs(data.faqs || []);
    } catch (error: any) {
      console.error('Error fetching FAQs:', error);
      showToast('Failed to load FAQs', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, []);

  const refreshSingleEmbedding = async (faqId: number) => {
    setRefreshingEmbedding(faqId);
    try {
      const response = await debugFetch('/api/debug/refresh-embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faqId }),
      });

      if (!response.ok) throw new Error('Failed to refresh embedding');

      const result = await response.json();
      showToast(`Successfully refreshed embedding for FAQ #${faqId}`, 'success');
      fetchTables();
    } catch (error: any) {
      console.error('Error refreshing embedding:', error);
      showToast('Failed to refresh embedding', 'error');
    } finally {
      setRefreshingEmbedding(null);
    }
  };

  const refreshAllEmbeddings = async () => {
    setRefreshingEmbedding('all');
    try {
      const response = await debugFetch('/api/debug/refresh-embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faqId: null }),
      });

      if (!response.ok) throw new Error('Failed to refresh embeddings');

      const result = await response.json();
      showToast(`Successfully refreshed embeddings for ${result.count} FAQs`, 'success');
      fetchTables();
    } catch (error: any) {
      console.error('Error refreshing embeddings:', error);
      showToast('Failed to refresh embeddings', 'error');
    } finally {
      setRefreshingEmbedding(null);
    }
  };

  const refreshOutdatedEmbeddings = async () => {
    const outdatedFaqs = filteredFaqs.filter(faq => faq.isOutOfDate);
    
    if (outdatedFaqs.length === 0) {
      showToast('No outdated embeddings to refresh', 'success');
      return;
    }

    setRefreshingEmbedding('outdated');
    let successCount = 0;
    let failCount = 0;

    try {
      // Refresh each outdated FAQ
      for (const faq of outdatedFaqs) {
        try {
          const response = await debugFetch('/api/debug/refresh-embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ faqId: faq.id }),
          });

          if (response.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          failCount++;
        }
      }

      if (failCount === 0) {
        showToast(`Successfully refreshed ${successCount} outdated embedding${successCount !== 1 ? 's' : ''}`, 'success');
      } else {
        showToast(`Refreshed ${successCount} embeddings, ${failCount} failed`, 'error');
      }
      
      fetchTables();
    } catch (error: any) {
      console.error('Error refreshing outdated embeddings:', error);
      showToast('Failed to refresh outdated embeddings', 'error');
    } finally {
      setRefreshingEmbedding(null);
    }
  };

  const filteredFaqs = faqs
    .filter((faq) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        faq.question?.toLowerCase().includes(query) ||
        faq.answer?.toLowerCase().includes(query) ||
        faq.id?.toString().includes(query)
      );
    })
    .map((faq) => {
      const isOutOfDate = faq.updated_at && faq.embedding_updated_at
        ? new Date(faq.updated_at) > new Date(faq.embedding_updated_at)
        : false;
      return { ...faq, isOutOfDate };
    })
    .sort((a, b) => {
      if (a.isOutOfDate && !b.isOutOfDate) return -1;
      if (!a.isOutOfDate && b.isOutOfDate) return 1;
      return 0;
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center gap-3 text-text-secondary">
          <SpinnerIcon />
          <span>Loading FAQs...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-2 sm:p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-text-primary mb-1 sm:mb-2">FAQ Embeddings</h1>
          <p className="text-sm sm:text-base text-text-secondary">Manage and refresh FAQ embeddings</p>
        </div>

        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-text-primary">Embeddings</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {filteredFaqs.filter(faq => faq.isOutOfDate).length > 0 && (
                  <button
                    onClick={refreshOutdatedEmbeddings}
                    disabled={refreshingEmbedding === 'outdated' || refreshingEmbedding === 'all'}
                    className="px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-lg bg-accent/20 text-accent border border-accent/30 font-semibold hover:bg-accent/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                  >
                    {refreshingEmbedding === 'outdated' ? (
                      <>
                        <SpinnerIcon />
                        <span>Refreshing Outdated...</span>
                      </>
                    ) : (
                      <>
                        Refresh Outdated ({filteredFaqs.filter(faq => faq.isOutOfDate).length})
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={refreshAllEmbeddings}
                  disabled={refreshingEmbedding === 'all' || refreshingEmbedding === 'outdated'}
                  className="px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-lg bg-primary text-background font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {refreshingEmbedding === 'all' ? (
                    <>
                      <SpinnerIcon />
                      <span>Refreshing All...</span>
                    </>
                  ) : (
                    'Refresh All Embeddings'
                  )}
                </button>
              </div>
            </div>

            <div className="mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search FAQs..."
                className="w-full px-4 py-2 rounded-lg bg-surface-light border border-border text-text-primary focus:outline-none focus:ring-2 focus:ring-primary text-sm sm:text-base"
              />
            </div>

            <div className="space-y-3 sm:space-y-4 max-h-[600px] overflow-y-auto">
              {filteredFaqs.length === 0 ? (
                <div className="text-center py-12 text-text-secondary">
                  <p className="text-lg mb-2">No FAQs found</p>
                  <p className="text-sm">{searchQuery ? 'Try a different search term' : 'No FAQs in the database'}</p>
                </div>
              ) : (
                filteredFaqs.map((faq) => {
                  const hasEmbedding = faq.embedding && Array.isArray(faq.embedding) && faq.embedding.length > 0;
                  const embeddingDim = hasEmbedding ? faq.embedding.length : 0;
                  const isRefreshing = refreshingEmbedding === faq.id;

                  return (
                    <div
                      key={faq.id}
                      className={`bg-surface-light rounded-lg border p-4 sm:p-5 hover:border-primary/30 transition-colors ${
                        faq.isOutOfDate ? 'border-accent/50' : 'border-border'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            {faq.isOutOfDate && (
                              <span className="text-xs sm:text-sm font-semibold text-accent bg-accent/10 px-2 py-1 rounded">
                                Out of Date
                              </span>
                            )}
                            <span className="text-xs sm:text-sm font-semibold text-primary bg-primary/10 px-2 py-1 rounded">
                              FAQ #{faq.id}
                            </span>
                            {hasEmbedding ? (
                              <span className="text-xs sm:text-sm text-text-secondary bg-green-500/10 text-green-500 px-2 py-1 rounded">
                                {embeddingDim} dimensions
                              </span>
                            ) : (
                              <span className="text-xs sm:text-sm text-text-secondary bg-accent/10 text-accent px-2 py-1 rounded">
                                No embedding
                              </span>
                            )}
                          </div>
                          <h3 className="text-base sm:text-lg font-semibold text-text-primary mb-2 break-words">
                            {faq.question || 'No question'}
                          </h3>
                          <p className="text-sm sm:text-base text-text-secondary line-clamp-2 break-words">
                            {faq.answer || 'No answer'}
                          </p>
                        </div>
                        <button
                          onClick={() => refreshSingleEmbedding(faq.id)}
                          disabled={isRefreshing}
                          className="px-3 sm:px-4 py-2 text-xs sm:text-sm rounded-lg bg-primary text-background font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0"
                          title="Refresh embedding for this FAQ"
                        >
                          {isRefreshing ? (
                            <>
                              <SpinnerIcon />
                              <span className="hidden sm:inline">Refreshing...</span>
                            </>
                          ) : (
                            <span>Refresh</span>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmbeddingsPage;

