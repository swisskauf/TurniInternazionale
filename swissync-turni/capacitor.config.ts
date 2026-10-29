import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ch.swissync.turni',
  appName: 'Swissync Turni',
  webDir: 'dist',
  backgroundColor: '#f3f4f7',
  ios: {
    contentInset: 'never',
    scheme: 'Swissync Turni',
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: false,
      backgroundColor: '#e5223f',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: false,
      splashImmersive: false,
    },
    LocalNotifications: {
      iconColor: '#E5223F',
    },
  },
};

export default config;
