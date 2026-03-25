import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { apiGet } from '../services/api.service';
import { addToast } from '../services/toast.service';
import { currentProject, projectConfig } from '../state/app.state';
import { Button } from '../components/common/Button';
import { Spinner } from '../components/common/Spinner';
import { Badge } from '../components/common/Badge';

interface Supplier {
  name: string;
  url: string;
  partNumber?: string;
  priceUsd?: number;
}

interface ExternalLink {
  label: string;
  url: string;
}

interface PartData {
  id: string;
  name: string;
  manufacturer?: string;
  description?: string;
  summary?: string;
  features?: string[];
  concerns?: string[];
  datasheet?: string;
  externalLinks?: ExternalLink[];
  specs?: Record<string, any>;
  designNotes?: string[] | string;
  suppliers?: Supplier[];
  [key: string]: any;
}

interface PartDetailProps {
  category?: string;
  id?: string;
}

// Keys that are displayed in dedicated sections or are not spec-like
const NON_SPEC_KEYS = new Set([
  'id', 'name', 'manufacturer', 'description', 'summary',
  'features', 'concerns', 'datasheet', 'externalLinks',
  'specs', 'designNotes', 'suppliers', 'variants',
  'gpioPins', 'pinout', 'externalComponents', 'package',
  'commonResistorValues',
]);

/** Prettify a camelCase or snake_case key into a readable label */
function formatKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format a value for display in the specs table */
function formatValue(value: any): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') {
    // Handle objects with unit field like { min: 4.35, max: 6.4, unit: "V" }
    const keys = Object.keys(value);
    if ('unit' in value) {
      const parts: string[] = [];
      if ('min' in value && 'max' in value) {
        parts.push(`${value.min}–${value.max} ${value.unit}`);
      } else if ('typical' in value) {
        parts.push(`${value.typical} ${value.unit}`);
        if ('min' in value) parts.push(`(min ${value.min})`);
        if ('max' in value) parts.push(`(max ${value.max})`);
      } else if ('value' in value) {
        parts.push(`${value.value} ${value.unit}`);
      } else if ('nominal' in value) {
        parts.push(`${value.nominal} ${value.unit} nominal`);
        if ('fullCharge' in value) parts.push(`(${value.fullCharge} full)`);
        if ('cutoff' in value) parts.push(`(${value.cutoff} cutoff)`);
      } else if ('width' in value) {
        const d = value;
        const dims = [d.width, d.length || d.depth, d.height || d.thickness].filter(Boolean);
        parts.push(`${dims.join(' x ')} ${value.unit}`);
      }
      if ('note' in value) parts.push(`— ${value.note}`);
      return parts.join(' ') || JSON.stringify(value);
    }
    // Handle { x, y } like switchSpacing
    if ('x' in value && 'y' in value && keys.length === 2) {
      return `${value.x} x ${value.y}`;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

/** Extract spec-like key/value pairs from the part data */
function extractSpecs(part: PartData): Array<[string, string]> {
  const specs: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(part)) {
    if (NON_SPEC_KEYS.has(key)) continue;
    if (typeof value === 'function') continue;
    specs.push([formatKey(key), formatValue(value)]);
  }
  return specs;
}

const sectionStyle = 'margin-bottom:28px';
const sectionHeaderStyle = 'margin:0 0 14px;font-size:17px;font-weight:600;color:var(--text-primary);border-bottom:1px solid var(--border);padding-bottom:8px';

