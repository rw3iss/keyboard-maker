import type { ComponentChildren } from 'preact';

interface EmptyStateProps {
  /** Optional icon shown in a circle above the title (unicode or JSX) */
  icon?: ComponentChildren;
  /** Primary heading */
  title?: string;
  /** Supporting message text */
  message?: string | ComponentChildren;
  /** Optional action buttons rendered below the message */
  actions?: ComponentChildren;
  /** Visual density */
  variant?: 'default' | 'compact' | 'inline';
  /** Extra class names */
  className?: string;
}

/**
 * Shared empty/loading/error state placeholder.
 *
 * Use for:
 * - "No data yet" screens (Build output before first build)
 * - "No project open" splash (Overview)
 * - "No results match filters" list states
 * - Error states with a retry action
 *
 * Replaces the repeated `padding:40px;text-align:center;color:var(--text-muted)`
 * pattern found across views.
 */
export function EmptyState({
  icon,
  title,
  message,
  actions,
  variant = 'default',
  className,
}: EmptyStateProps) {
  const classes = [
    'empty-state-wrap',
    `empty-state-wrap--${variant}`,
    className || '',
  ].filter(Boolean).join(' ');

  return (
    <div class={classes}>
      {icon && <div class="empty-state-icon">{icon}</div>}
      {title && <h3 class="empty-state-title">{title}</h3>}
      {message && <p class="empty-state-message">{message}</p>}
      {actions && <div class="empty-state-actions">{actions}</div>}
    </div>
  );
}
