



import React, { useState } from 'react';
import type { Media } from '../types';
import { api } from '../lib/apiClient';
import { PlusIcon, TrashIcon, SearchIcon, VideoIcon, ImageIcon, DragHandleIcon, SpinnerIcon, EditIcon } from '../components/icons';

interface MediaLibraryPageProps {
  media: Media[];
  refreshData: () => void;
  loading: boolean;
  showToast: (message: string, type: 'success' | 'error') => void;
}

const MediaModal = ({ item, onClose, refreshData, showToast }: { item: Partial<Media> | null, onClose: () => void, refreshData: () => void, showToast: (message: string, type: 'success' | 'error') => void }) => {
    const [title, setTitle] = useState(item?.title || '');
    const [url, setUrl] = useState(item?.url || '');
    const [type, setType] = useState<'video' | 'image' | 'document'>(item?.type || 'video');
    const [keywords, setKeywords] = useState((item?.keywords || []).join(', '));
    const [isSaving, setIsSaving] = useState(false);
    const isEditing = !!item?.id;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        const keywordsArray = keywords.split(',').map(k => k.trim()).filter(Boolean);
        const mediaData = { title, url, type, keywords: keywordsArray };
        try {
            if (isEditing && item?.id) {
                await api.updateMedia(item.id, mediaData);
            } else {
                await api.createMedia(mediaData);
            }
            refreshData();
            onClose();
        } catch (error: any) {
            console.error("Error saving media:", error);
            showToast(`Error saving media: ${error.message || 'Unknown error'}`, 'error');
        }
        setIsSaving(false);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-surface rounded-lg shadow-xl p-8 w-full max-w-2xl border border-border" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-6">{isEditing ? 'Edit Media' : 'Add New Media'}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">Title</label>
                        <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-surface-light border border-border rounded-md py-2 px-4 focus:outline-none focus:ring-2 focus:ring-primary" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">URL</label>
                        <input type="url" value={url} onChange={e => setUrl(e.target.value)} className="w-full bg-surface-light border border-border rounded-md py-2 px-4 focus:outline-none focus:ring-2 focus:ring-primary" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">Type</label>
                        <select value={type} onChange={e => setType(e.target.value as any)} className="w-full bg-surface-light border border-border rounded-md py-2 px-4 focus:outline-none focus:ring-2 focus:ring-primary">
                            <option value="video">Video</option>
                            <option value="image">Image</option>
                            <option value="document">Document</option>
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">Keywords (comma-separated)</label>
                        <input type="text" value={keywords} onChange={e => setKeywords(e.target.value)} className="w-full bg-surface-light border border-border rounded-md py-2 px-4 focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    <div className="flex justify-end gap-4 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-md bg-surface-light hover:opacity-80 transition-opacity">Cancel</button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 rounded-md bg-primary text-background font-bold hover:bg-primary-hover transition-colors flex items-center gap-2 disabled:opacity-50">
                            {isSaving && <SpinnerIcon />}
                            {isSaving ? 'Saving...' : 'Save Media'}
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

const MediaCard: React.FC<{ item: Media; onEdit: () => void; onDelete: () => void }> = ({ item, onEdit, onDelete }) => (
  <div className="bg-surface rounded-lg p-4 flex flex-col border border-border transition-all hover:border-primary/50">
    <div className="flex justify-between gap-3">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-surface-light text-primary flex-shrink-0">
          {item.type === 'video' && <VideoIcon className="w-7 h-7" />}
          {item.type === 'image' && <ImageIcon className="w-7 h-7" />}
          {item.type === 'document' && <VideoIcon className="w-7 h-7" />}
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-text-primary text-sm truncate">{item.title}</h3>
          <p className="text-[11px] text-text-secondary/70 mt-1">
            {new Date(item.created_at).toLocaleString()}
          </p>
        </div>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-full text-text-secondary hover:text-primary hover:bg-surface-light transition-colors"
        >
          <EditIcon />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-full text-text-secondary hover:text-accent hover:bg-surface-light transition-colors"
        >
          <TrashIcon />
        </button>
      </div>
    </div>

    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 text-xs text-secondary hover:underline break-all"
    >
      {item.url}
    </a>

    {item.keywords.length > 0 && (
      <div className="mt-4 flex flex-wrap gap-2">
        {item.keywords.map(keyword => (
          <span
            key={keyword}
            className="text-xs bg-surface-light text-text-secondary px-2 py-1 rounded-full"
          >
            {keyword}
          </span>
        ))}
      </div>
    )}
  </div>
);


const MediaLibraryPage: React.FC<MediaLibraryPageProps> = ({ media, refreshData, loading, showToast }) => {
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<Partial<Media> | null>(null);
  const [deleteModalState, setDeleteModalState] = useState<{ isOpen: boolean; mediaId: number | null; isDeleteAll: boolean; }>({ isOpen: false, mediaId: null, isDeleteAll: false });

  const openMediaModal = (item: Partial<Media> | null = null) => {
    setSelectedMedia(item);
    setIsMediaModalOpen(true);
  };
  
  const closeMediaModal = () => {
    setSelectedMedia(null);
    setIsMediaModalOpen(false);
  };
  
    const handleDelete = async (mediaId: number) => {
      try {
        await api.deleteMedia(mediaId);
        showToast('Media item deleted successfully.', 'success');
        refreshData();
      } catch (error: any) {
        console.error("Error deleting media:", error);
        showToast(`Failed to delete media: ${error.message || 'Unknown error'}`, 'error');
      }
      closeDeleteModal();
    };
  
    const handleDeleteAll = async () => {
      try {
        await api.deleteAllMedia();
        showToast('All media items have been deleted.', 'success');
        refreshData();
      } catch (error: any) {
        console.error("Error deleting all media:", error);
        showToast(`Failed to delete all media: ${error.message || 'Unknown error'}`, 'error');
      }
      closeDeleteModal();
    };

  const openDeleteModal = (mediaId: number) => setDeleteModalState({ isOpen: true, mediaId, isDeleteAll: false });
  const openDeleteAllModal = () => setDeleteModalState({ isOpen: true, mediaId: null, isDeleteAll: true });
  const closeDeleteModal = () => setDeleteModalState({ isOpen: false, mediaId: null, isDeleteAll: false });

  return (
    <div className="p-4 md:p-8 bg-background text-text-primary">
      {isMediaModalOpen && <MediaModal item={selectedMedia} onClose={closeMediaModal} refreshData={refreshData} showToast={showToast} />}
      <ConfirmDeleteModal
        isOpen={deleteModalState.isOpen}
        onClose={closeDeleteModal}
        onConfirm={() => {
          if (deleteModalState.isDeleteAll) {
            handleDeleteAll();
          } else if (deleteModalState.mediaId) {
            handleDelete(deleteModalState.mediaId);
          }
        }}
        title={deleteModalState.isDeleteAll ? "Delete All Media?" : "Delete Media?"}
        message={deleteModalState.isDeleteAll ? `Are you sure you want to delete all ${media.length} media items? This is irreversible.` : "Are you sure you want to permanently delete this media item?"}
      />
      <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
        <div>
            <h2 className="text-2xl font-bold">Media Library ({media.length})</h2>
            <p className="text-text-secondary">Manage your images and videos</p>
        </div>
        <div className="flex gap-2 self-start md:self-center">
            <button onClick={() => openMediaModal(null)} className="bg-primary text-background font-bold px-4 py-2 rounded-md hover:bg-primary-hover transition-colors flex items-center gap-2 text-sm"><PlusIcon /> Add Media</button>
            {media.length > 0 && (
                <button onClick={openDeleteAllModal} className="bg-accent text-white px-4 py-2 rounded-md hover:bg-accent-hover transition-colors flex items-center gap-2 text-sm font-semibold"><TrashIcon /> Delete All</button>
            )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
         {loading ? (
            <div className="col-span-full flex justify-center items-center py-16">
                <SpinnerIcon />
                <span className="ml-2">Loading Media...</span>
            </div>
        ) : media.length > 0 ? (
            media.map(item => (
                <MediaCard key={item.id} item={item} onEdit={() => openMediaModal(item)} onDelete={() => openDeleteModal(item.id)} />
            ))
        ) : (
            <div className="col-span-full text-center py-16 bg-surface rounded-lg border border-border">
                <h3 className="text-xl font-semibold">Your Media Library is Empty</h3>
                <p className="text-text-secondary mt-2">Click "Add Media" to upload your first item.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default MediaLibraryPage;
