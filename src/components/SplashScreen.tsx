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

  const alt = isGetShape ? "Get Shape Training" : "ORBI Pro";

  return (
    <div className="min-h-screen w-full bg-black flex items-center justify-center">
      <img
        src={src}
        alt={alt}
        className={
          iconUrl
            ? "w-[120px] h-[120px] object-contain"
            : "w-[110px] h-[110px] md:w-[140px] md:h-[140px] object-contain"
        }
      />
    </div>
  );
};

export default SplashScreen;
