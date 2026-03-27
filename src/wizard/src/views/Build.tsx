import { h } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { currentProject, projectConfig } from '../state/app.state';
import {
  buildStages, buildRunning, buildDone, buildError,
  buildFiles, buildLogLines, buildProject, lastBuildTimestamp,
  resetBuildState, appendBuildLog,
} from '../state/build.state';
import { addToast } from '../services/toast.service';
import { apiGet, apiPost } from '../services/api.service';
import { WIZARD_STEPS } from '../config/wizard-steps';
import { Button } from '../components/common/Button';
import { Spinner } from '../components/common/Spinner';
import { Badge } from '../components/common/Badge';
import { Collapsible } from '../components/common/Collapsible';
import { FileLink } from '../components/common/FileLink';
import type { BuildFile } from '../types/project.types';

// Keep SSE ref outside the component so it survives re-mounts
let activeES: EventSource | null = null;

/** Format milliseconds to a human-readable short duration */
function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

/** Live elapsed timer — re-renders every second while running */
function LiveTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(Date.now() - startedAt);
  useEffect(() => {
    const interval = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);
  return <span style="color:var(--text-muted);font-size:11px;font-family:monospace">{formatDuration(elapsed)}</span>;
}

function getMissingSteps(config: any): string[] {
  if (!config) return WIZARD_STEPS.filter((s) => s.required).map((s) => s.label);
  const missing: string[] = [];
  if (!config.layout?.path && !config.layout?.kleUrl) missing.push('Layout');
  if (!config.switches?.model) missing.push('Switches');
  if (!config.mcu?.module) missing.push('MCU Module');
  return missing;
}

