import { useEffect } from 'react';
import ReactDOM from 'react-dom';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={`relative bg-white rounded-lg shadow-xl w-full ${sizeClasses[size]} max-h-[90vh] flex flex-col`}
      >
        <div className="px-6 py-4 border-b flex justify-between items-center flex-shrink-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-4"
          >
            &times;
          </button>
        </div>
        <div className="px-6 py-4 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
