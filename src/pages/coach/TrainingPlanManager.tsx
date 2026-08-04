import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, Video, Library, ChevronUp, ChevronDown, Copy, Bookmark, Link2,
  GripVertical, GripHorizontal, Search, X, Wand2, MoreVertical,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  DndContext, DragOverlay, useDraggable, useDroppable, useSensor, useSensors,
  PointerSensor, TouchSensor, pointerWithin, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { useTenantContext } from "@/contexts/TenantContext";

interface TrainingPlanManagerProps {
  studentId: string;
}

interface Plan {
  id: string;
  nome_plano: string;
  objetivo: string | null;
  data_inicio: string;
  data_fim: string | null;
  ativo: boolean;
}

interface Week {
  id: string;
  numero_semana: number;
  semana_inicio: number;
  semana_fim: number;
  zona_reps: string | null;
  observacoes: string | null;
  data_inicio: string | null;
  data_fim: string | null;
}

interface Training {
  id: string;
  titulo_treino: string;
  dia_semana: string;
  descricao_geral: string | null;
  ordem: number;
}

// TipoSerie is open — presets below plus any custom string the trainer creates
type TipoSerie   = string;
type TipoCalculo = 'percentual' | 'reducao' | 'aumento' | 'manual';

/** Tipos padrão — sempre visíveis no seletor */
const PRESET_TIPOS_STANDARD: string[] = ['warm-up', 'feeder', 'trabalho'];

/** Normaliza variações de nome de tipo para a chave interna canônica */
const normalizeTipo = (t: string): string => {
  const map: Record<string, string> = {
    'warm up': 'warm-up', 'warm-up': 'warm-up', 'warmup': 'warm-up',
    'feeder set': 'feeder', 'feeder': 'feeder',
    'work set': 'trabalho', 'trabalho': 'trabalho', 'work': 'trabalho',
    'drop set': 'drop-set', 'drop-set': 'drop-set', 'dropset': 'drop-set',
    'cluster': 'cluster',
    'rest pause': 'rest-pause', 'rest-pause': 'rest-pause', 'restpause': 'rest-pause',
    'muscle round': 'muscle-round', 'muscle-round': 'muscle-round', 'muscleround': 'muscle-round',
  };
  return map[t.toLowerCase().trim()] ?? t;
};

/** Técnicas avançadas — ocultadas por padrão, expandidas sob demanda */
const PRESET_TIPOS_ADVANCED: string[] = [
  'drop-set', 'cluster', 'rest-pause', 'muscle-round',
];

const PRESET_TIPOS: string[] = [...PRESET_TIPOS_STANDARD, ...PRESET_TIPOS_ADVANCED];

interface SerieDetalhe {
  id: string;
  tipo: string;
  repeticoes: string;
  tipo_calculo: TipoCalculo;
  valor_calculo: string;
  quantidade: number; // quantas vezes repetir este bloco (default 1)
  descricao?: string; // descrição customizada da técnica (opcional, sobrescreve o padrão)
}

interface Exercise {
  id: string;
  nome_exercicio: string;
  series: string;
  repeticoes: string;
  descanso: string | null;
  video_url: string | null;
  observacoes: string | null;
  ordem: number;
  exercicio_base_id: string | null;
  carga_base?: string | null;
  series_detalhadas?: SerieDetalhe[] | null;
  conjugado_com_proximo?: boolean;
}

interface ExerciseBase {
  id: string;
  nome: string;
  video_url: string | null;
  descricao: string | null;
  grupo_muscular_principal: string | null;
  grupo_muscular_secundario: string | null;
}

/** Técnica de série personalizada, salva na biblioteca da org */
interface CustomTipo {
  id: string;
  name: string;
  description: string | null;
}

const GRUPOS_MUSCULARES = [
  'Peito', 'Costas', 'Ombros', 'Bíceps', 'Tríceps',
  'Abdômen', 'Glúteos', 'Quadríceps', 'Posteriores', 'Panturrilha',
] as const;

const parseRepsNum = (s: string): number => {
  if (!s) return 0;
  if (s.includes('-')) {
    const parts = s.split('-').map((n) => parseInt(n.trim())).filter((n) => !isNaN(n));
    if (parts.length === 2) return Math.round((parts[0] + parts[1]) / 2);
    return parts[0] || 0;
  }
  return parseInt(s) || 0;
};

// ── Notificação silenciosa de treino atualizado ───────────────────────────────
const notifyTreinoAtualizado = (studentUserId: string, orgId: string) => {
  void (async () => {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: existing } = await supabase.from("notificacoes")
        .select("id").eq("user_id", studentUserId)
        .eq("tipo", "treino_atualizado").gte("created_at", oneHourAgo).limit(1);
      if (!existing || existing.length === 0) {
        await supabase.from("notificacoes").insert({
          user_id: studentUserId,
          org_id: orgId,
          titulo: "Treino atualizado",
          mensagem: 'Seu plano de treino foi atualizado. Clique em "Ver treinos" e confira.',
          tipo: "treino_atualizado",
        });
      }
    } catch {}
    // Push real (chega mesmo com o app fechado) — sino acima é só o registro in-app.
    try {
      await supabase.functions.invoke("notify-trainer-action", {
        body: { type: "workout_updated", student_id: studentUserId, org_id: orgId },
      });
    } catch {}
  })();
};

