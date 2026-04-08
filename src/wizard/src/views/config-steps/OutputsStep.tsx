import { h } from 'preact';
import { Checkbox } from '../../components/common/Checkbox';
import type { BuildConfig } from '../../types/project.types';
import type { ConfigStepProps } from './types';

export function OutputsStep({ localConfig, updateLocal }: ConfigStepProps) {
  const out = (localConfig as BuildConfig)?.outputs;
  const outputFields: Array<{ key: keyof NonNullable<BuildConfig['outputs']>; label: string }> = [
    { key: 'schematic', label: 'Schematic (KiCad)' },
    { key: 'pcb', label: 'PCB Layout (KiCad)' },
    { key: 'gerbers', label: 'Gerber Files' },
    { key: 'plate', label: 'Plate DXF' },
    { key: 'bom', label: 'Bill of Materials' },
    { key: 'firmware', label: 'Firmware Source' },
    { key: 'notes', label: 'Build Notes' },
  ];
  return (
    <div style="display:flex;flex-direction:column;gap:16px;max-width:500px">
      {outputFields.map((f) => (
        <Checkbox
          key={f.key}
          checked={out?.[f.key] ?? false}
          onChange={(v) => updateLocal('outputs', f.key, v)}
          label={f.label}
        />
      ))}
    </div>
  );
}
