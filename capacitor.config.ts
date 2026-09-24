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

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      launchFadeOutDuration: 300,
      backgroundColor: '#000000',
      showSpinner: false,
    },
  },
}

export default config