import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Save, CalendarDays, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface UpdateFormManagerProps {
  studentId: string;
}

const UpdateFormManager = ({ studentId }: UpdateFormManagerProps) => {
  const [nextDate, setNextDate] = useState("");
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const { toast } = useToast();

  useEffect(() => { load(); }, [studentId]);

  const load = async () => {
    try {
      const { data, error } = await supabase
        .from("alunos")
        .select("form_atualizacao_ultima_data")
        .eq("id", studentId)
        .single();
      if (error) throw error;
      setNextDate(data?.form_atualizacao_ultima_data ?? "");
    } catch (e: any) {
      toast({ title: "Erro ao carregar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("alunos")
        .update({ form_atualizacao_ultima_data: nextDate || null })
        .eq("id", studentId);
      if (error) throw error;
      toast({ title: "Data salva com sucesso!" });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center gap-2 py-4 text-white/30">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-sm">Carregando...</span>
    </div>
  );

  const hasDate = Boolean(nextDate);
  const formatted = hasDate
    ? format(parseISO(nextDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
    : null;

  return (
    <div
      className="rounded-2xl border p-5 space-y-4"
      style={{ borderColor: "var(--section-card-border)", backgroundColor: "var(--section-card-bg)" }}
    >
      {/* Title */}
      <div className="flex items-center gap-2">
        <CalendarDays className="w-4 h-4" style={{ color: "var(--cp-400)" }} />
        <p className="text-sm font-semibold text-white/80">Próxima atualização</p>
      </div>

      {/* Date input */}
      <div className="space-y-1.5">
        <p className="text-xs text-white/40 uppercase tracking-wider">Data agendada</p>
        <input
          type="date"
          value={nextDate}
          onChange={e => setNextDate(e.target.value)}
          className="w-full h-10 rounded-xl border border-white/10 px-3 text-sm text-white outline-none focus:border-amber-500/40 transition-colors"
          style={{ backgroundColor: "var(--surface-2)", colorScheme: "auto" }}
        />
        {formatted ? (
          <p className="text-xs" style={{ color: "var(--cp-400)" }}>
            Agendado para {formatted}
          </p>
        ) : (
          <p className="text-xs text-white/30">Nenhuma data definida</p>
        )}
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, hsl(42 95% 58%), hsl(35 92% 44%))", color: "#ffffff" }}
      >
        {saving
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Save className="w-3.5 h-3.5" />
        }
        {saving ? "Salvando..." : "Salvar data"}
      </button>
    </div>
  );
};

export default UpdateFormManager;
