import { confirm, select } from '../prompt-wrapper.js';

export async function promptFeatures() {
  const rgbPerKey = await confirm({ message: 'Enable per-key RGB LEDs?', default: false });

  let ledPlacement: 'above' | 'below' = 'below';
  if (rgbPerKey) {
    ledPlacement = await select({
      message: 'LED placement?',
      choices: [
        { name: 'Above switch (shine-through keycaps)', value: 'above' as const },
        { name: 'Below switch (reverse-mount, through PCB)', value: 'below' as const },
      ],
    });
  }

  const rgbUnderglow = !rgbPerKey && await confirm({ message: 'Enable RGB underglow?', default: false });
  const rotaryEncoder = await confirm({ message: 'Include rotary encoder?', default: false });

  return {
    rgbPerKey,
    ledPlacement,
    rgbUnderglow,
    underglow: { ledCount: rgbUnderglow ? 12 : 0, ledModel: rgbUnderglow ? 'sk6812-mini-e' : null },
    rotaryEncoder,
    oledDisplay: false,
  };
}
