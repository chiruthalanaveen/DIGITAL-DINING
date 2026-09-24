import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.digitaldining.app',
  appName: 'Digital Dine',
  webDir: 'public',

  server: {
    url: 'https://www.digitaldine-in.online/app',
    cleartext: false,
  },

  android: {
    allowMixedContent: false,
  },
}

export default config