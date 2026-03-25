import { h } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { LayoutEditor } from '../editors/LayoutEditor';
import { projectConfig, currentProject } from '../state/app.state';
import { addToast } from '../services/toast.service';
import { apiGet, apiPut } from '../services/api.service';
import { getLayoutOverrides, hasCollisions } from '../editors/LayoutState';
import type { SimpleKey } from '../editors/LayoutState';

const MIN_PANEL_HEIGHT = 200;

export function Layout() {
  const config = projectConfig.value;
  const project = currentProject.value;
  const [keys, setKeys] = useState<SimpleKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [layoutImage, setLayoutImage] = useState<string | null>(null);
  const [splitRatio, setSplitRatio] = useState(() => {
    try { const v = localStorage.getItem('keyboard-maker:layout-split'); return v ? parseFloat(v) : 0.65; } catch { return 0.65; }
  });
  const [draggingSplit, setDraggingSplit] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!project) return;
    setLoading(true);
    apiGet<{ keys: SimpleKey[] }>(`/api/projects/${project}/kle-keys`)
      .then((data) => setKeys(data.keys))
      .catch((err) => { addToast(`Failed to load layout: ${err.message}`, 'error'); setKeys([]); })
      .finally(() => setLoading(false));

    fetch(`/api/build/${project}/files/images/kle-layout.svg`, { method: 'HEAD' })
      .then((r) => { if (r.ok) setLayoutImage(`/api/build/${project}/files/images/kle-layout.svg`); })
      .catch(() => {});
  }, [project]);

  const handleSave = async () => {
    if (hasCollisions.value) addToast('Warning: Some components overlap.', 'warning');
    setSaving(true);
    try {
      const overrides = getLayoutOverrides();
      const screws = overrides.filter(o => o.type === 'screw').map(o => ({ id: o.id, x: o.x, y: o.y }));
      const usb = overrides.find(o => o.type === 'usb');
      const mcu = overrides.find(o => o.type === 'mcu');
      const battery = overrides.find(o => o.type === 'battery');
      const updated = {
        ...config,
        layoutOverrides: {
          components: overrides,
          screws: screws.length > 0 ? screws : undefined,
          usb: usb ? { x: usb.x, y: usb.y } : undefined,
          mcu: mcu ? { x: mcu.x, y: mcu.y } : undefined,
          battery: battery ? { x: battery.x, y: battery.y } : undefined,
        },
      };
      await apiPut(`/api/projects/${project}/config`, updated);
      projectConfig.value = updated as any;
      addToast('Layout overrides saved', 'success');
    } catch (err: any) {
      addToast(`Save failed: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Splitter drag handlers
  const onSplitMouseDown = useCallback((e: MouseEvent) => {
    e.preventDefault();
    setDraggingSplit(true);
  }, []);

  useEffect(() => {
    if (!draggingSplit) return;
    const onMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const totalHeight = rect.height;
      const newTop = e.clientY - rect.top;
      const ratio = Math.max(MIN_PANEL_HEIGHT / totalHeight, Math.min(1 - MIN_PANEL_HEIGHT / totalHeight, newTop / totalHeight));
      setSplitRatio(ratio);
    };
    const onUp = () => {
      setDraggingSplit(false);
      try { localStorage.setItem('keyboard-maker:layout-split', String(splitRatio)); } catch { /* ignore */ }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [draggingSplit]);

  if (!config || !project) {
    return <div style="padding:40px;text-align:center;color:var(--text-muted)">No project loaded.</div>;
  }

  const hasPreview = !!layoutImage;

  return (
    <div style="display:flex;flex-direction:column;height:100%">
      {/* Top bar */}
      <div style="display:flex;align-items:center;gap:12px;padding:8px 16px;background:var(--bg-secondary,#16213e);border-bottom:1px solid var(--border,#334155);flex-shrink:0">
        <a href="#" onClick={(e) => { e.preventDefault(); history.back(); }}
          style="color:var(--text-secondary);font-size:13px;text-decoration:none;cursor:pointer">← Back</a>
        <span style="font-size:14px;font-weight:600">Layout Editor</span>
        <div style="flex:1" />
        {hasCollisions.value && <span style="font-size:11px;color:var(--error);font-weight:500">Collisions detected</span>}
        <button onClick={handleSave} disabled={saving}
          style={`padding:6px 16px;background:var(--accent);color:#000;border:none;border-radius:4px;cursor:pointer;font-weight:600;font-size:13px;opacity:${saving ? 0.6 : 1}`}>
          {saving ? 'Saving...' : 'Save Layout'}
        </button>
      </div>

      {/* Tips */}
      <div style="padding:5px 16px;background:var(--bg-card,#1f2937);border-bottom:1px solid var(--border);font-size:11px;color:var(--text-muted);flex-shrink:0">
        Drag screws, USB, MCU, battery to reposition. Scroll to zoom. Middle-click to pan. Arrow keys nudge (Shift=fine). Red=collision.
      </div>

      {/* Resizable split container */}
      <div ref={containerRef} style={`flex:1;display:flex;flex-direction:column;overflow:hidden;${draggingSplit ? 'cursor:row-resize;user-select:none' : ''}`}>
        {/* Top panel — editor */}
        <div style={`height:${hasPreview ? `${splitRatio * 100}%` : '100%'};min-height:${MIN_PANEL_HEIGHT}px;overflow:hidden`}>
          {loading ? (
            <div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-muted)">Loading layout...</div>
          ) : (
            <LayoutEditor config={config} keys={keys} />
          )}
        </div>

        {/* Draggable splitter */}
        {hasPreview && (
          <div
            onMouseDown={onSplitMouseDown}
            style="height:6px;background:var(--border,#334155);cursor:row-resize;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:background 0.1s"
            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--accent,#6ecbf5)'}
            onMouseLeave={(e) => { if (!draggingSplit) (e.currentTarget as HTMLElement).style.background = 'var(--border,#334155)'; }}
          >
            <div style="width:40px;height:2px;background:var(--text-muted);border-radius:1px;opacity:0.5" />
          </div>
        )}

        {/* Bottom panel — KLE layout preview */}
        {hasPreview && (
          <div style={`height:${(1 - splitRatio) * 100}%;min-height:${MIN_PANEL_HEIGHT}px;overflow:auto;background:var(--bg-card,#1f2937);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px`}>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;align-self:flex-start">KLE Layout Rendering</div>
            <img
              src={`${layoutImage}?t=${Date.now()}`}
              alt="Keyboard Layout"
              style="max-width:100%;max-height:100%;object-fit:contain;border-radius:4px"
            />
          </div>
        )}
      </div>
    </div>
  );
}
