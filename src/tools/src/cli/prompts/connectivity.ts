import { confirm } from '../prompt-wrapper.js';

export async function promptConnectivity() {
  const bluetooth = await confirm({
    message: 'Enable Bluetooth wireless?',
    default: true,
  });

  return {
    usb: true,
    bluetooth,
    bluetoothVersion: bluetooth ? '5.0' : '',
  };
}
