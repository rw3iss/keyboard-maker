import { h } from 'preact';
import { useState } from 'preact/hooks';
import { Modal } from '../components/common/Modal';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
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

  return (
    <Modal title="New Project" onClose={onClose}>
      <div class="u-stack" style="min-width:400px">
        <Input
          label="Project Name"
          required
          value={name}
          onInput={(v) => { setName(v); if (error) setError(''); }}
          onEnter={handleCreate}
          placeholder="my-keyboard"
          autofocus
          error={error || undefined}
          hint={error ? undefined : 'Letters, numbers, hyphens, and underscores only.'}
        />
        <div style="display:flex;justify-content:flex-end;gap:var(--space-2)">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={creating} onClick={handleCreate}>
            Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}
