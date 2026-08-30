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
  ios: {
    // 'automatic' deixa o WKWebView calcular os insets de safe-area sozinho,
    // o que soma com o padding-top: env(safe-area-inset-top) que o CSS já
    // aplica (StudentLayout.tsx) — resultado: área de conteúdo maior que a
    // tela, arrastável em qualquer direção. 'never' desliga o ajuste
    // automático do WebKit e deixa 100% por conta do CSS.
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      // Mesmo preto do manifest.json (background_color/theme_color) e do
      // splash.png gerado — evita qualquer flash de cor diferente antes do
      // app React montar.
      backgroundColor: '#000000',
      // autoHide desligado de propósito: com true + launchShowDuration fixo,
      // a splash nativa some sozinha depois de 1.5s independente do app já
      // ter terminado de carregar — se o carregamento (checkSession em
      // App.tsx) demorasse mais que isso, a tela de loading web
      // (SplashScreen.tsx) aparecia por baixo, dando a sensação de "duas
      // telas". Agora a splash nativa fica visível até o código chamar
      // CapacitorSplashScreen.hide() explicitamente (App.tsx), exatamente
      // quando o app está pronto — só uma tela, nunca duas.
      launchAutoHide: false,
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
