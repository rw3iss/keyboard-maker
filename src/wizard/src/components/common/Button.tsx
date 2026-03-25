import type { ComponentChildren } from 'preact';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  onClick?: (e: MouseEvent) => void;
  type?: string;
  children: ComponentChildren;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  onClick,
  type,
  children,
}: ButtonProps) {
  return (
    <button
      class={`btn btn-${variant} btn-${size}`}
      disabled={disabled || loading}
      onClick={onClick}
      type={type}
    >
      {loading && <span class="spinner spinner--inline" />}
      {children}
    </button>
  );
}
