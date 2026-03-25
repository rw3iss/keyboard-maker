import { select, input } from '../prompt-wrapper.js';
import chalk from 'chalk';

export async function promptPhysical(config: { bluetooth: boolean }) {
  // USB/power side
  const connectorSide = await select({
    message: 'Which side for the USB port and power button?',
    choices: [
      { name: 'Back (rear edge)', value: 'back' },
      { name: 'Left side', value: 'left' },
      { name: 'Right side', value: 'right' },
    ],
  });

  let connectorPosition: 'left' | 'center' | 'right' = 'center';
  let connectorOrder: 'usb-first' | 'power-first' = 'usb-first';

  if (connectorSide === 'back') {
    connectorPosition = await select({
      message: 'Position on the rear edge?',
      choices: [
        { name: 'Left side', value: 'left' },
        { name: 'Center', value: 'center' },
        { name: 'Right side', value: 'right' },
      ],
    }) as 'left' | 'center' | 'right';

    if (config.bluetooth) {
      connectorOrder = await select({
        message: 'Order of USB port and power button?',
        choices: [
          { name: 'USB port, then power button', value: 'usb-first' },
          { name: 'Power button, then USB port', value: 'power-first' },
        ],
      }) as 'usb-first' | 'power-first';
    }
  }
  // For left/right side: USB closer to rear, power next to it (no need to ask order)

  // Case height
  // Calculate minimum heights
  const pcbThickness = 1.6;  // standard
  const plateThickness = 1.5;
  const minFrontHeight = 0.8 + pcbThickness + plateThickness; // 0.8mm case bottom
  const minRearHeight = minFrontHeight + 3; // slight tilt for ergonomics + USB connector height

  console.log(chalk.dim(`\n  Minimum front height: ${minFrontHeight.toFixed(1)}mm (case bottom + PCB + plate)`));
  console.log(chalk.dim(`  Minimum rear height: ${minRearHeight.toFixed(1)}mm (+ USB connector clearance)`));

  const heightChoice = await select({
    message: 'Case height profile?',
    choices: [
      { name: `Minimal (front: ${minFrontHeight.toFixed(1)}mm, rear: ${minRearHeight.toFixed(1)}mm)`, value: 'minimal' },
      { name: 'Standard (front: 7mm, rear: 10mm)', value: 'standard' },
      { name: 'Custom', value: 'custom' },
    ],
  });

  let frontHeight: number | null = null;
  let rearHeight: number | null = null;

  if (heightChoice === 'minimal') {
    frontHeight = Math.round(minFrontHeight * 10) / 10;
    rearHeight = Math.round(minRearHeight * 10) / 10;
  } else if (heightChoice === 'standard') {
    frontHeight = 7;
    rearHeight = 10;
  } else {
    const fh = await input({
      message: `Front height in mm (min ${minFrontHeight.toFixed(1)}):`,
      default: minFrontHeight.toFixed(1),
      validate: v => parseFloat(v) >= minFrontHeight || `Must be at least ${minFrontHeight.toFixed(1)}mm`,
    });
    const rh = await input({
      message: `Rear height in mm (min ${minRearHeight.toFixed(1)}):`,
      default: minRearHeight.toFixed(1),
      validate: v => parseFloat(v) >= minRearHeight || `Must be at least ${minRearHeight.toFixed(1)}mm`,
    });
    frontHeight = parseFloat(fh);
    rearHeight = parseFloat(rh);
  }

  return {
    connectorSide: connectorSide as 'left' | 'back' | 'right',
    connectorPosition,
    connectorOrder,
    frontHeight,
    rearHeight,
  };
}
