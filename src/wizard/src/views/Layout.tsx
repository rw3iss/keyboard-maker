import { h } from 'preact';
import { LayoutEditor } from '../editors/LayoutEditor';
import { projectConfig, currentProject } from '../state/app.state';
import { addToast } from '../services/toast.service';
import { layoutComponents } from '../editors/LayoutState';

export function Layout() {
  const config = projectConfig.value;
  if (!config) {
    return (
      <div style="padding:40px;text-align:center;color:var(--text-muted, #64748b)">
        No project loaded
      </div>
    );
  }

  // TODO: load KLE keys from the project's layout file via /api/projects/:name
  // For now, use a placeholder array
  const keys: any[] = [];

  const handleSave = async () => {
    const overrides = layoutComponents.value
      .filter(c => c.draggable)
      .map(c => ({ id: c.id, type: c.type, x: c.x, y: c.y }));

    try {
      const name = currentProject.value;
      if (!name) throw new Error('No project selected');

      await fetch(`/api/projects/${encodeURIComponent(name)}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          layout_overrides: overrides,
        }),
      });
      addToast('Layout saved', 'success');
    } catch (err: any) {
      addToast(`Save failed: ${err.message}`, 'error');
    }
  };

  return (
    <div style="display:flex;flex-direction:column;height:100%">
      <div style="display:flex;align-items:center;gap:12px;padding:8px 16px;background:var(--bg-secondary, #1e293b);border-bottom:1px solid var(--border, #334155)">
        <a href="/overview" style="color:var(--text-secondary, #94a3b8);font-size:13px;text-decoration:none">
          &larr; Back to Overview
        </a>
        <span style="font-size:14px;font-weight:600;color:var(--text-primary, #e2e8f0)">Layout Editor</span>
        <div style="flex:1" />
        <button
          onClick={handleSave}
          style="padding:6px 16px;background:var(--accent, #6ecbf5);color:#000;border:none;border-radius:var(--radius-sm, 4px);cursor:pointer;font-weight:600"
        >
          Save Layout
        </button>
      </div>
      <LayoutEditor config={config} keys={keys} />
    </div>
  );
}
