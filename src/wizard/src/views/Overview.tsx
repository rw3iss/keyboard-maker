import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { currentProject, projectConfig, activeTab, hasProject } from '../state/app.state';
import { WIZARD_STEPS } from '../config/wizard-steps';
import type { BuildConfig } from '../types/project.types';
import { route } from 'preact-router';
import { apiPost } from '../services/api.service';
import { addToast } from '../services/toast.service';
import { EmptyState } from '../components/common/EmptyState';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getStepSummary(stepId: string, config: BuildConfig | null): string {
  if (!config) return 'Not configured';
  switch (stepId) {
    case 'layout':
      return config.layout?.path
        ? config.layout.path.split('/').pop() || config.layout.path
        : 'Not configured';
    case 'switches':
      return config.switches?.model || 'Not configured';
    case 'mcu':
      return config.mcu?.module || 'Not configured';
    case 'connectivity':
      if (!config.connectivity) return 'Not configured';
      return config.connectivity.bluetooth ? 'USB + BLE' : 'USB only';
    case 'power': {
      if (!config.power) return 'Not configured';
      const parts: string[] = [];
      if (config.power.chargerIc) parts.push(config.power.chargerIc);
      if (config.power.battery && config.power.batteryCapacityMah) parts.push(`${config.power.batteryCapacityMah}mAh`);
      if (!config.power.battery && !config.power.chargerIc) return 'No battery';
      return parts.join(', ') || 'Not configured';
    }
    case 'features': {
      if (!config.features) return 'Not configured';
      const active: string[] = [];
      if (config.features.rgbPerKey) active.push('RGB');
      if (config.features.rgbUnderglow) active.push('Underglow');
      if (config.features.rotaryEncoder) active.push('Encoder');
      if (config.features.oledDisplay) active.push('OLED');
      return active.length > 0 ? active.join(', ') : 'None enabled';
    }
    case 'pcb':
      if (!config.pcb) return 'Not configured';
      return `${config.pcb.layers || 2}-layer, ${config.pcb.routing || 'auto'} routing`;
    case 'physical': {
      if (!config.physical) return 'Not configured';
      const sideLabels: Record<string, string> = { back: 'Rear', top: 'Top', left: 'Left', right: 'Right' };
      const side = sideLabels[config.physical.connectorSide] || config.physical.connectorSide;
      const extras: string[] = [];
      if ((config.physical as any).powerButton) extras.push('Power btn');
      if ((config.physical as any).wifiToggleButton) extras.push('WiFi btn');
      return `USB: ${side}${extras.length ? ' + ' + extras.join(', ') : ''}`;
    }
    case 'outputs': {
      if (!config.outputs) return 'Not configured';
      const count = Object.values(config.outputs).filter(Boolean).length;
      return `${count} output${count !== 1 ? 's' : ''} enabled`;
    }
    case 'layout-editor': {
      const ov = (config as any).layoutOverrides;
      if (ov?.components?.length > 0 || ov?.screws?.length > 0 || ov?.usb || ov?.mcu || ov?.battery) {
        const count = ov.components?.length || 0;
        return `${count} position${count !== 1 ? 's' : ''} customized`;
      }
      return 'Not customized';
    }
    default:
      return 'Not configured';
  }
}

function isStepConfigured(stepId: string, config: BuildConfig | null): boolean {
  const summary = getStepSummary(stepId, config);
  return summary !== 'Not configured' && summary !== 'Not customized';
}

