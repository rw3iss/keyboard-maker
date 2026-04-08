import { h } from 'preact';
import { useMemo } from 'preact/hooks';

export interface FilterConfig {
	key: string;
	label: string;
	type: 'select' | 'boolean' | 'range' | 'multi' | 'maxPrice';
	options?: string[];
	rangeBrackets?: string[];
	/** For maxPrice: path to extract price from component (e.g. "suppliers.0.priceUsd") */
	pricePath?: string;
}

interface Props {
	components: any[];
	filters: FilterConfig[];
	activeFilters: Record<string, any>;
	onChange: (filters: Record<string, any>) => void;
	onReset: () => void;
	/** Optional extra content rendered at the end of the filter row */
	extraFilter?: any;
}

/** Generate range bracket labels for a numeric field */
function buildRangeBrackets(values: number[]): string[] {
	if (values.length === 0) return [];
	const sorted = [...new Set(values)].sort((a, b) => a - b);
	if (sorted.length <= 4) return sorted.map((v) => String(v));

	const min = sorted[0];
	const max = sorted[sorted.length - 1];
	const range = max - min;
	if (range === 0) return [String(min)];

	// Create ~4 brackets
	const step = Math.ceil(range / 4);
	const brackets: string[] = [];
	let lo = min;
	while (lo <= max) {
		const hi = Math.min(lo + step - 1, max);
		if (hi >= max) {
			brackets.push(`${lo}+`);
			break;
		} else {
			brackets.push(`${lo}-${hi}`);
		}
		lo = hi + 1;
	}
	return brackets;
}

/** Resolve a nested key like "switchSpacing.x" from an object */
function resolveKey(obj: any, key: string): any {
	const parts = key.split('.');
	let val = obj;
	for (const p of parts) {
		if (val == null) return undefined;
		val = val[p];
	}
	return val;
}

/** Check if a numeric value falls within a bracket like "10-20" or "30+" */
function matchesBracket(value: number, bracket: string): boolean {
	if (bracket.endsWith('+')) {
		const lo = parseFloat(bracket);
		return value >= lo;
	}
	const [lo, hi] = bracket.split('-').map(Number);
	return value >= lo && value <= hi;
}

/** Collect unique values from components for a given filter config */
function getFilterOptions(components: any[], fc: FilterConfig): string[] {
	if (fc.options && fc.options.length > 0) return fc.options;

	if (fc.type === 'boolean') return ['Yes', 'No'];

	const raw: any[] = [];
	for (const c of components) {
		const val = resolveKey(c, fc.key);
		if (val == null) continue;
		if (Array.isArray(val)) {
			raw.push(...val);
		} else {
			raw.push(val);
		}
	}

	if (fc.type === 'range') {
		const nums = raw.filter((v) => typeof v === 'number') as number[];
		if (fc.rangeBrackets) return fc.rangeBrackets;
		return buildRangeBrackets(nums);
	}

	// select or multi: unique string values — filter out empty/blank entries
	const unique = [...new Set(raw.map(String))].filter(v => v && v.trim() !== '' && v !== 'undefined' && v !== 'null').sort();
	return unique;
}

export function matchesFilters(component: any, activeFilters: Record<string, any>, filters: FilterConfig[]): boolean {
	for (const fc of filters) {
		const filterVal = activeFilters[fc.key];
		if (!filterVal || filterVal === '' || filterVal === 'all') continue;

		const compVal = resolveKey(component, fc.key);

		if (fc.type === 'boolean') {
			const boolExpected = filterVal === 'Yes';
			if (Boolean(compVal) !== boolExpected) return false;
		} else if (fc.type === 'range') {
			const num = typeof compVal === 'number' ? compVal : parseFloat(String(compVal));
			if (isNaN(num) || !matchesBracket(num, filterVal)) return false;
		} else if (fc.type === 'maxPrice') {
			const maxPrice = parseFloat(filterVal);
			if (isNaN(maxPrice)) continue;
			// Extract lowest price from suppliers array
			let lowestPrice = Infinity;
			const suppliers = component.suppliers;
			if (Array.isArray(suppliers)) {
				for (const s of suppliers) {
					if (s.priceUsd != null && s.priceUsd < lowestPrice) lowestPrice = s.priceUsd;
				}
			}
			// Also check variant suppliers
			if (Array.isArray(component.variants)) {
				for (const v of component.variants) {
					if (Array.isArray(v.suppliers)) {
						for (const s of v.suppliers) {
							if (s.priceUsd != null && s.priceUsd < lowestPrice) lowestPrice = s.priceUsd;
						}
					}
				}
			}
			if (lowestPrice > maxPrice) return false;
		} else if (fc.type === 'multi') {
			// Component value is an array; check if it contains the filter value (case-insensitive)
			const arr = Array.isArray(compVal) ? compVal.map((v: any) => String(v).toLowerCase()) : [String(compVal || '').toLowerCase()];
			if (!arr.some(v => v.includes(filterVal.toLowerCase()))) return false;
		} else {
			// select: exact string match
			if (String(compVal || '') !== filterVal) return false;
		}
	}
	return true;
}

export function ComponentFilter({ components, filters, activeFilters, onChange, onReset, extraFilter }: Props) {
	const filterOptions = useMemo(() => {
		const map: Record<string, string[]> = {};
		for (const fc of filters) {
			map[fc.key] = getFilterOptions(components, fc);
		}
		return map;
	}, [components, filters]);

	const hasActiveFilters = Object.values(activeFilters).some((v) => v && v !== '' && v !== 'all');

	const handleChange = (key: string, value: string) => {
		onChange({ ...activeFilters, [key]: value });
	};

	return (
		<div class="comp-filter-bar">
			<div class="comp-filter-row">
				{filters.map((fc) => {
					if (fc.type === 'maxPrice') {
						return (
							<div key={fc.key} class="comp-filter-item">
								<label class="comp-filter-label">{fc.label}</label>
								<input
									type="number"
									class="comp-filter-select"
									style="width:70px"
									placeholder="Max $"
									min="0"
									step="1"
									value={activeFilters[fc.key] || ''}
									onInput={(e) => handleChange(fc.key, (e.target as HTMLInputElement).value)}
								/>
							</div>
						);
					}
					const opts = filterOptions[fc.key] || [];
					if (opts.length === 0 && fc.type !== 'boolean') return null;
					return (
						<div key={fc.key} class="comp-filter-item">
							<label class="comp-filter-label">{fc.label}</label>
							<select
								class="comp-filter-select"
								value={activeFilters[fc.key] || 'all'}
								onChange={(e) => handleChange(fc.key, (e.target as HTMLSelectElement).value)}
							>
								<option value="all">All</option>
								{opts.map((o) => (
									<option key={o} value={o}>{o}</option>
								))}
							</select>
						</div>
					);
				})}
			{extraFilter}
			</div>
			{hasActiveFilters && (
				<button class="comp-filter-reset" onClick={onReset}>
					Reset Filters
				</button>
			)}
		</div>
	);
}
