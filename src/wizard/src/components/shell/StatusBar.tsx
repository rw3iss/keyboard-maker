import { currentProject, isProjectDirty } from '../../state/app.state';

export function StatusBar() {
  const project = currentProject.value;
  const dirty = isProjectDirty.value;

  return (
    <div class="status-bar">
      <span class="status-bar-project">
        {project ? (
          <>
            {project}
            {dirty && <span class="status-bar-dirty"> (unsaved)</span>}
          </>
        ) : (
          'No project open'
        )}
      </span>
      <span class="status-bar-spacer" />
      <span class="status-bar-version">v0.1.0</span>
    </div>
  );
}
