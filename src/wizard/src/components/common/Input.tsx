import type { JSX, ComponentChildren } from 'preact';

interface InputProps {
  /** Input type — defaults to "text" */
  type?: 'text' | 'number' | 'email' | 'password' | 'search' | 'url' | 'tel';
  /** Visible label above the input */
  label?: string;
  /** Current value */
  value: string | number;
  /** Called on every input event */
  onInput?: (value: string) => void;
  /** Called when the input loses focus */
  onBlur?: (value: string) => void;
  /** Called on Enter key */
  onEnter?: () => void;
  /** Placeholder text */
  placeholder?: string;
  /** Short helper text shown below the input */
  hint?: string;
  /** Error message (takes precedence over hint and adds error styling) */
  error?: string;
  /** Disable the input */
  disabled?: boolean;
  /** Mark the field as required (purely visual for now) */
  required?: boolean;
  /** Autofocus on mount */
  autofocus?: boolean;
  /** Native min/max/step for number inputs */
  min?: number;
  max?: number;
  step?: number;
  /** Visual size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Inline content rendered before the input (icon etc.) */
  prefix?: ComponentChildren;
  /** Inline content rendered after the input (unit label etc.) */
  suffix?: ComponentChildren;
  /** Width of the field */
  width?: string | number;
  /** Extra class names to pass through */
  className?: string;
  /** HTML id attribute */
  id?: string;
  /** Pass through any additional native attributes */
  name?: string;
  autoComplete?: string;
}

/**
 * Shared text/number input primitive.
 *
 * Replaces the native `<input>` + inline styles pattern scattered
 * across the app. Supports labels, hints, error states, prefix/suffix
 * slots, and size variants. Values are always passed as strings so
 * consumers can decide how to parse them.
 */
export function Input({
  type = 'text',
  label,
  value,
  onInput,
  onBlur,
  onEnter,
  placeholder,
  hint,
  error,
  disabled,
  required,
  autofocus,
  min,
  max,
  step,
  size = 'md',
  prefix,
  suffix,
  width,
  className,
  id,
  name,
  autoComplete,
}: InputProps) {
  const handleInput = (e: JSX.TargetedEvent<HTMLInputElement>) => {
    onInput?.(e.currentTarget.value);
  };
  const handleBlur = (e: JSX.TargetedEvent<HTMLInputElement>) => {
    onBlur?.(e.currentTarget.value);
  };
  const handleKeyDown = (e: KeyboardEvent) => {
    if (onEnter && e.key === 'Enter') {
      onEnter();
    }
  };

  const classes = [
    'input-field',
    `input-field--${size}`,
    error ? 'input-field--error' : '',
    disabled ? 'input-field--disabled' : '',
    className || '',
  ].filter(Boolean).join(' ');

  return (
    <div class={classes} style={width ? { width: typeof width === 'number' ? `${width}px` : width } : undefined}>
      {label && (
        <label class="input-label" htmlFor={id}>
          {label}
          {required && <span class="input-required"> *</span>}
        </label>
      )}
      <div class="input-wrap">
        {prefix && <span class="input-affix input-affix--prefix">{prefix}</span>}
        <input
          class="input-control"
          id={id}
          name={name}
          type={type}
          value={value as any}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autofocus={autofocus}
          min={min}
          max={max}
          step={step}
          autoComplete={autoComplete}
          onInput={handleInput}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        {suffix && <span class="input-affix input-affix--suffix">{suffix}</span>}
      </div>
      {error ? (
        <div class="input-message input-message--error">{error}</div>
      ) : hint ? (
        <div class="input-message input-message--hint">{hint}</div>
      ) : null}
    </div>
  );
}
