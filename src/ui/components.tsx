import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { RESOURCE_INFO, getSpecies } from '../engine/data';
import type { Resource, ResourceBag } from '../engine/types';
import { RESOURCES } from '../engine/types';

export function spriteUrl(speciesId: number): string {
  return `${import.meta.env.BASE_URL}assets/pokemon/${speciesId}.png`;
}

export function Sprite({
  speciesId,
  size = 48,
  className = ''
}: {
  speciesId: number;
  size?: number;
  className?: string;
}): JSX.Element {
  const species = getSpecies(speciesId);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [speciesId]);
  if (failed) {
    return (
      <span
        className={`sprite sprite-fallback ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
        role="img"
        aria-label={species.name}
      >
        {species.name.slice(0, 1)}
      </span>
    );
  }
  return (
    <img
      className={`sprite ${className}`}
      src={spriteUrl(speciesId)}
      width={size}
      height={size}
      alt={species.name}
      title={species.name}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

export function ResourceChip({
  resource,
  count,
  compact = false,
  muted = false
}: {
  resource: Resource;
  count?: number;
  compact?: boolean;
  muted?: boolean;
}): JSX.Element {
  const info = RESOURCE_INFO[resource];
  return (
    <span
      className={`resource-chip ${compact ? 'compact' : ''} ${muted ? 'muted' : ''}`}
      style={{ '--resource-color': info.color } as CSSProperties}
      title={info.name}
    >
      <span className="resource-mark" aria-hidden="true">
        {info.short.slice(0, 1)}
      </span>
      {!compact && <span className="resource-name">{info.short}</span>}
      {count !== undefined && <span className="resource-count">{count}</span>}
    </span>
  );
}

export function ResourceRow({ bag, compact = false }: { bag: ResourceBag; compact?: boolean }): JSX.Element {
  return (
    <div className="resource-row">
      {RESOURCES.map((resource) => (
        <ResourceChip key={resource} resource={resource} count={bag[resource]} compact={compact} muted={bag[resource] === 0} />
      ))}
    </div>
  );
}

export function Cost({ cost }: { cost: Partial<ResourceBag> }): JSX.Element {
  return (
    <span className="cost">
      {RESOURCES.filter((resource) => (cost[resource] ?? 0) > 0).map((resource) => (
        <ResourceChip key={resource} resource={resource} count={cost[resource]} compact />
      ))}
    </span>
  );
}

const DIE_PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8]
};

export function Die({ value, rolling = false }: { value: number | null; rolling?: boolean }): JSX.Element {
  const pips = value === null ? [] : DIE_PIPS[value] ?? [];
  return (
    <span className={`die ${rolling ? 'rolling' : ''}`} aria-label={value === null ? 'Dado sin lanzar' : `Dado ${value}`}>
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} className={pips.includes(index) ? 'pip on' : 'pip'} />
      ))}
    </span>
  );
}

export function Modal({
  title,
  children,
  onClose,
  dismissible = true,
  wide = false,
  className = ''
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  dismissible?: boolean;
  wide?: boolean;
  className?: string;
}): JSX.Element {
  useEffect(() => {
    if (!dismissible || !onClose) return;
    const listener = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [dismissible, onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        className={`modal ${wide ? 'modal-wide' : ''} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          {dismissible && onClose && (
            <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar">
              X
            </button>
          )}
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }): JSX.Element {
  return (
    <div className="section-title">
      <h3>{children}</h3>
      {hint && <span>{hint}</span>}
    </div>
  );
}
