import { select, confirm } from '../prompt-wrapper.js';
import { loadCategory } from '../data-loader.js';
import chalk from 'chalk';

export async function promptSwitches() {
  const families = loadCategory('switches');

  if (families.length === 0) {
    console.log(chalk.yellow('No switch data found in data/switches/. Using defaults.'));
    return { type: 'choc_v1', model: 'kailh-choc-brown', hotswap: true };
  }

  const familyId = await select({
    message: 'Select switch type:',
    choices: families.map(f => ({
      name: f.name,
      value: f.id,
      description: f.description,
    })),
  });

  const family = families.find(f => f.id === familyId)!;
  const familyData = family.data as any;

  let modelId = familyId;
  if (familyData.variants?.length > 1) {
    modelId = await select({
      message: 'Select switch variant:',
      choices: familyData.variants.map((v: any) => ({
        name: v.name,
        value: v.id,
        description: `${v.actuationForce ?? '?'}g, ${v.tactile ? 'tactile' : 'linear'}`,
      })),
    });
  }

  let hotswap = false;
  if (familyData.hotswapCompatible) {
    hotswap = await confirm({
      message: 'Use hot-swap sockets?',
      default: true,
    });
  } else {
    console.log(chalk.dim(`  ${family.name} does not support hot-swap sockets.`));
  }

  // Map family id to switch type enum
  const typeMap: Record<string, string> = {
    'kailh-choc-v1': 'choc_v1',
    'kailh-choc-v2': 'choc_v2',
    'cherry-mx-ulp': 'mx_ulp',
    'cherry-mx': 'mx',
    'gateron-low-profile': 'gateron_lp',
  };

  return {
    type: typeMap[familyId] ?? 'choc_v1',
    model: modelId,
    hotswap,
  };
}
