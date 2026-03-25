import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { currentProject, projectConfig, isProjectDirty } from '../../state/app.state';
import { apiPut } from '../../services/api.service';
import { addToast } from '../../services/toast.service';

interface MenuItem {
  label: string;
  action?: () => void;
  separator?: boolean;
}

interface AppMenuProps {
  onNewProject?: () => void;
  onOpenProject?: () => void;
  onAbout?: () => void;
}

export function AppMenu({ onNewProject, onOpenProject, onAbout }: AppMenuProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleSave = async () => {
    setOpenMenu(null);
    const project = currentProject.value;
    const config = projectConfig.value;
    if (!project || !config) {
      addToast('No project to save', 'warning');
      return;
    }
    try {
      await apiPut(`/api/projects/${project}/config`, config);
      isProjectDirty.value = false;
      addToast('Project saved', 'success');
    } catch {
      addToast('Failed to save project', 'error');
    }
  };

  const fileItems: MenuItem[] = [
    { label: 'New Project', action: () => { setOpenMenu(null); onNewProject?.(); } },
    { label: 'Open Project', action: () => { setOpenMenu(null); onOpenProject?.(); } },
    { label: 'Save', action: handleSave },
    { separator: true, label: '' },
    { label: 'Exit', action: () => { setOpenMenu(null); } },
  ];

  const helpItems: MenuItem[] = [
    { label: 'About', action: () => { setOpenMenu(null); onAbout?.(); } },
  ];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    if (openMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenu]);

  const renderMenu = (name: string, items: MenuItem[]) => (
    <div class="app-menu-trigger">
      <button
        class="app-menu-btn"
        onClick={() => setOpenMenu(openMenu === name ? null : name)}
      >
        {name.charAt(0).toUpperCase() + name.slice(1)}
      </button>
      {openMenu === name && (
        <div class="app-menu-dropdown">
          {items.map((item, i) =>
            item.separator ? (
              <div key={i} class="app-menu-separator" />
            ) : (
              <button
                key={item.label}
                class="app-menu-dropdown-item"
                onClick={item.action}
              >
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );

  return (
    <div class="app-menu" ref={menuRef}>
      <div class="app-menu-brand">Keyboard Maker</div>
      <div class="app-menu-items">
        {renderMenu('file', fileItems)}
        {renderMenu('help', helpItems)}
      </div>
    </div>
  );
}
