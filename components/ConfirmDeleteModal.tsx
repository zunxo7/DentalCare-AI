import React from 'react';

interface ConfirmDeleteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
}

const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({ isOpen, onClose, onConfirm, title, message }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-surface rounded-xl border border-border max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="p-6">
                    <h3 className="text-lg font-semibold text-text-primary mb-2">{title}</h3>
                    <p className="text-sm text-text-secondary mb-6">{message}</p>
                    <div className="flex gap-3 justify-end">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm rounded-lg bg-surface-light text-text-primary border border-border font-semibold hover:bg-surface-hover transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onConfirm}
                            className="px-4 py-2 text-sm rounded-lg bg-accent text-white font-semibold hover:bg-accent-hover transition-colors"
                        >
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDeleteModal;
