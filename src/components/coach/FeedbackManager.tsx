import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MessageSquare, Plus } from "lucide-react";
import { format } from "date-fns";

interface FeedbackManagerProps {
  studentId: string;
}

interface Feedback {
  id: string;
  titulo: string | null;
  mensagem: string;
  created_at: string;
}

const FeedbackManager = ({ studentId }: FeedbackManagerProps) => {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    loadFeedbacks();
  }, [studentId]);

  const loadFeedbacks = async () => {
    try {
      const { data, error } = await supabase
        .from("feedbacks_alunos")
        .select("*")
        .eq("aluno_id", studentId)
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

  const handleSendFeedback = async () => {
    if (!mensagem.trim()) {
      toast({
        title: "Mensagem obrigatória",
        description: "Por favor, escreva uma mensagem para o feedback.",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão não encontrada");

      const { error } = await supabase
        .from("feedbacks_alunos")
        .insert({
          aluno_id: studentId,
          treinador_id: session.user.id,
          titulo: titulo.trim() || null,
          mensagem: mensagem.trim(),
        });

      if (error) throw error;

      toast({
        title: "Feedback enviado",
        description: "O aluno receberá seu feedback.",
      });

      setTitulo("");
      setMensagem("");
      setIsDialogOpen(false);
      loadFeedbacks();
    } catch (error: any) {
      toast({
        title: "Erro ao enviar feedback",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <p>Carregando feedbacks...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-lg">
            Feedbacks<br />para o aluno
          </h3>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button
              className="text-white font-semibold"
              style={{ background: "var(--cp-gradient)" }}>
              <Plus className="w-4 h-4 mr-2" />
              Novo feedback
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Enviar feedback para o aluno</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="titulo">Título (opcional)</Label>
                <Input
                  id="titulo"
                  placeholder="Ex: Atualização de treino 18/11"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mensagem">Mensagem do feedback</Label>
                <Textarea
                  id="mensagem"
                  placeholder="Escreva suas orientações sobre treino, dieta ou progresso do aluno..."
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  rows={8}
                  className="resize-none"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    setTitulo("");
                    setMensagem("");
                  }}
                >
                  Cancelar
                </Button>
                <Button onClick={handleSendFeedback} disabled={sending}
                  className="text-white font-semibold"
                  style={{ background: "var(--cp-gradient)" }}>
                  {sending ? "Enviando..." : "Enviar feedback"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {feedbacks.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-muted-foreground">
              Nenhum feedback enviado ainda. Clique em "Novo feedback" para começar.
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
  );
};

export default FeedbackManager;
