export interface WizardStep {
  id: string;
  label: string;
  category?: string;
  required: boolean;
  icon: string;
  description: string;
}

export const WIZARD_STEPS: WizardStep[] = [
  { id: 'layout', label: 'Layout', required: true, icon: '\u2328\uFE0F', description: 'Keyboard layout (KLE file)' },
  { id: 'switches', label: 'Switches', category: 'switches', required: true, icon: '\uD83D\uDD18', description: 'Mechanical switch type' },
  { id: 'mcu', label: 'MCU Module', category: 'mcus', required: true, icon: '\uD83D\uDD27', description: 'Microcontroller' },
  { id: 'connectivity', label: 'Connectivity', required: false, icon: '\uD83D\uDCE1', description: 'USB and Bluetooth' },
  { id: 'power', label: 'Power', category: 'chargers', required: false, icon: '\uD83D\uDD0B', description: 'Battery and charging' },
  { id: 'features', label: 'Features', required: false, icon: '\uD83D\uDCA1', description: 'RGB, encoder, display' },
  { id: 'pcb', label: 'PCB & Layers', required: true, icon: '\uD83D\uDCD0', description: 'Layer count and routing' },
  { id: 'physical', label: 'Physical Layout', required: false, icon: '\uD83D\uDCCF', description: 'Connector position, case height' },
  { id: 'outputs', label: 'Outputs', required: true, icon: '\uD83D\uDCE6', description: 'Files to generate' },
  { id: 'layout-editor', label: 'Layout Editor', required: false, icon: '\u270F\uFE0F', description: 'Fine-tune component positions' },
];
