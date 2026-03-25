import chalk from 'chalk';
import { confirm } from '../prompt-wrapper.js';

export interface ComponentSpec {
  label: string;
  value: string;
}

export async function showComponentInfo(
  name: string,
  summary: string,
  specs: ComponentSpec[],
  notes: string[],
): Promise<boolean> {
  console.log('');
  console.log(chalk.bold.cyan(`  ${name}`));
  console.log(chalk.dim(`  ${summary}`));
  console.log('');

  // Specs table
  const maxLabel = Math.max(...specs.map(s => s.label.length));
  for (const spec of specs) {
    console.log(`  ${chalk.bold(spec.label.padEnd(maxLabel + 2))}${spec.value}`);
  }

  if (notes.length > 0) {
    console.log('');
    console.log(chalk.yellow('  Notes:'));
    for (const note of notes) {
      console.log(`  - ${note}`);
    }
  }
  console.log('');

  return confirm({ message: 'Use this component?', default: true });
}
