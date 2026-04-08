import { useEffect, useRef, useState, useMemo } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

export interface DropdownCustomOption {
  /** Option value (what gets passed to onChange) */
  value: string;
  /** Label shown in the list and in the trigger when selected */
  label: string;
  /** Optional secondary description shown under the label */
  description?: string;
  /** Optional icon / leading node */
  icon?: ComponentChildren;
  /** Optional badge shown at the end of the row */
  badge?: string;
  /** Optional group name — options with the same group are rendered under a heading */
  group?: string;
  /** Mark the option as disabled */
  disabled?: boolean;
  /** Extra data kept alongside for custom matching. Not rendered. */
  meta?: Record<string, unknown>;
}

interface DropdownCustomProps {
  /** Current selected value */
  value: string;
  /** Option list */
  options: DropdownCustomOption[];
  /** Called when the user picks an option */
  onChange: (value: string, option: DropdownCustomOption) => void;
  /** Label above the trigger */
  label?: string;
  /** Placeholder text when nothing is selected */
  placeholder?: string;
  /** Enable fuzzy search filtering */
  searchable?: boolean;
  /** Search input placeholder */
  searchPlaceholder?: string;
  /** Disable the whole control */
  disabled?: boolean;
  /** Optional width override */
  width?: string | number;
  /** Optional extra class name */
  className?: string;
}

/**
 * Custom dropdown with search, grouping, icons, descriptions, and badges.
 *
 * Additive — does not replace the existing native `<Dropdown>`.
 * Use this when the native `<select>` isn't rich enough: component
 * pickers, theme switchers, tagged option lists, etc.
 *
 * Keyboard support:
 *   - Enter / Space to open
 *   - Arrow Up/Down to navigate
 *   - Enter to select
 *   - Escape to close
 *   - Typing with searchable=true filters the list
 */
export function DropdownCustom({
  value,
  options,
  onChange,
  label,
  placeholder = 'Select...',
  searchable = false,
  searchPlaceholder = 'Search...',
  disabled,
  width,
  className,
}: DropdownCustomProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState<number>(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Filter options based on search query
  const visible = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) =>
      o.label.toLowerCase().includes(q) ||
      (o.description ?? '').toLowerCase().includes(q) ||
      (o.badge ?? '').toLowerCase().includes(q)
    );
  }, [options, query, searchable]);

  // Group options under headings
  const grouped = useMemo(() => {
    const result: Array<{ group: string | null; items: DropdownCustomOption[] }> = [];
    const map = new Map<string | null, DropdownCustomOption[]>();
    for (const opt of visible) {
      const key = opt.group ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(opt);
    }
    for (const [group, items] of map.entries()) {
      result.push({ group, items });
    }
    return result;
  }, [visible]);

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Focus search input when opened
  useEffect(() => {
    if (open && searchable) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, searchable]);

  // Reset highlight when list changes
  useEffect(() => {
    if (!open) {
      setHighlight(-1);
      setQuery('');
      return;
    }
    const idx = visible.findIndex((o) => o.value === value);
    setHighlight(idx >= 0 ? idx : 0);
  }, [open, visible, value]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => {
        let next = h + 1;
        while (next < visible.length && visible[next].disabled) next++;
        return next >= visible.length ? h : next;
      });
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => {
        let next = h - 1;
        while (next >= 0 && visible[next].disabled) next--;
        return next < 0 ? h : next;
      });
      return;
    }
    if (e.key === 'Enter' && highlight >= 0 && highlight < visible.length) {
      e.preventDefault();
      const opt = visible[highlight];
      if (!opt.disabled) {
        onChange(opt.value, opt);
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
  };

  const handleSelect = (opt: DropdownCustomOption) => {
    if (opt.disabled) return;
    onChange(opt.value, opt);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const classes = [
    'dropdown-custom',
    open ? 'dropdown-custom--open' : '',
    disabled ? 'dropdown-custom--disabled' : '',
    className || '',
  ].filter(Boolean).join(' ');

  const style: Record<string, string> = {};
  if (width != null) style.width = typeof width === 'number' ? `${width}px` : width;

  return (
    <div class={classes} ref={rootRef} style={style} onKeyDown={handleKeyDown}>
      {label && <label class="dropdown-custom-label">{label}</label>}
      <button
        ref={triggerRef}
        type="button"
        class="dropdown-custom-trigger"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selectedOption ? (
          <span class="dropdown-custom-value">
            {selectedOption.icon && <span class="dropdown-custom-icon">{selectedOption.icon}</span>}
            <span>{selectedOption.label}</span>
          </span>
        ) : (
          <span class="dropdown-custom-placeholder">{placeholder}</span>
        )}
        <span class="dropdown-custom-arrow" aria-hidden="true">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && (
        <div class="dropdown-custom-menu" role="listbox">
          {searchable && (
            <div class="dropdown-custom-search-wrap">
              <input
                ref={searchRef}
                class="dropdown-custom-search"
                type="text"
                value={query}
                placeholder={searchPlaceholder}
                onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
              />
            </div>
          )}
          <div class="dropdown-custom-list">
            {visible.length === 0 && (
              <div class="dropdown-custom-empty">No matches</div>
            )}
            {grouped.map((group, gi) => (
              <div key={`${group.group ?? 'no-group'}-${gi}`} class="dropdown-custom-group">
                {group.group && <div class="dropdown-custom-group-heading">{group.group}</div>}
                {group.items.map((opt) => {
                  const idx = visible.indexOf(opt);
                  const isSelected = opt.value === value;
                  const isHighlight = idx === highlight;
                  const itemClasses = [
                    'dropdown-custom-item',
                    isSelected ? 'dropdown-custom-item--selected' : '',
                    isHighlight ? 'dropdown-custom-item--highlight' : '',
                    opt.disabled ? 'dropdown-custom-item--disabled' : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <div
                      key={opt.value}
                      class={itemClasses}
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setHighlight(idx)}
                      onClick={() => handleSelect(opt)}
                    >
                      {opt.icon && <span class="dropdown-custom-icon">{opt.icon}</span>}
                      <div class="dropdown-custom-item-body">
                        <div class="dropdown-custom-item-label">{opt.label}</div>
                        {opt.description && (
                          <div class="dropdown-custom-item-description">{opt.description}</div>
                        )}
                      </div>
                      {opt.badge && <span class="dropdown-custom-badge">{opt.badge}</span>}
                      {isSelected && <span class="dropdown-custom-check" aria-hidden="true">{'\u2713'}</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
