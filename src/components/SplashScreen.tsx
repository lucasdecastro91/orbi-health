interface SplashScreenProps {
  isGetShape?: boolean;
  /** Ícone customizado da org (icon_url). Se fornecido, substitui o ícone padrão. */
  iconUrl?: string | null;
}

const SplashScreen = ({ isGetShape = false, iconUrl }: SplashScreenProps) => {
  // Prioridade: ícone customizado da org → GS splash → Orbi Balance (ícone padrão)
  const src = iconUrl
    ? iconUrl
    : isGetShape
      ? "/splash-getshape.png"
      : "/logos/orbi-balance-icon-hd.png";

  const alt = isGetShape ? "Get Shape Training" : "ORBI Health";

  return (
    <div className="min-h-screen w-full bg-black flex items-center justify-center">
      <img
        src={src}
        alt={alt}
        className={
          iconUrl
            ? "w-[120px] h-[120px] object-contain"
            // Reduzido de 110/140px pra bater com o tamanho da splash nativa
            // (Capacitor) — do jeito que era antes, essa tela web aparecia
            // visivelmente maior que a nativa, dando a sensação de "dois
            // ícones diferentes" quando o carregamento demorava mais.
            : "w-[76px] h-[76px] md:w-[96px] md:h-[96px] object-contain"
        }
      />
    </div>
  );
};

export default SplashScreen;
