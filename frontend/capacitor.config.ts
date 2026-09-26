import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ethanalyzer.app',
  appName: 'ETH Analyzer',
  webDir: 'dist',
  android: {
    // La importación desde el PC usa HTTP en claro contra una IP privada de la red local.
    allowMixedContent: true,
  },
  plugins: {
    LocalNotifications: {
      iconColor: '#7C9CFF',
    },
    BackgroundRunner: {
      label: 'com.ethanalyzer.app.alerts',
      src: 'runners/alerts.js',
      event: 'checkAlerts',
      repeat: true,
      interval: 15,
      autoStart: true,
    },
  },
};

export default config;
