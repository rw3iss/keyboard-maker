/**
 * Bill of Materials (BOM) generator.
 *
 * Generates markdown and CSV BOM files based on the build configuration
 * and component data from the data/ directory.
 */

import type { BuildConfig } from '../shared/types.js';
import { loadCategory, loadComponent } from '../cli/data-loader.js';

interface BomLine {
  ref: string;
  component: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  supplier: string;
  url: string;
}

function getPrice(data: Record<string, unknown> | null): number {
  if (!data) return 0;
  if (typeof data.priceUsd === 'number') return data.priceUsd;
  const suppliers = data.suppliers as Array<{ priceUsd?: number }> | undefined;
  return suppliers?.[0]?.priceUsd ?? 0;
}

function getSupplier(data: Record<string, unknown> | null): { name: string; url: string } {
  if (!data) return { name: 'Various', url: '' };
  const suppliers = data.suppliers as Array<{ name: string; url: string }> | undefined;
  return suppliers?.[0] ?? { name: 'Various', url: '' };
}

function getName(data: Record<string, unknown> | null, fallback: string): string {
  return (data?.name as string) ?? fallback;
}

/**
 * Generate Bill of Materials in both markdown and CSV formats.
 *
 * @param config - Build configuration
 * @param keyCount - Number of keys in the layout
 * @returns Object with markdown and csv string properties
 */
export function generateBOM(
  config: BuildConfig,
  keyCount: number,
): { markdown: string; csv: string } {
  const lines: BomLine[] = [];
  const addLine = (ref: string, data: Record<string, unknown> | null, fallbackName: string, qty: number, fallbackPrice: number) => {
    const price = getPrice(data) || fallbackPrice;
    const sup = getSupplier(data);
    lines.push({ ref, component: getName(data, fallbackName), quantity: qty, unitPrice: price, totalPrice: qty * price, supplier: sup.name, url: sup.url });
  };

  // Switches — look up by switch family id
  const switchTypeToId: Record<string, string> = { choc_v1: 'kailh-choc-v1', choc_v2: 'kailh-choc-v2', mx_ulp: 'cherry-mx-ulp', mx: 'cherry-mx', gateron_lp: 'gateron-low-profile' };
  const switchData = loadComponent('switches', switchTypeToId[config.switches.type] ?? config.switches.type);
  addLine(`SW1-SW${keyCount}`, switchData, config.switches.model, keyCount, 0.45);

  // Diodes
  const diodeData = loadComponent('diodes', '1n4148w-sod123');
  addLine(`D1-D${keyCount}`, diodeData, `${config.diode.model} ${config.diode.package}`, keyCount, 0.02);

  // Hot-swap sockets
  if (config.switches.hotswap) {
    addLine(`HS1-HS${keyCount}`, null, 'Hot-swap Socket', keyCount, 0.15);
  }

  // MCU
  const mcuData = loadComponent('mcus', config.mcu.module.replace(/_/g, '-'));
  addLine('U1', mcuData, config.mcu.module, 1, 25.00);

  // USB connector
  const usbData = loadComponent('connectors', config.usbConnector.model);
  addLine('J1', usbData, 'USB-C Connector', 1, 1.00);

  // ESD protection
  const esdData = loadComponent('esd', config.esdProtection.model);
  addLine('U2', esdData, config.esdProtection.model, 1, 0.30);

  // Battery (if enabled)
  if (config.power.battery) {
    const batData = loadComponent('batteries', `lipo-${config.power.batteryCapacityMah}mah`);
    addLine('BT1', batData, `LiPo ${config.power.batteryCapacityMah}mAh`, 1, 8.00);
  }

  // Calculate total
  const grandTotal = lines.reduce((sum, l) => sum + l.totalPrice, 0);

  // Generate markdown
  const markdown = generateMarkdown(config, lines, grandTotal);

  // Generate CSV
  const csv = generateCSV(lines, grandTotal);

  return { markdown, csv };
}

function generateMarkdown(config: BuildConfig, lines: BomLine[], grandTotal: number): string {
  let md = `# Bill of Materials - ${config.project.name}\n\n`;
  md += `**Version:** ${config.project.version}  \n`;
  md += `**Author:** ${config.project.author}  \n`;
  md += `**Switch Type:** ${config.switches.type}  \n`;
  md += `**MCU:** ${config.mcu.module}  \n\n`;

  md += '| Ref | Component | Qty | Unit Price | Total | Supplier |\n';
  md += '|-----|-----------|-----|-----------|-------|----------|\n';

  for (const line of lines) {
    const supplierLink = line.url ? `[${line.supplier}](${line.url})` : line.supplier;
    md += `| ${line.ref} | ${line.component} | ${line.quantity} | $${line.unitPrice.toFixed(2)} | $${line.totalPrice.toFixed(2)} | ${supplierLink} |\n`;
  }

  md += `\n**Estimated Total: $${grandTotal.toFixed(2)}**\n`;
  md += `\n_Note: Prices are estimates and may vary. PCB fabrication costs not included._\n`;

  return md;
}

function generateCSV(lines: BomLine[], grandTotal: number): string {
  const rows: string[] = [
    'Reference,Component,Quantity,Unit Price (USD),Total Price (USD),Supplier,URL',
  ];

  for (const line of lines) {
    rows.push(
      `"${line.ref}","${line.component}",${line.quantity},${line.unitPrice.toFixed(2)},${line.totalPrice.toFixed(2)},"${line.supplier}","${line.url}"`,
    );
  }

  rows.push(`,,,,${grandTotal.toFixed(2)},"TOTAL",`);

  return rows.join('\n') + '\n';
}
