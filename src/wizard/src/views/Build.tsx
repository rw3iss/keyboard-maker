import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { currentProject, projectConfig } from '../state/app.state';
import { addToast } from '../services/toast.service';
import { apiGet, apiPost } from '../services/api.service';
import { WIZARD_STEPS } from '../config/wizard-steps';
import { Button } from '../components/common/Button';
import { Spinner } from '../components/common/Spinner';
import { Badge } from '../components/common/Badge';
import { Collapsible } from '../components/common/Collapsible';
import { FileLink } from '../components/common/FileLink';
import type { BuildFile } from '../types/project.types';

interface BuildStage {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  message?: string;
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
  const [stages, setStages] = useState<BuildStage[]>([]);
  const [building, setBuilding] = useState(false);
  const [buildDone, setBuildDone] = useState(false);
  const [buildError, setBuildError] = useState('');
  const [buildFiles, setBuildFiles] = useState<BuildFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const logRef = useRef<HTMLTextAreaElement>(null);

  const missingSteps = getMissingSteps(config);
  const canBuild = missingSteps.length === 0;

  // Load existing build files
  useEffect(() => {
    if (!project) return;
    setLoadingFiles(true);
    apiGet<Record<string, BuildFile[]>>(`/api/build/${project}`)
      .then((grouped) => {
        const all: BuildFile[] = [];
        for (const files of Object.values(grouped)) {
          if (Array.isArray(files)) all.push(...files);
        }
        setBuildFiles(all);
      })
      .catch(() => setBuildFiles([]))
      .finally(() => setLoadingFiles(false));
  }, [project, buildDone]);

  const appendLog = (msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogLines((prev) => [...prev, `[${ts}] ${msg}`]);
    // Auto-scroll
    setTimeout(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, 50);
  };

  const startBuild = async () => {
    if (!project) return;
    setBuilding(true);
    setBuildDone(false);
    setBuildError('');
    setStages([]);
    setLogLines([]);

    appendLog('Starting build...');

    // 1. POST to trigger the build
    try {
      await apiPost(`/api/generate/${project}`, {
        outputs: config?.outputs || {},
      });
      appendLog('Build triggered, connecting to event stream...');
    } catch (err: any) {
      setBuilding(false);
      setBuildError(err.message || 'Failed to start build');
      appendLog(`ERROR: Failed to start build: ${err.message}`);
      return;
    }

    // 2. Connect to SSE stream for progress
    const es = new EventSource(`/api/generate/${project}/stream`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);

        // Log every event
        appendLog(`${event.type}: ${event.message || event.stage || ''}`);

        if (event.type === 'stage:start') {
          setStages((prev) => {
            const exists = prev.find((s) => s.id === event.stage);
            if (exists) {
              return prev.map((s) =>
                s.id === event.stage ? { ...s, status: 'running', message: event.message } : s
              );
            }
            return [...prev, { id: event.stage, label: event.stage, status: 'running', message: event.message }];
          });
        } else if (event.type === 'stage:complete') {
          setStages((prev) =>
            prev.map((s) =>
              s.id === event.stage ? { ...s, status: 'done', message: event.message } : s
            )
          );
        } else if (event.type === 'stage:error') {
          setStages((prev) =>
            prev.map((s) =>
              s.id === event.stage ? { ...s, status: 'error', message: event.message } : s
            )
          );
        } else if (event.type === 'build:complete') {
          setBuilding(false);
          setBuildDone(true);
          appendLog('Build completed successfully!');
          addToast('Build completed', 'success');
          es.close();
        } else if (event.type === 'build:error') {
          setBuilding(false);
          setBuildError(event.message || 'Build failed');
          appendLog(`BUILD ERROR: ${event.message}`);
          addToast('Build failed', 'error');
          es.close();
        } else if (event.type === 'log') {
          // Generic log message — already appended above
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      if (!buildDone) {
        appendLog('SSE connection lost');
        // Don't immediately fail — the build may still be running
        // Wait a moment and check if it reconnects
        setTimeout(() => {
          if (es.readyState === EventSource.CLOSED && !buildDone) {
            setBuilding(false);
            setBuildError('Connection to build server lost');
            appendLog('ERROR: Build connection lost');
          }
        }, 3000);
      }
    };
  };

  useEffect(() => {
    return () => { esRef.current?.close(); };
  }, []);

  if (!project) {
    return (
      <div style="padding:40px;text-align:center;color:var(--text-muted)">
        Open a project first.
      </div>
    );
  }

  const stageIcon = (status: string) => {
    switch (status) {
      case 'running': return null;
      case 'done': return '\u2705';
      case 'error': return '\u274C';
      default: return '\u23F3';
    }
  };

  // Group build files
  const fileGroups: Record<string, BuildFile[]> = {};
  for (const f of buildFiles) {
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
            <div style="color:var(--error);font-weight:600;margin-bottom:8px">
              Missing required configuration:
            </div>
            <ul style="margin:0;padding-left:20px;color:var(--text-muted)">
              {missingSteps.map((s) => <li key={s}>{s}</li>)}
            </ul>
          </div>
        )}

        {canBuild && !building && !buildDone && !buildError && (
          <Button variant="primary" onClick={startBuild}>
            Start Build
          </Button>
        )}

        {/* Stage status list */}
        {stages.length > 0 && (
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:12px;margin-bottom:16px">
            {stages.map((s) => (
              <div key={s.id} style="display:flex;align-items:center;gap:10px;padding:6px 12px;background:var(--bg-hover);border-radius:var(--radius-sm);font-size:13px">
                {s.status === 'running' ? <Spinner size="sm" /> : <span>{stageIcon(s.status)}</span>}
                <span style="font-weight:500;min-width:100px">{s.label}</span>
                {s.message && <span style="color:var(--text-muted);margin-left:auto;font-size:12px">{s.message}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Build log textarea */}
        {(building || logLines.length > 0) && (
          <div style="margin-top:12px;position:relative">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span style="font-size:12px;color:var(--text-muted)">Build Log:</span>
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
            </div>
            <textarea
              ref={logRef}
              readOnly
              value={logLines.join('\n')}
              style="width:100%;height:280px;background:var(--bg-input,#0f172a);color:var(--text-secondary);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;font-family:'JetBrains Mono',monospace;font-size:12px;resize:vertical;white-space:pre;overflow-x:auto"
            />
          </div>
        )}

        {buildDone && (
          <div style="margin-top:16px">
            <Badge variant="success">Build completed successfully</Badge>
          </div>
        )}

        {buildError && (
          <div style="margin-top:16px">
            <Badge variant="error">{buildError}</Badge>
          </div>
        )}

        {(buildDone || buildError) && (
          <div style="margin-top:12px">
            <Button variant="secondary" onClick={() => { setBuildDone(false); setBuildError(''); setStages([]); setLogLines([]); }}>
              Reset
            </Button>
          </div>
        )}
      </div>

      {/* Build output section */}
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:20px">
        <h3 style="margin:0 0 12px">Build Output</h3>
        {loadingFiles ? (
          <div style="text-align:center;padding:20px"><Spinner /></div>
        ) : buildFiles.length === 0 ? (
          <div style="color:var(--text-muted);font-size:14px">
            No build files yet. Run a build to generate output files.
          </div>
        ) : (
          <div style="display:flex;flex-direction:column;gap:8px">
            {Object.entries(fileGroups).map(([group, files]) => (
              <Collapsible key={group} title={`${group} (${files.length})`} defaultOpen>
                <div style="display:flex;flex-direction:column;gap:4px;padding:8px 0">
                  {files.map((f) => (
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
