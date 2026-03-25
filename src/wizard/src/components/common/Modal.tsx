import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

interface ModalProps {
  title: string;
  onClose: () => void;
  actions?: Array<{
    label: string;
    variant?: 'primary' | 'secondary' | 'danger';
    onClick: () => void;
  }>;
  children: ComponentChildren;
}

export function Modal({ title, onClose, actions, children }: ModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleBackdrop = (e: MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  return (
    <div class="modal-backdrop" ref={backdropRef} onClick={handleBackdrop}>
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="modal-title">{title}</h3>
          <button class="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div class="modal-body">{children}</div>
        {actions && actions.length > 0 && (
          <div class="modal-actions">
            {actions.map((a) => (
              <button
                key={a.label}
                class={`btn btn-${a.variant || 'secondary'}`}
                onClick={a.onClick}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
