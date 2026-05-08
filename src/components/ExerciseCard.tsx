import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Clock } from "lucide-react";

interface ExerciseCardProps {
  nome: string;
  series: string;
  repeticoes: string;
  descanso: string | null;
  videoUrl: string | null;
  onClick: () => void;
}

const getYouTubeThumbnail = (url: string): string => {
  try {
    const urlObj = new URL(url);
    let videoId = "";

    if (urlObj.hostname.includes("youtube.com")) {
      videoId = urlObj.searchParams.get("v") || "";
    } else if (urlObj.hostname.includes("youtu.be")) {
      videoId = urlObj.pathname.slice(1);
    }

    return videoId
      ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      : "/placeholder.svg";
  } catch {
    return "/placeholder.svg";
  }
};

export const ExerciseCard = ({
  nome,
  series,
  repeticoes,
  descanso,
  videoUrl,
  onClick,
}: ExerciseCardProps) => {
  const thumbnail = videoUrl ? getYouTubeThumbnail(videoUrl) : "/placeholder.svg";

  return (
    <Card
      className="overflow-hidden hover:shadow-lg transition-all cursor-pointer group"
      onClick={onClick}
    >
      <div className="relative aspect-video bg-muted">
        <img
          src={thumbnail}
          alt={nome}
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.src = "/placeholder.svg";
          }}
        />
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
            <Play className="w-8 h-8 text-primary-foreground ml-1" />
          </div>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <h4 className="font-semibold text-lg">{nome}</h4>
        <div className="flex gap-2 flex-wrap">
          <Badge variant="outline">{series} séries</Badge>
          <Badge variant="outline">{repeticoes} reps</Badge>
          {descanso && (
            <Badge variant="outline" className="gap-1">
              <Clock className="w-3 h-3" />
              {descanso}s
            </Badge>
          )}
        </div>
      </div>
    </Card>
  );
};
