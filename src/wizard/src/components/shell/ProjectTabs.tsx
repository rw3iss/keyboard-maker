import { route } from 'preact-router';
import { activeTab, hasProject } from '../../state/app.state';

const TABS = [
  { id: 'overview' as const, label: 'Overview', path: '/overview' },
  { id: 'config' as const, label: 'Config', path: '/config' },
  { id: 'build' as const, label: 'Build', path: '/build' },
];

export function ProjectTabs() {
  if (!hasProject.value) return null;

  return (
    <div class="project-tabs">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          class={`project-tab ${activeTab.value === tab.id ? 'project-tab--active' : ''}`}
          onClick={() => {
            activeTab.value = tab.id;
            route(tab.path);
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
