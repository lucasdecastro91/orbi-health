import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ChevronRight } from "lucide-react";

interface Semana {
  id: string;
  semana_inicio: number;
  semana_fim: number;
  zona_reps: string | null;
  observacoes: string | null;
}

const Semanas = () => {
  const [semanas, setSemanas] = useState<Semana[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    loadSemanas();
  }, []);

  const loadSemanas = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }

      const { data: aluno } = await supabase
        .from("alunos")
        .select("id")
        .eq("user_id", session.user.id)
        .single();

      if (!aluno) {
        toast({
          title: "Erro",
          description: "Dados do aluno não encontrados.",
          variant: "destructive",
        });
        return;
      }

      const { data: plano } = await supabase
        .from("planos_treino")
        .select("id")
        .eq("aluno_id", aluno.id)
        .eq("ativo", true)
        .single();

      if (!plano) {
        toast({
          title: "Nenhum plano ativo",
          description: "Aguarde seu treinador criar um plano para você.",
        });
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("semanas")
        .select("id, semana_inicio, semana_fim, zona_reps, observacoes")
        .eq("plano_id", plano.id)
        .order("semana_inicio", { ascending: true });

      if (error) throw error;
      setSemanas(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar semanas",
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-background">
      <div className="container mx-auto p-4 md:p-8 max-w-4xl">
        <Button variant="ghost" onClick={() => navigate("/aluno")} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>

        <h1 className="text-3xl font-bold mb-6">Meu Plano de Treino</h1>

        {semanas.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <p className="text-muted-foreground">Nenhuma semana cadastrada ainda</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {semanas.map((semana) => (
              <Card
                key={semana.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/aluno/semana/${semana.id}`)}
              >
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div className="space-y-2">
                      <CardTitle>Semanas {semana.semana_inicio}–{semana.semana_fim}</CardTitle>
                      {semana.zona_reps && (
                        <CardDescription>Zona: {semana.zona_reps}</CardDescription>
                      )}
                      {semana.observacoes && (
                        <CardDescription className="mt-1">{semana.observacoes}</CardDescription>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Semanas;