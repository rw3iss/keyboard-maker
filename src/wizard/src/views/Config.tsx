import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { currentProject, projectConfig, activeTab } from '../state/app.state';
import { addToast } from '../services/toast.service';
import { apiGet, apiPost, apiPut } from '../services/api.service';
import { WIZARD_STEPS } from '../config/wizard-steps';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Dropdown } from '../components/common/Dropdown';
import { Spinner } from '../components/common/Spinner';
import type { BuildConfig } from '../types/project.types';
import { route } from 'preact-router';

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

export function Config({ step }: ConfigProps) {
	const project = currentProject.value;
	const config = projectConfig.value;
	const [currentStep, setCurrentStep] = useState(step || WIZARD_STEPS[0].id);
	const [options, setOptions] = useState<ComponentOption[]>([]);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [selected, setSelected] = useState<string>('');
	const [localConfig, setLocalConfig] = useState<Partial<BuildConfig>>({});

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
		// Set selected component from config
		if (currentStep === 'switches') setSelected(config.switches?.model || '');
		else if (currentStep === 'mcu') setSelected(config.mcu?.module || '');
		else if (currentStep === 'power') setSelected(config.power?.chargerIc || '');
	}, [config, currentStep]);

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
				const opt = options.find((o) => o.name === selected || o.id === selected);
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
				const opt = options.find((o) => o.name === selected || o.id === selected);
				// Extract GPIO count from component data
				const gpioCount = (opt as any)?.gpioCount || (opt as any)?.specs?.gpioCount || updatedConfig.mcu?.gpioAvailable || 21;
				updatedConfig.mcu = {
					...updatedConfig.mcu,
					module: opt?.id || selected,
					type: 'nrf52840',
					gpioAvailable: gpioCount,
				};
			} else if (currentStep === 'power' && selected) {
				const opt = options.find((o) => o.name === selected || o.id === selected);
				updatedConfig.power = {
					...updatedConfig.power,
					chargerIc: opt?.name || selected,
				};
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

	const renderComponentStep = () => {
		if (loading) {
			return (
				<div style="text-align:center;padding:40px">
					<Spinner />
				</div>
			);
		}
		return (
			<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">
				{options.map((opt) => (
					<Card
						key={opt.id}
						title={opt.name}
						description={opt.description}
						selected={selected === opt.name || selected === opt.id}
						onClick={() => setSelected(opt.name || opt.id)}
					>
						{opt.manufacturer && (
							<div style="font-size:12px;color:var(--text-muted);margin-top:4px">
								{opt.manufacturer}
							</div>
						)}
						{opt.specs && (
							<div style="font-size:12px;margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
								{Object.entries(opt.specs).slice(0, 4).map(([k, v]) => (
									<span
										key={k}
										style="background:var(--bg-hover);padding:2px 6px;border-radius:4px"
									>
										{k}: {String(v)}
									</span>
								))}
							</div>
						)}
						<a
							href={`/parts/${COMPONENT_STEPS[currentStep]}/${opt.id}`}
							style="display:inline-block;margin-top:8px;font-size:12px;color:var(--accent)"
							onClick={(e) => e.stopPropagation()}
						>
							View Details &rarr;
						</a>
					</Card>
				))}
				{options.length === 0 && (
					<div style="color:var(--text-muted);padding:20px">
						No options available for this category.
					</div>
				)}
			</div>
		);
	};

	const renderConnectivity = () => {
		const conn = (localConfig as BuildConfig)?.connectivity;
		return (
			<div style="display:flex;flex-direction:column;gap:16px;max-width:500px">
				<label style="display:flex;align-items:center;gap:12px;cursor:pointer">
					<input
						type="checkbox"
						checked={conn?.usb ?? true}
						onChange={(e) => updateLocal('connectivity', 'usb', (e.target as HTMLInputElement).checked)}
					/>
					<span>USB Connection</span>
				</label>
				<label style="display:flex;align-items:center;gap:12px;cursor:pointer">
					<input
						type="checkbox"
						checked={conn?.bluetooth ?? false}
						onChange={(e) => updateLocal('connectivity', 'bluetooth', (e.target as HTMLInputElement).checked)}
					/>
					<span>Bluetooth (BLE)</span>
				</label>
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
	};

	const renderFeatures = () => {
		const feat = (localConfig as BuildConfig)?.features;
		return (
			<div style="display:flex;flex-direction:column;gap:16px;max-width:500px">
				<label style="display:flex;align-items:center;gap:12px;cursor:pointer">
					<input
						type="checkbox"
						checked={feat?.rgbPerKey ?? false}
						onChange={(e) => updateLocal('features', 'rgbPerKey', (e.target as HTMLInputElement).checked)}
					/>
					<span>Per-key RGB LEDs</span>
				</label>
				<label style="display:flex;align-items:center;gap:12px;cursor:pointer">
					<input
						type="checkbox"
						checked={feat?.rgbUnderglow ?? false}
						onChange={(e) => updateLocal('features', 'rgbUnderglow', (e.target as HTMLInputElement).checked)}
					/>
					<span>RGB Underglow</span>
				</label>
				<label style="display:flex;align-items:center;gap:12px;cursor:pointer">
					<input
						type="checkbox"
						checked={feat?.rotaryEncoder ?? false}
						onChange={(e) => updateLocal('features', 'rotaryEncoder', (e.target as HTMLInputElement).checked)}
					/>
					<span>Rotary Encoder</span>
				</label>
				<label style="display:flex;align-items:center;gap:12px;cursor:pointer">
					<input
						type="checkbox"
						checked={feat?.oledDisplay ?? false}
						onChange={(e) => updateLocal('features', 'oledDisplay', (e.target as HTMLInputElement).checked)}
					/>
					<span>OLED Display</span>
				</label>
			</div>
		);
	};

	const renderOutputs = () => {
		const out = (localConfig as BuildConfig)?.outputs;
		const outputFields: Array<{ key: keyof NonNullable<BuildConfig['outputs']>; label: string }> = [
			{ key: 'schematic', label: 'Schematic (KiCad)' },
			{ key: 'pcb', label: 'PCB Layout (KiCad)' },
			{ key: 'gerbers', label: 'Gerber Files' },
			{ key: 'plate', label: 'Plate DXF' },
			{ key: 'bom', label: 'Bill of Materials' },
			{ key: 'firmware', label: 'Firmware Source' },
			{ key: 'notes', label: 'Build Notes' },
		];
		return (
			<div style="display:flex;flex-direction:column;gap:16px;max-width:500px">
				{outputFields.map((f) => (
					<label key={f.key} style="display:flex;align-items:center;gap:12px;cursor:pointer">
						<input
							type="checkbox"
							checked={out?.[f.key] ?? false}
							onChange={(e) => updateLocal('outputs', f.key, (e.target as HTMLInputElement).checked)}
						/>
						<span>{f.label}</span>
					</label>
				))}
			</div>
		);
	};

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
					options={[
						{ label: 'Auto-route', value: 'auto' },
						{ label: 'Manual (guides only)', value: 'manual' },
					]}
					value={pcb?.routing || 'auto'}
					onChange={(v) => updateLocal('pcb', 'routing', v)}
				/>
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
								style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-input,#0f172a);color:var(--text-primary)"
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
								style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-input,#0f172a);color:var(--text-primary)"
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
							style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-input,#0f172a);color:var(--text-primary)"
							placeholder="http://www.keyboard-layout-editor.com/..."
							value={layout?.kleUrl || ''}
							onInput={(e) => updateLocal('layout', 'kleUrl', (e.target as HTMLInputElement).value)}
						/>
					</div>
					<div style="margin-top:16px">
						<label style="display:block;font-weight:600;margin-bottom:6px">Layout File Path</label>
						<input
							type="text"
							style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-input,#0f172a);color:var(--text-primary)"
							placeholder="projects/my-project/kle.json"
							value={layout?.path || ''}
							onInput={(e) => updateLocal('layout', 'path', (e.target as HTMLInputElement).value)}
						/>
						<div style="font-size:12px;color:var(--text-muted);margin-top:4px">
							Relative to src/tools/, or absolute path, or relative to project directory
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
		return (
			<div style="text-align:center;padding:40px;color:var(--text-muted)">
				<div style="font-size:32px;margin-bottom:12px">&#9999;&#65039;</div>
				<p>Layout editor will allow fine-tuning of component positions on the PCB.</p>
				<p style="font-size:13px">This feature is coming soon.</p>
			</div>
		);
	};

	const renderPower = () => {
		const pwr = (localConfig as BuildConfig)?.power;
		const [chargerOptions, setChargerOptions] = useState<ComponentOption[]>([]);
		const [batteryOptions, setBatteryOptions] = useState<ComponentOption[]>([]);

		useEffect(() => {
			apiGet<ComponentOption[]>('/api/components/chargers').then(setChargerOptions).catch(() => {});
			apiGet<ComponentOption[]>('/api/components/batteries').then(setBatteryOptions).catch(() => {});
		}, []);

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

						<div>
							<label style="display:block;font-weight:500;margin-bottom:6px;font-size:13px">Charge Current (mA)</label>
							<input
								type="number"
								step="50"
								min="100"
								max="2000"
								style="width:150px;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-input,#0f172a);color:var(--text-primary)"
								value={pwr?.chargeCurrentMa ?? 500}
								onInput={(e) => updateLocal('power', 'chargeCurrentMa', parseInt((e.target as HTMLInputElement).value) || 500)}
							/>
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
				return renderConnectivity();
			case 'power':
				return renderPower();
			case 'features':
				return renderFeatures();
			case 'outputs':
				return renderOutputs();
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
