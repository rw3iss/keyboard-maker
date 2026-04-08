import { h } from 'preact';
import { Dropdown } from '../../components/common/Dropdown';
import { Checkbox } from '../../components/common/Checkbox';
import type { BuildConfig } from '../../types/project.types';
import type { ConfigStepProps } from './types';

export function ConnectivityStep({ localConfig, updateLocal }: ConfigStepProps) {
  const conn = (localConfig as BuildConfig)?.connectivity;
  return (
    <div style="display:flex;flex-direction:column;gap:16px;max-width:500px">
      <Checkbox
        checked={conn?.usb ?? true}
        onChange={(v) => updateLocal('connectivity', 'usb', v)}
        label="USB Connection"
      />
      <Checkbox
        checked={conn?.bluetooth ?? false}
        onChange={(v) => updateLocal('connectivity', 'bluetooth', v)}
        label="Bluetooth (BLE)"
      />
      {conn?.bluetooth && (
        <Dropdown
          label="Bluetooth Version"
          options={[
            { label: 'BLE 5.0', value: '5.0' },
            { label: 'BLE 5.1', value: '5.1' },
            { label: 'BLE 5.2', value: '5.2' },
          ]}
          value={conn?.bluetoothVersion || '5.0'}
          onChange={(v) => updateLocal('connectivity', 'bluetoothVersion', v)}
        />
      )}
    </div>
  );
}
