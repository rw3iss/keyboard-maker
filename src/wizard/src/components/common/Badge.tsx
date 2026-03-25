import type { ComponentChildren } from 'preact';

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'error';
  children: ComponentChildren;
}

export function Badge({ variant = 'default', children }: BadgeProps) {
  return <span class={`badge badge--${variant}`}>{children}</span>;
}
