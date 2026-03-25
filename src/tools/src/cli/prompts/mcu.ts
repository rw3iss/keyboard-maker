import { select } from '../prompt-wrapper.js';
import { loadCategory } from '../data-loader.js';
import { showComponentInfo } from './component-info.js';

export async function promptMcu() {
  const mcus = loadCategory('mcus');

  if (mcus.length === 0) {
    return { type: 'nrf52840', module: 'nice_nano_v2', gpioAvailable: 21 };
  }

  let confirmed = false;
  let mcu: (typeof mcus)[number] | undefined;
  let data: any;

  while (!confirmed) {
    const moduleId = await select({
      message: 'Select MCU module:',
      choices: mcus.map(m => {
        const d = m.data as any;
        const summary = d.summary ? ` (${d.summary})` : '';
        return {
          name: `${m.name}${summary}`,
          value: m.id,
          description: `${d.gpioCount ?? '?'} GPIOs, ${d.hasBle ? 'BLE' : 'no BLE'}, ${d.hasUsb ? 'USB' : 'no USB'}`,
        };
      }),
    });

    mcu = mcus.find(m => m.id === moduleId)!;
    data = mcu.data as any;

    const specs = [
      { label: 'Chip', value: data.chip ?? 'Unknown' },
      { label: 'Form Factor', value: data.formFactor ?? 'Unknown' },
      { label: 'GPIOs', value: String(data.gpioCount ?? '?') },
      { label: 'BLE', value: data.hasBle ? `Yes (v${data.bleVersion ?? '?'})` : 'No' },
      { label: 'USB', value: data.hasUsb ? (data.usbType ?? 'Yes') : 'No' },
      { label: 'LiPo Charger', value: data.hasLipoCharger ? `Yes (${data.chargerMaxMa ?? '?'}mA max)` : 'No' },
      { label: 'Flash / RAM', value: `${data.flashSize ?? '?'} / ${data.ramSize ?? '?'}` },
      { label: 'Clock', value: data.clockSpeed ?? 'Unknown' },
    ];

    const summary = data.summary ?? mcu.description;
    const notes: string[] = data.designNotes ?? [];

    confirmed = await showComponentInfo(mcu.name, summary, specs, notes);
  }

  // Map to config format (underscores for IDs)
  return {
    type: data.chip?.toLowerCase() ?? 'nrf52840',
    module: mcu!.id.replace(/-/g, '_'),
    gpioAvailable: data.gpioCount ?? 21,
  };
}
