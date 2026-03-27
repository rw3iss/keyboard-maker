import { h } from 'preact';
import { useState } from 'preact/hooks';

export interface ChipDef {
	label: string;
	value: string;
}

interface Props {
	component: any;
	category: string;
	isSelected: boolean;
	onSelect: () => void;
	chips: ChipDef[];
}

function getPrice(component: any): string | null {
	// Check variants for price
	if (component.variants?.length) {
		for (const v of component.variants) {
			if (v.suppliers?.length) {
				for (const s of v.suppliers) {
					if (s.priceUsd != null) return `$${s.priceUsd.toFixed(2)}`;
				}
			}
		}
	}
	// Check top-level suppliers
	if (component.suppliers?.length) {
		for (const s of component.suppliers) {
			if (s.priceUsd != null) return `$${s.priceUsd.toFixed(2)}`;
		}
	}
	return null;
}

function getAllSuppliers(component: any): Array<{ name: string; url: string; priceUsd: number | null }> {
	const suppliers: Array<{ name: string; url: string; priceUsd: number | null }> = [];
	const seen = new Set<string>();

	if (component.suppliers?.length) {
		for (const s of component.suppliers) {
			if (!seen.has(s.name)) {
				seen.add(s.name);
				suppliers.push(s);
			}
		}
	}
	if (component.variants?.length) {
		for (const v of component.variants) {
			if (v.suppliers?.length) {
				for (const s of v.suppliers) {
					if (!seen.has(s.name)) {
						seen.add(s.name);
						suppliers.push(s);
					}
				}
			}
		}
	}
	return suppliers;
}

/** Fields to skip in the expanded spec table (shown elsewhere or too noisy) */
const SKIP_FIELDS = new Set([
	'id', 'name', 'summary', 'description', 'variants', 'suppliers', 'designNotes',
	'features', 'concerns', 'externalLinks', 'gpioPins', 'footprintFile',
	'hotswapFootprintFile', 'symbolRef', 'datasheet', 'zmkBoard', 'qmkBoard',
	'manufacturer', 'boardPins', 'pinMap', 'externalComponents',
]);

function formatSpecValue(val: any): string {
	if (val == null) return '--';
	if (typeof val === 'boolean') return val ? 'Yes' : 'No';
	if (Array.isArray(val)) {
		if (val.length > 0 && typeof val[0] === 'object') return `${val.length} items`;
		return val.join(', ');
	}
	if (typeof val === 'object') {
		return Object.entries(val)
			.map(([k, v]) => {
				if (typeof v === 'object' && v != null) return `${k}: (...)`;
				return `${k}: ${v}`;
			})
			.join(', ');
	}
	return String(val);
}

function formatSpecKey(key: string): string {
	return key
		.replace(/([A-Z])/g, ' $1')
		.replace(/^./, (s) => s.toUpperCase())
		.replace(/\b(Usb|Ble|Gpio|Mcu|Ic|Mhz|Kb|Mb)\b/gi, (s) => s.toUpperCase());
}

