import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Copy, Save } from "lucide-react";
import { format } from "date-fns";

interface UpdateFormManagerProps {
  studentId: string;
}

const UpdateFormManager = ({ studentId }: UpdateFormManagerProps) => {
  const [formUrl, setFormUrl] = useState("");
  const [lastUpdateDate, setLastUpdateDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadFormUrl();
  }, [studentId]);

  const loadFormUrl = async () => {
    try {
      const { data, error } = await supabase
        .from("alunos")
        .select("form_atualizacao_url, form_atualizacao_ultima_data")
        .eq("id", studentId)
        .single();

      if (error) throw error;
      setFormUrl(data?.form_atualizacao_url || "");
      setLastUpdateDate(data?.form_atualizacao_ultima_data || "");
    } catch (error: any) {
      toast({
        title: "Erro ao carregar formulário",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("alunos")
        .update({ 
          form_atualizacao_url: formUrl || null,
          form_atualizacao_ultima_data: lastUpdateDate || null
        })
        .eq("id", studentId);

      if (error) throw error;

      toast({
        title: "Formulário salvo",
        description: "Link do formulário atualizado com sucesso.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    if (formUrl) {
      navigator.clipboard.writeText(formUrl);
      toast({
        title: "Link copiado",
        description: "Link copiado para a área de transferência.",
      });
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="form_url">Link do Formulário (Google Forms ou Typeform)</Label>
        <div className="flex gap-2 mt-2">
          <Input
            id="form_url"
            value={formUrl}
            onChange={(e) => setFormUrl(e.target.value)}
            placeholder="Cole aqui o link do formulário de check-in do aluno"
          />
          {formUrl && (
            <Button variant="outline" size="icon" onClick={handleCopy}>
              <Copy className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="last_update_date">Data da próxima atualização</Label>
        <Input
          id="last_update_date"
          type="date"
          value={lastUpdateDate}
          onChange={(e) => setLastUpdateDate(e.target.value)}
          className="mt-2"
        />
        <p className="text-sm text-muted-foreground mt-1">
          Selecione a data em que este aluno deverá enviar a próxima atualização (check-in).
        </p>
        {lastUpdateDate ? (
          <p className="text-sm text-muted-foreground mt-2">
            Próxima atualização prevista para {format(new Date(lastUpdateDate), "dd/MM/yyyy")}.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground mt-2">
            Nenhuma data de próxima atualização definida.
          </p>
        )}
      </div>

      <Button onClick={handleSave} disabled={saving}
        className="text-white font-semibold"
        style={{ background: "var(--cp-gradient)" }}>
        <Save className="w-4 h-4 mr-2" />
        {saving ? "Salvando..." : "Salvar Formulário"}
      </Button>
      {!formUrl && (
        <p className="text-sm text-muted-foreground">
          Nenhum formulário de atualização configurado para este aluno.
        </p>
      )}
    </div>
  );
};

export default UpdateFormManager;
