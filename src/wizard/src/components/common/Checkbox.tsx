import type { JSX, ComponentChildren } from 'preact';

interface CheckboxProps {
  /** Current checked state */
  checked: boolean;
  /** Called with the new checked value when the user toggles */
  onChange: (checked: boolean) => void;
  /** Primary label text shown next to the box */
  label?: string | ComponentChildren;
  /** Optional secondary description shown under the label */
  description?: string | ComponentChildren;
  /** Disable the checkbox */
  disabled?: boolean;
  /** "switch" variant (for on/off style toggles) — visual only */
  variant?: 'default' | 'switch';
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Extra class names */
  className?: string;
  /** HTML id for label association */
  id?: string;
}

/**
 * Shared checkbox primitive.
 *
 * Wraps a native `<input type="checkbox">` with a label and optional
 * description slot. Use this instead of hand-rolling checkbox+label
 * flex rows with inline styles across the app.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
  variant = 'default',
  size = 'md',
  className,
  id,
}: CheckboxProps) {
  const handleChange = (e: JSX.TargetedEvent<HTMLInputElement>) => {
    onChange(e.currentTarget.checked);
  };

  const classes = [
    'checkbox-field',
    `checkbox-field--${variant}`,
    `checkbox-field--${size}`,
    disabled ? 'checkbox-field--disabled' : '',
    description ? 'checkbox-field--with-description' : '',
    className || '',
  ].filter(Boolean).join(' ');

  return (
    <label class={classes} htmlFor={id}>
      <input
        class="checkbox-input"
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={handleChange}
      />
      <div class="checkbox-body">
        {label && <div class="checkbox-label">{label}</div>}
        {description && <div class="checkbox-description">{description}</div>}
      </div>
    </label>
  );
}
