import { select } from '../prompt-wrapper.js';
import { loadCategory } from '../data-loader.js';
import { showComponentInfo } from './component-info.js';

export async function promptPower() {
  const chargers = loadCategory('chargers');
  const batteries = loadCategory('batteries');

  // --- Charger selection with info screen ---
  let chargerIc = '';
  let chargerData: any;

  if (chargers.length === 0) {
    chargerIc = 'mcp73831';
    chargerData = { maxChargeCurrent: 500 };
  } else {
    let confirmed = false;
    let selectedCharger: (typeof chargers)[number] | undefined;

    while (!confirmed) {
      chargerIc = await select({
        message: 'Select battery charger IC:',
        choices: chargers.map(c => {
          const d = c.data as any;
          const summary = d.summary ? ` (${d.summary})` : '';
          return {
            name: `${c.name}${summary}`,
            value: c.id,
            description: c.description,
          };
        }),
      });

      selectedCharger = chargers.find(c => c.id === chargerIc)!;
      chargerData = selectedCharger.data as any;

      const specs = [
        { label: 'Package', value: chargerData.package ?? 'Unknown' },
        { label: 'Max Charge Current', value: `${chargerData.maxChargeCurrent ?? '?'}${chargerData.chargeCurrentUnit ?? 'mA'}` },
        { label: 'Input Voltage', value: chargerData.inputVoltage ? `${chargerData.inputVoltage.min}-${chargerData.inputVoltage.max}V` : 'Unknown' },
        { label: 'Regulation Voltage', value: chargerData.regulationVoltage ? `${chargerData.regulationVoltage}V` : 'Unknown' },
        { label: 'Programmable Current', value: chargerData.programmableChargeCurrent ? 'Yes' : 'No' },
        { label: 'Type', value: chargerData.type ?? 'Unknown' },
      ];

      const summary = chargerData.summary ?? selectedCharger.description;
      const notes: string[] = chargerData.designNotes ?? [];

      confirmed = await showComponentInfo(selectedCharger.name, summary, specs, notes);
    }
  }

  // --- Battery selection with info screen ---
  let capacityStr: string;

  if (batteries.length === 0) {
    capacityStr = await select({
      message: 'Select battery capacity:',
      choices: [
        { name: '500mAh', value: '500' },
        { name: '1000mAh', value: '1000' },
        { name: '2000mAh', value: '2000' },
      ],
    });
  } else {
    let confirmed = false;

    // Initialize with a default; the loop always runs at least once
    capacityStr = '';

    while (!confirmed) {
      capacityStr = await select({
        message: 'Select battery capacity:',
        choices: batteries.map(b => {
          const d = b.data as any;
          const summary = d.summary ? ` (${d.summary})` : '';
          return {
            name: `${b.name}${summary}`,
            value: d.capacityMah.toString(),
            description: `${d.dimensions?.length ?? '?'}x${d.dimensions?.width ?? '?'}x${d.dimensions?.thickness ?? d.dimensions?.height ?? '?'}mm`,
          };
        }),
      });

      const selectedBattery = batteries.find(b => {
        const d = b.data as any;
        return d.capacityMah.toString() === capacityStr;
      })!;
      const battData = selectedBattery.data as any;

      const specs = [
        { label: 'Capacity', value: `${battData.capacityMah}mAh` },
        { label: 'Voltage', value: `${battData.voltage?.nominal ?? '?'}V nominal (${battData.voltage?.fullCharge ?? '?'}V full)` },
        { label: 'Dimensions', value: `${battData.dimensions?.length ?? '?'}x${battData.dimensions?.width ?? '?'}x${battData.dimensions?.thickness ?? battData.dimensions?.height ?? '?'}mm` },
        { label: 'Weight', value: battData.weight ? `${battData.weight.value}${battData.weight.unit}` : 'Unknown' },
        { label: 'Connector', value: battData.connector ?? 'Unknown' },
        { label: 'BLE Life (no LEDs)', value: battData.estimatedKeyboardLife?.withoutLeds ?? 'Unknown' },
        { label: 'BLE Life (LEDs)', value: battData.estimatedKeyboardLife?.withLeds ?? 'Unknown' },
      ];

      const summary = battData.summary ?? selectedBattery.description;
      const notes: string[] = battData.designNotes ?? [];

      confirmed = await showComponentInfo(selectedBattery.name, summary, specs, notes);
    }
  }

  const maxCurrent = chargerData?.maxChargeCurrent ?? 500;

  return {
    battery: true,
    batteryType: 'lipo',
    batteryCapacityMah: parseInt(capacityStr, 10),
    chargerIc,
    chargeCurrentMa: Math.min(maxCurrent, 500),
  };
}
