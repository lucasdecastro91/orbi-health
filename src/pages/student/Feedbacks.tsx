import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare } from "lucide-react";
import { useTenantContext } from "@/contexts/TenantContext";
import StudentPageHeader from "@/components/student/StudentPageHeader";
import { format } from "date-fns";

interface Feedback {
  id: string;
  titulo: string | null;
  mensagem: string;
  created_at: string;
}

const Feedbacks = () => {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { slug } = useTenantContext();

  useEffect(() => {
    loadFeedbacks();
    markFeedbacksAsRead();
  }, []);

  const loadFeedbacks = async () => {
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

      const { data, error } = await supabase
        .from("feedbacks_alunos")
        .select("*")
        .eq("aluno_id", aluno.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setFeedbacks(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar feedbacks",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const markFeedbacksAsRead = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: aluno } = await supabase
        .from("alunos")
        .select("id")
        .eq("user_id", session.user.id)
        .single();

      if (!aluno) return;

      // Marcar todos os feedbacks não vistos como vistos
      await supabase
        .from("feedbacks_alunos")
        .update({ visto_pelo_aluno: true })
        .eq("aluno_id", aluno.id)
        .eq("visto_pelo_aluno", false);
    } catch (error) {
      console.error("Erro ao marcar feedbacks como lidos:", error);
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
    <div>
      <StudentPageHeader title="Feedbacks" backTo={`/${slug}/aluno/mais`} />

      <div
        className="relative max-w-lg mx-auto px-4 pt-6 rounded-t-[28px]"
        style={{ marginTop: -24, backgroundColor: "hsl(var(--background))" }}
      >
      <p className="text-sm text-muted-foreground mb-4">Orientações e mensagens do seu treinador</p>

      {feedbacks.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <MessageSquare className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              Seu treinador ainda não enviou nenhum feedback por aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {feedbacks.map((feedback) => (
            <Card key={feedback.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">
                    {feedback.titulo || "Sem título"}
                  </CardTitle>
                  <span className="text-sm text-muted-foreground">
                    {format(new Date(feedback.created_at), "dd/MM/yyyy")}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground texto-multilinha">
                  {feedback.mensagem}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>
    </div>
  );
};

export default Feedbacks;
