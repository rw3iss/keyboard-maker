import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { Modal } from '../components/common/Modal';
import { Spinner } from '../components/common/Spinner';
import { currentProject, projectConfig, activeTab } from '../state/app.state';
import { addToast } from '../services/toast.service';
import { apiGet } from '../services/api.service';
import { saveLastProject } from '../App';
import type { ProjectInfo, BuildConfig } from '../types/project.types';

interface Props {
  onClose: () => void;
}

export function OpenProject({ onClose }: Props) {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<ProjectInfo[]>('/api/projects')
      .then(setProjects)
      .catch(() => addToast('Failed to load projects', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const openProject = async (name: string, hasConfig: boolean) => {
    if (!hasConfig) {
      addToast(`Project "${name}" has no build config. Configure it first.`, 'warning');
      currentProject.value = name;
      projectConfig.value = null;
      activeTab.value = 'overview';
      saveLastProject(name);
      onClose();
      return;
    }
    try {
      const data = await apiGet<{ config: BuildConfig }>(`/api/projects/${name}`);
      currentProject.value = name;
      projectConfig.value = data.config;
      activeTab.value = 'overview';
      saveLastProject(name);
      addToast(`Opened project: ${name}`, 'success');
      onClose();
    } catch {
      addToast(`Failed to open project "${name}"`, 'error');
    }
  };

  return (
    <Modal title="Open Project" onClose={onClose}>
      {loading ? (
        <div style="text-align:center;padding:20px">
          <Spinner />
        </div>
      ) : (
        <div style="display:flex;flex-direction:column;gap:8px;min-width:400px">
          {projects.map((p) => (
            <div
              key={p.name}
              onClick={() => openProject(p.name, p.hasConfig)}
              style="padding:12px 16px;background:var(--bg-hover);border-radius:var(--radius);cursor:pointer;display:flex;justify-content:space-between;align-items:center"
            >
              <div>
                <div style="font-weight:600">{p.name}</div>
                <div style="font-size:12px;color:var(--text-muted)">
                  {new Date(p.lastModified).toLocaleDateString()}
                </div>
              </div>
              <div style="display:flex;gap:6px">
                {p.hasConfig && (
                  <span style="background:var(--success);color:#000;padding:2px 8px;border-radius:10px;font-size:11px">
                    Config
                  </span>
                )}
                {p.hasBuild && (
                  <span style="background:var(--accent);color:#000;padding:2px 8px;border-radius:10px;font-size:11px">
                    Built
                  </span>
                )}
                {!p.hasConfig && (
                  <span style="background:var(--warning);color:#000;padding:2px 8px;border-radius:10px;font-size:11px">
                    New
                  </span>
                )}
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <div style="text-align:center;color:var(--text-muted);padding:20px">
              No projects found. Create one with File &rarr; New.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
