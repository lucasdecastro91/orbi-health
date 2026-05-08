import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { ExerciseCard } from "@/components/ExerciseCard";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface Exercise {
  id: string;
  nome_exercicio: string;
  series: string;
  repeticoes: string;
  descanso: string | null;
  video_url: string | null;
  ordem: number;
}

interface Training {
  id: string;
  titulo_treino: string;
  descricao_geral: string | null;
  ordem: number;
  exercicios: Exercise[];
}

interface Week {
  id: string;
  semana_inicio: number;
  semana_fim: number;
  zona_reps: string | null;
  observacoes: string | null;
}

const SemanaDetail = () => {
  const { id } = useParams();
  const [week, setWeek] = useState<Week | null>(null);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    loadWeekData();
  }, [id]);

  const loadWeekData = async () => {
    try {
      const { data: weekData, error: weekError } = await supabase
        .from("semanas")
        .select("*")
        .eq("id", id)
        .single();

      if (weekError) throw weekError;
      setWeek(weekData);

      const { data: trainingsData, error: trainingsError } = await supabase
        .from("treinos")
        .select(`
          id,
          titulo_treino,
          descricao_geral,
          ordem,
          exercicios (
            id,
            nome_exercicio,
            series,
            repeticoes,
            descanso,
            video_url,
            ordem
          )
        `)
        .eq("semana_id", id)
        .order("ordem", { ascending: true });

      if (trainingsError) throw trainingsError;

      const sortedTrainings = trainingsData.map((training: any) => ({
        ...training,
        exercicios: training.exercicios.sort((a: Exercise, b: Exercise) => a.ordem - b.ordem),
      }));

      setTrainings(sortedTrainings);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar dados",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Carregando...</p>
      </div>
    );
  }

  if (!week) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Semana não encontrada</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-background">
      <div className="container mx-auto p-4 md:p-8 max-w-6xl">
        <Button variant="ghost" onClick={() => navigate("/aluno/semanas")} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-2xl">
              Semanas {week.semana_inicio}–{week.semana_fim}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {week.zona_reps && (
              <p className="text-muted-foreground">
                <span className="font-semibold">Zona de repetições:</span> {week.zona_reps}
              </p>
            )}
            {week.observacoes && (
              <p className="text-muted-foreground texto-multilinha">
                <span className="font-semibold">Observações:</span> {week.observacoes}
              </p>
            )}
          </CardContent>
        </Card>

        {trainings.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <p className="text-muted-foreground">Nenhum treino cadastrado nesta semana</p>
            </CardContent>
          </Card>
        ) : (
          <Accordion type="single" collapsible className="space-y-4">
            {trainings.map((training) => (
              <AccordionItem
                key={training.id}
                value={training.id}
                className="border rounded-lg overflow-hidden"
              >
                <AccordionTrigger className="px-6 hover:no-underline hover:bg-muted/50">
                  <div className="text-left">
                    <h3 className="font-semibold text-lg">{training.titulo_treino}</h3>
                    {training.descricao_geral && (
                      <p className="text-sm text-muted-foreground texto-multilinha">{training.descricao_geral}</p>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6">
                  {training.exercicios.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">
                      Nenhum exercício cadastrado
                    </p>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-4">
                      {training.exercicios.map((exercise) => (
                        <ExerciseCard
                          key={exercise.id}
                          nome={exercise.nome_exercicio}
                          series={exercise.series}
                          repeticoes={exercise.repeticoes}
                          descanso={exercise.descanso}
                          videoUrl={exercise.video_url}
                          onClick={() => navigate(`/aluno/exercicio/${exercise.id}`)}
                        />
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </div>
  );
};

export default SemanaDetail;
