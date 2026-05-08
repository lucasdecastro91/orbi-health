import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TreinoConcluido {
  id: string;
  data_conclusao: string;
  comentario: string;
  treinos: {
    titulo_treino: string;
    dia_semana: string;
  };
}

const Historico = () => {
  const [treinos, setTreinos] = useState<TreinoConcluido[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    loadHistorico();
  }, []);

  const loadHistorico = async () => {
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

      if (!aluno) return;

      const { data, error } = await supabase
        .from("treinos_concluidos")
        .select(`
          id,
          data_conclusao,
          comentario,
          treinos (
            titulo_treino,
            dia_semana
          )
        `)
        .eq("aluno_id", aluno.id)
        .order("data_conclusao", { ascending: false });

      if (error) throw error;
      setTreinos(data as any || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar histórico",
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

        <div className="mb-6">
          <h1 className="text-3xl font-bold">Histórico de Treinos</h1>
          <p className="text-muted-foreground mt-2">
            Total de treinos concluídos: <strong>{treinos.length}</strong>
          </p>
        </div>

        {treinos.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <CheckCircle className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground mb-4">Nenhum treino concluído ainda</p>
              <Button onClick={() => navigate("/aluno/treino-hoje")}>
                Fazer primeiro treino
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {treinos.map((treino) => (
              <Card key={treino.id}>
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-lg">{treino.treinos.titulo_treino}</CardTitle>
                      <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                        <span>{treino.treinos.dia_semana}</span>
                        <span>•</span>
                        <span>
                          {format(new Date(treino.data_conclusao), "dd 'de' MMMM 'às' HH:mm", {
                            locale: ptBR,
                          })}
                        </span>
                      </div>
                      {treino.comentario && (
                        <p className="text-sm text-muted-foreground mt-2">{treino.comentario}</p>
                      )}
                    </div>
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

export default Historico;