import { h } from 'preact';
import { Checkbox } from '../../components/common/Checkbox';
import type { BuildConfig } from '../../types/project.types';
import type { ConfigStepProps } from './types';

export function FeaturesStep({ localConfig, updateLocal, switchOptions }: ConfigStepProps) {
  const feat = (localConfig as BuildConfig)?.features;
  const switchModel = (localConfig as BuildConfig)?.switches?.model;
  const selectedSwitch = switchOptions?.find((s) => s.id === switchModel) as any;
  const hasTransparentHousing = selectedSwitch?.transparentHousing ?? true;

  return (
    <div style="display:flex;flex-direction:column;gap:20px;max-width:600px">
      {/* Per-key RGB */}
      <Checkbox
        checked={feat?.rgbPerKey ?? false}
        onChange={(v) => updateLocal('features', 'rgbPerKey', v)}
        label="Per-Key RGB LEDs"
        description={
          <div>
            Adds one addressable RGB LED (SK6812MINI-E) per switch on the top side of the PCB (F.Cu),
            same side as the switches. Each key can be individually controlled for color and brightness.
            Choose to place LEDs above (north) or below (south) of each switch.
            <div style="color:var(--warning);margin-top:4px">
              Adds one LED per key. High power draw (~1.7A at full white) — battery life significantly reduced in wireless mode.
            </div>
            {feat?.rgbPerKey && !hasTransparentHousing && (
              <div style="color:var(--accent);margin-top:6px;padding:6px 8px;background:var(--accent-soft);border-radius:var(--radius-sm)">
                Note: The selected switch ({selectedSwitch?.name || switchModel}) has an opaque housing.
                Per-key RGB LEDs will still work electrically, but the light won't shine through the switch body.
                For best RGB visibility, consider a switch with a transparent housing (filter by "RGB-Ready" on the Switches page).
              </div>
            )}
          </div>
        }
      />

      {feat?.rgbPerKey && (
        <div style="margin-left:32px">
          <div style="font-size:13px;font-weight:500;margin-bottom:6px">LED Placement</div>
          <div style="display:flex;gap:12px">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
              <input type="radio" name="ledPlacement" checked={feat?.ledPlacement === 'below'} onChange={() => updateLocal('features', 'ledPlacement', 'below')} />
              Below switch (south side of each key)
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
              <input type="radio" name="ledPlacement" checked={feat?.ledPlacement === 'above'} onChange={() => updateLocal('features', 'ledPlacement', 'above')} />
              Above switch (north side of each key)
            </label>
          </div>
        </div>
      )}

      {/* RGB Underglow */}
      <Checkbox
        checked={feat?.rgbUnderglow ?? false}
        onChange={(v) => updateLocal('features', 'rgbUnderglow', v)}
        label="RGB Underglow"
        description={
          <div>
            Places 12 addressable RGB LEDs (SK6812MINI-E) evenly around the perimeter of the PCB on the back side.
            Creates a glow effect underneath the keyboard, visible through translucent or open cases.
            All LEDs are independently addressable and daisy-chained on a single data line from the MCU.
            <div style="color:var(--text-muted);margin-top:4px">
              Low power (~0.2A). Minimal PCB space. Does NOT light individual keys — use per-key RGB for that.
            </div>
          </div>
        }
      />

      {/* Rotary Encoder */}
      <Checkbox
        checked={feat?.rotaryEncoder ?? false}
        onChange={(v) => updateLocal('features', 'rotaryEncoder', v)}
        label="Rotary Encoder"
        description="Adds a rotary encoder for volume control, scrolling, or custom functions. Typically placed in a corner of the keyboard. Uses 3 GPIO pins (A, B, switch). Supported by ZMK with custom key bindings."
      />

      {/* OLED Display */}
      <Checkbox
        checked={feat?.oledDisplay ?? false}
        onChange={(v) => updateLocal('features', 'oledDisplay', v)}
        label="OLED Display"
        description="Adds a small OLED screen (128x32 SSD1306) for displaying layer info, WPM, battery level, or custom graphics. Connected via I2C (2 GPIO pins). Requires a cutout or window in the case."
      />
    </div>
  );
}
