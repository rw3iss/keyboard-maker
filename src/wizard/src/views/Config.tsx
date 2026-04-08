import { h } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';
import { currentProject, projectConfig, activeTab, serverConfig } from '../state/app.state';
import { addToast } from '../services/toast.service';
import { apiGet, apiPost, apiPut } from '../services/api.service';
import { WIZARD_STEPS } from '../config/wizard-steps';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Dropdown } from '../components/common/Dropdown';
import { Spinner } from '../components/common/Spinner';
import { ComponentFilter, matchesFilters } from '../components/wizard/ComponentFilter';
import { ComponentListItem } from '../components/wizard/ComponentListItem';
import type { FilterConfig } from '../components/wizard/ComponentFilter';
import type { ChipDef } from '../components/wizard/ComponentListItem';
import type { BuildConfig } from '../types/project.types';
import { route } from 'preact-router';
import { ConnectivityStep, FeaturesStep, OutputsStep } from './config-steps';

interface ComponentOption {
	id: string;
	name: string;
	description?: string;
	manufacturer?: string;
	specs?: Record<string, any>;
}

interface ConfigProps {
	step?: string;
}

// Steps that load options from /api/components/:category
const COMPONENT_STEPS: Record<string, string> = {
	switches: 'switches',
	mcu: 'mcus',
};

// Filter configurations per category
const SWITCH_FILTERS: FilterConfig[] = [
	{ key: 'type', label: 'Type', type: 'select' },
	{ key: 'manufacturer', label: 'Brand', type: 'select' },
	{ key: 'profile', label: 'Profile', type: 'select' },
	{ key: 'hotswapCompatible', label: 'Hotswap', type: 'boolean' },
	{ key: 'mounting', label: 'Mounting', type: 'select' },
	{ key: 'activationDistance', label: 'Actuation (mm)', type: 'range' },
	{ key: 'travelDistance', label: 'Travel (mm)', type: 'range' },
	{ key: 'totalHeight', label: 'Height (mm)', type: 'range' },
	{ key: 'keycapMount', label: 'Keycap Mount', type: 'select' },
	{ key: 'pinSpacing', label: 'Pin Spacing', type: 'range' },
	{ key: 'maxPrice', label: 'Max Price', type: 'maxPrice' },
];

const MCU_FILTERS: FilterConfig[] = [
	{ key: 'formFactor', label: 'Package', type: 'select' },
	{ key: 'hasUsb', label: 'USB', type: 'boolean' },
	{ key: 'hasBle', label: 'BLE', type: 'boolean' },
	{ key: 'bleVersion', label: 'BLE Version', type: 'select' },
	{ key: 'hasLipoCharger', label: 'LiPo Charger', type: 'boolean' },
	{ key: 'splitSupport', label: 'Split Support', type: 'boolean' },
	{ key: 'firmwareSupport', label: 'Firmware', type: 'multi', options: ['zmk', 'qmk', 'vial', 'kmk', 'via', 'circuitpython'] },
	{ key: 'gpioCount', label: 'GPIOs', type: 'range', rangeBrackets: ['10-15', '16-20', '21-30', '31-40', '41+'] },
	{ key: 'operatingVoltage', label: 'Voltage', type: 'select' },
	{ key: 'flashKB', label: 'Flash (KB)', type: 'range', rangeBrackets: ['0-256', '257-1024', '1025-8192', '8193+'] },
	{ key: 'ramKB', label: 'RAM (KB)', type: 'range', rangeBrackets: ['0-64', '65-256', '257-512', '513+'] },
	{ key: 'clockMhz', label: 'Clock (MHz)', type: 'range', rangeBrackets: ['0-48', '49-100', '101-150', '151+'] },
	{ key: 'chip', label: 'Chip', type: 'select' },
	{ key: 'maxPrice', label: 'Max Price', type: 'maxPrice' },
];

const FILTER_CONFIGS: Record<string, FilterConfig[]> = {
	switches: SWITCH_FILTERS,
	mcu: MCU_FILTERS,
};

/** Extract display chips for a switch component */
function getSwitchChips(c: any): ChipDef[] {
	const chips: ChipDef[] = [];
	if (c.type) chips.push({ label: 'Type', value: c.type });
	if (c.keycapMount) chips.push({ label: 'Profile', value: c.keycapMount });
	if (c.travelDistance != null) chips.push({ label: 'Travel', value: `${c.travelDistance}mm` });
	// Actuation force from first variant
	const force = c.actuationForce || c.variants?.[0]?.actuationForce;
	if (force) chips.push({ label: 'Force', value: `${force}g` });
	if (c.mounting) chips.push({ label: 'Mount', value: c.mounting });
	if (c.hotswapCompatible != null) chips.push({ label: 'Hotswap', value: c.hotswapCompatible ? 'Yes' : 'No' });
	return chips;
}

