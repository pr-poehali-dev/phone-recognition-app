import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.coinscan.app',
  appName: 'CoinScan',
  webDir: 'dist',
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
  plugins: {
    CapacitorHttp: {
      enabled: false,
    },
  },
};

export default config;
