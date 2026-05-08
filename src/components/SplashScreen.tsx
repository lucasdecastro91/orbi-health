interface SplashScreenProps {
  isGetShape?: boolean;
}

const SplashScreen = ({ isGetShape = false }: SplashScreenProps) => {
  return (
    <div className="min-h-screen w-full bg-black flex items-center justify-center">
      <img
        src={isGetShape ? "/splash-getshape.png" : "/logos/orbi-logo-vertical-dark.svg"}
        alt={isGetShape ? "Get Shape Training" : "ORBI Pro"}
        className="w-[110px] h-[110px] md:w-[140px] md:h-[140px] object-contain"
      />
    </div>
  );
};

export default SplashScreen;
