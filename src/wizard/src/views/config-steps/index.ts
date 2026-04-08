/**
 * Config step components — decomposed from views/Config.tsx.
 *
 * Each step is a small, focused component that takes
 * `localConfig`, `updateLocal`, and any shared data it needs.
 *
 * Currently extracted:
 *   - ConnectivityStep
 *   - FeaturesStep
 *   - OutputsStep
 *
 * Still inlined in Config.tsx (deferred to a later decomposition):
 *   - PcbStep (uses chargerOptions, mcuOptions for fanout logic)
 *   - PhysicalStep (uses connectivity + usbConnector cross-refs)
 *   - PowerStep (uses chargerOptions + batteryOptions)
 *   - LayoutStep (triggers API calls to render KLE preview)
 *   - LayoutEditorStep (embeds the canvas editor)
 *   - renderComponentStep (switches/mcu/diode/etc. — tightly
 *     coupled to Config state: options, selected, activeFilters)
 */
export { ConnectivityStep } from './ConnectivityStep';
export { FeaturesStep } from './FeaturesStep';
export { OutputsStep } from './OutputsStep';
export type { ConfigStepProps } from './types';
