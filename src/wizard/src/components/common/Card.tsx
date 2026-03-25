import type { ComponentChildren } from 'preact';

interface CardProps {
  title?: string;
  description?: string;
  onClick?: () => void;
  selected?: boolean;
  badge?: string;
  image?: string;
  children?: ComponentChildren;
}

export function Card({
  title,
  description,
  onClick,
  selected,
  badge,
  image,
  children,
}: CardProps) {
  return (
    <div
      class={`card ${selected ? 'card--selected' : ''} ${onClick ? 'card--clickable' : ''}`}
      onClick={onClick}
    >
      {image && (
        <div class="card-image">
          <img src={image} alt={title || ''} />
        </div>
      )}
      <div class="card-content">
        {(title || badge) && (
          <div class="card-header">
            {title && <h4 class="card-title">{title}</h4>}
            {badge && <span class="badge">{badge}</span>}
          </div>
        )}
        {description && <p class="card-description">{description}</p>}
        {children}
      </div>
    </div>
  );
}