/** Unicode geometric step indicators (no emoji). */
const STEP_ICONS: Record<string, string> = {
  layout: '\u25A6',       // square with fill
  switches: '\u25C9',     // fisheye
  mcu: '\u25B2',          // triangle
  connectivity: '\u25C8', // diamond
  power: '\u25A3',        // square
  features: '\u2726',     // four-pointed star
  pcb: '\u25CE',          // bullseye
  physical: '\u25AB',     // small square
  outputs: '\u25B6',      // right triangle
  'layout-editor': '\u25A1', // empty square
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Overview() {
  const project = currentProject.value;
  const config = projectConfig.value;
  const [layoutImageUrl, setLayoutImageUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  // Check for existing layout image
  useEffect(() => {
    if (!project) return;
    const imgUrl = `/api/build/${project}/files/images/kle-layout.svg`;
    fetch(imgUrl, { method: 'HEAD' })
      .then((res) => {
        if (res.ok) setLayoutImageUrl(imgUrl);
        else setLayoutImageUrl(null);
      })
      .catch(() => setLayoutImageUrl(null));
  }, [project]);

  if (!hasProject.value) {
    return (
      <EmptyState
        icon={'\u2328'}
        title="Keybuild"
        message="Open or create a project to get started. Use the File menu above."
      />
    );
  }

  const navigateToStep = (stepId: string) => {
    activeTab.value = 'config';
    route(`/config/${stepId}`);
  };

  const configuredCount = WIZARD_STEPS.filter((s) => isStepConfigured(s.id, config)).length;
  const requiredSteps = WIZARD_STEPS.filter((s) => s.required);
  const requiredConfigured = requiredSteps.filter((s) => isStepConfigured(s.id, config)).length;

  const handleRenderLayout = async () => {
    if (!project) return;
    setRendering(true);
    try {
      const result = await apiPost<{ path: string }>(`/api/projects/${project}/render-layout`, {});
      addToast('Layout image generated', 'success');
      setLayoutImageUrl(`/api/build/${project}/files/${result.path}?t=${Date.now()}`);
    } catch {
      addToast('Failed to render layout image', 'error');
    } finally {
      setRendering(false);
    }
  };

  return (
    <div style={{ padding: '32px 24px', maxWidth: 860, margin: '0 auto' }}>

      {/* ---- Header ---- */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
          <h1 style={{ margin: 0 }}>{project}</h1>
          {config?.project?.version && (
            <span style={{
              fontSize: 12, padding: '2px 8px', borderRadius: 4,
              background: 'var(--bg-hover)', color: 'var(--text-secondary)',
              fontWeight: 600, letterSpacing: '0.3px',
            }}>
              v{config.project.version}
            </span>
          )}
        </div>
        {config?.project?.author && (
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>
            by {config.project.author}
          </p>
        )}
        <p style={{
          margin: '8px 0 0', fontSize: 13, color: 'var(--text-muted)',
        }}>
          {configuredCount} of {WIZARD_STEPS.length} steps configured
          {' '}&middot;{' '}
          {requiredConfigured} of {requiredSteps.length} required
        </p>
      </div>

      {/* ---- Layout Image Card ---- */}
      {layoutImageUrl && (
        <div style={{
          marginBottom: 32, border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', overflow: 'hidden',
          background: 'var(--bg-card)',
        }}>
          <img
            src={layoutImageUrl}
            alt="KLE Layout"
            style={{ width: '100%', display: 'block' }}
          />
        </div>
      )}

      {/* ---- Configuration Steps (vertical stepper) ---- */}
      <h2 style={{ margin: '0 0 20px' }}>Configuration</h2>

      <div style={{ position: 'relative', paddingLeft: 40, marginBottom: 40 }}>
        {/* Vertical connector line */}
        <div class="stepper-line" />

        {WIZARD_STEPS.map((step, i) => {
          const summary = getStepSummary(step.id, config);
          const configured = isStepConfigured(step.id, config);
          const isLast = i === WIZARD_STEPS.length - 1;

          return (
            <div
              key={step.id}
              class="card-accent"
              style={{
                position: 'relative',
                marginBottom: isLast ? 0 : 8,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 16,
              }}
              onClick={() => navigateToStep(step.id)}
            >
              {/* Stepper dot */}
              <div
                class={`stepper-dot ${configured ? 'stepper-dot--complete' : ''}`}
                style={{ position: 'absolute', left: -34, top: '50%', transform: 'translateY(-50%)' }}
              />

              {/* Left: icon + name + description */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 16, color: configured ? 'var(--accent)' : 'var(--text-muted)',
                    width: 22, textAlign: 'center', flexShrink: 0,
                  }}>
                    {STEP_ICONS[step.id] || '\u25CF'}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{step.label}</span>
                  {step.required && (
                    <span style={{
                      fontSize: 10, padding: '1px 5px', borderRadius: 3,
                      background: 'rgba(110,203,245,0.12)', color: 'var(--accent)',
                      fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase',
                    }}>
                      req
                    </span>
                  )}
                </div>
                <p style={{
                  margin: '2px 0 0 30px', fontSize: 12,
                  color: 'var(--text-muted)', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {step.description}
                </p>
              </div>

              {/* Right: value + status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span style={{
                  fontSize: 13, color: configured ? 'var(--text-primary)' : 'var(--text-muted)',
                  maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {summary}
                </span>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: configured ? 'var(--success)' : 'var(--border)',
                }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ---- Build Section ---- */}
      <div style={{
        borderLeft: '3px solid var(--border)',
        borderRadius: '0 var(--radius) var(--radius) 0',
        background: 'var(--bg-card)', padding: '20px 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: '0 0 4px' }}>Build</h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              {requiredConfigured === requiredSteps.length
                ? 'All required steps configured. Ready to build.'
                : `${requiredSteps.length - requiredConfigured} required step${requiredSteps.length - requiredConfigured !== 1 ? 's' : ''} remaining.`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {config?.layout?.path && (
              <button
                class="btn"
                style={{
                  padding: '8px 16px', fontSize: 13, borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)', background: 'var(--bg-hover)',
                  color: 'var(--text-primary)', cursor: 'pointer',
                  opacity: rendering ? 0.6 : 1,
                }}
                onClick={handleRenderLayout}
                disabled={rendering}
              >
                {rendering ? 'Rendering...' : 'Render Layout'}
              </button>
            )}
            <button
              class="btn btn-primary"
              style={{
                padding: '8px 20px', fontSize: 13, borderRadius: 'var(--radius-sm)',
                background: 'var(--accent)', color: 'var(--bg-input)', fontWeight: 600,
                border: 'none', cursor: 'pointer',
                opacity: requiredConfigured < requiredSteps.length ? 0.5 : 1,
              }}
              onClick={() => {
                activeTab.value = 'build';
                route('/build');
              }}
            >
              Go to Build
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
