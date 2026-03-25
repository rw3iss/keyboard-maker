import { confirm } from '../prompt-wrapper.js';
import chalk from 'chalk';
import type { BuildConfig } from '../../shared/types.js';
import { flagDesignConcerns } from '../../config/validator.js';

export async function promptConfirm(config: BuildConfig): Promise<boolean> {
  console.log('\n' + chalk.bold.cyan('━━━ Build Configuration Summary ━━━'));
  console.log(`  Project:      ${config.project.name}`);
  console.log(`  Layout:       ${config.layout.path || config.layout.kleUrl || 'template'}`);
  console.log(`  Switches:     ${config.switches.model} (${config.switches.hotswap ? 'hot-swap' : 'soldered'})`);
  console.log(`  MCU:          ${config.mcu.module} (${config.mcu.gpioAvailable} GPIOs)`);
  console.log(`  USB:          ${config.connectivity.usb ? 'Yes' : 'No'}`);
  console.log(`  Bluetooth:    ${config.connectivity.bluetooth ? 'Yes' : 'No'}`);
  if (config.power.battery) {
    console.log(`  Battery:      ${config.power.batteryCapacityMah}mAh ${config.power.batteryType}`);
    console.log(`  Charger:      ${config.power.chargerIc} @ ${config.power.chargeCurrentMa}mA`);
  }
  const rgbLabel = config.features.rgbPerKey
    ? `Per-key (${config.features.ledPlacement === 'above' ? 'above switch' : 'below switch'})`
    : config.features.rgbUnderglow ? 'Underglow' : 'None';
  console.log(`  RGB:          ${rgbLabel}`);
  console.log(`  PCB:          ${config.pcb.layers}-layer, ${config.pcb.thickness}mm, routing: ${config.pcb.routing}`);

  // Physical layout
  const sideLabel = config.physical.connectorSide === 'back'
    ? `Back (${config.physical.connectorPosition})`
    : config.physical.connectorSide === 'left' ? 'Left side' : 'Right side';
  console.log(`  Connector:    ${sideLabel}`);
  if (config.physical.connectorSide === 'back' && config.connectivity.bluetooth) {
    console.log(`  Port order:   ${config.physical.connectorOrder === 'usb-first' ? 'USB then power' : 'Power then USB'}`);
  }

  // Estimated dimensions
  const frontH = config.physical.frontHeight;
  const rearH = config.physical.rearHeight;
  if (frontH != null && rearH != null) {
    // Estimate width/depth from a typical 65% layout (~15u wide, ~5u deep)
    const estWidth = 310;
    const estDepth = 120;
    console.log(chalk.dim(`\n  Estimated Dimensions:`));
    console.log(chalk.dim(`    Width:  ${estWidth}mm`));
    console.log(chalk.dim(`    Depth:  ${estDepth}mm`));
    console.log(chalk.dim(`    Front:  ${frontH.toFixed(1)}mm  Rear: ${rearH.toFixed(1)}mm`));

    // ASCII side-profile diagram
    const profileWidth = 40;
    const bar = '\u2501'.repeat(profileWidth);
    const fill = '\u2593'.repeat(profileWidth + 2);
    const usbLabel = config.physical.connectorSide === 'back' ? '[USB]' : '';
    console.log(chalk.dim(''));
    console.log(chalk.dim(`    Side profile:`));
    console.log(chalk.dim(`                          ${'_'.repeat(profileWidth - 5)}`));
    console.log(chalk.dim(`                         /${' '.repeat(profileWidth - 5)}|`));
    console.log(chalk.dim(`    ${bar}${' '.repeat(2)}|  ${rearH.toFixed(1)}mm`));
    console.log(chalk.dim(`    ${fill}|`));
    console.log(chalk.dim(`    ${frontH.toFixed(1)}mm${' '.repeat(profileWidth - 8)}${usbLabel}`));
  }

  const concerns = flagDesignConcerns(config);
  if (concerns.length > 0) {
    console.log('\n' + chalk.bold.yellow('  Design Notes:'));
    for (const note of concerns) {
      const icon = note.severity === 'error' ? chalk.red('X') : note.severity === 'warning' ? chalk.yellow('!') : chalk.blue('i');
      console.log(`  ${icon} ${note.message}`);
    }
  }

  const outputs = config.outputs;
  console.log('\n' + chalk.bold('  Outputs:'));
  if (outputs.schematic) console.log('    [x] KiCad Schematic');
  if (outputs.pcb) console.log('    [x] KiCad PCB Layout');
  if (outputs.gerbers) console.log('    [x] Gerber Files');
  if (outputs.plate) console.log('    [x] Switch Plate DXF');
  if (outputs.bom) console.log('    [x] Bill of Materials');
  if (outputs.firmware) console.log('    [x] ZMK Firmware Config');
  console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

  const errors = concerns.filter(c => c.severity === 'error');
  if (errors.length > 0) {
    console.log(chalk.red('\nCannot proceed — fix the errors above first.'));
    return false;
  }

  return confirm({ message: 'Proceed with generation?', default: true });
}
