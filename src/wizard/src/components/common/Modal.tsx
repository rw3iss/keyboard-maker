import { useEffect, useRef, useState, useLayoutEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

interface ModalProps {
  /** Modal heading text */
  title: string;
  /** Called when the user closes via ESC, backdrop click, or close button */
  onClose: () => void;
  /** Action buttons rendered in the modal footer */
  actions?: Array<{
    label: string;
    variant?: 'primary' | 'secondary' | 'danger';
    onClick: () => void;
  }>;
  /** Size variant. Defaults to `md` (existing behavior). */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Optional class name for custom tweaks */
  className?: string;
  /** Hide the close (×) button */
  hideClose?: boolean;
  /** Disable closing on backdrop click */
  disableBackdropClose?: boolean;
  children: ComponentChildren;
}

/**
 * Shared modal dialog.
 *
 * Adds a `size` prop (sm/md/lg/xl) so larger content like part
 * details or build settings can avoid bypassing the component.
 * When the body is scrollable a top/bottom mask shadow hints at
 * the overflow.
 */
export function Modal({
  title,
  onClose,
  actions,
  size = 'md',
  className,
  hideClose,
  disableBackdropClose,
  children,
}: ModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Detect whether the body content overflows so we can show a
  // scroll-shadow hint via CSS mask.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const check = () => setScrollable(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [children]);

  const handleBackdrop = (e: MouseEvent) => {
    if (disableBackdropClose) return;
    if (e.target === backdropRef.current) onClose();
  };

  const cardClasses = [
    'modal-card',
    `modal-card--${size}`,
    className || '',
  ].filter(Boolean).join(' ');

  const bodyClasses = ['modal-body', scrollable ? 'modal-body--scrollable' : ''].filter(Boolean).join(' ');

  return (
    <div class="modal-backdrop" ref={backdropRef} onClick={handleBackdrop} role="dialog" aria-modal="true" aria-label={title}>
      <div class={cardClasses}>
        <div class="modal-header">
          <h3 class="modal-title">{title}</h3>
          {!hideClose && (
            <button class="modal-close" onClick={onClose} aria-label="Close">
              &times;
            </button>
          )}
        </div>
        <div class={bodyClasses} ref={bodyRef}>{children}</div>
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