export function Build() {
  const project = currentProject.value;
  const config = projectConfig.value;
  const logRef = useRef<HTMLTextAreaElement>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [logFullscreen, setLogFullscreen] = useState(false);

  // Local output selections
  const [outputs, setOutputs] = useState(() => ({
    schematic: config?.outputs?.schematic ?? true,
    pcb: config?.outputs?.pcb ?? true,
    gerbers: config?.outputs?.gerbers ?? true,
    plate: config?.outputs?.plate ?? true,
    bom: config?.outputs?.bom ?? true,
    firmware: config?.outputs?.firmware ?? true,
    notes: config?.outputs?.notes ?? true,
  }));

  const [routingTimeout, setRoutingTimeout] = useState(10); // minutes
  const [maxPasses, setMaxPasses] = useState(25);

  const toggleOutput = (key: string) => {
    setOutputs((prev) => ({ ...prev, [key]: !(prev as any)[key] }));
  };

  const missingSteps = getMissingSteps(config);
  const canBuild = missingSteps.length === 0;

  // Load existing build files (on mount and after build completes)
  useEffect(() => {
    if (!project) return;
    setLoadingFiles(true);
    apiGet<Record<string, BuildFile[]>>(`/api/build/${project}`)
      .then((grouped) => {
        const all: BuildFile[] = [];
        for (const files of Object.values(grouped)) {
          if (Array.isArray(files)) all.push(...files);
        }
        buildFiles.value = all;
      })
      .catch(() => { buildFiles.value = []; })
      .finally(() => setLoadingFiles(false));
  }, [project, buildDone.value]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [buildLogLines.value]);

  const startBuild = async () => {
    if (!project) return;
    resetBuildState();
    buildRunning.value = true;
    buildProject.value = project;
    appendBuildLog('Starting build...');

    try {
      await apiPost(`/api/generate/${project}`, { outputs, routingTimeoutMinutes: routingTimeout, maxPasses });
      appendBuildLog('Build triggered, connecting to event stream...');
    } catch (err: any) {
      buildRunning.value = false;
      buildError.value = err.message || 'Failed to start build';
      appendBuildLog(`ERROR: Failed to start build: ${err.message}`);
      return;
    }

    // Close any previous SSE
    activeES?.close();

    const es = new EventSource(`/api/generate/${project}/stream`);
    activeES = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        appendBuildLog(`${event.type}: ${event.message || event.stage || ''}`);

        if (event.type === 'stage:start') {
          buildStages.value = [
            ...buildStages.value.filter(s => s.id !== event.stage),
            { id: event.stage, label: event.stage, status: 'running', message: event.message, startedAt: Date.now() },
          ];
        } else if (event.type === 'stage:complete') {
          buildStages.value = buildStages.value.map((s) =>
            s.id === event.stage ? { ...s, status: 'done', message: event.message, duration: s.startedAt ? Date.now() - s.startedAt : undefined } : s
          );
        } else if (event.type === 'stage:error') {
          buildStages.value = buildStages.value.map((s) =>
            s.id === event.stage ? { ...s, status: 'error', message: event.message, duration: s.startedAt ? Date.now() - s.startedAt : undefined } : s
          );
        } else if (event.type === 'build:complete') {
          buildRunning.value = false;
          buildDone.value = true;
          const ts = new Date().toISOString();
          lastBuildTimestamp.value = ts;
          try { localStorage.setItem('keyboard-maker:last-build-time', ts); } catch { /* ignore */ }
          appendBuildLog('Build completed successfully!');
          addToast('Build completed', 'success');
          es.close();
          activeES = null;
        } else if (event.type === 'build:error') {
          buildRunning.value = false;
          buildError.value = event.message || 'Build failed';
          appendBuildLog(`BUILD ERROR: ${event.message}`);
          addToast('Build failed', 'error');
          es.close();
          activeES = null;
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      if (!buildDone.value) {
        setTimeout(() => {
          if (es.readyState === EventSource.CLOSED && !buildDone.value) {
            buildRunning.value = false;
            buildError.value = 'Connection to build server lost';
            appendBuildLog('ERROR: Build connection lost');
          }
        }, 3000);
      }
    };
  };

  if (!project) {
    return <div style="padding:40px;text-align:center;color:var(--text-muted)">Open a project first.</div>;
  }

  const stages = buildStages.value;
  const running = buildRunning.value;
  const done = buildDone.value;
  const error = buildError.value;
  const logLines = buildLogLines.value;
  const files = buildFiles.value;

  const stageIcon = (status: string) => {
    switch (status) {
      case 'running': return null;
      case 'done': return '\u2705';
      case 'error': return '\u274C';
      default: return '\u23F3';
    }
  };

  const fileGroups: Record<string, BuildFile[]> = {};
  for (const f of files) {
    const group = f.group || 'Other';
    if (!fileGroups[group]) fileGroups[group] = [];
    fileGroups[group].push(f);
  }

  return (
    <div style="padding:24px;max-width:900px;margin:0 auto">
      <h2 style="margin:0 0 24px">Build</h2>

      {/* Generate section */}
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:24px">
        <h3 style="margin:0 0 12px">Generate Files</h3>

        {!canBuild && (
          <div style="margin-bottom:16px">
            <div style="color:var(--error);font-weight:600;margin-bottom:8px">Missing required configuration:</div>
            <ul style="margin:0;padding-left:20px;color:var(--text-muted)">
              {missingSteps.map((s) => <li key={s}>{s}</li>)}
            </ul>
          </div>
        )}

        {canBuild && !running && !done && !error && (
          <div>
            <div style="margin-bottom:16px">
              <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:10px">Select outputs to generate:</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 24px">
                {([
                  { key: 'schematic', label: 'KiCad Schematic' },
                  { key: 'pcb', label: 'KiCad PCB Layout' },
                  { key: 'gerbers', label: 'Gerber Files' },
                  { key: 'plate', label: 'Plate (DXF + STL)' },
                  { key: 'bom', label: 'Bill of Materials' },
                  { key: 'firmware', label: 'ZMK Firmware' },
                  { key: 'notes', label: 'Design Notes' },
                ] as const).map(({ key, label }) => (
                  <label key={key} style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text-primary)">
                    <input type="checkbox" checked={(outputs as any)[key]} onChange={() => toggleOutput(key)} style="accent-color:var(--accent)" />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            {/* Routing settings — only shown for auto routing */}
            {config?.pcb?.routing === 'auto' && <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
              <div style="display:flex;align-items:center;gap:10px">
                <label style="font-size:13px;color:var(--text-secondary);min-width:130px">Max routing passes:</label>
                <input
                  type="number"
                  min="5"
                  max="200"
                  value={maxPasses}
                  onInput={(e) => setMaxPasses(Math.max(5, parseInt((e.target as HTMLInputElement).value) || 25))}
                  style="width:60px;padding:6px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-input,#0f172a);color:var(--text-primary);font-size:13px;text-align:center"
                />
                <span style="font-size:12px;color:var(--text-muted)">passes (more = better routing, longer time)</span>
              </div>
              <div style="display:flex;align-items:center;gap:10px">
                <label style="font-size:13px;color:var(--text-secondary);min-width:130px">Routing timeout:</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={routingTimeout}
                  onInput={(e) => setRoutingTimeout(Math.max(1, parseInt((e.target as HTMLInputElement).value) || 10))}
                  style="width:60px;padding:6px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-input,#0f172a);color:var(--text-primary);font-size:13px;text-align:center"
                />
                <span style="font-size:12px;color:var(--text-muted)">minutes (hard stop — ensures SES file is saved)</span>
              </div>
            </div>}

            <div style="margin-top:16px">
              <Button variant="primary" onClick={startBuild}>Start Build</Button>
            </div>
          </div>
        )}

        {/* Stage status list */}
        {stages.length > 0 && (
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:12px;margin-bottom:16px">
            {stages.map((s) => (
              <div key={s.id} style="display:flex;align-items:center;gap:10px;padding:6px 12px;background:var(--bg-hover);border-radius:var(--radius-sm);font-size:13px">
                {s.status === 'running' ? <Spinner size="sm" /> : <span>{stageIcon(s.status)}</span>}
                <span style="font-weight:500;min-width:100px">{s.label}</span>
                <span style="color:var(--text-muted);font-size:12px;flex:1">{s.message || ''}</span>
                <span style="flex-shrink:0">
                  {s.status === 'running' && s.startedAt && <LiveTimer startedAt={s.startedAt} />}
                  {s.status === 'done' && s.duration != null && (
                    <span style="color:var(--success);font-size:11px;font-family:monospace">({formatDuration(s.duration)})</span>
                  )}
                  {s.status === 'error' && s.duration != null && (
                    <span style="color:var(--error);font-size:11px;font-family:monospace">({formatDuration(s.duration)})</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Build log textarea */}
        {(running || logLines.length > 0) && (
          <div style={logFullscreen
            ? "position:fixed;top:0;left:0;right:0;bottom:0;z-index:1000;background:var(--bg-primary,#1a1a2e);display:flex;flex-direction:column;padding:12px"
            : "margin-top:12px;position:relative"
          }>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span style="font-size:12px;color:var(--text-muted)">Build Log:</span>
              <div style="display:flex;gap:4px">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(logLines.join('\n')).then(
                      () => addToast('Log copied to clipboard', 'success'),
                      () => addToast('Failed to copy', 'error'),
                    );
                  }}
                  style="padding:3px 10px;font-size:11px;background:var(--bg-hover);color:var(--text-secondary);border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer"
                >
                  Copy
                </button>
                <button
                  onClick={() => setLogFullscreen(!logFullscreen)}
                  title={logFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                  style="padding:3px 10px;font-size:11px;background:var(--bg-hover);color:var(--text-secondary);border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer"
                >
                  {logFullscreen ? 'Exit' : 'Expand'}
                </button>
              </div>
            </div>
            <textarea
              ref={logRef}
              readOnly
              value={logLines.join('\n')}
              style={`width:100%;background:var(--bg-input,#0f172a);color:var(--text-secondary);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;font-family:'JetBrains Mono',monospace;font-size:12px;resize:vertical;white-space:pre;overflow-x:auto;${logFullscreen ? 'flex:1' : 'height:280px'}`}
            />
          </div>
        )}

        {done && <div style="margin-top:16px"><Badge variant="success">Build completed successfully</Badge></div>}
        {error && <div style="margin-top:16px"><Badge variant="error">{error}</Badge></div>}

        {(done || error) && (
          <div style="margin-top:12px">
            <Button variant="secondary" onClick={() => resetBuildState()}>Reset</Button>
          </div>
        )}
      </div>

      {/* Build output section */}
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:20px">
        <div style="display:flex;align-items:baseline;gap:10px;margin:0 0 12px">
          <h3 style="margin:0">Build Output</h3>
          {lastBuildTimestamp.value && (
            <span style="font-size:12px;color:var(--text-muted)">(last build: {new Date(lastBuildTimestamp.value).toLocaleString()})</span>
          )}
        </div>
        {loadingFiles ? (
          <div style="text-align:center;padding:20px"><Spinner /></div>
        ) : files.length === 0 ? (
          <div style="color:var(--text-muted);font-size:14px">No build files yet. Run a build to generate output files.</div>
        ) : (
          <div style="display:flex;flex-direction:column;gap:8px">
            {Object.entries(fileGroups).map(([group, gFiles]) => (
              <Collapsible key={group} title={`${group} (${gFiles.length})`} defaultOpen>
                <div style="display:flex;flex-direction:column;gap:4px;padding:8px 0">
                  {gFiles.map((f) => (
                    <FileLink key={f.path} name={f.name} path={`/api/build/${project}/files/${f.path}`} size={f.size} />
                  ))}
                </div>
              </Collapsible>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
