import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

interface CollapsibleProps {
  title: string;
  defaultOpen?: boolean;
  children: ComponentChildren;
}

export function Collapsible({
  title,
  defaultOpen = false,
  children,
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div class={`collapsible ${open ? 'collapsible--open' : ''}`}>
      <button
        class="collapsible-header"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span class="collapsible-arrow">{open ? '\u25BC' : '\u25B6'}</span>
        <span class="collapsible-title">{title}</span>
      </button>
      {open && <div class="collapsible-body">{children}</div>}
    </div>
  );
}
