import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileText, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface ModeloTreino {
  id: string;
  nome_modelo: string;
  objetivo: string | null;
  descricao: string | null;
}

const TrainingTemplates = () => {
  const [modelos, setModelos] = useState<ModeloTreino[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [modeloToDelete, setModeloToDelete] = useState<string | null>(null);
  const [editingModelo, setEditingModelo] = useState<ModeloTreino | null>(null);
  const [novoModelo, setNovoModelo] = useState({ nome_modelo: "", objetivo: "", descricao: "" });
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    loadModelos();
  }, []);

  const loadModelos = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from("modelos_treino")
        .select("*")
        .eq("treinador_id", session.user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setModelos(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar modelos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddModelo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase.from("modelos_treino").insert({
        treinador_id: session.user.id,
        nome_modelo: novoModelo.nome_modelo,
        objetivo: novoModelo.objetivo || null,
        descricao: novoModelo.descricao || null,
      });

      if (error) throw error;

      toast({
        title: "Modelo criado",
        description: "Modelo de treino criado com sucesso.",
      });

      setDialogOpen(false);
      setNovoModelo({ nome_modelo: "", objetivo: "", descricao: "" });
      loadModelos();
    } catch (error: any) {
      toast({
        title: "Erro ao criar modelo",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEditModelo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingModelo) return;

    try {
      const { error } = await supabase
        .from("modelos_treino")
        .update({
          nome_modelo: editingModelo.nome_modelo,
          objetivo: editingModelo.objetivo || null,
          descricao: editingModelo.descricao || null,
        })
        .eq("id", editingModelo.id);

      if (error) throw error;

      toast({
        title: "Modelo atualizado",
        description: "Modelo de treino atualizado com sucesso.",
      });

      setEditDialogOpen(false);
      setEditingModelo(null);
      loadModelos();
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar modelo",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteModelo = async () => {
    if (!modeloToDelete) return;
    
    try {
      const { error } = await supabase
        .from("modelos_treino")
        .delete()
        .eq("id", modeloToDelete);

      if (error) throw error;

      toast({
        title: "Modelo excluído",
        description: "Modelo de treino excluído com sucesso.",
      });

      setDeleteDialogOpen(false);
      setModeloToDelete(null);
      loadModelos();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir modelo",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-8">
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-zinc-900 to-black">
      <div className="container mx-auto p-4 md:p-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white">Modelos de Treino</h1>
            <p className="text-slate-300 mt-1">
              Crie templates para reutilizar em seus alunos
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Novo Modelo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Modelo de Treino</DialogTitle>
              <DialogDescription>
                Crie um template de treino para reutilizar com seus alunos
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddModelo} className="space-y-4">
              <div>
                <Label htmlFor="nome_modelo">Nome do Modelo *</Label>
                <Input
                  id="nome_modelo"
                  value={novoModelo.nome_modelo}
                  onChange={(e) =>
                    setNovoModelo({ ...novoModelo, nome_modelo: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <Label htmlFor="objetivo">Objetivo</Label>
                <Input
                  id="objetivo"
                  value={novoModelo.objetivo}
                  onChange={(e) =>
                    setNovoModelo({ ...novoModelo, objetivo: e.target.value })
                  }
                  placeholder="Ex: Hipertrofia, Emagrecimento"
                />
              </div>
              <div>
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  value={novoModelo.descricao}
                  onChange={(e) =>
                    setNovoModelo({ ...novoModelo, descricao: e.target.value })
                  }
                  placeholder="Descreva o modelo de treino"
                />
              </div>
              <Button type="submit" className="w-full">
                Criar Modelo
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {modelos.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              Nenhum modelo criado ainda. Crie seu primeiro modelo de treino!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {modelos.map((modelo) => (
            <Card key={modelo.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle>{modelo.nome_modelo}</CardTitle>
                    {modelo.objetivo && (
                      <CardDescription className="mt-1">
                        {modelo.objetivo}
                      </CardDescription>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => {
                        setEditingModelo(modelo);
                        setEditDialogOpen(true);
                      }}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar modelo
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => {
                          setModeloToDelete(modelo.id);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir modelo
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              {modelo.descricao && (
                <CardContent>
                  <p className="text-sm text-muted-foreground">{modelo.descricao}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este modelo? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteModelo}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Modelo de Treino</DialogTitle>
            <DialogDescription>Atualize as informações do modelo</DialogDescription>
          </DialogHeader>
          {editingModelo && (
            <form onSubmit={handleEditModelo} className="space-y-4">
              <div>
                <Label htmlFor="edit-nome_modelo">Nome do Modelo *</Label>
                <Input
                  id="edit-nome_modelo"
                  value={editingModelo.nome_modelo}
                  onChange={(e) => setEditingModelo({ ...editingModelo, nome_modelo: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-objetivo">Objetivo</Label>
                <Input
                  id="edit-objetivo"
                  value={editingModelo.objetivo || ""}
                  onChange={(e) => setEditingModelo({ ...editingModelo, objetivo: e.target.value })}
                  placeholder="Ex: Hipertrofia, Emagrecimento"
                />
              </div>
              <div>
                <Label htmlFor="edit-descricao">Descrição</Label>
                <Textarea
                  id="edit-descricao"
                  value={editingModelo.descricao || ""}
                  onChange={(e) => setEditingModelo({ ...editingModelo, descricao: e.target.value })}
                  placeholder="Descreva o modelo de treino"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
                <Button type="submit">Salvar alterações</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default TrainingTemplates;
