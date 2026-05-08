import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Video, Library, ChevronUp, ChevronDown, Copy, Bookmark } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

/** Fixed preset keys shown in the dropdown */
const PRESET_TIPOS: string[] = [
  'warm-up', 'feeder', 'trabalho', 'tecnica', 'drop-set', 'cluster',
  'rest-pause', 'muscle-round',
];

interface SerieDetalhe {
  id: string;
  tipo: string;
  repeticoes: string;
  tipo_calculo: TipoCalculo;
  valor_calculo: string;
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
}

interface ExerciseBase {
  id: string;
  nome: string;
  video_url: string | null;
  descricao: string | null;
}

const TrainingPlanManager = ({ studentId }: TrainingPlanManagerProps) => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadPlans();
  }, [studentId]);

  const loadPlans = async () => {
    try {
      const { data, error } = await supabase
        .from("planos_treino")
        .select("*")
        .eq("aluno_id", studentId)
        .order("data_inicio", { ascending: false });

      if (error) throw error;
      setPlans(data || []);
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
        <Accordion type="single" collapsible className="space-y-2">
          {plans.map((plan) => (
            <AccordionItem key={plan.id} value={plan.id} className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="text-left">
                    <p className="font-semibold">{plan.nome_plano}</p>
                    <p className="text-sm text-muted-foreground">{plan.objetivo}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {plan.ativo && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                        Ativo
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDialog(plan);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingPlanId(plan.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <PlanDetails planId={plan.id} />
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

const PlanDetails = ({ planId }: { planId: string }) => {
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWeek, setEditingWeek] = useState<Week | null>(null);
  const [deletingWeekId, setDeletingWeekId] = useState<string | null>(null);
  const { toast } = useToast();

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
      };

      if (editingWeek) {
        const { error } = await supabase
          .from("semanas")
          .update(weekData)
          .eq("id", editingWeek.id);

        if (error) throw error;
        toast({ title: "Bloco atualizado!" });
      } else {
        const { error } = await supabase.from("semanas").insert({
          ...weekData,
          plano_id: planId,
        });

        if (error) throw error;
        toast({ title: "Bloco criado!" });
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

        // 6. Duplicar exercícios com a NOVA zona de repetições
        if (exercises && exercises.length > 0) {
          const newExercises = exercises.map((ex) => ({
            treino_id: newTraining.id,
            nome_exercicio: ex.nome_exercicio,
            series: ex.series,
            repeticoes: customZonaReps,
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
            <AccordionItem key={week.id} value={week.id} className="border rounded-lg px-4">
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
                <WeekDetails weekId={week.id} />
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

const WeekDetails = ({ weekId }: { weekId: string }) => {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTraining, setEditingTraining] = useState<Training | null>(null);
  const [deletingTrainingId, setDeletingTrainingId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadTrainings();
  }, [weekId]);

  const loadTrainings = async () => {
    try {
      const { data, error } = await supabase
        .from("treinos")
        .select("*")
        .eq("semana_id", weekId)
        .order("ordem");

      if (error) throw error;
      setTrainings(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar treinos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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

  const handleMoveTraining = async (trainingId: string, direction: "up" | "down") => {
    const currentIndex = trainings.findIndex((t) => t.id === trainingId);
    if (currentIndex === -1) return;
    
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= trainings.length) return;

    const currentTraining = trainings[currentIndex];
    const targetTraining = trainings[targetIndex];

    try {
      // Trocar os valores de ordem
      await supabase
        .from("treinos")
        .update({ ordem: targetTraining.ordem })
        .eq("id", currentTraining.id);

      await supabase
        .from("treinos")
        .update({ ordem: currentTraining.ordem })
        .eq("id", targetTraining.id);

      toast({ title: "Ordem atualizada!" });
      loadTrainings(); // Recarregar lista
    } catch (error: any) {
      toast({
        title: "Erro ao reordenar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

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
        <Button size="sm" variant="outline" onClick={() => openDialog()}>
          <Plus className="w-4 h-4 mr-2" />
          Adicionar Treino
        </Button>
      </div>

      {trainings.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum treino adicionado</p>
      ) : (
        <Accordion type="single" collapsible className="space-y-2">
          {trainings.map((training) => (
            <AccordionItem
              key={training.id}
              value={training.id}
              className="border rounded-lg px-4"
            >
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="text-left">
                    <p className="font-medium">{training.titulo_treino}</p>
                    <p className="text-sm text-muted-foreground">{training.dia_semana}</p>
                  </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveTraining(training.id, "up");
                    }}
                    disabled={trainings.indexOf(training) === 0}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveTraining(training.id, "down");
                    }}
                    disabled={trainings.indexOf(training) === trainings.length - 1}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDuplicateTraining(training);
                    }}
                    title="Duplicar treino"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDialog(training);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingTrainingId(training.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <TrainingExercises trainingId={training.id} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
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

const TrainingExercises = ({ trainingId }: { trainingId: string }) => {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exercisesBase, setExercisesBase] = useState<ExerciseBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [deletingExerciseId, setDeletingExerciseId] = useState<string | null>(null);
  const [selectedBase, setSelectedBase] = useState<ExerciseBase | null>(null);
  const [saveToLibrary, setSaveToLibrary] = useState(false);
  const [comboOpen, setComboOpen] = useState(false);
  const [detailedSeries, setDetailedSeries] = useState<SerieDetalhe[]>([]);
  const [cargaBase, setCargaBase] = useState('');
  const [customTipos, setCustomTipos] = useState<string[]>([]);
  const { toast } = useToast();
  const { orgId } = useTenantContext();

  // ── Custom tipo helpers ────────────────────────────────────────────
  /** True when tipo is neither a preset nor a saved custom — shows free-text input */
  const isCustomTipo = (tipo: string) =>
    !PRESET_TIPOS.includes(tipo) && !customTipos.includes(tipo);

  const loadCustomTipos = async () => {
    if (!orgId) return;
    try {
      const { data } = await supabase
        .from("serie_tipos_custom")
        .select("nome")
        .eq("org_id", orgId)
        .order("nome");
      if (data) setCustomTipos(data.map((r: any) => r.nome));
    } catch { /* silent */ }
  };

  const saveCustomTipo = async (nome: string) => {
    if (!orgId || !nome.trim()) return;
    try {
      const { error } = await supabase
        .from("serie_tipos_custom")
        .insert({ org_id: orgId, nome: nome.trim() });
      if (error) throw error;
      setCustomTipos((prev) => [...prev, nome.trim()].sort());
      toast({ title: "Tipo salvo!", description: `"${nome.trim()}" adicionado à sua lista` });
    } catch (err: any) {
      if (err.code === "23505") {
        toast({ title: "Tipo já existe", description: "Este nome já está na sua lista" });
      } else {
        toast({ title: "Erro ao salvar tipo", description: err.message, variant: "destructive" });
      }
    }
  };

  // ── Defaults per tipo ──────────────────────────────────────────────
  const DEFAULT_CALCULO: Record<string, { tipo_calculo: TipoCalculo; valor_calculo: string }> = {
    'warm-up':      { tipo_calculo: 'percentual', valor_calculo: '50'  },
    'feeder':       { tipo_calculo: 'percentual', valor_calculo: '70'  },
    'trabalho':     { tipo_calculo: 'manual',     valor_calculo: ''    },
    'tecnica':      { tipo_calculo: 'manual',     valor_calculo: ''    },
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
    }]);
  };

  const removeDetailedSerie = (idx: number) => {
    setDetailedSeries(prev => prev.filter((_, i) => i !== idx));
  };

  const updateDetailedSerie = (idx: number, field: keyof SerieDetalhe, value: string) => {
    setDetailedSeries(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const updated = { ...s, [field]: value };
      // Auto-apply defaults when tipo changes
      if (field === 'tipo') {
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
  const normalizeSerie = (s: any): SerieDetalhe => ({
    id: s.id ?? crypto.randomUUID(),
    tipo: s.tipo ?? 'trabalho',
    repeticoes: s.repeticoes ?? '',
    tipo_calculo: s.tipo_calculo ?? (s.tipo_carga === 'percentual' ? 'percentual' : 'manual'),
    valor_calculo: s.valor_calculo ?? s.valor_carga ?? '',
  });

  // ── Auto-migrate old simple-series exercise to detailed format ────
  const migrateToDetailed = (series: string, repeticoes: string): SerieDetalhe[] => {
    const count = Math.max(1, parseInt(series) || 1);
    return Array.from({ length: count }, () => ({
      id: crypto.randomUUID(),
      tipo: 'trabalho',
      repeticoes: repeticoes || '',
      tipo_calculo: 'manual' as TipoCalculo,
      valor_calculo: '',
    }));
  };

  useEffect(() => {
    loadExercises();
    loadExercisesBase();
    loadCustomTipos();
  }, [trainingId]);

  const loadExercises = async () => {
    try {
      const { data, error } = await supabase
        .from("exercicios")
        .select("*")
        .eq("treino_id", trainingId)
        .order("ordem");

      if (error) throw error;
      
      // Normalizar ordem para garantir valores sequenciais únicos (0, 1, 2, ...)
      const sorted = data || [];
      const needsNormalization = sorted.some((ex, i) => ex.ordem !== i);
      
      if (needsNormalization && sorted.length > 0) {
        const updates = sorted.map((ex, i) => 
          supabase.from("exercicios").update({ ordem: i }).eq("id", ex.id)
        );
        await Promise.all(updates);
        sorted.forEach((ex, i) => { ex.ordem = i; });
      }
      
      setExercises(sorted);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar exercícios",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadExercisesBase = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("exercicios_base")
        .select("*")
        .eq("treinador_id", user.id)
        .order("nome");

      if (error) throw error;
      setExercisesBase(data || []);
    } catch (error: any) {
      console.error("Error loading exercise library:", error);
    }
  };

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
      // Compute legacy fields from detailedSeries for backward compatibility
      const exerciseData = {
        nome_exercicio: formData.get("nome_exercicio") as string,
        series: String(detailedSeries.length),
        repeticoes: detailedSeries[0]?.repeticoes || '—',
        descanso: null as string | null,
        video_url: formData.get("video_url") as string || null,
        observacoes: formData.get("observacoes") as string || null,
        exercicio_base_id: selectedBase?.id || null,
        carga_base: cargaBase.trim() || null,
        series_detalhadas: detailedSeries,
      };

      if (editingExercise) {
        const { error } = await supabase
          .from("exercicios")
          .update(exerciseData)
          .eq("id", editingExercise.id);

        if (error) throw error;
        toast({ title: "Exercício atualizado!" });
      } else {
        const { error } = await supabase.from("exercicios").insert({
          ...exerciseData,
          treino_id: trainingId,
          ordem: exercises.length,
        });

        if (error) throw error;
        toast({ title: "Exercício adicionado!" });
      }

      if (saveToLibrary && !editingExercise) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("exercicios_base").insert({
            treinador_id: user.id,
            nome: exerciseData.nome_exercicio,
            video_url: exerciseData.video_url,
            descricao: exerciseData.observacoes || null,
          });
        }
      }

      setDialogOpen(false);
      setEditingExercise(null);
      setSelectedBase(null);
      setSaveToLibrary(false);
      setDetailedSeries([]);
      setCargaBase('');
      loadExercises();
      loadExercisesBase();
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
      loadExercises();
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
    setSelectedBase(null);
    setSaveToLibrary(false);
    setCargaBase(exercise?.carga_base || '');

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

  const selectExerciseBase = (base: ExerciseBase) => {
    setSelectedBase(base);
    setComboOpen(false);
  };

  const handleMoveExercise = async (exerciseId: string, direction: "up" | "down") => {
    // Criar cópia do array atual para evitar stale closure
    const exercisesCopy = [...exercises];
    const currentIndex = exercisesCopy.findIndex((e) => e.id === exerciseId);
    if (currentIndex === -1) return;

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= exercisesCopy.length) return;

    const currentExercise = exercisesCopy[currentIndex];
    const targetExercise = exercisesCopy[targetIndex];

    // Usar índices como ordem garantida (normalizada no load)
    const newCurrentOrdem = targetIndex;
    const newTargetOrdem = currentIndex;

    // Atualizar UI otimisticamente usando callback form do setState
    setExercises(prev => {
      const updated = [...prev];
      const ci = updated.findIndex(e => e.id === currentExercise.id);
      const ti = updated.findIndex(e => e.id === targetExercise.id);
      if (ci === -1 || ti === -1) return prev;
      updated[ci] = { ...updated[ci], ordem: newCurrentOrdem };
      updated[ti] = { ...updated[ti], ordem: newTargetOrdem };
      return updated.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
    });

    try {
      const { error: err1 } = await supabase
        .from("exercicios")
        .update({ ordem: newCurrentOrdem })
        .eq("id", currentExercise.id);
      if (err1) throw err1;

      const { error: err2 } = await supabase
        .from("exercicios")
        .update({ ordem: newTargetOrdem })
        .eq("id", targetExercise.id);
      if (err2) throw err2;

      toast({ title: "Ordem atualizada!" });
    } catch (error: any) {
      toast({
        title: "Erro ao reordenar",
        description: error.message,
        variant: "destructive",
      });
      loadExercises();
    }
  };

  if (loading) return <p className="text-sm">Carregando...</p>;

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-between items-center">
        <h6 className="font-semibold text-sm">Exercícios</h6>
        <Button size="sm" variant="outline" onClick={() => openDialog()}>
          <Plus className="w-4 h-4 mr-2" />
          Adicionar Exercício
        </Button>
      </div>

      {exercises.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum exercício adicionado</p>
      ) : (
        <div className="space-y-2">
          {exercises.map((exercise) => (
            <Card key={exercise.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1.5 flex-1">
                    <p className="font-medium">{exercise.nome_exercicio}</p>
                    {/* Series summary */}
                    {(() => {
                      const sd = exercise.series_detalhadas as SerieDetalhe[] | null | undefined;
                      const hasSd = sd && sd.length > 0;
                      const count = hasSd ? sd.length : parseInt(exercise.series) || 0;

                      // Build tipo summary e.g. "2× Trabalho · 1× Warm-up"
                      const tipoLabels: Record<string, string> = {
                        'warm-up': 'W-up', 'feeder': 'Feeder', 'trabalho': 'Work Set',
                        'tecnica': 'Técnica', 'drop-set': 'Drop', 'cluster': 'Cluster',
                        'rest-pause': 'Rest Pause', 'muscle-round': 'Muscle Rnd',
                      };
                      const tipoCounts = hasSd
                        ? sd.reduce<Record<string, number>>((acc, s) => {
                            acc[s.tipo] = (acc[s.tipo] || 0) + 1; return acc;
                          }, {})
                        : null;
                      const tipoSummary = tipoCounts
                        ? Object.entries(tipoCounts)
                            .map(([t, n]) => `${n}× ${tipoLabels[t] ?? t}`)
                            .join(' · ')
                        : exercise.repeticoes
                          ? `${exercise.repeticoes} reps`
                          : null;

                      return (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-muted-foreground">
                            {count} {count === 1 ? 'série' : 'séries'}
                          </span>
                          {tipoSummary && (
                            <span className="text-xs text-muted-foreground opacity-70">
                              {tipoSummary}
                            </span>
                          )}
                          {exercise.carga_base && (
                            <span className="text-xs text-muted-foreground opacity-70">
                              · base {exercise.carga_base}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                    {exercise.video_url && (
                      <div className="flex items-center gap-1 text-xs text-primary opacity-80">
                        <Video className="h-3 w-3" />
                        <span>Vídeo</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleMoveExercise(exercise.id, "up")}
                      disabled={exercises.indexOf(exercise) === 0}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleMoveExercise(exercise.id, "down")}
                      disabled={exercises.indexOf(exercise) === exercises.length - 1}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openDialog(exercise)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeletingExerciseId(exercise.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) { setDetailedSeries([]); setCargaBase(''); }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingExercise ? "Editar Exercício" : "Adicionar Exercício"}
            </DialogTitle>
            <DialogDescription>Configure o exercício</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitExercise} className="space-y-4">
            {!editingExercise && exercisesBase.length > 0 && (
              <div className="space-y-2">
                <Label>Buscar da Biblioteca</Label>
                <Popover open={comboOpen} onOpenChange={setComboOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      {selectedBase ? selectedBase.nome : "Selecione um exercício..."}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput placeholder="Buscar exercício..." />
                      <CommandList>
                        <CommandEmpty>Nenhum exercício encontrado.</CommandEmpty>
                        <CommandGroup>
                          {exercisesBase.map((base) => (
                            <CommandItem
                              key={base.id}
                              onSelect={() => selectExerciseBase(base)}
                            >
                              {base.nome}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <div>
              <Label htmlFor="nome_exercicio">Nome do Exercício</Label>
              <Input
                id="nome_exercicio"
                name="nome_exercicio"
                defaultValue={editingExercise?.nome_exercicio || selectedBase?.nome}
                required
              />
            </div>
            <div>
              <Label htmlFor="video_url">URL do Vídeo (YouTube)</Label>
              <Input
                id="video_url"
                name="video_url"
                placeholder="https://youtube.com/watch?v=..."
                defaultValue={editingExercise?.video_url || selectedBase?.video_url || ""}
              />
            </div>
            <div>
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                name="observacoes"
                defaultValue={editingExercise?.observacoes || ""}
              />
            </div>

            {/* ── Séries ── */}
            <div className="space-y-3 pt-1 border-t border-border/50">
              <div className="flex items-center justify-between pt-2">
                <div>
                  <Label className="text-sm font-semibold">Séries</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {detailedSeries.length > 0
                      ? `${detailedSeries.length} ${detailedSeries.length === 1 ? 'série configurada' : 'séries configuradas'}`
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
                <div className="rounded-xl border border-border/60 p-3 space-y-2 bg-muted/10">
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
                    className="h-9 text-sm"
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

                    return (
                      <div key={serie.id} className="rounded-xl border p-3 space-y-2.5">
                        {/* Row 1: index | tipo selector | reorder | delete */}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground font-bold w-5 shrink-0 text-center">
                            {idx + 1}
                          </span>

                          {/* Type selector — expands to show text input when custom */}
                          <div className="flex-1 flex flex-col gap-1">
                            <select
                              value={
                                PRESET_TIPOS.includes(serie.tipo) || customTipos.includes(serie.tipo)
                                  ? serie.tipo
                                  : '__custom__'
                              }
                              onChange={(e) => {
                                if (e.target.value === '__custom__') {
                                  updateDetailedSerie(idx, 'tipo', '');
                                } else {
                                  updateDetailedSerie(idx, 'tipo', e.target.value);
                                }
                              }}
                              className="w-full h-8 rounded-lg text-xs border bg-background px-2 cursor-pointer"
                            >
                              <optgroup label="Padrão">
                                <option value="warm-up">Warm-up</option>
                                <option value="feeder">Feeder</option>
                                <option value="trabalho">Work Set</option>
                                <option value="tecnica">Técnica</option>
                                <option value="drop-set">Drop Set</option>
                                <option value="cluster">Cluster</option>
                              </optgroup>
                              <optgroup label="Técnicas Especiais">
                                <option value="rest-pause">Rest Pause</option>
                                <option value="muscle-round">Muscle Round</option>
                              </optgroup>
                              {customTipos.length > 0 && (
                                <optgroup label="Salvos">
                                  {customTipos.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </optgroup>
                              )}
                              <option value="__custom__">Personalizado...</option>
                            </select>

                            {/* Technique hint — shown for special types */}
                            {serie.tipo === 'rest-pause' && (
                              <p className="text-[10px] px-2 py-1 rounded-md leading-relaxed"
                                style={{ backgroundColor: 'rgba(251,113,133,0.08)', color: '#fb7185' }}>
                                ⏱ Mesmo peso · descanse 20s · repita até a falha
                              </p>
                            )}
                            {serie.tipo === 'muscle-round' && (
                              <p className="text-[10px] px-2 py-1 rounded-md leading-relaxed"
                                style={{ backgroundColor: 'rgba(34,211,238,0.08)', color: '#22d3ee' }}>
                                🔄 Mesmo peso · 18 reps totais · descanse 10-15s ao falhar e continue
                              </p>
                            )}

                            {/* Free-text input — shown when tipo is not preset and not a saved custom */}
                            {isCustomTipo(serie.tipo) && (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={serie.tipo}
                                  onChange={(e) => updateDetailedSerie(idx, 'tipo', e.target.value)}
                                  placeholder="Nome do tipo..."
                                  className="flex-1 h-7 rounded-md text-[11px] border bg-background px-2 outline-none focus:ring-1 focus:ring-primary/50"
                                />
                                {serie.tipo.trim() && !customTipos.includes(serie.tipo.trim()) && (
                                  <button
                                    type="button"
                                    onClick={() => saveCustomTipo(serie.tipo.trim())}
                                    title="Salvar tipo para reutilizar"
                                    className="h-7 w-7 shrink-0 rounded-md flex items-center justify-center border border-border hover:border-primary hover:text-primary transition-colors"
                                  >
                                    <Bookmark className="w-3 h-3" />
                                  </button>
                                )}
                                {serie.tipo.trim() && customTipos.includes(serie.tipo.trim()) && (
                                  <span className="text-[10px] text-primary shrink-0">✓ salvo</span>
                                )}
                              </div>
                            )}
                          </div>

                          <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0"
                            onClick={() => moveDetailedSerie(idx, 'up')} disabled={idx === 0}>
                            <ChevronUp className="w-3.5 h-3.5" />
                          </Button>
                          <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0"
                            onClick={() => moveDetailedSerie(idx, 'down')} disabled={idx === detailedSeries.length - 1}>
                            <ChevronDown className="w-3.5 h-3.5" />
                          </Button>
                          <Button type="button" size="sm" variant="ghost"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => removeDetailedSerie(idx)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>

                        {/* Row 2: reps | tipo_calculo buttons | valor | preview */}
                        <div className="flex items-end gap-2 ml-7">
                          {/* Reps */}
                          <div className="w-[4.5rem] shrink-0">
                            <Label className="text-[10px] text-muted-foreground">Reps</Label>
                            <Input
                              value={serie.repeticoes}
                              onChange={(e) => updateDetailedSerie(idx, 'repeticoes', e.target.value)}
                              placeholder="8-10"
                              className="h-8 text-xs mt-1"
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
                                  className={`px-2 rounded text-[10px] font-bold transition-colors border ${
                                    serie.tipo_calculo === key
                                      ? 'bg-primary text-primary-foreground border-primary'
                                      : 'bg-transparent text-muted-foreground border-border hover:border-muted-foreground/50'
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
                              className="h-8 text-xs mt-1"
                            />
                          </div>

                          {/* Preview */}
                          <div className="flex-1 text-right pb-0.5">
                            {preview ? (
                              <>
                                <p className="text-[9px] text-muted-foreground">Preview</p>
                                <p className="text-sm font-bold" style={{ color: 'var(--cp-400)' }}>
                                  {serie.tipo_calculo !== 'manual' && cargaBase.trim()
                                    ? `${cargaBase.trim()} → ${preview}`
                                    : preview}
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-[9px] text-muted-foreground opacity-0">Preview</p>
                                <p className="text-sm font-bold text-muted-foreground/25">—</p>
                              </>
                            )}
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

      <AlertDialog open={!!deletingExerciseId} onOpenChange={() => setDeletingExerciseId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O exercício será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteExercise}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TrainingPlanManager;
