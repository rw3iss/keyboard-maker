import { h } from 'preact';
import { Modal } from '../components/common/Modal';
import { APP_CONFIG } from '../config/app.config';

interface Props {
  onClose: () => void;
}

export function About({ onClose }: Props) {
  return (
    <Modal title="About" onClose={onClose}>
      <div style="min-width:380px;text-align:center;padding:20px 16px;display:flex;flex-direction:column;gap:14px;align-items:center">
        <h2 style="margin:0">{APP_CONFIG.appName}</h2>
        <div style="color:var(--text-muted);font-size:13px;margin-top:-8px">
          v{APP_CONFIG.appVersion}
        </div>

        <div style="height:1px;background:var(--border);width:60%;margin:4px 0" />

        <div style="font-size:14px;line-height:1.7;color:var(--text-secondary)">
          Designed by{' '}
          <a
            href="https://ryanweiss.net"
            target="_blank"
            rel="noopener noreferrer"
            style="color:var(--accent);font-weight:600"
          >
            Ryan Weiss
          </a>
        </div>

        <div style="font-size:14px;line-height:1.7;color:var(--text-secondary)">
          Developed by{' '}
          <a
            href="https://claude.ai"
            target="_blank"
            rel="noopener noreferrer"
            style="color:var(--accent);font-weight:600"
          >
            Claude
          </a>
        </div>

        <div style="height:1px;background:var(--border);width:60%;margin:4px 0" />

        <p style="margin:0;font-size:13px;color:var(--text-muted);line-height:1.6;max-width:340px">
          If you find Keybuild useful, star the repo, or buy my cats and fish some food:
        </p>

        <a
          href="https://buymeacoffee.com/ttv1xp6yAj"
          target="_blank"
          rel="noopener noreferrer"
          style="display:inline-flex;align-items:center;gap:6px;padding:8px 18px;font-size:13px;font-weight:600;background:var(--accent);color:#0f172a;border-radius:var(--radius);text-decoration:none;transition:background var(--transition-fast)"
        >
          {'\u2615'} buymeacoffee.com/ttv1xp6yAj
        </a>
      </div>
    </Modal>
  );
}
