import { h } from 'preact';
import { useState } from 'preact/hooks';
import { Modal } from '../components/common/Modal';
import { Button } from '../components/common/Button';
import { currentProject, projectConfig, activeTab } from '../state/app.state';
import { addToast } from '../services/toast.service';
import { apiPost } from '../services/api.service';
import { saveLastProject } from '../App';
import type { BuildConfig } from '../types/project.types';

interface Props {
  onClose: () => void;
}

export function NewProject({ onClose }: Props) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Project name is required');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setError('Name must contain only letters, numbers, hyphens, and underscores');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const data = await apiPost<{ config: BuildConfig }>('/api/projects', { name: trimmed });
      currentProject.value = trimmed;
      projectConfig.value = data.config ?? null;
      activeTab.value = 'overview';
      saveLastProject(trimmed);
      addToast(`Created project: ${trimmed}`, 'success');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleCreate();
  };

  return (
    <Modal title="New Project" onClose={onClose}>
      <div style="min-width:400px;display:flex;flex-direction:column;gap:16px">
        <div>
          <label style="display:block;margin-bottom:6px;font-weight:600">Project Name</label>
          <input
            type="text"
            class="input"
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            onKeyDown={handleKeyDown}
            placeholder="my-keyboard"
            autofocus
            style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-input);color:var(--text)"
          />
          {error && (
            <div style="color:var(--error);font-size:13px;margin-top:6px">{error}</div>
          )}
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={creating} onClick={handleCreate}>
            Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}
