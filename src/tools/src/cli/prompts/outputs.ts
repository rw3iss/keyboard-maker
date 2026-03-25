import { checkbox } from '../prompt-wrapper.js';

export async function promptOutputs() {
  const selected = await checkbox({
    message: 'Select output files to generate:',
    choices: [
      { name: 'Bill of Materials (BOM.md + BOM.csv)', value: 'bom', checked: true },
      { name: 'KiCad Schematic (.kicad_sch)', value: 'schematic', checked: true },
      { name: 'KiCad PCB Layout (.kicad_pcb)', value: 'pcb', checked: true },
      { name: 'Gerber Files (for fabrication)', value: 'gerbers', checked: true },
      { name: 'Switch Plate DXF (laser cutting)', value: 'plate', checked: true },
      { name: 'ZMK Firmware Config', value: 'firmware', checked: true },
      { name: 'Design Notes & Warnings', value: 'notes', checked: true },
    ],
  });

  return {
    bom: selected.includes('bom'),
    schematic: selected.includes('schematic'),
    pcb: selected.includes('pcb'),
    gerbers: selected.includes('gerbers'),
    plate: selected.includes('plate'),
    firmware: selected.includes('firmware'),
    notes: selected.includes('notes'),
  };
}
