import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { AppMenu } from './components/shell/AppMenu';
import { ProjectTabs } from './components/shell/ProjectTabs';
import { StatusBar } from './components/shell/StatusBar';
import { ToastContainer } from './components/shell/ToastContainer';
import { Overview } from './views/Overview';
import { Config } from './views/Config';
import { Build } from './views/Build';
import { Layout } from './views/Layout';
import { PartDetail } from './views/PartDetail';
import { OpenProject } from './views/OpenProject';
import { NewProject } from './views/NewProject';
import { About } from './views/About';
import { currentProject, projectConfig, serverConfig } from './state/app.state';
import { addToast } from './services/toast.service';
import { apiGet } from './services/api.service';
import Router from 'preact-router';
import './styles/shell.css';
import './styles/components.css';

const LAST_PROJECT_KEY = 'keyboard-maker:last-project';

/** Save last opened project to localStorage */
export function saveLastProject(name: string) {
  try { localStorage.setItem(LAST_PROJECT_KEY, name); } catch { /* ignore */ }
}

export function App() {
  const [modal, setModal] = useState<'open' | 'new' | 'about' | null>(null);

  // On mount: fetch server config + restore last project
  useEffect(() => {
    apiGet<{ enableAutoRouting: boolean }>('/api/config/server')
      .then((cfg) => { serverConfig.value = cfg; })
      .catch(() => { /* use defaults */ });

    const last = localStorage.getItem(LAST_PROJECT_KEY);
    if (last && !currentProject.value) {
      apiGet<{ config: any }>(`/api/projects/${last}`)
        .then((data) => {
          currentProject.value = last;
          projectConfig.value = data.config || null;
          addToast(`Restored project: ${last}`, 'info');
        })
        .catch(() => {
          // Project no longer exists — clear
          localStorage.removeItem(LAST_PROJECT_KEY);
        });
    }
  }, []);

  return (
    <div class="app-shell">
      <AppMenu
        onNewProject={() => setModal('new')}
        onOpenProject={() => setModal('open')}
        onAbout={() => setModal('about')}
      />
      <ProjectTabs />
      <main class="app-content">
        <Router>
          <Overview path="/" />
          <Overview path="/overview" />
          <Config path="/config" />
          <Config path="/config/:step" />
          <Build path="/build" />
          <Layout path="/layout" />
          <PartDetail path="/parts/:category/:id" />
        </Router>
      </main>
      <StatusBar />
      <ToastContainer />

      {modal === 'open' && <OpenProject onClose={() => setModal(null)} />}
      {modal === 'new' && <NewProject onClose={() => setModal(null)} />}
      {modal === 'about' && <About onClose={() => setModal(null)} />}
    </div>
  );
}
