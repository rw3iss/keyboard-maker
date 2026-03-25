export interface Toast {
  id: string;
  message: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

export interface ModalConfig {
  title: string;
  body: any;
  actions: Array<{ label: string; variant?: string; onClick: () => void }>;
}
