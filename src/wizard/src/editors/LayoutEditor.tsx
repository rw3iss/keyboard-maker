import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { LayoutCanvas } from './LayoutCanvas';
import { layoutComponents, showLayers, selectedId, initLayout, selectComponent } from './LayoutState';

export function LayoutEditor({ config, keys }: { config: any; keys: any[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LayoutCanvas | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    initLayout(config, keys);
    rendererRef.current = new LayoutCanvas(canvasRef.current);

    // Render loop
    let running = true;
    const loop = () => {
      if (!running || !rendererRef.current) return;
      rendererRef.current.render(layoutComponents.value, showLayers.value);
      requestAnimationFrame(loop);
    };
    loop();

    return () => { running = false; };
  }, [config, keys]);

  const toggleLayer = (layer: keyof typeof showLayers.value) => (e: Event) => {
    const checked = (e.target as HTMLInputElement).checked;
    showLayers.value = { ...showLayers.value, [layer]: checked };
  };

  const selected = selectedId.value
    ? layoutComponents.value.find(c => c.id === selectedId.value)
    : null;

  return (
    <div style="display:flex;flex-direction:column;height:100%">
      {/* Toolbar */}
      <div style="display:flex;gap:8px;padding:8px;background:var(--bg-secondary, #1e293b);border-bottom:1px solid var(--border, #334155);flex-wrap:wrap;align-items:center">
        <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-secondary, #94a3b8)">
          <input type="checkbox" checked={showLayers.value.switches} onChange={toggleLayer('switches')} />
          Switches
        </label>
        <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-secondary, #94a3b8)">
          <input type="checkbox" checked={showLayers.value.screws} onChange={toggleLayer('screws')} />
          Screws
        </label>
        <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-secondary, #94a3b8)">
          <input type="checkbox" checked={showLayers.value.connectors} onChange={toggleLayer('connectors')} />
          Connectors
        </label>
        <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-secondary, #94a3b8)">
          <input type="checkbox" checked={showLayers.value.mcu} onChange={toggleLayer('mcu')} />
          MCU
        </label>
        <div style="flex:1" />
        {selected && (
          <span style="font-size:12px;color:var(--accent, #6ecbf5)">
            Selected: {selected.id} ({selected.x.toFixed(1)}, {selected.y.toFixed(1)})mm
            {selected.draggable ? ' [draggable]' : ''}
          </span>
        )}
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={1200}
        height={600}
        style="flex:1;cursor:crosshair;background:#0f172a"
      />

      <div style="padding:4px 8px;background:var(--bg-secondary, #1e293b);border-top:1px solid var(--border, #334155);font-size:11px;color:var(--text-muted, #64748b)">
        Scroll to zoom | Drag empty space to pan | Drag screws, USB, MCU to reposition | Grid: 0.5mm snap
      </div>
    </div>
  );
}
