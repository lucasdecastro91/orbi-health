import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.orbihealth.app',
  appName: 'ORBI Health',
  webDir: 'dist',
  // Carrega o app direto da produção (Vercel) em vez de empacotar o build
  // dentro do binário — atualizações normais (features, bugfix, UI) vão só
  // pelo deploy de sempre, sem precisar recompilar/reenviar pra loja. Só
  // muda quando algo nativo de verdade mudar (ícone, splash, plugin nativo
  // novo, upgrade do Capacitor).
  server: {
    url: 'https://app.orbihealth.com.br',
    cleartext: false,
  },
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
