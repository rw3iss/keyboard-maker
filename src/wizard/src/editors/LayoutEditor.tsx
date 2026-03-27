import { h } from 'preact';
import { useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { LayoutCanvas } from './LayoutCanvas';
import {
  layoutComponents,
  layers,
  selectedId,
  selectedComponent,
  boardBounds,
  hasCollisions,
  initLayout,
  selectComponent,
  moveComponentTo,
  resetComponentPosition,
  setLayerVisibility,
  setLayerOpacity,
  nudgeSelected,
  undo,
  redo,
  canUndo,
  canRedo,
  type SimpleKey,
} from './LayoutState';

interface LayoutEditorProps {
  config: any;
  keys: SimpleKey[];
}

export function LayoutEditor({ config, keys }: LayoutEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LayoutCanvas | null>(null);
  const [cursorPos, setCursorPos] = useState<{ mmX: number; mmY: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(2);

  // Init layout + canvas
  useEffect(() => {
    if (!canvasRef.current) return;
    initLayout(config, keys);
    const canvas = new LayoutCanvas(canvasRef.current);
    rendererRef.current = canvas;

    canvas.setCallbacks(
      (pos) => setCursorPos(pos),
      (z) => setZoomLevel(z),
    );

    // Fit to view on first load
    const bounds = boardBounds.value;
    if (bounds.maxX > bounds.minX) {
      requestAnimationFrame(() => canvas.fitToView(bounds));
    }

    // Render loop
    let running = true;
    const loop = () => {
      if (!running || !rendererRef.current) return;
      rendererRef.current.render(layoutComponents.value, layers.value);
      requestAnimationFrame(loop);
    };
    loop();

    return () => {
      running = false;
      canvas.dispose();
      rendererRef.current = null;
    };
  }, [config, keys]);

  const handleZoomIn = useCallback(() => {
    rendererRef.current?.setZoom(zoomLevel * 1.3);
  }, [zoomLevel]);

  const handleZoomOut = useCallback(() => {
    rendererRef.current?.setZoom(zoomLevel / 1.3);
  }, [zoomLevel]);

  const handleFitView = useCallback(() => {
    rendererRef.current?.fitToView(boardBounds.value);
  }, []);

  const selected = selectedComponent.value;
  const collisions = hasCollisions.value;

  return (
    <div style="display:flex;flex-direction:column;height:100%;min-height:0">
      {/* Tip bar */}
      <div style="padding:6px 12px;background:#1e293b;border-bottom:1px solid #334155;font-size:11px;color:#94a3b8;flex-shrink:0;display:flex;align-items:center;justify-content:space-between">
        <span>Drag components to reposition. Scroll to zoom. Middle-click to pan. Arrow keys nudge (Shift=fine). Ctrl+Z undo, Ctrl+Shift+Z redo.</span>
        <div style="display:flex;gap:4px;flex-shrink:0;margin-left:12px">
          {canUndo.value && (
            <button
              onClick={() => undo()}
              title="Undo (Ctrl+Z)"
              style="padding:2px 8px;font-size:11px;background:#0f172a;color:#94a3b8;border:1px solid #334155;border-radius:3px;cursor:pointer"
            >Undo</button>
          )}
          {canRedo.value && (
            <button
              onClick={() => redo()}
              title="Redo (Ctrl+Shift+Z)"
              style="padding:2px 8px;font-size:11px;background:#0f172a;color:#94a3b8;border:1px solid #334155;border-radius:3px;cursor:pointer"
            >Redo</button>
          )}
        </div>
      </div>

      {/* Main area: sidebar + canvas */}
      <div style="display:flex;flex:1;min-height:0;overflow:hidden">
        {/* Sidebar */}
        <div style="width:200px;flex-shrink:0;background:#1e293b;border-right:1px solid #334155;overflow-y:auto;display:flex;flex-direction:column;font-size:12px">
          {/* Layers section */}
          <div style="padding:10px 12px;border-bottom:1px solid #334155">
            <div style="font-weight:700;color:#e2e8f0;margin-bottom:8px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Layers</div>
            {layers.value.map((layer) => (
              <div key={layer.id} style="margin-bottom:8px">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                  <input
                    type="checkbox"
                    checked={layer.visible}
                    onChange={(e) => setLayerVisibility(layer.id, (e.target as HTMLInputElement).checked)}
                  />
                  <span style={`width:8px;height:8px;border-radius:50%;background:${layer.color};flex-shrink:0;display:inline-block`} />
                  <span style={`color:${layer.color};font-size:12px`}>{layer.label}</span>
                </label>
                <div style="display:flex;align-items:center;gap:4px;margin-top:2px;padding-left:22px">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(layer.opacity * 100)}
                    onInput={(e) => setLayerOpacity(layer.id, parseInt((e.target as HTMLInputElement).value) / 100)}
                    style="width:100%;height:4px;accent-color:#6ecbf5"
                    disabled={!layer.visible}
                  />
                  <span style="color:#64748b;font-size:10px;min-width:28px;text-align:right">
                    {Math.round(layer.opacity * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Selected component section */}
          <div style="padding:10px 12px;border-bottom:1px solid #334155;flex:1">
            <div style="font-weight:700;color:#e2e8f0;margin-bottom:8px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Selected</div>
            {selected ? (
              <div>
                <div style="color:#06b6d4;font-weight:600;margin-bottom:4px">{selected.id}</div>
                <div style="color:#94a3b8;margin-bottom:4px;display:flex;align-items:center;gap:6px">
                  <span>Type: {selected.type}</span>
                  <span style={`font-size:9px;padding:1px 5px;border-radius:3px;font-weight:700;${selected.side === 'front' ? 'background:#1e3a5f;color:#6ecbf5' : selected.side === 'back' ? 'background:#3f1e1e;color:#f87171' : 'background:#1e3a1e;color:#86efac'}`}>
                    {selected.side === 'front' ? 'FRONT' : selected.side === 'back' ? 'BACK' : 'THRU'}
                  </span>
                </div>

                {selected.collision && (
                  <div style="color:#ef4444;font-weight:600;margin-bottom:6px;padding:4px 6px;background:#3f1111;border-radius:4px;font-size:11px">
                    COLLISION DETECTED
                  </div>
                )}

                {/* Position inputs */}
                <div style="display:flex;gap:8px;margin-bottom:6px">
                  <div style="flex:1">
                    <label style="display:block;color:#64748b;font-size:10px;margin-bottom:2px">X (mm)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={selected.x.toFixed(1)}
                      disabled={!selected.draggable}
                      onInput={(e) => {
                        const v = parseFloat((e.target as HTMLInputElement).value);
                        if (!isNaN(v)) moveComponentTo(selected.id, v, selected.y);
                      }}
                      style="width:100%;padding:4px 6px;background:#0f172a;border:1px solid #334155;border-radius:3px;color:#e2e8f0;font-size:12px;font-family:monospace"
                    />
                  </div>
                  <div style="flex:1">
                    <label style="display:block;color:#64748b;font-size:10px;margin-bottom:2px">Y (mm)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={selected.y.toFixed(1)}
                      disabled={!selected.draggable}
                      onInput={(e) => {
                        const v = parseFloat((e.target as HTMLInputElement).value);
                        if (!isNaN(v)) moveComponentTo(selected.id, selected.x, v);
                      }}
                      style="width:100%;padding:4px 6px;background:#0f172a;border:1px solid #334155;border-radius:3px;color:#e2e8f0;font-size:12px;font-family:monospace"
                    />
                  </div>
                </div>

                {/* Size (read-only) */}
                <div style="display:flex;gap:8px;margin-bottom:8px">
                  <div style="flex:1">
                    <label style="display:block;color:#64748b;font-size:10px;margin-bottom:2px">W (mm)</label>
                    <div style="padding:4px 6px;background:#0f172a;border:1px solid #1e293b;border-radius:3px;color:#64748b;font-size:12px;font-family:monospace">
                      {selected.width.toFixed(1)}
                    </div>
                  </div>
                  <div style="flex:1">
                    <label style="display:block;color:#64748b;font-size:10px;margin-bottom:2px">H (mm)</label>
                    <div style="padding:4px 6px;background:#0f172a;border:1px solid #1e293b;border-radius:3px;color:#64748b;font-size:12px;font-family:monospace">
                      {selected.height.toFixed(1)}
                    </div>
                  </div>
                </div>

                {selected.draggable && (
                  <button
                    onClick={() => resetComponentPosition(selected.id)}
                    style="width:100%;padding:5px 8px;background:#1e293b;border:1px solid #334155;border-radius:4px;color:#94a3b8;cursor:pointer;font-size:11px"
                  >
                    Reset Position
                  </button>
                )}
              </div>
            ) : (
              <div style="color:#64748b;font-style:italic">Click a component to select it</div>
            )}
          </div>

          {/* Zoom controls */}
          <div style="padding:10px 12px;border-top:1px solid #334155;flex-shrink:0">
            <div style="font-weight:700;color:#e2e8f0;margin-bottom:8px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Zoom</div>
            <div style="display:flex;gap:4px;align-items:center">
              <button
                onClick={handleZoomOut}
                style="padding:3px 8px;background:#0f172a;border:1px solid #334155;border-radius:3px;color:#e2e8f0;cursor:pointer;font-size:14px"
              >-</button>
              <div style="flex:1;text-align:center;color:#94a3b8;font-size:12px;font-family:monospace">
                {Math.round(zoomLevel * 100)}%
              </div>
              <button
                onClick={handleZoomIn}
                style="padding:3px 8px;background:#0f172a;border:1px solid #334155;border-radius:3px;color:#e2e8f0;cursor:pointer;font-size:14px"
              >+</button>
            </div>
            <button
              onClick={handleFitView}
              style="width:100%;margin-top:6px;padding:4px 8px;background:#0f172a;border:1px solid #334155;border-radius:3px;color:#94a3b8;cursor:pointer;font-size:11px"
            >
              Fit to View
            </button>
          </div>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          tabIndex={0}
          style="flex:1;min-width:0;min-height:0;outline:none;cursor:crosshair;background:#0f172a"
        />
      </div>

      {/* Status bar */}
      <div style="display:flex;align-items:center;gap:16px;padding:4px 12px;background:#1e293b;border-top:1px solid #334155;font-size:11px;color:#64748b;flex-shrink:0">
        <span>
          Cursor: {cursorPos ? `(${cursorPos.mmX.toFixed(1)}, ${cursorPos.mmY.toFixed(1)})mm` : '--'}
        </span>
        <span>Zoom: {Math.round(zoomLevel * 100)}%</span>
        <span>Grid: 0.5mm</span>
        {collisions && (
          <span style="color:#ef4444;font-weight:600;margin-left:auto">
            Collisions detected!
          </span>
        )}
      </div>
    </div>
  );
}