/** Extract display chips for an MCU component */
function getMcuChips(c: any): ChipDef[] {
	const chips: ChipDef[] = [];
	if (c.chip) chips.push({ label: 'Chip', value: c.chip });
	if (c.gpioCount != null) chips.push({ label: 'GPIOs', value: String(c.gpioCount) });
	if (c.hasUsb != null) chips.push({ label: 'USB', value: c.hasUsb ? (c.usbType || 'Yes') : 'No' });
	if (c.hasBle != null) chips.push({ label: 'BLE', value: c.hasBle ? (c.bleVersion || 'Yes') : 'No' });
	const fw = c.firmwareSupport || c.firmware;
	if (fw?.length) chips.push({ label: 'Firmware', value: fw.join(', ') });
	if (c.flashSize) chips.push({ label: 'Flash', value: c.flashSize });
	if (c.clockSpeed) chips.push({ label: 'Clock', value: c.clockSpeed });
	return chips;
}

const CHIP_EXTRACTORS: Record<string, (c: any) => ChipDef[]> = {
	switches: getSwitchChips,
	mcu: getMcuChips,
};

export function Config({ step }: ConfigProps) {
	const project = currentProject.value;
	const config = projectConfig.value;
	const [currentStep, setCurrentStep] = useState(step || WIZARD_STEPS[0].id);
	const [options, setOptions] = useState<ComponentOption[]>([]);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [selected, setSelected] = useState<string>('');
	const [localConfig, setLocalConfig] = useState<Partial<BuildConfig>>({});
	const [compatibleOnly, setCompatibleOnly] = useState(false);

	const stepDef = WIZARD_STEPS.find((s) => s.id === currentStep);

	// Sync step from URL
	useEffect(() => {
		if (step && step !== currentStep) {
			setCurrentStep(step);
		}
	}, [step]);

	// Load current selection from config
	useEffect(() => {
		if (!config) return;
		setLocalConfig(JSON.parse(JSON.stringify(config)));
		// Set selected component from config — store the raw value, matching happens in isSelected()
		if (currentStep === 'switches') setSelected(config.switches?.model || config.switches?.type || '');
		else if (currentStep === 'mcu') setSelected(config.mcu?.module || '');
		else if (currentStep === 'power') setSelected(config.power?.chargerIc || '');
	}, [config, currentStep]);

	// Flexible matching: the saved config value might be an id, name, or partial match
	const isSelected = (opt: ComponentOption): boolean => {
		if (!selected) return false;
		const sel = selected.toLowerCase();
		const id = (opt.id || '').toLowerCase();
		const name = (opt.name || '').toLowerCase();
		// Exact match
		if (sel === id || sel === name) return true;
		// ID with underscores vs hyphens
		if (sel.replace(/_/g, '-') === id || sel.replace(/-/g, '_') === id) return true;
		// Partial match — selected value contains the ID or vice versa
		if (id && (sel.includes(id) || id.includes(sel))) return true;
		if (name && (sel.includes(name) || name.includes(sel))) return true;
		return false;
	};

	// Fetch component options
	useEffect(() => {
		const category = COMPONENT_STEPS[currentStep];
		if (!category) {
			setOptions([]);
			return;
		}
		setLoading(true);
		apiGet<ComponentOption[]>(`/api/components/${category}`)
			.then(setOptions)
			.catch(() => {
				setOptions([]);
				addToast(`Failed to load ${category} options`, 'error');
			})
			.finally(() => setLoading(false));
	}, [currentStep]);

	if (!project) {
		return (
			<div style="padding:40px;text-align:center;color:var(--text-muted)">
				Open a project first.
			</div>
		);
	}

	const handleStepChange = (newStep: string) => {
		setCurrentStep(newStep);
		route(`/config/${newStep}`);
	};

	const handleSave = async () => {
		setSaving(true);
		try {
			const updatedConfig = { ...localConfig } as BuildConfig;

			// Apply selected component
			if (currentStep === 'switches' && selected) {
				const opt = options.find((o) => isSelected(o));
				// Map component ID to the SwitchType enum used by generators
				const switchTypeMap: Record<string, string> = {
					'kailh-choc-v1': 'choc_v1',
					'kailh-choc-v2': 'choc_v2',
					'cherry-mx-ulp': 'mx_ulp',
					'cherry-mx': 'mx',
					'gateron-low-profile': 'gateron_lp',
				};
				const switchType = switchTypeMap[opt?.id || ''] || updatedConfig.switches?.type || 'choc_v1';
				updatedConfig.switches = {
					...updatedConfig.switches,
					model: opt?.id || selected,
					type: switchType,
					hotswap: updatedConfig.switches?.hotswap ?? true,
				};
			} else if (currentStep === 'mcu' && selected) {
				const opt = options.find((o) => isSelected(o));
				// Extract GPIO count from component data
				const gpioCount = (opt as any)?.gpioCount || (opt as any)?.specs?.gpioCount || updatedConfig.mcu?.gpioAvailable || 21;
				updatedConfig.mcu = {
					...updatedConfig.mcu,
					module: opt?.id || selected,
					type: 'nrf52840',
					gpioAvailable: gpioCount,
				};
			} else if (currentStep === 'power') {
				// Power config is already fully updated in localConfig via updateLocal() calls
				// (chargerIc, battery, batteryCapacityMah, chargeCurrentMa, etc.)
				// No need to override from `selected` — just use localConfig.power as-is
			}

			await apiPut(`/api/projects/${project}/config`, updatedConfig);
			projectConfig.value = updatedConfig;
			addToast('Configuration saved', 'success');
		} catch {
			addToast('Failed to save configuration', 'error');
		} finally {
			setSaving(false);
		}
	};

	const updateLocal = (section: string, field: string, value: any) => {
		setLocalConfig((prev) => ({
			...prev,
			[section]: { ...(prev as any)[section], [field]: value },
		}));
	};

	const [activeFilters, setActiveFilters] = useState<Record<string, any>>({});

	// Reset filters when step changes
	useEffect(() => {
		setActiveFilters({});
	}, [currentStep]);

	const filterConfigs = FILTER_CONFIGS[currentStep] || [];
	const chipExtractor = CHIP_EXTRACTORS[currentStep] || (() => []);

	/** Compute GPIO budget for the current layout + features */
	const gpioInfo = useMemo(() => {
		const cfg = localConfig as BuildConfig;
		const keyCount = cfg?.layout?.path ? 86 : 0;
		const keys = keyCount || 86;
		const sqrtKeys = Math.ceil(Math.sqrt(keys));
		let bestPins = sqrtKeys * 2;
		for (let r = sqrtKeys; r >= 2; r--) {
			const c = Math.ceil(keys / r);
			if (r + c < bestPins) bestPins = r + c;
		}
		const matrixGpios = bestPins;
		let extraGpios = 0;
		const extras: string[] = [];
		if (cfg?.features?.rgbPerKey || cfg?.features?.rgbUnderglow) {
			extraGpios += 1;
			extras.push('RGB data (1)');
		}
		if (cfg?.features?.rotaryEncoder) {
			extraGpios += 2;
			extras.push('Encoder (2)');
		}
		if (cfg?.features?.oledDisplay) {
			extraGpios += 2;
			extras.push('OLED I2C (2)');
		}
		return { matrixGpios, extraGpios, total: matrixGpios + extraGpios, extras };
	}, [localConfig]);

	const filteredOptions = useMemo(() => {
		let result = options;
		if (filterConfigs.length > 0) {
			result = result.filter((opt) => matchesFilters(opt, activeFilters, filterConfigs));
		}
		if (compatibleOnly && currentStep === 'mcu') {
			result = result.filter((opt) => {
				const gpios = (opt as any).gpioCount;
				return typeof gpios === 'number' && gpios >= gpioInfo.total;
			});
		}
		return result;
	}, [options, activeFilters, filterConfigs, compatibleOnly, currentStep, gpioInfo]);

	const renderComponentStep = () => {
		if (loading) {
			return (
				<div style="text-align:center;padding:40px">
					<Spinner />
				</div>
			);
		}

		// GPIO budget banner for MCU selection
		const gpiBanner = currentStep === 'mcu' ? (() => {
			const selMcu = options.find((o) => isSelected(o)) as any;
			const mcuGpios = selMcu?.gpioCount ?? 0;
			const needed = gpioInfo.total;
			const sufficient = !mcuGpios || mcuGpios >= needed;
			return (
				<div style={`padding:10px 14px;margin-bottom:12px;border-radius:var(--radius);font-size:12px;line-height:1.6;border:1px solid ${sufficient ? 'var(--border)' : '#ef4444'};background:${sufficient ? 'var(--bg-card)' : '#2d1111'}`}>
					<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
						<span style="font-weight:600;color:var(--text-secondary)">GPIO Budget</span>
						<span style={`font-weight:700;${sufficient ? 'color:var(--success)' : 'color:#ef4444'}`}>
							{needed} needed {mcuGpios ? `/ ${mcuGpios} available` : ''}
						</span>
					</div>
					<div style="color:var(--text-muted)">
						Matrix: ~{gpioInfo.matrixGpios} GPIOs
						{gpioInfo.extras.length > 0 && ` + ${gpioInfo.extras.join(' + ')}`}
					</div>
					{!sufficient && mcuGpios > 0 && (
						<div style="color:#ef4444;font-weight:600;margin-top:4px">
							This MCU has {mcuGpios - needed} too few GPIOs. Choose an MCU with more pins, reduce key count, or disable features.
						</div>
					)}
				</div>
			);
		})() : null;

		return (
			<div>
				{gpiBanner}
				{filterConfigs.length > 0 && (
					<ComponentFilter
						components={options}
						filters={filterConfigs}
						activeFilters={activeFilters}
						onChange={setActiveFilters}
						onReset={() => { setActiveFilters({}); setCompatibleOnly(false); }}
						extraFilter={currentStep === 'mcu' ? (
							<div class="comp-filter-item" title={`Show only MCUs with ${gpioInfo.total}+ GPIOs for this layout and features`}>
								<label class="comp-filter-label" style="white-space:nowrap">Compatible</label>
								<label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px;color:var(--text-muted,var(--text-secondary));white-space:nowrap">
									<input
										type="checkbox"
										checked={compatibleOnly}
										onChange={(e: any) => setCompatibleOnly(e.target.checked)}
										style="accent-color:var(--accent)"
									/>
									{gpioInfo.total}+ GPIOs
								</label>
							</div>
						) : undefined}
					/>
				)}
				{filteredOptions.length !== options.length && (
					<div class="comp-list-count">
						Showing {filteredOptions.length} of {options.length} components
					</div>
				)}
				<div class="comp-list-container">
					{filteredOptions.map((opt) => (
						<ComponentListItem
							key={opt.id}
							component={opt}
							category={COMPONENT_STEPS[currentStep]}
							isSelected={isSelected(opt)}
							onSelect={() => setSelected(opt.id)}
							chips={chipExtractor(opt)}
						/>
					))}
					{filteredOptions.length === 0 && (
						<div class="comp-list-empty">
							{options.length === 0
								? 'No options available for this category.'
								: 'No components match the current filters.'}
						</div>
					)}
				</div>
			</div>
		);
	};

	// NOTE: Connectivity / Features / Outputs step renderers moved to
	// `./config-steps/*.tsx`. See views/config-steps/index.ts.

	const renderPcb = () => {
		const pcb = (localConfig as BuildConfig)?.pcb;
		return (
			<div style="display:flex;flex-direction:column;gap:20px;max-width:500px">
				<Dropdown
					label="Layer Count"
					options={[
						{ label: '2-layer', value: '2' },
						{ label: '4-layer', value: '4' },
					]}
					value={String(pcb?.layers ?? 2)}
					onChange={(v) => updateLocal('pcb', 'layers', Number(v))}
				/>
				{pcb?.layers === 4 && (
					<div style="background:var(--bg-hover);padding:16px;border-radius:var(--radius)">
						<div style="font-weight:600;margin-bottom:8px">4-Layer Stackup</div>
						<div style="font-size:13px;color:var(--text-muted);line-height:1.8">
							<div>L1 - Signal (Top)</div>
							<div>L2 - Ground Plane</div>
							<div>L3 - Power Plane</div>
							<div>L4 - Signal (Bottom)</div>
						</div>
					</div>
				)}
				<Dropdown
					label="Routing Mode"
					options={serverConfig.value.enableAutoRouting
						? [
							{ label: 'Auto-route', value: 'auto' },
							{ label: 'Manual (guides only)', value: 'manual' },
						]
						: [
							{ label: 'Manual (guides only)', value: 'manual' },
						]
					}
					value={!serverConfig.value.enableAutoRouting ? 'manual' : (pcb?.routing || 'auto')}
					onChange={(v) => updateLocal('pcb', 'routing', v)}
				/>
				{!serverConfig.value.enableAutoRouting && (
					<div style="font-size:12px;color:var(--text-muted);margin-top:-4px;padding:6px 10px;background:var(--bg-hover);border-radius:var(--radius)">
						Auto-routing is disabled on this server. You can route manually or run Freerouting locally after downloading your build files.
					</div>
				)}
				<Dropdown
					label="PCB Thickness"
					options={[
						{ label: '1.6mm (standard)', value: '1.6' },
						{ label: '1.2mm', value: '1.2' },
						{ label: '0.8mm', value: '0.8' },
					]}
					value={String(pcb?.thickness ?? 1.6)}
					onChange={(v) => updateLocal('pcb', 'thickness', Number(v))}
				/>

				{/* MCU Fanout option — only for 4-layer boards, adapts to selected MCU */}
				{pcb?.layers === 4 && (() => {
					const mcuId = (localConfig as BuildConfig)?.mcu?.module;
					const mcuData = mcuOptions.find((m) => m.id === mcuId) as any;
					const mcuPkg = mcuData?.package ?? mcuData?.packageInfo;
					const mcuPitch = mcuPkg?.pitch ?? null;
					const mcuForm = mcuData?.formFactor ?? '';
					const isBareChip = mcuPkg && /qfn|qfp|bga|lqfp|tssop/i.test(mcuPkg.type ?? mcuForm);
					const isTightPitch = mcuPitch !== null && mcuPitch <= 0.65;
					const mcuName = mcuData?.name ?? mcuId ?? 'MCU';

					// Modules (pro-micro, XIAO, etc.) don't need fanout — hide entirely
					if (!isBareChip) {
						// Auto-disable fanout if it was previously enabled for a different MCU
						if ((pcb as any)?.mcuFanout) {
							setTimeout(() => updateLocal('pcb', 'mcuFanout', false), 0);
						}
						return null;
					}

					return (
						<div style="border-top:1px solid var(--border);padding-top:16px;margin-top:4px">
							<label style="display:flex;align-items:flex-start;gap:12px;cursor:pointer">
								<input
									type="checkbox"
									checked={(pcb as any)?.mcuFanout ?? false}
									onChange={(e) => updateLocal('pcb', 'mcuFanout', (e.target as HTMLInputElement).checked)}
									style="margin-top:3px;accent-color:var(--accent)"
								/>
								<div>
									<div style="font-weight:600;margin-bottom:4px">MCU Fanout Vias</div>
									<div style="font-size:12px;color:var(--text-muted);line-height:1.5">
										The selected MCU ({mcuName}) uses a {mcuPkg?.type ?? mcuForm} package
										{mcuPitch ? ` with ${mcuPitch}mm pitch` : ''}.
										{isTightPitch
											? ' Fanout vias are strongly recommended — they route signals from the tight pads to inner layers, dramatically reducing routing congestion.'
											: ` At ${mcuPitch ?? '?'}mm pitch, fanout vias are optional but can still help reduce routing congestion around the chip.`
										}
									</div>
									<div style="font-size:12px;margin-top:6px;padding:8px;background:var(--bg-card);border-radius:var(--radius-sm)">
										<div style="color:var(--success);margin-bottom:4px"><strong>Benefits:</strong> Reduces routing congestion around the MCU. Fewer DRC violations. Cleaner trace spacing.</div>
										<div style="color:var(--warning)"><strong>Considerations:</strong> Adds staggered vias around the MCU perimeter. The MCU needs slightly more clearance from other components.</div>
									</div>
								</div>
							</label>
						</div>
					);
				})()}

				{/* Charger IC Fanout — only for 4-layer boards with a QFN charger IC */}
				{pcb?.layers === 4 && (() => {
					const chargerId = (localConfig as BuildConfig)?.power?.chargerIc;
					const chargerData = chargerOptions.find((c) => c.id === chargerId);
					const pkgInfo = (chargerData as any)?.packageInfo;
					const isQfn = pkgInfo && /qfn|bga/i.test(pkgInfo.type ?? '') && (pkgInfo.pitch ?? 1) <= 0.65;
					if (!isQfn) return null;
					return (
						<div style="border-top:1px solid var(--border);padding-top:16px;margin-top:4px">
							<label style="display:flex;align-items:flex-start;gap:12px;cursor:pointer">
								<input
									type="checkbox"
									checked={(pcb as any)?.chargerFanout ?? false}
									onChange={(e) => updateLocal('pcb', 'chargerFanout', (e.target as HTMLInputElement).checked)}
									style="margin-top:3px;accent-color:var(--accent)"
								/>
								<div>
									<div style="font-weight:600;margin-bottom:4px">Charger IC Fanout Vias</div>
									<div style="font-size:12px;color:var(--text-muted);line-height:1.5">
										The selected charger IC ({(chargerData as any)?.name}) uses a {pkgInfo.type} package ({pkgInfo.pitch}mm pitch).
										Fanout vias route signals from the tight QFN pads to inner layers for easier routing.
									</div>
								</div>
							</label>
						</div>
					);
				})()}
			</div>
		);
	};

	const renderPhysical = () => {
		const phys = (localConfig as BuildConfig)?.physical;
		const conn = (localConfig as BuildConfig)?.connectivity;
		return (
			<div style="display:flex;flex-direction:column;gap:20px;max-width:500px">
				<h3 style="margin:0;font-size:15px;color:var(--text-secondary)">USB Connector</h3>
				<Dropdown
					label="USB Connector Side"
					options={[
						{ label: 'Rear', value: 'back' },
						{ label: 'Top of Case', value: 'top' },
						{ label: 'Left Side', value: 'left' },
						{ label: 'Right Side', value: 'right' },
					]}
					value={phys?.connectorSide || 'back'}
					onChange={(v) => updateLocal('physical', 'connectorSide', v)}
				/>
				<Dropdown
					label="Connector Position on Edge"
					options={[
						{ label: 'Center', value: 'center' },
						{ label: 'Left of center', value: 'left' },
						{ label: 'Right of center', value: 'right' },
					]}
					value={phys?.connectorPosition || 'center'}
					onChange={(v) => updateLocal('physical', 'connectorPosition', v)}
				/>
				<Dropdown
					label="Port Order (USB and Power Button)"
					options={[
						{ label: 'USB port first, then power button', value: 'usb-first' },
						{ label: 'Power button first, then USB port', value: 'power-first' },
					]}
					value={phys?.connectorOrder || 'usb-first'}
					onChange={(v) => updateLocal('physical', 'connectorOrder', v)}
				/>

				<div style="border-top:1px solid var(--border);padding-top:16px;margin-top:4px">
					<h3 style="margin:0 0 12px;font-size:15px;color:var(--text-secondary)">Buttons</h3>
					<label style="display:flex;align-items:center;gap:12px;cursor:pointer;margin-bottom:12px">
						<input
							type="checkbox"
							checked={(phys as any)?.powerButton ?? true}
							onChange={(e) => updateLocal('physical', 'powerButton', (e.target as HTMLInputElement).checked)}
						/>
						<div>
							<div style="font-weight:500">Power Button</div>
							<div style="font-size:12px;color:var(--text-muted)">Hardware on/off switch for the keyboard</div>
						</div>
					</label>
					{conn?.bluetooth && (
						<label style="display:flex;align-items:center;gap:12px;cursor:pointer;margin-bottom:12px">
							<input
								type="checkbox"
								checked={(phys as any)?.wifiToggleButton ?? false}
								onChange={(e) => updateLocal('physical', 'wifiToggleButton', (e.target as HTMLInputElement).checked)}
							/>
							<div>
								<div style="font-weight:500">Wireless Toggle Button</div>
								<div style="font-size:12px;color:var(--text-muted)">Hardware button to enable/disable Bluetooth</div>
							</div>
						</label>
					)}
				</div>

				<div style="border-top:1px solid var(--border);padding-top:16px;margin-top:4px">
					<h3 style="margin:0 0 12px;font-size:15px;color:var(--text-secondary)">Case Height</h3>
					<div style="display:flex;gap:16px">
						<div style="flex:1">
							<label style="display:block;font-weight:500;margin-bottom:6px;font-size:13px">Front Height (mm)</label>
							<input
								type="number"
								step="0.1"
								min="3"
								style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-input);color:var(--text-primary)"
								value={phys?.frontHeight ?? ''}
								placeholder="auto"
								onInput={(e) => {
									const v = (e.target as HTMLInputElement).value;
									updateLocal('physical', 'frontHeight', v ? parseFloat(v) : null);
								}}
							/>
						</div>
						<div style="flex:1">
							<label style="display:block;font-weight:500;margin-bottom:6px;font-size:13px">Rear Height (mm)</label>
							<input
								type="number"
								step="0.1"
								min="3"
								style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-input);color:var(--text-primary)"
								value={phys?.rearHeight ?? ''}
								placeholder="auto"
								onInput={(e) => {
									const v = (e.target as HTMLInputElement).value;
									updateLocal('physical', 'rearHeight', v ? parseFloat(v) : null);
								}}
							/>
						</div>
					</div>
					<div style="font-size:12px;color:var(--text-muted);margin-top:6px">
						Leave blank for minimal height (case bottom + PCB + plate)
					</div>
				</div>
			</div>
		);
	};

	const [layoutImage, setLayoutImage] = useState<string | null>(null);
	const [renderingLayout, setRenderingLayout] = useState(false);

	// Check for existing layout image
	useEffect(() => {
		if (project && currentStep === 'layout') {
			fetch(`/api/build/${project}/files/images/kle-layout.svg`, { method: 'HEAD' })
				.then((r) => { if (r.ok) setLayoutImage(`/api/build/${project}/files/images/kle-layout.svg`); })
				.catch(() => {});
		}
	}, [project, currentStep]);

	const renderLayoutPreview = async () => {
		if (!project) return;
		setRenderingLayout(true);
		try {
			await apiPost(`/api/projects/${project}/render-layout`, {});
			// Try SVG first, then PNG
			const svgUrl = `/api/build/${project}/files/images/kle-layout.svg`;
			const pngUrl = `/api/build/${project}/files/images/kle-layout.png`;
			const svgResp = await fetch(svgUrl, { method: 'HEAD' });
			setLayoutImage(svgResp.ok ? svgUrl : pngUrl);
			addToast('Layout image rendered', 'success');
		} catch (err: any) {
			addToast(`Render failed: ${err.message}`, 'error');
		} finally {
			setRenderingLayout(false);
		}
	};

	const renderLayout = () => {
		const layout = (localConfig as BuildConfig)?.layout;
		return (
			<div style="display:flex;flex-direction:column;gap:16px">
				<div style="max-width:500px">
					<div>
						<label style="display:block;font-weight:600;margin-bottom:6px">KLE JSON URL</label>
						<input
							type="text"
							style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-input);color:var(--text-primary)"
							placeholder="http://www.keyboard-layout-editor.com/..."
							value={layout?.kleUrl || ''}
							onInput={(e) => updateLocal('layout', 'kleUrl', (e.target as HTMLInputElement).value)}
						/>
					</div>
					<div style="margin-top:16px">
						<label style="display:block;font-weight:600;margin-bottom:6px">Layout File Path</label>
						<input
							type="text"
							style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-input);color:var(--text-primary)"
							placeholder="projects/my-project/kle.json"
							value={layout?.path || ''}
							onInput={(e) => updateLocal('layout', 'path', (e.target as HTMLInputElement).value)}
						/>
						<div style="font-size:12px;color:var(--text-muted);margin-top:4px">
							Relative to project directory, or absolute path
						</div>
					</div>
					<div style="margin-top:16px">
						<Button
							variant="secondary"
							loading={renderingLayout}
							onClick={renderLayoutPreview}
						>
							Render Layout Preview
						</Button>
					</div>
				</div>

				{/* Layout image preview */}
				{layoutImage && (
					<div style="margin-top:16px;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;background:var(--bg-card)">
						<div style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-muted)">
							Layout Preview
						</div>
						<img
							src={`${layoutImage}?t=${Date.now()}`}
							alt="Keyboard Layout"
							style="width:100%;display:block"
						/>
					</div>
				)}
			</div>
		);
	};

	const renderLayoutEditor = () => {
		// Navigate to the full-page layout editor
		route('/layout');
		return null;
	};

	// Component data — loaded once, shared between power/pcb sections
	const [chargerOptions, setChargerOptions] = useState<ComponentOption[]>([]);
	const [batteryOptions, setBatteryOptions] = useState<ComponentOption[]>([]);
	const [mcuOptions, setMcuOptions] = useState<ComponentOption[]>([]);
	useEffect(() => {
		apiGet<ComponentOption[]>('/api/components/chargers').then(setChargerOptions).catch(() => {});
		apiGet<ComponentOption[]>('/api/components/batteries').then(setBatteryOptions).catch(() => {});
		apiGet<ComponentOption[]>('/api/components/mcus').then(setMcuOptions).catch(() => {});
	}, []);

	const renderPower = () => {
		const pwr = (localConfig as BuildConfig)?.power;

		return (
			<div style="display:flex;flex-direction:column;gap:20px;max-width:600px">
				<label style="display:flex;align-items:center;gap:12px;cursor:pointer">
					<input
						type="checkbox"
						checked={pwr?.battery ?? false}
						onChange={(e) => updateLocal('power', 'battery', (e.target as HTMLInputElement).checked)}
					/>
					<div>
						<div style="font-weight:600">Enable Battery</div>
						<div style="font-size:12px;color:var(--text-muted)">Required for wireless/Bluetooth operation</div>
					</div>
				</label>

				{pwr?.battery && (
					<>
						<div>
							<h3 style="margin:0 0 12px;font-size:15px;color:var(--text-secondary)">Charger IC</h3>
							<div style="display:flex;flex-direction:column;gap:8px">
								{chargerOptions.map((opt) => (
									<div
										key={opt.id}
										onClick={() => updateLocal('power', 'chargerIc', opt.id)}
										style={`padding:12px 16px;background:${pwr?.chargerIc === opt.id ? 'var(--bg-hover)' : 'var(--bg-card)'};border:1px solid ${pwr?.chargerIc === opt.id ? 'var(--accent)' : 'var(--border)'};border-radius:var(--radius);cursor:pointer;display:flex;justify-content:space-between;align-items:center`}
									>
										<div>
											<div style="font-weight:500">{opt.name}</div>
											<div style="font-size:12px;color:var(--text-muted)">{opt.description}</div>
										</div>
										<a href={`/parts/chargers/${opt.id}`} onClick={(e) => e.stopPropagation()} style="font-size:12px;color:var(--accent)">Details</a>
									</div>
								))}
							</div>
						</div>

						<div>
							<h3 style="margin:0 0 12px;font-size:15px;color:var(--text-secondary)">Battery Capacity</h3>
							<div style="display:flex;flex-direction:column;gap:8px">
								{batteryOptions.map((opt) => {
									const cap = (opt as any).capacityMah || (opt as any).data?.capacityMah || opt.id.match(/(\d+)mah/)?.[1];
									const capStr = cap ? `${cap}` : opt.id;
									return (
										<div
											key={opt.id}
											onClick={() => updateLocal('power', 'batteryCapacityMah', parseInt(capStr) || 1000)}
											style={`padding:12px 16px;background:${String(pwr?.batteryCapacityMah) === capStr ? 'var(--bg-hover)' : 'var(--bg-card)'};border:1px solid ${String(pwr?.batteryCapacityMah) === capStr ? 'var(--accent)' : 'var(--border)'};border-radius:var(--radius);cursor:pointer;display:flex;justify-content:space-between;align-items:center`}
										>
											<div>
												<div style="font-weight:500">{opt.name}</div>
												<div style="font-size:12px;color:var(--text-muted)">{opt.description}</div>
											</div>
											<a href={`/parts/batteries/${opt.id}`} onClick={(e) => e.stopPropagation()} style="font-size:12px;color:var(--accent)">Details</a>
										</div>
									);
								})}
							</div>
						</div>

						<div style="border-top:1px solid var(--border);padding-top:16px;margin-top:8px">
							<label style="display:block;font-weight:500;margin-bottom:6px;font-size:13px">Charge Current (mA)</label>
							{(() => {
								// Determine limits from selected charger
								const chargerId = pwr?.chargerIc || '';
								const chargerMaxMa: Record<string, number> = {
									'mcp73831': 500, 'tp4056': 1000, 'bq24075': 1500,
									'MCP73831': 500, 'TP4056': 1000, 'BQ24075RGTR': 1500,
								};
								const maxMa = chargerMaxMa[chargerId] || 500;
								const battMah = pwr?.batteryCapacityMah || 1000;
								// Safe charge rate: 0.5C (half the battery capacity)
								const safeMa = Math.min(maxMa, Math.round(battMah * 0.5));
								const chargeHours = battMah / (pwr?.chargeCurrentMa || safeMa);

								return (
									<div>
										<input
											type="number"
											step="50"
											min="100"
											max={maxMa}
											style="width:150px;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-input);color:var(--text-primary)"
											value={pwr?.chargeCurrentMa ?? safeMa}
											onInput={(e) => updateLocal('power', 'chargeCurrentMa', parseInt((e.target as HTMLInputElement).value) || safeMa)}
										/>
										<span style="margin-left:8px;font-size:12px;color:var(--text-muted)">
											max {maxMa}mA ({chargerId || 'charger'})
										</span>

										<div style="margin-top:10px;padding:10px 12px;background:var(--bg-hover,#2d3748);border-radius:var(--radius-sm);font-size:12px;line-height:1.6">
											<div style="font-weight:600;color:var(--text-primary);margin-bottom:4px">About charge current</div>
											<div style="color:var(--text-muted)">
												This sets how fast the battery charges via the charger IC. It's limited by the charger module's maximum output.
											</div>
											<div style="margin-top:6px;color:var(--text-muted)">
												<strong style="color:var(--text-secondary)">Higher current</strong> = faster charge, but generates more heat and can reduce battery lifespan. Max for your charger: {maxMa}mA.
											</div>
											<div style="margin-top:4px;color:var(--text-muted)">
												<strong style="color:var(--text-secondary)">Lower current</strong> = slower charge, gentler on the battery, longer lifespan. Min recommended: 100mA.
											</div>
											<div style="margin-top:8px;padding:6px 8px;background:var(--bg-card,#1f2937);border-radius:4px;border-left:3px solid var(--accent)">
												<strong style="color:var(--accent)">Recommended: {safeMa}mA</strong> (0.5C rate for {battMah}mAh battery)
												<div style="color:var(--text-muted);font-size:11px;margin-top:2px">
													Estimated charge time: ~{chargeHours.toFixed(1)} hours
												</div>
											</div>
										</div>
									</div>
								);
							})()}
						</div>
					</>
				)}
			</div>
		);
	};

	const renderStepContent = () => {
		if (COMPONENT_STEPS[currentStep]) return renderComponentStep();
		switch (currentStep) {
			case 'layout':
				return renderLayout();
			case 'connectivity':
				return <ConnectivityStep localConfig={localConfig} updateLocal={updateLocal} />;
			case 'power':
				return renderPower();
			case 'features':
				return <FeaturesStep localConfig={localConfig} updateLocal={updateLocal} />;
			case 'outputs':
				return <OutputsStep localConfig={localConfig} updateLocal={updateLocal} />;
			case 'pcb':
				return renderPcb();
			case 'physical':
				return renderPhysical();
			case 'layout-editor':
				return renderLayoutEditor();
			default:
				return <div style="color:var(--text-muted)">Unknown step.</div>;
		}
	};

	return (
		<div style="padding:24px;max-width:1100px;margin:0 auto">
			{/* Top bar */}
			<div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;flex-wrap:wrap">
				<Button
					variant="ghost"
					onClick={() => {
						activeTab.value = 'overview';
						route('/overview');
					}}
				>
					&larr; Back
				</Button>
				<Dropdown
					options={WIZARD_STEPS.map((s) => ({ label: `${s.icon} ${s.label}`, value: s.id }))}
					value={currentStep}
					onChange={handleStepChange}
				/>
				<div style="flex:1" />
				<Button variant="primary" loading={saving} onClick={handleSave}>
					Save
				</Button>
			</div>

			{/* Step header */}
			<div style="margin-bottom:24px">
				<h2 style="margin:0 0 4px">
					{stepDef?.icon} {stepDef?.label || currentStep}
				</h2>
				<p style="margin:0;color:var(--text-muted)">{stepDef?.description}</p>
			</div>

			{/* Step content */}
			{renderStepContent()}
		</div>
	);
}
