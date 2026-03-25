import { h } from 'preact';
import { Modal } from '../components/common/Modal';
import { APP_CONFIG } from '../config/app.config';

interface Props {
  onClose: () => void;
}

export function About({ onClose }: Props) {
  return (
    <Modal title="About" onClose={onClose}>
      <div style="min-width:350px;text-align:center;padding:16px 0">
        <h2 style="margin:0 0 4px">{APP_CONFIG.appName}</h2>
        <div style="color:var(--text-muted);margin-bottom:16px">v{APP_CONFIG.appVersion}</div>
        <p style="margin:0 0 12px;line-height:1.5">
          A web-based wizard for designing custom mechanical keyboards.
          Configure your layout, select components, and generate production-ready
          PCB files, firmware, and build documentation.
        </p>
        <div style="font-size:13px;color:var(--text-muted)">
          Built with Preact, KiCad, and open-source component libraries.
        </div>
      </div>
    </Modal>
  );
}