const TrainingPlanManager = ({ studentId }: TrainingPlanManagerProps) => {
  const navigate = useNavigate();
  const { orgId } = useTenantContext();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [studentUserId, setStudentUserId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadPlans();
  }, [studentId]);

  const loadPlans = async () => {
    try {
      const [plansRes, alunoRes] = await Promise.all([
        supabase.from("planos_treino").select("*").eq("aluno_id", studentId).order("data_inicio", { ascending: false }),
        supabase.from("alunos").select("user_id").eq("id", studentId).maybeSingle(),
      ]);

      if (plansRes.error) throw plansRes.error;
      setPlans(plansRes.data || []);
      if (alunoRes.data?.user_id) setStudentUserId(alunoRes.data.user_id);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar planos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitPlan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      const planData = {
        nome_plano: formData.get("nome_plano") as string,
        objetivo: formData.get("objetivo") as string,
        data_inicio: formData.get("data_inicio") as string,
        data_fim: formData.get("data_fim") as string || null,
      };

      if (editingPlan) {
        const { error } = await supabase
          .from("planos_treino")
          .update(planData)
          .eq("id", editingPlan.id);

        if (error) throw error;
        toast({ title: "Plano atualizado com sucesso!" });
        // Edição de plano existente não notifica — só planos genuinamente novos.
      } else {
        const { error } = await supabase
          .from("planos_treino")
          .insert({
            ...planData,
            aluno_id: studentId,
            ativo: true,
          });

        if (error) throw error;
        toast({ title: "Plano criado com sucesso!" });
        if (studentUserId && orgId) notifyTreinoAtualizado(studentUserId, orgId);
      }

      setDialogOpen(false);
      setEditingPlan(null);
      loadPlans();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar plano",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeletePlan = async () => {
    if (!deletingPlanId) return;

    try {
      const { error } = await supabase
        .from("planos_treino")
        .delete()
        .eq("id", deletingPlanId);

      if (error) throw error;

      toast({ title: "Plano excluído com sucesso!" });
      setDeletingPlanId(null);
      loadPlans();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir plano",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const openDialog = (plan?: Plan) => {
    setEditingPlan(plan || null);
    setDialogOpen(true);
  };

  if (loading) return <p>Carregando planos...</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 w-full justify-end">
        <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => navigate("/treinador/biblioteca")}>
          <Library className="w-4 h-4 mr-2" />
          Biblioteca
        </Button>
        <Button size="sm" className="flex-1 sm:flex-none text-white font-semibold" onClick={() => openDialog()}
          style={{ background: "var(--cp-gradient)" }}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Plano
        </Button>
      </div>

      {plans.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhum plano de treino criado ainda
        </p>
      ) : (
        <Accordion type="single" collapsible className="space-y-2" defaultValue={plans[0]?.id}>
          {plans.map((plan) => (
            <AccordionItem key={plan.id} value={plan.id} className="border-0">
              <AccordionTrigger className="sr-only" />
              <AccordionContent>
                <PlanDetails
                  planId={plan.id}
                  plan={plan}
                  studentUserId={studentUserId ?? undefined}
                  onEditPlan={() => openDialog(plan)}
                  onDeletePlan={() => setDeletingPlanId(plan.id)}
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPlan ? "Editar Plano" : "Criar Novo Plano"}</DialogTitle>
            <DialogDescription>Preencha os dados do plano de treino</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitPlan} className="space-y-4">
            <div>
              <Label htmlFor="nome_plano">Nome do Plano</Label>
              <Input
                id="nome_plano"
                name="nome_plano"
                defaultValue={editingPlan?.nome_plano}
                required
              />
            </div>
            <div>
              <Label htmlFor="objetivo">Objetivo</Label>
              <Textarea
                id="objetivo"
                name="objetivo"
                defaultValue={editingPlan?.objetivo || ""}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="data_inicio">Data Início</Label>
                <Input
                  id="data_inicio"
                  name="data_inicio"
                  type="date"
                  defaultValue={editingPlan?.data_inicio}
                  required
                />
              </div>
              <div>
                <Label htmlFor="data_fim">Data Fim (opcional)</Label>
                <Input
                  id="data_fim"
                  name="data_fim"
                  type="date"
                  defaultValue={editingPlan?.data_fim || ""}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">{editingPlan ? "Atualizar" : "Criar Plano"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingPlanId} onOpenChange={() => setDeletingPlanId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os blocos, treinos e exercícios deste plano
              serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePlan}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const PlanDetails = ({ planId, plan, studentUserId, onEditPlan, onDeletePlan }: {
  planId: string; plan: Plan; studentUserId?: string; onEditPlan: () => void; onDeletePlan: () => void;
}) => {
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWeek, setEditingWeek] = useState<Week | null>(null);
  const [deletingWeekId, setDeletingWeekId] = useState<string | null>(null);
  const { toast } = useToast();
  const { orgId } = useTenantContext();

  useEffect(() => {
    loadWeeks();
  }, [planId]);

  const loadWeeks = async () => {
    try {
      const { data, error } = await supabase
        .from("semanas")
        .select("*")
        .eq("plano_id", planId)
        .order("semana_inicio");

      if (error) throw error;
      setWeeks(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar blocos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitWeek = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      const semanaInicio = parseInt(formData.get("semana_inicio") as string);
      const semanaFim = parseInt(formData.get("semana_fim") as string);

      const weekData = {
        numero_semana: semanaInicio,
        semana_inicio: semanaInicio,
        semana_fim: semanaFim,
        zona_reps: formData.get("zona_reps") as string,
        observacoes: formData.get("observacoes") as string,
        data_inicio: formData.get("data_inicio") as string || null,
        data_fim: formData.get("data_fim") as string || null,
      };

      if (editingWeek) {
        const { error } = await supabase
          .from("semanas")
          .update(weekData)
          .eq("id", editingWeek.id);

        if (error) throw error;
        toast({ title: "Bloco atualizado!" });
        // Edição de bloco existente não notifica — só blocos genuinamente novos.
      } else {
        const { error } = await supabase.from("semanas").insert({
          ...weekData,
          plano_id: planId,
        });

        if (error) throw error;
        toast({ title: "Bloco criado!" });
        if (studentUserId && orgId) notifyTreinoAtualizado(studentUserId, orgId);
      }

      setDialogOpen(false);
      setEditingWeek(null);
      loadWeeks();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar bloco",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteWeek = async () => {
    if (!deletingWeekId) return;

    try {
      const { error } = await supabase
        .from("semanas")
        .delete()
        .eq("id", deletingWeekId);

      if (error) throw error;

      toast({ title: "Bloco excluído!" });
      setDeletingWeekId(null);
      loadWeeks();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir bloco",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const openDialog = (week?: Week) => {
    setEditingWeek(week || null);
    setDialogOpen(true);
  };

  // Estados para o modal de duplicação
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [weekToDuplicate, setWeekToDuplicate] = useState<Week | null>(null);
  const [newZonaReps, setNewZonaReps] = useState("");

  const openDuplicateDialog = (week: Week) => {
    setWeekToDuplicate(week);
    setNewZonaReps(week.zona_reps || "");
    setDuplicateDialogOpen(true);
  };

  const handleDuplicateWeek = async (week: Week, customZonaReps: string) => {
    try {
      // 1. Calcular novas semanas (incrementando após o original)
      const newSemanaInicio = week.semana_fim + 1;
      const duration = week.semana_fim - week.semana_inicio;
      const newSemanaFim = newSemanaInicio + duration;

      // 2. Inserir novo bloco com a NOVA zona_reps
      const { data: newWeek, error: weekError } = await supabase
        .from("semanas")
        .insert({
          plano_id: planId,
          numero_semana: newSemanaInicio,
          semana_inicio: newSemanaInicio,
          semana_fim: newSemanaFim,
          zona_reps: customZonaReps,
          observacoes: week.observacoes,
        })
        .select()
        .single();

      if (weekError) throw weekError;

      // 3. Buscar treinos do bloco original
      const { data: trainings, error: trainingsError } = await supabase
        .from("treinos")
        .select("*")
        .eq("semana_id", week.id)
        .order("ordem");

      if (trainingsError) throw trainingsError;

      // 4. Duplicar cada treino e seus exercícios
      for (const training of trainings || []) {
        const { data: newTraining, error: newTrainingError } = await supabase
          .from("treinos")
          .insert({
            semana_id: newWeek.id,
            titulo_treino: training.titulo_treino,
            dia_semana: training.dia_semana,
            descricao_geral: training.descricao_geral,
            ordem: training.ordem,
          })
          .select()
          .single();

        if (newTrainingError) throw newTrainingError;

        // 5. Buscar exercícios do treino original
        const { data: exercises, error: exercisesError } = await supabase
          .from("exercicios")
          .select("*")
          .eq("treino_id", training.id)
          .order("ordem");

        if (exercisesError) throw exercisesError;

        // 6. Duplicar exercícios com a NOVA zona de repetições (só Work Sets)
        if (exercises && exercises.length > 0) {
          const newExercises = exercises.map((ex) => {
            const seriesDetalhadas = ex.series_detalhadas
              ? ex.series_detalhadas.map((s: any) =>
                  s.tipo === "trabalho" ? { ...s, repeticoes: customZonaReps } : s
                )
              : null;
            return {
              treino_id: newTraining.id,
              nome_exercicio: ex.nome_exercicio,
              series: ex.series,
              repeticoes: customZonaReps,
              descanso: ex.descanso,
              video_url: ex.video_url,
              observacoes: ex.observacoes,
              ordem: ex.ordem,
              exercicio_base_id: ex.exercicio_base_id,
              carga_base: ex.carga_base ?? null,
              series_detalhadas: seriesDetalhadas,
            };
          });

          const { error: insertExError } = await supabase
            .from("exercicios")
            .insert(newExercises);

          if (insertExError) throw insertExError;
        }
      }

      toast({ title: "Bloco duplicado com sucesso!" });
      setDuplicateDialogOpen(false);
      setWeekToDuplicate(null);
      loadWeeks();
    } catch (error: any) {
      toast({
        title: "Erro ao duplicar bloco",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const confirmDuplicate = () => {
    if (weekToDuplicate) {
      handleDuplicateWeek(weekToDuplicate, newZonaReps);
    }
  };

  if (loading) return <p className="text-sm">Carregando...</p>;

  return (
    <div className="space-y-4 pt-4">
      {/* Card do plano — nível 1 da escala de elevação. max-w própria porque o
          container da aba usa a largura toda (pro kanban); texto de objetivo
          esticado fica ilegível. */}
      <div
        className="rounded-2xl p-4 space-y-3 max-w-5xl"
        style={{
          backgroundColor: LVL_PLAN_BG,
          border: `1px solid ${ELEV_BORDER}`,
          boxShadow: SHADOW_HERO,
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold truncate">{plan.nome_plano}</h3>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{plan.objetivo || 'Sem objetivo definido'}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="ghost" onClick={onEditPlan} title="Editar plano">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={onDeletePlan} title="Excluir plano">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h4 className="font-semibold">Blocos de Semanas</h4>
        <Button size="sm" variant="outline" onClick={() => openDialog()}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Bloco
        </Button>
      </div>

      {weeks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum bloco criado</p>
      ) : (
        <Accordion type="single" collapsible className="space-y-2">
          {weeks.map((week) => (
            <AccordionItem
              key={week.id}
              value={week.id}
              className="rounded-lg px-4 border-0"
              style={{
                backgroundColor: LVL_BLOCK_BG,
                border: `1px solid ${ELEV_BORDER_SOFT}`,
                boxShadow: SHADOW_CARD,
              }}
            >
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="text-left">
                    <p className="font-medium">
                      Semanas {week.semana_inicio}–{week.semana_fim}
                    </p>
                    {week.zona_reps && (
                      <p className="text-sm text-muted-foreground">Zona: {week.zona_reps}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDuplicateDialog(week);
                      }}
                      title="Duplicar bloco"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDialog(week);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingWeekId(week.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <WeekDetails weekId={week.id} studentUserId={studentUserId} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingWeek ? "Editar Bloco" : "Criar Novo Bloco"}</DialogTitle>
            <DialogDescription>Configure o bloco de semanas</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitWeek} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="semana_inicio">Semana Inicial</Label>
                <Input
                  id="semana_inicio"
                  name="semana_inicio"
                  type="number"
                  defaultValue={editingWeek?.semana_inicio}
                  required
                />
              </div>
              <div>
                <Label htmlFor="semana_fim">Semana Final</Label>
                <Input
                  id="semana_fim"
                  name="semana_fim"
                  type="number"
                  defaultValue={editingWeek?.semana_fim}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="data_inicio">Data Início (opcional)</Label>
                <Input
                  id="data_inicio"
                  name="data_inicio"
                  type="date"
                  defaultValue={editingWeek?.data_inicio || ""}
                />
              </div>
              <div>
                <Label htmlFor="data_fim">Data Fim (opcional)</Label>
                <Input
                  id="data_fim"
                  name="data_fim"
                  type="date"
                  defaultValue={editingWeek?.data_fim || ""}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="zona_reps">Zona de Repetições</Label>
              <Input
                id="zona_reps"
                name="zona_reps"
                placeholder="Ex: 12-15 repetições"
                defaultValue={editingWeek?.zona_reps || ""}
              />
            </div>
            <div>
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                name="observacoes"
                defaultValue={editingWeek?.observacoes || ""}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">{editingWeek ? "Atualizar" : "Criar Bloco"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingWeekId} onOpenChange={() => setDeletingWeekId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os treinos e exercícios deste bloco serão
              excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteWeek}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de Duplicação */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicar Bloco</DialogTitle>
            <DialogDescription>
              {weekToDuplicate && (
                <>
                  Duplicando Semanas {weekToDuplicate.semana_inicio}–{weekToDuplicate.semana_fim}.
                  <br />
                  O novo bloco será: Semanas {weekToDuplicate.semana_fim + 1}–
                  {weekToDuplicate.semana_fim + 1 + (weekToDuplicate.semana_fim - weekToDuplicate.semana_inicio)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newZonaReps">Nova Zona de Repetições</Label>
              <Input
                id="newZonaReps"
                placeholder="Ex: 9-12, 6-10, 15-20"
                value={newZonaReps}
                onChange={(e) => setNewZonaReps(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Zona atual: {weekToDuplicate?.zona_reps || "não definida"}
              </p>
            </div>
          </div>
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmDuplicate}>
              Confirmar Duplicação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const WeekDetails = ({ weekId, studentUserId }: { weekId: string; studentUserId?: string }) => {
  const [trainings, setTrainings] = useState<Training[]>([]);
  // Exercícios de TODAS as sessões do bloco, indexados por treino_id. Vêm na
  // mesma query aninhada de `treinos` — antes cada coluna buscava os seus, o que
  // gerava 1 requisição por coluna simultaneamente e estourava o
  // statement_timeout de 8s do role `authenticated`. Ver seção 15 do CLAUDE.md.
  const [exercisesByTraining, setExercisesByTraining] = useState<Record<string, Exercise[]>>({});
  // Biblioteca e técnicas da org: dependem só de orgId, então são buscadas uma
  // vez aqui e repassadas — antes eram refeitas identicamente em cada coluna.
  const [exercisesBase, setExercisesBase] = useState<ExerciseBase[]>([]);
  const [customTipos, setCustomTipos] = useState<{ id: string; name: string; description: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTraining, setEditingTraining] = useState<Training | null>(null);
  const [deletingTrainingId, setDeletingTrainingId] = useState<string | null>(null);
  // Incrementado a cada recarga: entra na `key` das colunas pra que elas
  // remontem com os exercícios novos vindos por prop (substitui o antigo
  // refreshTokens por treino, que forçava refetch individual).
  const [dataVersion, setDataVersion] = useState(0);
  /** O que está sendo arrastado agora — alimenta o DragOverlay */
  const [dragging, setDragging] = useState<
    { type: "exercise"; exercise: Exercise } | { type: "column"; training: Training } | null
  >(null);
  const { toast } = useToast();
  const { orgId } = useTenantContext();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { type?: string; trainingId: string } | undefined;
    if (!data) return;
    if (data.type === "column") {
      const training = trainings.find((t) => t.id === data.trainingId);
      if (training) setDragging({ type: "column", training });
      return;
    }
    const id = String(event.active.id);
    const exercise = (exercisesByTraining[data.trainingId] ?? []).find((e) => e.id === id);
    if (exercise) setDragging({ type: "exercise", exercise });
  };

  /** Reordena as sessões (colunas). Otimista na UI, grava em série. */
  const reorderTrainings = async (fromTrainingId: string, toTrainingId: string) => {
    const fromIdx = trainings.findIndex((t) => t.id === fromTrainingId);
    const toIdx = trainings.findIndex((t) => t.id === toTrainingId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

    const anterior = trainings;
    const next = [...trainings];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);

    setTrainings(next);
    try {
      // Em série e só o que mudou — mesmo motivo do handleDragEnd: updates
      // paralelos na mesma tabela disputam lock e já causaram timeout aqui.
      for (let i = 0; i < next.length; i++) {
        if (anterior[i]?.id === next[i].id && next[i].ordem === i) continue;
        const { error } = await supabase.from("treinos").update({ ordem: i }).eq("id", next[i].id);
        if (error) throw error;
      }
    } catch (error: any) {
      toast({ title: "Erro ao reordenar sessões", description: error.message, variant: "destructive" });
      loadTrainings(); // reverte pro que está no banco
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setDragging(null); // antes dos returns: o overlay precisa sumir em qualquer saída
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current as { type?: string; trainingId: string } | undefined;
    const overData = over.data.current as { type?: string; trainingId: string; exerciseId?: string } | undefined;
    if (!activeData || !overData) return;

    // Arrastando uma coluna inteira → reordena sessões. Soltar em qualquer ponto
    // da coluna destino (header ou lista de exercícios) conta como destino.
    if (activeData.type === "column") {
      if (activeData.trainingId !== overData.trainingId) {
        await reorderTrainings(activeData.trainingId, overData.trainingId);
      }
      return;
    }

    const exerciseId = String(active.id);
    const sourceTrainingId = activeData.trainingId;
    const destTrainingId = overData.trainingId;
    if (sourceTrainingId === destTrainingId && overData.exerciseId === exerciseId) return;

    // ── 1. Reordena em memória e mostra na hora (otimista) ──────────────────
    // A ordem de destino sai do estado local, que já tem todos os exercícios do
    // bloco pela query aninhada — não precisa de um SELECT antes de gravar.
    const source = [...(exercisesByTraining[sourceTrainingId] ?? [])];
    const dest = sourceTrainingId === destTrainingId
      ? source
      : [...(exercisesByTraining[destTrainingId] ?? [])];

    const movedIdx = source.findIndex((e) => e.id === exerciseId);
    if (movedIdx === -1) return;
    const [moved] = source.splice(movedIdx, 1);

    const overIdx = overData.exerciseId ? dest.findIndex((e) => e.id === overData.exerciseId) : -1;
    dest.splice(overIdx === -1 ? dest.length : overIdx, 0, moved);

    const next: Record<string, Exercise[]> = {
      ...exercisesByTraining,
      [destTrainingId]: dest.map((e, i) => ({ ...e, ordem: i })),
    };
    if (sourceTrainingId !== destTrainingId) {
      next[sourceTrainingId] = source.map((e, i) => ({ ...e, ordem: i }));
    }
    setExercisesByTraining(next);
    setDataVersion((v) => v + 1);

    // ── 2. Persiste numa única chamada ───────────────────────────────────────
    // `reordenar_exercicios` faz UM update em massa, atômico (migration
    // 20260730000001). Qualquer UPDATE nesta tabela custa ~160ms, então os N
    // updates individuais que existiam aqui somavam 1s+ e, pior, gravavam
    // PARCIALMENTE quando um deles estourava o statement_timeout — a coluna
    // ficava meio reordenada. Medido: 8 linhas em 26ms por esta via.
    try {
      const rows = next[destTrainingId].map((e, i) => ({
        id: e.id, treino_id: destTrainingId, ordem: i,
      }));
      if (sourceTrainingId !== destTrainingId) {
        next[sourceTrainingId].forEach((e, i) =>
          rows.push({ id: e.id, treino_id: sourceTrainingId, ordem: i })
        );
      }

      const { error } = await supabase.rpc("reordenar_exercicios", { p_rows: rows });
      if (error) throw error;
    } catch (error: any) {
      toast({ title: "Erro ao mover exercício", description: error.message, variant: "destructive" });
      await loadTrainings(); // volta pro que está gravado
    }
  };

  useEffect(() => {
    loadTrainings();
  }, [weekId]);

  // Biblioteca da org — buscada uma vez por bloco, não por coluna
  useEffect(() => {
    if (!orgId) return;
    void (async () => {
      const [baseRes, tiposRes] = await Promise.all([
        supabase.from("exercicios_base").select("*").eq("org_id", orgId).order("nome"),
        supabase.from("custom_techniques").select("id, name, description").eq("org_id", orgId).order("name"),
      ]);
      if (baseRes.error) console.error("Erro ao carregar biblioteca:", baseRes.error);
      else setExercisesBase(baseRes.data || []);
      if (tiposRes.error) console.error("Erro ao carregar técnicas:", tiposRes.error);
      else setCustomTipos(tiposRes.data || []);
    })();
  }, [orgId]);

  /** Uma query aninhada traz as sessões do bloco E todos os seus exercícios.
   *  Substitui o padrão anterior de 1 requisição por coluna.
   *
   *  Tem uma retentativa: o `statement_timeout` que aparecia aqui é transitório
   *  (contenção momentânea da instância, não custo da query — ela mede 122ms
   *  para um plano inteiro), então repetir uma vez resolve em vez de deixar a
   *  coluna quebrada na tela. */
  const loadTrainings = async (tentativa = 1) => {
    try {
      const { data, error } = await supabase
        .from("treinos")
        .select("*, exercicios(*)")
        .eq("semana_id", weekId)
        .order("ordem");

      if (error) throw error;

      const rows = (data ?? []) as any[];
      const byTraining: Record<string, Exercise[]> = {};
      const plainTrainings: Training[] = rows.map((row) => {
        const { exercicios, ...training } = row;
        // Ordenado no cliente de propósito: ordenar tabela aninhada pelo
        // PostgREST depende da sintaxe de referencedTable e falha em silêncio se
        // estiver errada. A lista é pequena, o custo é irrelevante.
        byTraining[row.id] = ((exercicios ?? []) as Exercise[])
          .slice()
          .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
        return training as Training;
      });

      setTrainings(plainTrainings);
      setExercisesByTraining(byTraining);
      setDataVersion((v) => v + 1);
      setLoading(false);
    } catch (error: any) {
      if (tentativa === 1) {
        await new Promise((r) => setTimeout(r, 700));
        return loadTrainings(2);
      }
      setLoading(false);
      toast({
        title: "Erro ao carregar treinos",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSubmitTraining = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      const trainingData = {
        titulo_treino: formData.get("titulo_treino") as string,
        dia_semana: formData.get("dia_semana") as string,
        descricao_geral: formData.get("descricao_geral") as string,
      };

      if (editingTraining) {
        const { error } = await supabase
          .from("treinos")
          .update(trainingData)
          .eq("id", editingTraining.id);

        if (error) throw error;
        toast({ title: "Treino atualizado!" });
      } else {
        const { error } = await supabase.from("treinos").insert({
          ...trainingData,
          semana_id: weekId,
          ordem: trainings.length,
        });

        if (error) throw error;
        toast({ title: "Treino adicionado!" });
      }
      // Sessões (treinos) dentro de um bloco não notificam — só bloco/plano novos.

      setDialogOpen(false);
      setEditingTraining(null);
      loadTrainings();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar treino",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteTraining = async () => {
    if (!deletingTrainingId) return;

    try {
      const { error } = await supabase
        .from("treinos")
        .delete()
        .eq("id", deletingTrainingId);

      if (error) throw error;

      toast({ title: "Treino excluído!" });
      setDeletingTrainingId(null);
      loadTrainings();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir treino",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const openDialog = (training?: Training) => {
    setEditingTraining(training || null);
    setDialogOpen(true);
  };

  // handleMoveTraining (setas ↑/↓) foi substituído por arrastar a coluna na
  // horizontal — ver reorderTrainings + TrainingColumn.

  const handleDuplicateTraining = async (training: Training) => {
    try {
      // 1. Calcular nova ordem (próximo valor após o maior)
      const maxOrdem = Math.max(...trainings.map(t => t.ordem ?? 0), 0);
      const newOrdem = maxOrdem + 1;

      // 2. Inserir novo treino
      const { data: newTraining, error: trainingError } = await supabase
        .from("treinos")
        .insert({
          semana_id: weekId,
          titulo_treino: `${training.titulo_treino} (Cópia)`,
          dia_semana: training.dia_semana,
          descricao_geral: training.descricao_geral,
          ordem: newOrdem,
        })
        .select()
        .single();

      if (trainingError) throw trainingError;

      // 3. Buscar exercícios do treino original
      const { data: exercises, error: exercisesError } = await supabase
        .from("exercicios")
        .select("*")
        .eq("treino_id", training.id)
        .order("ordem");

      if (exercisesError) throw exercisesError;

      // 4. Duplicar exercícios (se houver)
      if (exercises && exercises.length > 0) {
        const newExercises = exercises.map((ex) => ({
          treino_id: newTraining.id,
          nome_exercicio: ex.nome_exercicio,
          series: ex.series,
          repeticoes: ex.repeticoes,
          descanso: ex.descanso,
          video_url: ex.video_url,
          observacoes: ex.observacoes,
          ordem: ex.ordem,
          exercicio_base_id: ex.exercicio_base_id,
        }));

        const { error: insertExError } = await supabase
          .from("exercicios")
          .insert(newExercises);

        if (insertExError) throw insertExError;
      }

      toast({ title: "Treino duplicado com sucesso!" });
      loadTrainings();
    } catch (error: any) {
      toast({
        title: "Erro ao duplicar treino",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) return <p className="text-sm">Carregando...</p>;

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-between items-center">
        <h5 className="font-semibold text-sm">Treinos</h5>
        {trainings.length > 0 && (
          <p className="text-xs text-muted-foreground">Arraste os exercícios pra reordenar ou mover entre treinos</p>
        )}
      </div>

      {trainings.length === 0 ? (
        <div className="border border-dashed rounded-lg p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">Nenhum treino adicionado</p>
          <Button size="sm" variant="outline" onClick={() => openDialog()}>
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Treino
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDragging(null)}
        >
          <div className="flex gap-2.5 overflow-x-auto pb-2">
            {trainings.map((training) => (
              <TrainingColumn
                key={training.id}
                training={training}
                onDuplicate={() => handleDuplicateTraining(training)}
                onEdit={() => openDialog(training)}
                onDelete={() => setDeletingTrainingId(training.id)}
              >
                <TrainingExercises
                  key={`${training.id}:${dataVersion}`}
                  trainingId={training.id}
                  studentUserId={studentUserId}
                  initialExercises={exercisesByTraining[training.id] ?? []}
                  exercisesBase={exercisesBase}
                  customTipos={customTipos}
                  onCustomTiposChange={setCustomTipos}
                  onExercisesChanged={loadTrainings}
                />
              </TrainingColumn>
            ))}
            <button
              onClick={() => openDialog()}
              style={{
                width: '150px',
                minWidth: '150px',
                minHeight: '88px',
              }}
              className="shrink-0 border border-dashed rounded-lg flex flex-col items-center justify-center gap-1 text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Criar treino
            </button>
          </div>

          {/* O card que acompanha o cursor. Vive num portal, fora do container
              com overflow-x-auto — por isso não é cortado ao atravessar de uma
              coluna pra outra, que era o que travava o arraste. */}
          <DragOverlay dropAnimation={null}>
            {dragging?.type === "exercise" ? (
              <div
                className="rounded-lg p-2 text-card-foreground pointer-events-none"
                style={{
                  width: `${COLUMN_WIDTH - 20}px`,
                  backgroundColor: EXERCISE_CARD_BG,
                  border: "1px solid var(--cp-500)",
                  boxShadow: "0 0 0 1px rgba(var(--cp-rgb), 0.5), 0 14px 34px rgba(0,0,0,0.6)",
                  cursor: "grabbing",
                }}
              >
                <p className="font-medium text-[13px] leading-tight truncate">
                  {dragging.exercise.nome_exercicio}
                </p>
              </div>
            ) : dragging?.type === "column" ? (
              <div
                className="rounded-lg p-2.5 pointer-events-none"
                style={{
                  width: `${COLUMN_WIDTH}px`,
                  backgroundColor: EXERCISE_CARD_BG,
                  border: "1px solid var(--cp-500)",
                  boxShadow: "0 0 0 1px rgba(var(--cp-rgb), 0.5), 0 14px 34px rgba(0,0,0,0.6)",
                  cursor: "grabbing",
                }}
              >
                <p className="font-medium text-[13px] leading-tight truncate">
                  {dragging.training.titulo_treino}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {dragging.training.dia_semana}
                </p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTraining ? "Editar Treino" : "Adicionar Treino"}</DialogTitle>
            <DialogDescription>Configure o treino</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitTraining} className="space-y-4">
            <div>
              <Label htmlFor="titulo_treino">Título do Treino</Label>
              <Input
                id="titulo_treino"
                name="titulo_treino"
                placeholder="Ex: Treino A - Membros Inferiores"
                defaultValue={editingTraining?.titulo_treino}
                required
              />
            </div>
            <div>
              <Label htmlFor="dia_semana">Dia da Semana</Label>
              <Input
                id="dia_semana"
                name="dia_semana"
                placeholder="Ex: Segunda-feira"
                defaultValue={editingTraining?.dia_semana}
                required
              />
            </div>
            <div>
              <Label htmlFor="descricao_geral">Descrição</Label>
              <Textarea
                id="descricao_geral"
                name="descricao_geral"
                defaultValue={editingTraining?.descricao_geral || ""}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">{editingTraining ? "Atualizar" : "Adicionar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingTrainingId} onOpenChange={() => setDeletingTrainingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os exercícios deste treino serão excluídos
              permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTraining}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};


// ── Escala de elevação ───────────────────────────────────────────────────────
// A aba tem 4 níveis de aninhamento (plano → bloco → sessão → exercício) e antes
// eles não seguiam nenhuma ordem: o plano era o mais apagado (`bg-white/3`)
// mesmo sendo o container mais externo, e sessão e exercício usavam exatamente o
// mesmo tom — um dentro do outro, indistinguíveis.
//
// Aqui a regra é: quanto mais interno, mais claro e mais "próximo". Os valores
// #141417 / #1b1c21 e as sombras vêm do Dashboard (`CARD_BG`/`CARD_BG_2`/
// `CARD_SHADOW`/`HERO_SHADOW`, Dashboard.tsx:63-67) — é o sistema visual que já
// existe no projeto, não um padrão novo.
const ELEV_BORDER      = "rgba(255,255,255,0.09)";
const ELEV_BORDER_SOFT = "rgba(255,255,255,0.06)";

const SHADOW_HERO = "0 18px 44px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.3)";
const SHADOW_CARD = "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)";
const SHADOW_ITEM = "0 4px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)";

/** Nível 1 — plano/macrociclo. O mais externo e o mais escuro: funciona como o
 *  "chão" da tela, e a sombra ampla é o que o separa do fundo da página. */
const LVL_PLAN_BG = "#0f0f12";
/** Nível 2 — bloco de semanas */
const LVL_BLOCK_BG = "#121216";
/** Nível 3 — coluna de sessão */
const LVL_SESSION_BG = "#141417";
/** Nível 4 — exercício e bloco de série: o mais interno, logo o mais claro */
const LVL_ITEM_BG = "#1b1c21";

// Aliases mantidos pra não trocar nome em todo uso já existente da coluna/linha
const EXERCISE_CARD_BG = LVL_ITEM_BG;
const EXERCISE_CARD_BORDER = ELEV_BORDER;
const EXERCISE_CARD_SHADOW = SHADOW_ITEM;

/** Campo (input/select/textarea/botão) dentro do dialog de exercício.
 *
 *  O padrão do shadcn é `bg-background` (`0 0% 4%`), mais ESCURO que o `bg-card`
 *  (`0 0% 8%`) que o contém — cada campo virava um poço preto dentro do card.
 *
 *  A correção NÃO é clarear o fundo: é usar a MESMA cor da superfície e criar o
 *  relevo com sombra, que é como os cards de exercício se destacam da coluna no
 *  kanban. Três camadas: luz na borda de cima (`inset` claro), sombra projetada
 *  embaixo e uma sombra interna na base. Tokens e valores relativos, nunca hex,
 *  pra acompanhar o light mode. */
const FIELD_CLS =
  "bg-card border-white/[0.08] shadow-[0_2px_6px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.2)] focus-visible:border-white/20";

// Largura da coluna de sessão. Ajustada pra caber ~5 sessões numa tela wide sem
// scroll — foi o que o treinador considerou funcional (equivalente ao zoom 67%
// da versão anterior de 380px). Reduzir daqui pra baixo começa a truncar nome
// de exercício longo cedo demais.
const COLUMN_WIDTH = 272;

// ── Coluna de sessão — arrastável na horizontal pra reordenar as sessões.
// Definida no nível do módulo (não inline) pra não remontar a cada render do
// pai, o que derrubaria o drag em andamento e o foco de inputs internos. ──
const TrainingColumn = ({
  training, onDuplicate, onEdit, onDelete, children,
}: {
  training: Training;
  onDuplicate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}) => {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `column:${training.id}`,
    data: { type: "column", trainingId: training.id },
  });
  // IMPORTANTE: o droppable cobre só o HEADER, nunca a coluna inteira. Um
  // droppable do tamanho da coluna competiria com os `row:<id>` de cada
  // exercício sob `pointerWithin` — o dnd-kit escolheria a coluna, e soltar um
  // exercício "acima do outro" acabaria jogando ele no fim da lista.
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `colhead:${training.id}`,
    data: { type: "column", trainingId: training.id },
  });

  return (
    <div
      ref={setDragRef}
      className="shrink-0 rounded-lg p-2.5"
      style={{
        width: `${COLUMN_WIDTH}px`,
        minWidth: `${COLUMN_WIDTH}px`,
        borderWidth: "1px",
        borderStyle: "solid",
        // Nível 3: mais escuro que os exercícios que ela contém
        backgroundColor: LVL_SESSION_BG,
        borderColor: isOver ? "var(--cp-500)" : ELEV_BORDER,
        boxShadow: SHADOW_CARD,
        // Sem transform aqui: quem segue o cursor é o DragOverlay, imune ao
        // clipping do container com overflow-x-auto.
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <div ref={setDropRef} className="flex items-start justify-between gap-1 mb-2">
        <button
          {...attributes} {...listeners}
          title="Arrastar pra reordenar as sessões"
          className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing touch-none text-muted-foreground/40 hover:text-muted-foreground"
        >
          <GripHorizontal className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[13px] leading-tight truncate">{training.titulo_treino}</p>
          <p className="text-[11px] text-muted-foreground truncate">{training.dia_semana}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" title="Ações da sessão">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-4 w-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {children}
    </div>
  );
};

// ── Draggable exercise row — drag handle only starts the drag, so tapping the
// action buttons doesn't fight the pointer sensor. The row is also a drop
// target (`row:<id>`) so WeekDetails.handleDragEnd can insert before it. ──
const ExerciseRow = ({
  exercise, trainingId, isLast, isUnconfigured, isSelected, onToggleConjugado, onEdit, onDelete, onToggleSelect,
}: {
  exercise: Exercise;
  trainingId: string;
  isLast: boolean;
  isUnconfigured: boolean;
  isSelected: boolean;
  onToggleConjugado: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleSelect: () => void;
}) => {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: exercise.id,
    data: { type: "exercise", trainingId },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `row:${exercise.id}`,
    data: { type: "exercise", trainingId, exerciseId: exercise.id },
  });
  const setRefs = (node: HTMLElement | null) => { setDragRef(node); setDropRef(node); };
  // Nada de `transform` aqui: o card que segue o cursor é o DragOverlay, que
  // renderiza fora do container com `overflow-x-auto`. Aplicar transform no
  // próprio nó fazia o card ser cortado ao sair da coluna — era isso que dava a
  // sensação de arraste travado. Aqui só marcamos o lugar de origem.
  const style: React.CSSProperties = isDragging ? { opacity: 0.35 } : {};

  const sd = exercise.series_detalhadas as SerieDetalhe[] | null | undefined;
  const hasSd = sd && sd.length > 0;
  const count = hasSd
    ? sd.reduce((sum, s) => sum + (s.quantidade ?? 1), 0)
    : parseInt(exercise.series) || 0;
  // 'Work'/'Feed' em vez de 'Work Set'/'Feeder': aparecem em quase todo exercício,
  // e a forma curta é o que permite o resumo caber numa linha na coluna de 272px.
  // Técnicas avançadas ficam com o nome inteiro — são raras, e o nowrap por grupo
  // garante que a quebra caia entre grupos, nunca separando o "3×" do rótulo.
  const tipoLabels: Record<string, string> = {
    'warm-up': 'W-up', 'feeder': 'Feed', 'trabalho': 'Work',
    'drop-set': 'Drop', 'cluster': 'Cluster',
    'rest-pause': 'Rest Pause', 'muscle-round': 'Muscle Rnd',
  };
  // normalizeTipo agrupa variações legadas ('Work Set', 'work') na chave canônica
  const tipoCounts = hasSd
    ? sd.reduce<Record<string, number>>((acc, s) => {
        const t = normalizeTipo(s.tipo);
        acc[t] = (acc[t] || 0) + (s.quantidade ?? 1); return acc;
      }, {})
    : null;
  const tipoParts = tipoCounts
    ? Object.entries(tipoCounts).map(([t, n]) => `${n}× ${tipoLabels[t] ?? t}`)
    : [];

  /** Reps exibidas no card: as dos work sets, que são a série que define o
   *  estímulo (warm-up/feeder têm reps próprias, mas secundárias). Se o
   *  exercício não tiver nenhum work set — só técnica avançada, por exemplo —
   *  cai pra todos os blocos em vez de não mostrar nada. */
  const repsResumo = (() => {
    if (!hasSd) return exercise.repeticoes?.trim() || null;
    const distintos = (arr: SerieDetalhe[]) =>
      Array.from(new Set(arr.map((s) => (s.repeticoes ?? '').trim()).filter(Boolean)));
    let vals = distintos(sd.filter((s) => normalizeTipo(s.tipo) === 'trabalho'));
    if (vals.length === 0) vals = distintos(sd);
    if (vals.length === 0) return null;
    if (vals.length === 1) return vals[0];
    // Blocos de trabalho com zonas diferentes → mostra a faixa que engloba todas
    const nums = vals.flatMap((v) => (v.match(/\d+/g) ?? []).map(Number));
    if (nums.length === 0) return vals[0];
    const min = Math.min(...nums), max = Math.max(...nums);
    return min === max ? String(min) : `${min}-${max}`;
  })();

  return (
    <div
      ref={setRefs}
      style={{
        ...style,
        backgroundColor: EXERCISE_CARD_BG,
        // --cp-500 é a cor primária da org (var real; --cp-color não existe)
        borderColor: isSelected ? 'var(--cp-500)' : EXERCISE_CARD_BORDER,
        borderWidth: isSelected ? '2px' : '1px',
        borderStyle: 'solid',
        boxShadow: isSelected
          ? '0 0 0 1px rgba(var(--cp-rgb), 0.5), 0 0 14px rgba(var(--cp-rgb), 0.35), 0 10px 28px rgba(0,0,0,0.45)'
          : EXERCISE_CARD_SHADOW,
        // Barra na cor primária no topo do card sob o cursor: mostra que o item
        // arrastado vai ser inserido ANTES dele. Sem isso não havia nenhuma
        // pista visual de onde o exercício ia cair.
        borderTop: isOver ? '3px solid var(--cp-500)' : undefined,
      }}
      className={`rounded-lg text-card-foreground transition-all`}
      data-over={isOver || undefined}
    >
      <div className="p-2">
        <div className="flex items-start gap-1.5">
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggleSelect}
            className="mt-0.5 shrink-0 h-4 w-4"
            aria-label="Selecionar exercício"
          />
          <button
            {...attributes} {...listeners}
            title="Arrastar"
            className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing touch-none text-muted-foreground/40 hover:text-muted-foreground"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <div className="space-y-0.5 flex-1 min-w-0">
            <p className="font-medium text-[13px] leading-tight truncate">{exercise.nome_exercicio}</p>
            {isUnconfigured ? (
              <span className="text-[11px] font-medium text-amber-600">Configurar séries</span>
            ) : (
              <>
                {/* Linha 1 — o essencial: total de séries + reps do work set */}
                <div className="flex flex-wrap items-center gap-x-1 text-[11px] text-muted-foreground">
                  <span className="font-semibold whitespace-nowrap">
                    {count} {count === 1 ? 'série' : 'séries'}
                  </span>
                  {repsResumo && <span className="whitespace-nowrap">· {repsResumo} reps</span>}
                  {exercise.carga_base && (
                    <span className="opacity-70 whitespace-nowrap">· base {exercise.carga_base}</span>
                  )}
                </div>
                {/* Linha 2 — composição por tipo de série, hierarquia mais baixa.
                    Cada grupo é um span nowrap: a quebra só pode cair entre
                    grupos, nunca separando o "3×" do seu rótulo. */}
                {tipoParts.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-1 text-[10px] text-muted-foreground opacity-60">
                    {tipoParts.map((p, i) => (
                      <span key={p} className="whitespace-nowrap">
                        {i > 0 && <span className="mr-1 opacity-50">·</span>}
                        {p}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
            {exercise.video_url && (
              <div className="flex items-center gap-1 text-[11px] text-primary opacity-80">
                <Video className="h-2.5 w-2.5" />
                <span>Vídeo</span>
              </div>
            )}
            {exercise.conjugado_com_proximo && (
              <div className="flex items-center gap-1 text-[11px] text-primary opacity-80">
                <Link2 className="h-2.5 w-2.5" />
                <span>Conjugado com o próximo</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              size="icon" variant={exercise.conjugado_com_proximo ? "default" : "ghost"} className="h-6 w-6"
              onClick={onToggleConjugado} disabled={isLast}
              title="Vincular com o próximo exercício (bi-set/tri-set, sem descanso entre eles)"
            >
              <Link2 className="h-3 w-3" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-6 w-6" title="Ações">
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
};

const TrainingExercises = ({
  trainingId, studentUserId, initialExercises, exercisesBase, customTipos, onCustomTiposChange, onExercisesChanged,
}: {
  trainingId: string;
  studentUserId?: string;
  /** Exercícios já vindos da query aninhada do bloco — o componente não busca
   *  os seus no mount, só recarrega depois de uma mutação própria. */
  initialExercises: Exercise[];
  exercisesBase: ExerciseBase[];
  customTipos: CustomTipo[];
  onCustomTiposChange: React.Dispatch<React.SetStateAction<CustomTipo[]>>;
  /** Avisa o bloco que a LISTA de exercícios mudou, pra ele recarregar (1 query
   *  aninhada). Obrigatório: o `handleDragStart`/`handleDragEnd` vivem no pai e
   *  leem `exercisesByTraining` — se o pai não recarregar, um exercício criado
   *  depois da carga inicial não existe pra ele e o arraste simplesmente não sai
   *  do lugar. */
  onExercisesChanged: () => void | Promise<void>;
}) => {
  const [exercises, setExercises] = useState<Exercise[]>(initialExercises);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [deletingExerciseId, setDeletingExerciseId] = useState<string | null>(null);
  const [saveToLibrary, setSaveToLibrary] = useState(false);
  const [detailedSeries, setDetailedSeries] = useState<SerieDetalhe[]>([]);
  const [cargaBase, setCargaBase] = useState('');
  const [descansoEx, setDescansoEx] = useState('');
  // IDs de blocos de série que expandiram as Técnicas Avançadas no seletor
  const [showAdvancedFor, setShowAdvancedFor] = useState<Set<string>>(new Set());
  const [showDescFor, setShowDescFor] = useState<Set<string>>(new Set());
  // ── Seleção múltipla de exercícios ─────────────────────────────────
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<Set<string>>(new Set());
  // ── Adicionar exercícios (seleção múltipla da biblioteca) ──────────
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSearch, setBulkSearch] = useState('');
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  // Exercícios adicionados em lote ainda sem séries/reps/descanso configurados
  /** "Ainda não configurado" é **derivado**, não guardado em estado: exercício
   *  inserido em lote entra com `series: ""`, e qualquer um salvo pelo editor sai
   *  com `series` = soma das quantidades. Derivar faz a marcação sobreviver ao
   *  remount do bloco e a um F5 — como estado local ela se perdia nos dois casos. */
  const isUnconfigured = (e: Exercise) =>
    !e.series?.trim() || parseInt(e.series) === 0;
  const [defaultSeries, setDefaultSeries] = useState('3');
  const [defaultReps, setDefaultReps] = useState('12');
  const [defaultDescanso, setDefaultDescanso] = useState('60');
  const { toast } = useToast();
  const { orgId, org } = useTenantContext();

  // Torna a coluna inteira um alvo de drop (pra soltar num espaço vazio /
  // abaixo de todos os itens conta como "vai pro fim da lista").
  const { setNodeRef: setColumnDropRef, isOver: isColumnOver } = useDroppable({
    id: `col:${trainingId}`,
    data: { trainingId },
  });

  // ── Custom tipo helpers ────────────────────────────────────────────
  /** True when tipo is neither a preset nor a saved custom — shows free-text input */
  const isCustomTipo = (tipo: string) =>
    !PRESET_TIPOS.includes(tipo) && !customTipos.some(t => t.name === tipo);

  // A biblioteca de técnicas é carregada uma vez pelo WeekDetails e chega por
  // prop — este componente só a atualiza (salvar/editar), nunca a busca.
  const saveCustomTipo = async (nome: string, descricao?: string) => {
    if (!orgId || !nome.trim()) return;
    try {
      const { data, error } = await supabase
        .from("custom_techniques")
        .insert({ org_id: orgId, name: nome.trim(), description: descricao?.trim() || null })
        .select("id, name, description")
        .single();
      if (error) throw error;
      onCustomTiposChange(prev =>
        [...prev, data as CustomTipo].sort((a, b) => a.name.localeCompare(b.name))
      );
      toast({ title: "Técnica salva!", description: `"${nome.trim()}" adicionada à biblioteca` });
    } catch (err: any) {
      if (err.code === "23505") {
        toast({ title: "Técnica já existe", description: "Este nome já está na sua biblioteca" });
      } else {
        toast({ title: "Erro ao salvar técnica", description: err.message, variant: "destructive" });
      }
    }
  };

  const updateCustomTipoDesc = async (nome: string, descricao: string) => {
    const found = customTipos.find(t => t.name === nome);
    if (!found || !orgId) return;
    try {
      const { error } = await supabase
        .from("custom_techniques")
        .update({ description: descricao.trim() || null })
        .eq("id", found.id);
      if (error) throw error;
      onCustomTiposChange(prev =>
        prev.map(t => t.id === found.id ? { ...t, description: descricao.trim() || null } : t)
      );
      toast({ title: "Descrição atualizada globalmente!" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  // ── Defaults per tipo ──────────────────────────────────────────────
  const DEFAULT_CALCULO: Record<string, { tipo_calculo: TipoCalculo; valor_calculo: string }> = {
    'warm-up':      { tipo_calculo: 'percentual', valor_calculo: '50'  },
    'feeder':       { tipo_calculo: 'percentual', valor_calculo: '70'  },
    'trabalho':     { tipo_calculo: 'manual',     valor_calculo: ''    },
    'drop-set':     { tipo_calculo: 'reducao',    valor_calculo: '20'  },
    'cluster':      { tipo_calculo: 'aumento',    valor_calculo: '10'  },
    // Técnicas especiais: mesmo peso (100% da base)
    'rest-pause':   { tipo_calculo: 'percentual', valor_calculo: '100' },
    'muscle-round': { tipo_calculo: 'percentual', valor_calculo: '100' },
  };

  // ── Live preview helper ────────────────────────────────────────────
  const calcCarga = (base: string, tipo: TipoCalculo, valor: string): string | null => {
    const b = parseFloat(base.replace(/[^\d.]/g, ''));
    if (isNaN(b) || b <= 0) return null;
    const v = parseFloat(valor);
    switch (tipo) {
      case 'percentual': return isNaN(v) ? null : `${Math.round(b * v / 100)}kg`;
      case 'reducao':    return isNaN(v) ? null : `${Math.round(b * (1 - v / 100))}kg`;
      case 'aumento':    return isNaN(v) ? null : `${Math.round(b * (1 + v / 100))}kg`;
      case 'manual':     return valor || null;
    }
  };

  // ── Serie management ───────────────────────────────────────────────
  const addDetailedSerie = () => {
    const tipo = 'trabalho';
    const defs = DEFAULT_CALCULO[tipo];
    setDetailedSeries(prev => [...prev, {
      id: crypto.randomUUID(),
      tipo,
      repeticoes: '',
      tipo_calculo: defs.tipo_calculo,
      valor_calculo: defs.valor_calculo,
      quantidade: 1,
    }]);
  };

  const removeDetailedSerie = (idx: number) => {
    setDetailedSeries(prev => prev.filter((_, i) => i !== idx));
  };

  const updateDetailedSerie = (idx: number, field: keyof SerieDetalhe, value: string | number) => {
    setDetailedSeries(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const updated = { ...s, [field]: value };
      // Auto-apply defaults when tipo changes
      if (field === 'tipo' && typeof value === 'string') {
        const defs = DEFAULT_CALCULO[value as TipoSerie];
        if (defs) {
          updated.tipo_calculo = defs.tipo_calculo;
          updated.valor_calculo = defs.valor_calculo;
        }
      }
      return updated;
    }));
  };

  const moveDetailedSerie = (idx: number, direction: 'up' | 'down') => {
    setDetailedSeries(prev => {
      const next = [...prev];
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= next.length) return prev;
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return next;
    });
  };

  // ── Normalize backward-compat serie (old: tipo_carga/valor_carga) ──
  const normalizeSerie = (s: any): SerieDetalhe => {
    const tipo = normalizeTipo(s.tipo ?? 'trabalho');
    const globalConfig = ((org as any)?.serie_config ?? {}) as Record<string, string>;
    return {
      id: s.id ?? crypto.randomUUID(),
      tipo,
      repeticoes: s.repeticoes ?? '',
      tipo_calculo: s.tipo_calculo ?? (s.tipo_carga === 'percentual' ? 'percentual' : 'manual'),
      valor_calculo: s.valor_calculo ?? s.valor_carga ?? '',
      quantidade: typeof s.quantidade === 'number' && s.quantidade >= 1 ? s.quantidade : 1,
      // Descrição por exercício tem prioridade; fallback na config global da org
      descricao: s.descricao?.trim() ? s.descricao : (globalConfig[tipo] || undefined),
    };
  };

  // ── Auto-migrate old simple-series exercise to detailed format ────
  const migrateToDetailed = (series: string, repeticoes: string): SerieDetalhe[] => {
    const count = Math.max(1, parseInt(series) || 1);
    // Migra N séries antigas como 1 bloco Work Set com quantidade=N
    return [{
      id: crypto.randomUUID(),
      tipo: 'trabalho',
      repeticoes: repeticoes || '',
      tipo_calculo: 'manual' as TipoCalculo,
      valor_calculo: '',
      quantidade: count,
    }];
  };

  // Sem busca no mount: os exercícios chegam em `initialExercises`, junto com as
  // sessões, numa única query aninhada feita pelo WeekDetails. Antes cada coluna
  // buscava os seus, e N colunas montando juntas estouravam o statement_timeout.

  // Toda mutação que altera a LISTA chama `onExercisesChanged()` (recarga do
  // bloco) em vez de recarregar só esta coluna. Recarregar local deixava o
  // `exercisesByTraining` do pai desatualizado, e como é ele que o drag consulta,
  // exercícios criados depois da carga inicial não arrastavam.

  const handleSubmitExercise = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    // Require at least one detailed serie
    if (detailedSeries.length === 0) {
      toast({
        title: "Adicione pelo menos uma série",
        description: "Use o botão '+ Série' para configurar as séries do exercício.",
        variant: "destructive",
      });
      return;
    }

    try {
      const nomeExercicio = formData.get("nome_exercicio") as string;

      // Exercício "personalizado" (digitado à mão, sem passar pela busca da
      // biblioteca) nunca ganhava exercicio_base_id — mesmo quando o nome batia
      // exatamente com algo que já existia lá. Sem esse link, o exercício some
      // de todo cálculo de volume por grupo muscular (ele não sabe a que grupo
      // pertence). Casa por nome exato (dentro da própria org) como fallback —
      // tenta tanto ao criar quanto ao editar (ex: exercício duplicado de uma
      // sessão antiga, ainda sem link, que o treinador abre pra ajustar séries).
      const matchedBase = exercisesBase.find((b) => b.nome.trim().toLowerCase() === nomeExercicio.trim().toLowerCase());

      // Compute legacy fields from detailedSeries for backward compatibility
      const exerciseData = {
        nome_exercicio: nomeExercicio,
        series: String(detailedSeries.reduce((sum, s) => sum + (s.quantidade ?? 1), 0)),
        repeticoes: detailedSeries[0]?.repeticoes || '—',
        descanso: descansoEx.trim() || null,
        video_url: formData.get("video_url") as string || null,
        observacoes: formData.get("observacoes") as string || null,
        exercicio_base_id: editingExercise?.exercicio_base_id ?? matchedBase?.id ?? null,
        carga_base: cargaBase.trim() || null,
        series_detalhadas: detailedSeries,
      };

      let newExerciseId: string | null = null;

      if (editingExercise) {
        const { error } = await supabase
          .from("exercicios")
          .update(exerciseData)
          .eq("id", editingExercise.id);

        if (error) throw error;
        toast({ title: "Exercício atualizado!" });
      } else {
        const { data: inserted, error } = await supabase.from("exercicios").insert({
          ...exerciseData,
          treino_id: trainingId,
          ordem: exercises.length > 0 ? Math.max(...exercises.map(e => e.ordem ?? 0)) + 1 : 0,
        }).select("id").single();

        if (error) throw error;
        newExerciseId = inserted?.id ?? null;
        toast({ title: "Exercício adicionado!" });
      }

      // Promove descrições de série para a config global da org (1 chamada só, sem SELECT extra)
      const seriesComDescricao = detailedSeries.filter(s => s.descricao?.trim());
      if (seriesComDescricao.length > 0 && orgId) {
        const novaConfig: Record<string, string> = {};
        seriesComDescricao.forEach(s => {
          if (s.descricao?.trim()) novaConfig[s.tipo] = s.descricao.trim();
        });
        const configAtual = ((org as any)?.serie_config ?? {}) as Record<string, string>;
        await supabase
          .from("organizations")
          .update({ serie_config: { ...configAtual, ...novaConfig } } as any)
          .eq("id", orgId);
      }

      if (saveToLibrary && !editingExercise && !matchedBase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: novaBase, error: baseError } = await supabase.from("exercicios_base").insert({
            treinador_id: user.id,
            org_id: orgId,
            nome: exerciseData.nome_exercicio,
            video_url: exerciseData.video_url,
            descricao: exerciseData.observacoes || null,
          }).select("id").single();

          // Linka de volta o exercício recém-criado com a entrada da biblioteca
          // que ele mesmo acabou de gerar — sem isso, "salvar na biblioteca"
          // criava a entrada mas o exercício prescrito continuava sem link.
          if (!baseError && novaBase?.id && newExerciseId) {
            await supabase.from("exercicios").update({ exercicio_base_id: novaBase.id }).eq("id", newExerciseId);
          }
        }
      }
      // Exercícios (criação/edição) dentro de um treino existente não notificam.

      setDialogOpen(false);
      setEditingExercise(null);
      setSaveToLibrary(false);
      setDetailedSeries([]);
      setCargaBase('');
      setDescansoEx('');
      await onExercisesChanged();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar exercício",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteExercise = async () => {
    if (!deletingExerciseId) return;

    try {
      const { error } = await supabase
        .from("exercicios")
        .delete()
        .eq("id", deletingExerciseId);

      if (error) throw error;

      toast({ title: "Exercício excluído!" });
      setDeletingExerciseId(null);
      await onExercisesChanged();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir exercício",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const openDialog = (exercise?: Exercise) => {
    setEditingExercise(exercise || null);
    setSaveToLibrary(false);
    setCargaBase(exercise?.carga_base || '');
    setDescansoEx(exercise?.descanso || '');

    if (exercise?.series_detalhadas && exercise.series_detalhadas.length > 0) {
      // Use stored detailed series (normalize field names for backward compat)
      setDetailedSeries((exercise.series_detalhadas as any[]).map(normalizeSerie));
    } else if (exercise && (parseInt(exercise.series) > 0)) {
      // Auto-migrate from old simple fields so the coach sees them as detailed series
      setDetailedSeries(migrateToDetailed(exercise.series, exercise.repeticoes));
    } else {
      setDetailedSeries([]);
    }
    setDialogOpen(true);
  };

  // Reordenar/mover entre treinos agora é feito por arrastar — ver
  // WeekDetails.handleDragEnd, que já cobre tanto reordenar dentro do mesmo
  // treino quanto mover pra outro (compartilha um DndContext com as colunas).

  /** Insere N exercícios da biblioteca de uma vez, sem configuração de séries —
   *  o treinador ajusta cada um depois (ou usa a barra "aplicar padrão"). */
  const handleBulkAddExercises = async (bases: ExerciseBase[]) => {
    if (bases.length === 0) return;
    try {
      const startOrdem = exercises.length > 0 ? Math.max(...exercises.map(e => e.ordem ?? 0)) + 1 : 0;
      const rows = bases.map((base, i) => ({
        treino_id: trainingId,
        nome_exercicio: base.nome,
        series: "",
        repeticoes: "",
        descanso: null,
        video_url: base.video_url,
        observacoes: null,
        exercicio_base_id: base.id,
        ordem: startOrdem + i,
      }));
      // `ordem: startOrdem + i` preserva a ordem do array recebido, que vem na
      // ordem em que o treinador clicou os exercícios no modal.
      const { error } = await supabase.from("exercicios").insert(rows);
      if (error) throw error;
      toast({ title: `${bases.length} ${bases.length === 1 ? "exercício adicionado" : "exercícios adicionados"}!` });
      await onExercisesChanged();
    } catch (error: any) {
      toast({ title: "Erro ao adicionar exercícios", description: error.message, variant: "destructive" });
    }
  };

  /** Aplica séries/reps/descanso padrão a todos os exercícios recém-adicionados
   *  ainda não configurados (campos simples só — técnica/blocos avançados
   *  continuam exigindo o editor individual). */
  const applyDefaultsToUnconfigured = async (series: string, repeticoes: string, descanso: string) => {
    const ids = exercises.filter(isUnconfigured).map(e => e.id);
    if (ids.length === 0) return;
    try {
      const { error } = await supabase
        .from("exercicios")
        .update({ series, repeticoes, descanso: descanso.trim() || null })
        .in("id", ids);
      if (error) throw error;
      await onExercisesChanged();
    } catch (error: any) {
      toast({ title: "Erro ao aplicar padrão", description: error.message, variant: "destructive" });
    }
  };

  /** Liga/desliga "sem descanso até o próximo" — encadear bi-set/tri-set/giant-set */
  const toggleConjugado = async (exerciseId: string, current: boolean) => {
    setExercises(prev => prev.map(e => e.id === exerciseId ? { ...e, conjugado_com_proximo: !current } : e));
    try {
      const { error } = await supabase
        .from("exercicios")
        .update({ conjugado_com_proximo: !current })
        .eq("id", exerciseId);
      if (error) throw error;
    } catch (error: any) {
      setExercises(prev => prev.map(e => e.id === exerciseId ? { ...e, conjugado_com_proximo: current } : e));
      toast({ title: "Erro ao vincular exercício", description: error.message, variant: "destructive" });
    }
  };

  /** Deleta múltiplos exercícios selecionados */
  const deleteSelectedExercises = async () => {
    const ids = Array.from(selectedExerciseIds);
    if (ids.length === 0) return;

    try {
      const { error } = await supabase
        .from("exercicios")
        .delete()
        .in("id", ids);

      if (error) throw error;

      toast({ title: `${ids.length} ${ids.length === 1 ? "exercício excluído" : "exercícios excluídos"}!` });
      setSelectedExerciseIds(new Set());
      await onExercisesChanged();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir exercícios",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Sem estado de "Carregando..." aqui: os exercícios já chegam prontos por prop
  // junto com a sessão, então não existe janela de espera nesta coluna.

  const unconfiguredCount = exercises.filter(isUnconfigured).length;

  const selectedCount = selectedExerciseIds.size;

  /** Os exercícios marcados no modal, **na ordem em que foram clicados**.
   *  `Set` preserva ordem de inserção, então basta iterar o Set em vez de
   *  filtrar `exercisesBase` — filtrar impunha a ordem da biblioteca
   *  (alfabética por grupo muscular) e descartava a ordem de seleção.
   *  Desmarcar e marcar de novo joga o item pro fim, que é o esperado. */
  const bulkSelectedInOrder = (): ExerciseBase[] =>
    Array.from(bulkSelected)
      .map((id) => exercisesBase.find((b) => b.id === id))
      .filter((b): b is ExerciseBase => Boolean(b));

  return (
    <div className="space-y-3 pt-1">
      <Button
        size="sm" variant="outline" className="w-full"
        onClick={() => { setBulkSearch(''); setBulkSelected(new Set()); setBulkOpen(true); }}
        style={{
          backgroundColor: EXERCISE_CARD_BG,
          borderColor: EXERCISE_CARD_BORDER,
          boxShadow: EXERCISE_CARD_SHADOW,
        }}
      >
        <Plus className="w-3.5 h-3.5 mr-1.5" />
        Adicionar exercícios
      </Button>

      {selectedCount > 0 && (
        <div className="rounded-lg p-3 flex items-center justify-between gap-3 border border-white/10" style={{ backgroundColor: 'rgba(var(--cp-rgb), 0.08)' }}>
          <span className="text-sm font-medium">
            {selectedCount} {selectedCount === 1 ? "exercício selecionado" : "exercícios selecionados"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="ghost" className="text-xs h-8"
              onClick={() => setSelectedExerciseIds(new Set())}
            >
              Limpar
            </Button>
            <Button
              size="sm" className="text-xs h-8 font-medium"
              onClick={() => {
                if (selectedCount === 1) {
                  deleteSelectedExercises();
                } else {
                  setDeletingExerciseId("multiple");
                }
              }}
              style={{ background: 'var(--cp-gradient)', color: 'var(--cp-text)' }}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Deletar
            </Button>
          </div>
        </div>
      )}

      <div
        ref={setColumnDropRef}
        className={`space-y-2 min-h-[16px] rounded-lg transition-colors ${isColumnOver ? "bg-accent/40" : ""}`}
      >
        {exercises.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">Nenhum exercício adicionado</p>
        ) : (
          exercises.map((exercise) => (
            <ExerciseRow
              key={exercise.id}
              exercise={exercise}
              trainingId={trainingId}
              isLast={exercises.indexOf(exercise) === exercises.length - 1}
              isUnconfigured={isUnconfigured(exercise)}
              isSelected={selectedExerciseIds.has(exercise.id)}
              onToggleConjugado={() => toggleConjugado(exercise.id, !!exercise.conjugado_com_proximo)}
              onEdit={() => openDialog(exercise)}
              onDelete={() => setDeletingExerciseId(exercise.id)}
              onToggleSelect={() => {
                setSelectedExerciseIds(prev => {
                  const next = new Set(prev);
                  if (next.has(exercise.id)) {
                    next.delete(exercise.id);
                  } else {
                    next.add(exercise.id);
                  }
                  return next;
                });
              }}
            />
          ))
        )}
      </div>

      {unconfiguredCount > 0 && (
        <div className="rounded-lg bg-accent/60 p-2 space-y-1.5">
          <div className="flex items-center gap-1 flex-wrap">
            <Input value={defaultSeries} onChange={(e) => setDefaultSeries(e.target.value)} className="h-7 w-12 text-xs px-1.5" aria-label="Séries" />
            <span className="text-[11px] text-muted-foreground">séries ·</span>
            <Input value={defaultReps} onChange={(e) => setDefaultReps(e.target.value)} className="h-7 w-14 text-xs px-1.5" aria-label="Repetições" />
            <span className="text-[11px] text-muted-foreground">reps ·</span>
            <Input value={defaultDescanso} onChange={(e) => setDefaultDescanso(e.target.value)} className="h-7 w-12 text-xs px-1.5" aria-label="Descanso em segundos" />
            <span className="text-[11px] text-muted-foreground">s</span>
          </div>
          <Button
            size="sm" variant="secondary" className="w-full h-7 text-xs"
            onClick={() => applyDefaultsToUnconfigured(defaultSeries, defaultReps, defaultDescanso)}
          >
            <Wand2 className="h-3 w-3 mr-1" />
            Aplicar aos {unconfiguredCount} {unconfiguredCount === 1 ? "novo" : "novos"}
          </Button>
        </div>
      )}


      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) { setDetailedSeries([]); setCargaBase(''); setDescansoEx(''); }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingExercise ? "Editar Exercício" : "Adicionar Exercício"}
            </DialogTitle>
            <DialogDescription>Configure o exercício</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitExercise} className="space-y-4">
            <div>
              <Label htmlFor="nome_exercicio">Nome do Exercício</Label>
              <Input
                id="nome_exercicio"
                name="nome_exercicio"
                className={FIELD_CLS}
                defaultValue={editingExercise?.nome_exercicio}
                required
              />
            </div>
            <div>
              <Label htmlFor="video_url">URL do Vídeo (YouTube)</Label>
              <Input
                id="video_url"
                name="video_url"
                className={FIELD_CLS}
                placeholder="https://youtube.com/watch?v=..."
                defaultValue={editingExercise?.video_url || ""}
              />
            </div>
            <div>
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                name="observacoes"
                className={FIELD_CLS}
                defaultValue={editingExercise?.observacoes || ""}
              />
            </div>

            <div>
              <Label htmlFor="descanso_ex">Tempo de Descanso (segundos)</Label>
              <Input
                id="descanso_ex"
                type="number"
                className={FIELD_CLS}
                min={0}
                max={600}
                placeholder="Ex: 60, 90, 120 — padrão 60s"
                value={descansoEx}
                onChange={(e) => setDescansoEx(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Tempo exibido ao aluno e usado no cronômetro de descanso após cada série.
              </p>
            </div>

            {/* ── Séries ── */}
            <div className="space-y-3 pt-1 border-t border-border/50">
              <div className="flex items-center justify-between pt-2">
                <div>
                  <Label className="text-sm font-semibold">Séries</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {detailedSeries.length > 0
                      ? (() => {
                          const total = detailedSeries.reduce((s, b) => s + (b.quantidade ?? 1), 0);
                          const blocos = detailedSeries.length;
                          return blocos === total
                            ? `${total} ${total === 1 ? 'série configurada' : 'séries configuradas'}`
                            : `${total} séries · ${blocos} ${blocos === 1 ? 'bloco' : 'blocos'}`;
                        })()
                      : 'Adicione pelo menos uma série para salvar'}
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={addDetailedSerie}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Série
                </Button>
              </div>

              {/* Carga Base ─ visible when there are series */}
              {detailedSeries.length > 0 && (
                <div className="rounded-xl border border-border/60 p-3 space-y-2 bg-card/60">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Carga Base
                    </Label>
                    <span className="text-[10px] text-muted-foreground">
                      Referência para cálculo automático
                    </span>
                  </div>
                  <Input
                    value={cargaBase}
                    onChange={(e) => setCargaBase(e.target.value)}
                    placeholder="Ex: 100kg, 80"
                    className={`h-9 text-sm ${FIELD_CLS}`}
                  />
                  {cargaBase.trim() && (
                    <p className="text-[10px] text-muted-foreground">
                      Os valores calculados abaixo usam <strong>{cargaBase.trim()}</strong> como referência
                    </p>
                  )}
                </div>
              )}

              {detailedSeries.length > 0 && (
                <div className="space-y-2">
                  {detailedSeries.map((serie, idx) => {
                    const preview = calcCarga(cargaBase, serie.tipo_calculo, serie.valor_calculo);
                    const CALCULO_OPTS = [
                      { key: 'percentual' as TipoCalculo, label: '%',   title: 'Porcentagem da base (ex: 50% de 100kg = 50kg)' },
                      { key: 'reducao'    as TipoCalculo, label: '−%',  title: 'Redução percentual (ex: −30% de 100kg = 70kg)' },
                      { key: 'aumento'    as TipoCalculo, label: '+%',  title: 'Aumento percentual (ex: +20% de 100kg = 120kg)' },
                      { key: 'manual'     as TipoCalculo, label: 'kg',  title: 'Valor manual (digitado diretamente)' },
                    ] as const;

                    // Dentro do dialog usamos os tokens do tema (cinza neutro:
                    // --card é `0 0% 8%`), NÃO os tons da escala de elevação do
                    // kanban. Aqueles vêm do Dashboard e puxam pro azul
                    // (#1b1c21 = B mais alto que R/G); ao lado do "Carga Base",
                    // que usa --muted neutro, a diferença de temperatura fica
                    // evidente. Tokens também acompanham o light mode, que hex
                    // fixo não faz.
                    return (
                      <div
                        key={serie.id}
                        className="rounded-xl p-3 space-y-2.5 bg-card/60 border border-border/60 shadow-sm"
                      >
                        {/* Row 1: [nº + setas] | tipo selector | delete
                            Número e setas ficam na MESMA coluna à esquerda: as
                            duas coisas dizem respeito à posição do bloco. Antes
                            as setas ficavam à direita, encostadas na lixeira —
                            mesmo tamanho e mesma cor de uma ação destrutiva. */}
                        <div className="flex items-start gap-2">
                          {/* Número + setas num bloco só: as duas coisas tratam
                              da posição. As setas ficam SEMPRE as duas visíveis
                              quando há mais de um bloco — antes a desabilitada
                              usava opacity-20 e sumia, então cada card exibia uma
                              seta solta em posição diferente do outro e parecia
                              erro de renderização. */}
                          <div className="flex flex-col items-center shrink-0 rounded-lg bg-muted/40 py-1">
                            <span className="text-[10px] text-muted-foreground font-bold w-6 text-center">
                              {idx + 1}
                            </span>
                            {/* 57% dos exercícios têm um único bloco; ali as duas
                                setas ficariam permanentemente desabilitadas. */}
                            {detailedSeries.length > 1 && (
                              <div className="flex flex-col mt-0.5">
                                <button
                                  type="button"
                                  onClick={() => moveDetailedSerie(idx, 'up')}
                                  disabled={idx === 0}
                                  title="Mover para cima"
                                  className="h-5 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-foreground/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-default transition-colors"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveDetailedSerie(idx, 'down')}
                                  disabled={idx === detailedSeries.length - 1}
                                  title="Mover para baixo"
                                  className="h-5 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-foreground/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-default transition-colors"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Type selector — tipos padrão sempre visíveis; avançados sob demanda */}
                          <div className="flex-1 flex flex-col gap-1">
                            {(() => {
                              const isAdvanced = PRESET_TIPOS_ADVANCED.includes(serie.tipo);
                              const showAdvanced = isAdvanced || showAdvancedFor.has(serie.id);
                              return (
                                <select
                                  value={
                                    PRESET_TIPOS.includes(serie.tipo) || customTipos.some(t => t.name === serie.tipo)
                                      ? serie.tipo
                                      : '__custom__'
                                  }
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '__show_advanced__') {
                                      setShowAdvancedFor(prev => new Set([...prev, serie.id]));
                                    } else if (val === '__custom__') {
                                      updateDetailedSerie(idx, 'tipo', '');
                                    } else {
                                      updateDetailedSerie(idx, 'tipo', val);
                                    }
                                  }}
                                  className={`w-full h-8 rounded-lg text-xs border px-2 cursor-pointer ${FIELD_CLS}`}
                                >
                                  <optgroup label="Padrão">
                                    <option value="warm-up">Warm Up</option>
                                    <option value="feeder">Feeder Set</option>
                                    <option value="trabalho">Work Set</option>
                                  </optgroup>
                                  {showAdvanced ? (
                                    <optgroup label="Técnicas Avançadas">
                                      <option value="drop-set">Drop Set</option>
                                      <option value="cluster">Cluster</option>
                                      <option value="rest-pause">Rest Pause</option>
                                      <option value="muscle-round">Muscle Round</option>
                                    </optgroup>
                                  ) : (
                                    <option value="__show_advanced__">＋ Técnicas Avançadas...</option>
                                  )}
                                  {customTipos.length > 0 && (
                                    <optgroup label="Salvos">
                                      {customTipos.map((t) => (
                                        <option key={t.id} value={t.name}>{t.name}</option>
                                      ))}
                                    </optgroup>
                                  )}
                                  <option value="__custom__">Personalizado...</option>
                                </select>
                              );
                            })()}

                            {/* Technique description — collapsible, editable for advanced types + warm-up + feeder */}
                            {(([...PRESET_TIPOS_ADVANCED, 'warm-up', 'feeder', 'trabalho', 'tecnica'] as string[]).includes(serie.tipo)
                              || customTipos.some(t => t.name === serie.tipo)) && (() => {
                              const isSavedCustom = customTipos.some(t => t.name === serie.tipo);
                              const getDefault = () => {
                                // Técnica personalizada salva — usa descrição da biblioteca
                                if (isSavedCustom) {
                                  return customTipos.find(t => t.name === serie.tipo)?.description ?? '';
                                }
                                const reps = parseInt(serie.repeticoes);
                                if (serie.tipo === 'cluster') {
                                  if (!isNaN(reps) && reps > 0) {
                                    const rpb = Math.ceil(reps / 3);
                                    return `Aumente a carga conforme o % indicado. Realize 3 blocos de ${rpb} reps com 20 segundos de descanso entre cada (3×${rpb} = ${3 * rpb} reps total). A carga exibida já é a carga aumentada.`;
                                  }
                                  return 'Aumente a carga conforme o % indicado. Realize 3 blocos com 20s de descanso entre cada, até completar o total de reps. A carga exibida já é a carga aumentada.';
                                }
                                const MAP: Record<string, string> = {
                                  'warm-up':     'Execute com carga leve para aquecer as articulações e preparar o músculo. Não force ao máximo — o objetivo é ativar, não fadigar.',
                                  'feeder':      'Execute com peso moderado antes das séries de trabalho para sentir o movimento e calibrar a conexão mente-músculo.',
                                  'drop-set':    'Execute as repetições normalmente e, em seguida, reduza o peso conforme o % indicado e execute até a falha. A carga exibida já é a carga reduzida.',
                                  'rest-pause':  'Execute as repetições da série normalmente. Descanse 20 segundos e, com o mesmo peso, execute até a falha.',
                                  'muscle-round':'Execute 18 repetições totais. Ao chegar à falha, descanse 10 segundos e retome de onde parou até completar as 18 reps.',
                                };
                                return MAP[serie.tipo] ?? '';
                              };

                              const isOpen = showDescFor.has(serie.id);
                              const currentVal = serie.descricao ?? '';
                              const hasCustom = currentVal.trim() !== '';

                              const toggleDesc = () => {
                                setShowDescFor(prev => {
                                  const next = new Set(prev);
                                  if (next.has(serie.id)) {
                                    next.delete(serie.id);
                                  } else {
                                    // Pre-fill with default when opening for the first time
                                    if (!hasCustom) {
                                      updateDetailedSerie(idx, 'descricao', getDefault());
                                    }
                                    next.add(serie.id);
                                  }
                                  return next;
                                });
                              };

                              return (
                                <div className="mt-1">
                                  {/* Toggle header */}
                                  <button
                                    type="button"
                                    onClick={toggleDesc}
                                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    <ChevronDown
                                      className="w-3 h-3 transition-transform duration-200"
                                      style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                                    />
                                    <span>Descrição de execução</span>
                                    {hasCustom && (
                                      <span className="ml-1 text-[9px] px-1 rounded"
                                        style={{ backgroundColor: 'var(--btn-soft-bg)', color: 'var(--btn-soft-color)' }}>
                                        editada
                                      </span>
                                    )}
                                  </button>

                                  {/* Collapsible content */}
                                  {isOpen && (
                                    <div className="mt-1.5">
                                      <textarea
                                        value={currentVal}
                                        onChange={(e) => updateDetailedSerie(idx, 'descricao', e.target.value)}
                                        rows={4}
                                        className={`w-full text-[11px] rounded-lg border px-2 py-1.5 resize-none leading-relaxed outline-none focus:ring-1 focus:ring-primary/50 ${FIELD_CLS}`}
                                        style={{ color: 'inherit' }}
                                      />
                                      <div className="flex items-center gap-3 mt-0.5">
                                        {isSavedCustom ? (
                                          <button
                                            type="button"
                                            onClick={() => updateCustomTipoDesc(serie.tipo, currentVal)}
                                            className="text-[9px] text-primary underline"
                                          >
                                            Salvar globalmente
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => updateDetailedSerie(idx, 'descricao', getDefault())}
                                            className="text-[9px] text-muted-foreground underline"
                                          >
                                            Restaurar padrão
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Free-text input — shown when tipo is not preset and not a saved custom */}
                            {isCustomTipo(serie.tipo) && (
                              <div className="space-y-1.5">
                                {/* Nome da técnica + botão salvar */}
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={serie.tipo}
                                    onChange={(e) => updateDetailedSerie(idx, 'tipo', e.target.value)}
                                    placeholder="Nome da técnica..."
                                    className={`flex-1 h-7 rounded-md text-[11px] border px-2 outline-none focus:ring-1 focus:ring-primary/50 ${FIELD_CLS}`}
                                  />
                                  {serie.tipo.trim() && !customTipos.some(t => t.name === serie.tipo.trim()) && (
                                    <button
                                      type="button"
                                      onClick={() => saveCustomTipo(serie.tipo.trim(), serie.descricao)}
                                      title="Salvar técnica na biblioteca da org"
                                      className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center border border-border hover:border-primary hover:text-primary transition-colors"
                                    >
                                      <Bookmark className="w-3 h-3" />
                                    </button>
                                  )}
                                  {serie.tipo.trim() && customTipos.some(t => t.name === serie.tipo.trim()) && (
                                    <span className="text-[10px] text-primary shrink-0">✓ salvo</span>
                                  )}
                                </div>
                                {/* Descrição de execução (opcional) */}
                                {serie.tipo.trim() && (() => {
                                  const isOpen = showDescFor.has(serie.id);
                                  const currentVal = serie.descricao ?? '';
                                  const hasCustom  = currentVal.trim() !== '';
                                  const toggleDesc = () =>
                                    setShowDescFor(prev => {
                                      const next = new Set(prev);
                                      next.has(serie.id) ? next.delete(serie.id) : next.add(serie.id);
                                      return next;
                                    });
                                  return (
                                    <div>
                                      <button
                                        type="button"
                                        onClick={toggleDesc}
                                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                                      >
                                        <ChevronDown
                                          className="w-3 h-3 transition-transform duration-200"
                                          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                                        />
                                        <span>Descrição de execução</span>
                                        {hasCustom && (
                                          <span className="ml-1 text-[9px] px-1 rounded"
                                            style={{ backgroundColor: 'var(--btn-soft-bg)', color: 'var(--btn-soft-color)' }}>
                                            editada
                                          </span>
                                        )}
                                      </button>
                                      {isOpen && (
                                        <div className="mt-1.5">
                                          <textarea
                                            value={currentVal}
                                            onChange={(e) => updateDetailedSerie(idx, 'descricao', e.target.value)}
                                            rows={3}
                                            placeholder="Descreva como executar esta técnica..."
                                            className={`w-full text-[11px] rounded-lg border px-2 py-1.5 resize-none leading-relaxed outline-none focus:ring-1 focus:ring-primary/50 ${FIELD_CLS}`}
                                            style={{ color: 'inherit' }}
                                          />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>

                          {/* Só a exclusão fica à direita, longe dos controles
                              de posição que agora moram na coluna da esquerda. */}
                          <Button type="button" size="sm" variant="ghost"
                            className="h-7 w-7 p-0 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => removeDetailedSerie(idx)}
                            title="Remover este bloco de série">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>

                        {/* Row 2: quantidade | reps | tipo_calculo buttons | valor | preview
                            ml-8 = w-6 da coluna de posição + gap-2, pra alinhar
                            com o seletor de tipo da linha de cima. */}
                        <div className="flex items-end gap-2 ml-8">
                          {/* Quantidade de blocos */}
                          <div className="shrink-0">
                            <Label className="text-[10px] text-muted-foreground">Qtd</Label>
                            <div className="flex items-center gap-0.5 mt-1 h-8">
                              <button
                                type="button"
                                onClick={() => updateDetailedSerie(idx, 'quantidade', Math.max(1, (serie.quantidade ?? 1) - 1))}
                                className="w-6 h-8 rounded-l-lg border border-r-0 border-white/[0.08] bg-card shadow-[0_2px_5px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)] text-xs font-bold text-muted-foreground hover:text-foreground hover:brightness-125 transition-all"
                              >−</button>
                              <span className="w-8 h-8 border-y border-white/[0.08] bg-card shadow-[0_2px_5px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)] flex items-center justify-center text-xs font-bold tabular-nums">
                                {serie.quantidade ?? 1}×
                              </span>
                              <button
                                type="button"
                                onClick={() => updateDetailedSerie(idx, 'quantidade', Math.min(20, (serie.quantidade ?? 1) + 1))}
                                className="w-6 h-8 rounded-r-lg border border-l-0 border-white/[0.08] bg-card shadow-[0_2px_5px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)] text-xs font-bold text-muted-foreground hover:text-foreground hover:brightness-125 transition-all"
                              >＋</button>
                            </div>
                          </div>

                          {/* Reps */}
                          <div className="w-[4rem] shrink-0">
                            <Label className="text-[10px] text-muted-foreground">Reps</Label>
                            <Input
                              value={serie.repeticoes}
                              onChange={(e) => updateDetailedSerie(idx, 'repeticoes', e.target.value)}
                              placeholder="8-10"
                              className={`h-8 text-xs mt-1 ${FIELD_CLS}`}
                            />
                          </div>

                          {/* Tipo de cálculo — 4 toggle buttons */}
                          <div className="shrink-0">
                            <Label className="text-[10px] text-muted-foreground">Cálculo</Label>
                            <div className="flex gap-0.5 mt-1 h-8">
                              {CALCULO_OPTS.map(({ key, label, title }) => (
                                <button
                                  key={key}
                                  type="button"
                                  title={title}
                                  onClick={() => updateDetailedSerie(idx, 'tipo_calculo', key)}
                                  className={`px-2 rounded text-[10px] font-bold transition-all border ${
                                    serie.tipo_calculo === key
                                      ? 'bg-primary text-primary-foreground border-primary'
                                      : 'bg-card text-muted-foreground border-white/[0.08] shadow-[0_2px_5px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)] hover:text-foreground hover:brightness-125'
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Valor */}
                          <div className="w-[4.5rem] shrink-0">
                            <Label className="text-[10px] text-muted-foreground">
                              {serie.tipo_calculo === 'manual'
                                ? 'Valor'
                                : serie.tipo_calculo === 'aumento'
                                  ? '+%'
                                  : serie.tipo_calculo === 'reducao'
                                    ? '−%'
                                    : '%'}
                            </Label>
                            <Input
                              value={serie.valor_calculo}
                              onChange={(e) => updateDetailedSerie(idx, 'valor_calculo', e.target.value)}
                              placeholder={serie.tipo_calculo === 'manual' ? '80kg' : '50'}
                              className={`h-8 text-xs mt-1 ${FIELD_CLS}`}
                            />
                          </div>

                          {/* Carga calculada */}
                          <div className="flex-1 text-right pb-0.5">
                            <p className="text-[9px] text-muted-foreground">Carga</p>
                            <p className="text-sm font-bold" style={{ color: preview ? 'var(--cp-400)' : 'var(--muted-foreground)', opacity: preview ? 1 : 0.25 }}>
                              {preview ?? '—'}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {!editingExercise && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="save_to_library"
                  checked={saveToLibrary}
                  onCheckedChange={(checked) => setSaveToLibrary(checked as boolean)}
                />
                <Label htmlFor="save_to_library" className="cursor-pointer">
                  Salvar este exercício na biblioteca
                </Label>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">{editingExercise ? "Atualizar" : "Adicionar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Adicionar exercícios</DialogTitle>
            <DialogDescription>
              Selecione um ou mais exercícios da biblioteca — depois é só ajustar as séries de cada um.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={bulkSearch}
              onChange={(e) => setBulkSearch(e.target.value)}
              placeholder="Buscar exercício ou grupo muscular..."
              className="pl-8"
            />
          </div>

          {bulkSelected.size > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {/* Mesma ordem da inserção, pra servir de prévia do resultado */}
              {bulkSelectedInOrder()
                .map((b) => (
                  <span key={b.id} className="inline-flex items-center gap-1 text-xs bg-accent text-accent-foreground rounded-full pl-2.5 pr-1.5 py-1">
                    {b.nome}
                    <button
                      type="button"
                      onClick={() => setBulkSelected((prev) => { const next = new Set(prev); next.delete(b.id); return next; })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto min-h-[120px] space-y-1">
            {(() => {
              const q = bulkSearch.trim().toLowerCase();
              const groups = new Map<string, ExerciseBase[]>();
              exercisesBase.forEach((b) => {
                const g = b.grupo_muscular_principal || 'Outros';
                if (!groups.has(g)) groups.set(g, []);
                groups.get(g)!.push(b);
              });
              const entries = Array.from(groups.entries())
                .map(([g, items]) => {
                  const groupMatches = g.toLowerCase().includes(q);
                  const filtered = q === '' ? items : items.filter((b) => groupMatches || b.nome.toLowerCase().includes(q));
                  return [g, filtered] as const;
                })
                .filter(([, items]) => items.length > 0);

              if (exercisesBase.length === 0) {
                return <p className="text-sm text-muted-foreground text-center py-6">Nenhum exercício na biblioteca ainda.</p>;
              }
              if (entries.length === 0) {
                return <p className="text-sm text-muted-foreground text-center py-6">Nenhum exercício encontrado.</p>;
              }
              return entries.map(([group, items]) => (
                <div key={group}>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-1 pt-2 pb-1">{group}</p>
                  {items.map((b) => (
                    <label key={b.id} className="flex items-center gap-2 px-1 py-1.5 rounded-md hover:bg-accent/50 cursor-pointer text-sm">
                      <Checkbox
                        checked={bulkSelected.has(b.id)}
                        onCheckedChange={(checked) => setBulkSelected((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(b.id); else next.delete(b.id);
                          return next;
                        })}
                      />
                      {b.nome}
                    </label>
                  ))}
                </div>
              ));
            })()}
          </div>

          <button
            type="button"
            className="text-xs text-muted-foreground underline underline-offset-2 text-left"
            onClick={() => { setBulkOpen(false); openDialog(); }}
          >
            Não achei o que procuro — criar exercício personalizado
          </button>

          <DialogFooter className="items-center sm:justify-between">
            <span className="text-xs text-muted-foreground">
              {bulkSelected.size} {bulkSelected.size === 1 ? "selecionado" : "selecionados"}
            </span>
            <Button
              onClick={() => {
                const bases = bulkSelectedInOrder();
                setBulkOpen(false);
                handleBulkAddExercises(bases);
              }}
              disabled={bulkSelected.size === 0}
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingExerciseId} onOpenChange={() => setDeletingExerciseId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingExerciseId === "multiple"
                ? `Esta ação não pode ser desfeita. ${selectedCount} ${selectedCount === 1 ? "exercício" : "exercícios"} ${selectedCount === 1 ? "será" : "serão"} excluído(s) permanentemente.`
                : "Esta ação não pode ser desfeita. O exercício será excluído permanentemente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingExerciseId === "multiple") {
                  deleteSelectedExercises();
                } else {
                  handleDeleteExercise();
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TrainingPlanManager;
