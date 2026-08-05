import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.orbihealth.app',
  appName: 'ORBI Health',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      // Mesmo preto do manifest.json (background_color/theme_color) e do
      // splash.png gerado — evita qualquer flash de cor diferente antes do
      // app React montar.
      backgroundColor: '#000000',
      launchShowDuration: 1500,
      launchAutoHide: true,
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#000000',
    },
  },
};

export default config;