export function ComponentListItem({ component, category, isSelected, onSelect, chips }: Props) {
	const [expanded, setExpanded] = useState(false);
	const price = getPrice(component);

	const specEntries = Object.entries(component).filter(([k]) => !SKIP_FIELDS.has(k));
	const suppliers = getAllSuppliers(component);

	return (
		<div class={`comp-list-item ${isSelected ? 'comp-list-item--selected' : ''}`}>
			{/* Collapsed view — clicking selects the item */}
			<div class="comp-list-item-main" onClick={onSelect}>
				<div class="comp-list-item-indicator">
					<div class={`comp-radio ${isSelected ? 'comp-radio--active' : ''}`} />
				</div>
				<div class="comp-list-item-body">
					<div class="comp-list-item-header">
						<div class="comp-list-item-title-row">
							<span class="comp-list-item-name">{component.name}</span>
							{component.manufacturer && (
								<span class="comp-list-item-mfr">{component.manufacturer}</span>
							)}
						</div>
						<div class="comp-list-item-actions">
							{price && <span class="comp-list-item-price">{price}</span>}
							<button
								class="comp-list-item-details-btn"
								onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
							>
								{expanded ? 'Hide Details' : 'See Details'}
							</button>
							<a
								class="comp-list-item-view-btn"
								href={`/parts/${category}/${component.id}`}
								onClick={(e) => e.stopPropagation()}
								style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font-size:11px;background:var(--bg-hover,#2d3748);color:var(--accent,#6ecbf5);border:1px solid var(--border,#334155);border-radius:4px;text-decoration:none;white-space:nowrap"
							>
								View <span style="font-size:13px">&#8594;</span>
							</a>
						</div>
					</div>
					{component.summary && (
						<div class="comp-list-item-summary">{component.summary}</div>
					)}
					{chips.length > 0 && (
						<div class="comp-list-item-chips">
							{chips.map((chip) => (
								<span key={chip.label} class="comp-chip">
									<span class="comp-chip-label">{chip.label}:</span> {chip.value}
								</span>
							))}
						</div>
					)}
				</div>
			</div>

			{/* Expanded view */}
			{expanded && (
				<div class="comp-list-item-expanded">
					{/* Spec table */}
					<div class="comp-spec-section">
						<h4 class="comp-spec-heading">Specifications</h4>
						<div class="comp-spec-table">
							{specEntries.map(([key, val]) => (
								<div key={key} class="comp-spec-row">
									<span class="comp-spec-key">{formatSpecKey(key)}</span>
									<span class="comp-spec-val">{formatSpecValue(val)}</span>
								</div>
							))}
						</div>
					</div>

					{/* Variants */}
					{component.variants?.length > 0 && (
						<div class="comp-spec-section">
							<h4 class="comp-spec-heading">Variants</h4>
							<div class="comp-variants-list">
								{component.variants.map((v: any) => (
									<div key={v.id} class="comp-variant-item">
										<span class="comp-variant-name">{v.name}</span>
										{v.actuationForce && (
											<span class="comp-chip">Force: {v.actuationForce}g</span>
										)}
										{v.tactile != null && (
											<span class="comp-chip">{v.tactile ? 'Tactile' : 'Linear'}{v.clicky ? ' / Clicky' : ''}</span>
										)}
										{v.suppliers?.length > 0 && v.suppliers[0].priceUsd != null && (
											<span class="comp-variant-price">~${v.suppliers[0].priceUsd.toFixed(2)}/ea</span>
										)}
									</div>
								))}
							</div>
						</div>
					)}

					{/* Suppliers */}
					{suppliers.length > 0 && (
						<div class="comp-spec-section">
							<h4 class="comp-spec-heading">Suppliers</h4>
							<div class="comp-suppliers-list">
								{suppliers.map((s) => (
									<a
										key={s.name}
										class="comp-supplier-link"
										href={s.url}
										target="_blank"
										rel="noopener noreferrer"
										onClick={(e) => e.stopPropagation()}
									>
										{s.name}
										{s.priceUsd != null && ` ($${s.priceUsd.toFixed(2)})`}
									</a>
								))}
							</div>
						</div>
					)}

					{/* Design notes */}
					{component.designNotes?.length > 0 && (
						<div class="comp-spec-section">
							<h4 class="comp-spec-heading">Design Notes</h4>
							<ul class="comp-notes-list">
								{component.designNotes.map((note: string, i: number) => (
									<li key={i}>{note}</li>
								))}
							</ul>
						</div>
					)}

					{/* Features & Concerns */}
					{component.features?.length > 0 && (
						<div class="comp-spec-section">
							<h4 class="comp-spec-heading">Features</h4>
							<ul class="comp-notes-list comp-notes-list--features">
								{component.features.map((f: string, i: number) => (
									<li key={i}>{f}</li>
								))}
							</ul>
						</div>
					)}
					{component.concerns?.length > 0 && (
						<div class="comp-spec-section">
							<h4 class="comp-spec-heading">Concerns</h4>
							<ul class="comp-notes-list comp-notes-list--concerns">
								{component.concerns.map((c: string, i: number) => (
									<li key={i}>{c}</li>
								))}
							</ul>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
