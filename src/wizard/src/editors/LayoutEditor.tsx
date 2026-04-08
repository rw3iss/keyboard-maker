import { h } from 'preact';
import { useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { LayoutCanvas } from './LayoutCanvas';
import { apiGet } from '../services/api.service';
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
  setComponentSide,
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

  // Fetch component data for accurate dimensions, then init layout
  useEffect(() => {
    if (!canvasRef.current) return;
    // Fetch all relevant component categories in parallel
    Promise.all([
      apiGet<any[]>('/api/components/mcus').catch(() => []),
      apiGet<any[]>('/api/components/batteries').catch(() => []),
      apiGet<any[]>('/api/components/chargers').catch(() => []),
      apiGet<any[]>('/api/components/connectors').catch(() => []),
    ]).then(([mcus, batteries, chargers, connectors]) => {
      const mcuId = config?.mcu?.module;
      const batteryId = config?.power?.batteryCapacityMah;
      const chargerId = config?.power?.chargerIc;
      const connectorId = config?.usbConnector?.model;

      // Match battery by capacity since that's the config key
      const batteryData = batteries.find((b: any) =>
        b.id === batteryId || b.capacityMah === batteryId
          || String(b.capacityMah) === String(batteryId)
      ) ?? batteries[0] ?? null;

      initLayout(config, keys, {
        mcu: mcus.find((m: any) => m.id === mcuId) ?? null,
        battery: batteryData,
        charger: chargers.find((c: any) => c.id === chargerId) ?? null,
        connector: connectors.find((c: any) => c.id === connectorId) ?? connectors[0] ?? null,
      });
    }).catch(() => initLayout(config, keys));
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
        <span>Drag to reposition. Scroll to zoom. Middle-click to pan. Arrows nudge 1mm (Shift=0.25mm, Ctrl=0.1mm). Ctrl+Z undo, Ctrl+Shift+Z redo.</span>
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

        {/* Right sidebar: Component Properties */}
        {selected && (
          <div style="width:220px;flex-shrink:0;background:#1e293b;border-left:1px solid #334155;overflow-y:auto;display:flex;flex-direction:column;font-size:12px">
            <div style="padding:10px 12px;border-bottom:1px solid #334155">
              <div style="font-weight:700;color:#e2e8f0;margin-bottom:8px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Properties</div>
              <div style="color:#06b6d4;font-weight:600;margin-bottom:6px">{selected.label || selected.id}</div>
              <div style="color:#64748b;font-size:11px;margin-bottom:8px">{selected.type}</div>

              {(selected.collision || selected.outOfBounds) && (
                <div style="color:#ef4444;font-weight:600;margin-bottom:8px;padding:4px 6px;background:#3f1111;border-radius:4px;font-size:11px">
                  {selected.collision ? 'COLLISION DETECTED' : 'OUT OF BOUNDS'}
                </div>
              )}
            </div>

            {/* Board Side selector */}
            {selected.draggable && selected.type !== 'screw' && (
              <div style="padding:10px 12px;border-bottom:1px solid #334155">
                <div style="font-weight:600;color:#94a3b8;margin-bottom:6px;font-size:11px">Board Side</div>
                <div style="display:flex;gap:4px">
                  {(['front', 'back', 'through'] as const).map((side) => {
                    const isActive = selected.side === side;
                    const colors: Record<string, string> = {
                      front: isActive ? 'background:#1e3a5f;color:#6ecbf5;border-color:#6ecbf5' : 'color:#64748b',
                      back: isActive ? 'background:#3f1e1e;color:#f87171;border-color:#f87171' : 'color:#64748b',
                      through: isActive ? 'background:#1e3a1e;color:#86efac;border-color:#86efac' : 'color:#64748b',
                    };
                    return (
                      <button
                        key={side}
                        onClick={() => setComponentSide(selected.id, side)}
                        style={`flex:1;padding:4px 2px;font-size:10px;font-weight:700;border:1px solid #334155;border-radius:3px;cursor:pointer;background:#0f172a;${colors[side]}`}
                      >
                        {side === 'front' ? 'Front' : side === 'back' ? 'Back' : 'Thru'}
                      </button>
                    );
                  })}
                </div>
                <div style="color:#475569;font-size:10px;margin-top:4px;line-height:1.4">
                  {selected.side === 'front' && 'Top side, same as switches'}
                  {selected.side === 'back' && 'Bottom side, under switches (no switch collision)'}
                  {selected.side === 'through' && 'Passes through board, collides with all sides'}
                </div>
              </div>
            )}

            {/* Position */}
            <div style="padding:10px 12px;border-bottom:1px solid #334155">
              <div style="font-weight:600;color:#94a3b8;margin-bottom:6px;font-size:11px">Position</div>
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
            </div>

            {/* Dimensions (read-only) */}
            <div style="padding:10px 12px;border-bottom:1px solid #334155">
              <div style="font-weight:600;color:#94a3b8;margin-bottom:6px;font-size:11px">Dimensions</div>
              <div style="display:flex;gap:8px">
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
              {selected.fanout && (
                <div style="color:#86efac;font-size:10px;margin-top:4px">
                  + {(selected.fanoutExtend ?? 3.6).toFixed(1)}mm fanout zone
                </div>
              )}
            </div>

            {/* Actions */}
            {selected.draggable && (
              <div style="padding:10px 12px">
                <button
                  onClick={() => resetComponentPosition(selected.id)}
                  style="width:100%;padding:5px 8px;background:#1e293b;border:1px solid #334155;border-radius:4px;color:#94a3b8;cursor:pointer;font-size:11px"
                >
                  Reset Position
                </button>
              </div>
            )}
          </div>
        )}
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
