import { toasts, removeToast } from '../../services/toast.service';

export function ToastContainer() {
  const items = toasts.value;
  if (items.length === 0) return null;

  return (
    <div class="toast-container">
      {items.map((t) => (
        <div key={t.id} class={`toast toast--${t.severity}`}>
          <span class="toast-message">{t.message}</span>
          <button
            class="toast-dismiss"
            onClick={() => removeToast(t.id)}
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
