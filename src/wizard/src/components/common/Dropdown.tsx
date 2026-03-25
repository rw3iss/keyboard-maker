interface DropdownOption {
  label: string;
  value: string;
}

interface DropdownProps {
  label?: string;
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function Dropdown({
  label,
  options,
  value,
  onChange,
  placeholder,
  disabled,
}: DropdownProps) {
  return (
    <div class="dropdown-field">
      {label && <label class="dropdown-label">{label}</label>}
      <select
        class="dropdown-select"
        value={value}
        onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
        disabled={disabled}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