export function PartDetail({ category, id }: PartDetailProps) {
  const [part, setPart] = useState<PartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!category || !id) return;
    setLoading(true);
    setError('');
    apiGet<PartData>(`/api/components/${category}/${id}`)
      .then(setPart)
      .catch((err) => {
        setError(err?.message || 'Failed to load part');
      })
      .finally(() => setLoading(false));
  }, [category, id]);

  const handleUseInProject = () => {
    if (!part || !currentProject.value) return;
    const config = projectConfig.value;
    if (!config) {
      addToast('No project configuration loaded', 'warning');
      return;
    }
    const updated = { ...config };
    if (category === 'switches') {
      updated.switches = { ...updated.switches, model: part.name };
    } else if (category === 'mcus') {
      updated.mcu = { ...updated.mcu, module: part.name };
    } else if (category === 'chargers') {
      updated.power = { ...updated.power, chargerIc: part.name };
    }
    projectConfig.value = updated;
    addToast(`Selected ${part.name} for project`, 'success');
  };

  if (loading) {
    return (
      <div style="display:flex;justify-content:center;padding:60px">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !part) {
    return (
      <div style="padding:40px;text-align:center;color:var(--text-muted)">
        {error || 'Part not found.'}
      </div>
    );
  }

  const specs = extractSpecs(part);
  const designNotes = Array.isArray(part.designNotes)
    ? part.designNotes
    : part.designNotes
      ? [part.designNotes]
      : [];

  return (
    <div style="padding:24px 28px;max-width:860px;margin:0 auto">
      {/* Back button — uses browser history to return to the exact config step */}
      <a
        href="#"
        onClick={(e) => { e.preventDefault(); history.back(); }}
        style="display:inline-flex;align-items:center;gap:6px;color:var(--accent);text-decoration:none;font-size:13px;margin-bottom:20px;cursor:pointer"
      >
        <span style="font-size:16px">&larr;</span> Back
      </a>

      {/* Header */}
      <div style="margin-bottom:28px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;flex-wrap:wrap">
          <h2 style="margin:0;font-size:26px">{part.name}</h2>
          {part.manufacturer && <Badge>{part.manufacturer}</Badge>}
          {category && (
            <span style="font-size:12px;padding:3px 10px;border-radius:var(--radius-sm);background:var(--bg-hover);color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">
              {category}
            </span>
          )}
        </div>
        {part.summary && (
          <p style="margin:8px 0 0;color:var(--text-muted);font-size:15px;line-height:1.5">{part.summary}</p>
        )}
        {part.description && !part.summary && (
          <p style="margin:8px 0 0;color:var(--text-muted);font-size:15px;line-height:1.5">{part.description}</p>
        )}
      </div>

      {/* Datasheet + Use in Project buttons */}
      <div style="display:flex;gap:10px;margin-bottom:28px;flex-wrap:wrap">
        {part.datasheet && (
          <a
            href={part.datasheet}
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-primary btn-md"
            style="text-decoration:none;display:inline-flex;align-items:center;gap:6px"
          >
            <span style="font-size:15px">&#128196;</span> View Datasheet
          </a>
        )}
        {currentProject.value && (
          <Button variant="secondary" onClick={handleUseInProject}>
            Use in Project
          </Button>
        )}
      </div>

      {/* Features */}
      {part.features && part.features.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={sectionHeaderStyle}>Features</h3>
          <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px">
            {part.features.map((f, i) => (
              <li key={i} style="display:flex;align-items:flex-start;gap:8px;font-size:14px;line-height:1.5">
                <span style="color:var(--success);font-weight:bold;flex-shrink:0;margin-top:1px">&#10003;</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Specifications */}
      {specs.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={sectionHeaderStyle}>Specifications</h3>
          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
            <table style="width:100%;border-collapse:collapse">
              <tbody>
                {specs.map(([key, value], i) => (
                  <tr key={i} style={i < specs.length - 1 ? 'border-bottom:1px solid var(--border)' : ''}>
                    <td style="padding:10px 14px;font-weight:600;width:40%;color:var(--text-muted);font-size:13px;vertical-align:top">
                      {key}
                    </td>
                    <td style="padding:10px 14px;font-size:13px;word-break:break-word">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Concerns */}
      {part.concerns && part.concerns.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={sectionHeaderStyle}>Concerns</h3>
          <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:6px">
            {part.concerns.map((c, i) => (
              <li key={i} style="display:flex;align-items:flex-start;gap:8px;font-size:14px;line-height:1.5">
                <span style="color:var(--warning);flex-shrink:0;margin-top:1px">&#9888;</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Design Notes */}
      {designNotes.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={sectionHeaderStyle}>Design Notes</h3>
          <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px">
            <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px">
              {designNotes.map((note, i) => (
                <li key={i} style="display:flex;align-items:flex-start;gap:8px;font-size:13px;line-height:1.6;color:var(--text-primary)">
                  <span style="color:var(--accent);flex-shrink:0">&#8226;</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Suppliers */}
      {part.suppliers && part.suppliers.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={sectionHeaderStyle}>Suppliers</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">
            {part.suppliers.map((s, i) => (
              <div
                key={i}
                style="display:flex;flex-direction:column;gap:8px;padding:14px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius)"
              >
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <strong style="font-size:14px">{s.name}</strong>
                  {s.priceUsd != null && (
                    <span style="color:var(--success);font-weight:600;font-size:14px">
                      ${s.priceUsd.toFixed(2)}
                    </span>
                  )}
                </div>
                {s.partNumber && (
                  <span style="color:var(--text-muted);font-size:12px">{s.partNumber}</span>
                )}
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="btn btn-secondary btn-sm"
                  style="text-decoration:none;text-align:center;margin-top:auto"
                >
                  View Listing &rarr;
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* External Links */}
      {part.externalLinks && part.externalLinks.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={sectionHeaderStyle}>External Links</h3>
          <div style="display:flex;flex-direction:column;gap:6px">
            {part.externalLinks.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);text-decoration:none;color:var(--text-primary);font-size:14px;transition:background 0.15s"
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)'; }}
              >
                <span style="color:var(--accent)">&#8599;</span>
                <span>{link.label}</span>
                <span style="margin-left:auto;color:var(--text-muted);font-size:12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                  {link.url.replace(/^https?:\/\//, '').split('/')[0]}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
