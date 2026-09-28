import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import StudentPageHeader from "@/components/student/StudentPageHeader";

const AlterarSenha = () => {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { slug } = useTenantContext();
  // Antes navegava pra "/aluno" sem slug, que cai na tela de login.
  const perfilPath = `/${slug}/aluno/perfil`;

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (novaSenha !== confirmarSenha) {
      toast({
        title: "Erro",
        description: "A nova senha e a confirmação não coincidem.",
        variant: "destructive",
      });
      return;
    }

    if (novaSenha.length < 8) {
      toast({
        title: "Erro",
        description: "A nova senha deve ter pelo menos 8 caracteres.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Confere a senha atual antes de trocar — updateUser sozinho aceita
      // qualquer valor no campo "Senha atual" (quem pegasse o celular
      // desbloqueado trocaria a senha sem saber a antiga).
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("Sessão expirada. Entre de novo.");
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: senhaAtual,
      });
      if (verifyError) {
        toast({
          title: "Senha atual incorreta",
          description: "Confira a senha atual e tente de novo.",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: novaSenha,
      });

      if (error) throw error;

      toast({
        title: "Senha atualizada!",
        description: "Sua senha foi alterada com sucesso.",
      });

      setSenhaAtual("");
      setNovaSenha("");
      setConfirmarSenha("");
      
      // Navigate back after 1.5s
      setTimeout(() => navigate(perfilPath), 1500);
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar senha",
        description: error.message || "Verifique se a senha atual está correta.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pb-6">
      <StudentPageHeader title="Alterar senha" backTo={perfilPath} />

      <div
        className="relative max-w-lg mx-auto px-4 pt-6 rounded-t-[28px]"
        style={{ marginTop: -24, backgroundColor: "hsl(var(--background))" }}
      >
        <div
          className="rounded-2xl p-5"
          style={{
            backgroundColor: "var(--dash-card-bg)",
            border: "1px solid var(--dash-card-border)",
            boxShadow: "var(--dash-card-shadow)",
          }}
        >
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="senhaAtual">Senha Atual</Label>
                <Input
                  id="senhaAtual"
                  type="password"
                  value={senhaAtual}
                  onChange={(e) => setSenhaAtual(e.target.value)}
                  required
                  placeholder="Digite sua senha atual"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="novaSenha">Nova Senha</Label>
                <Input
                  id="novaSenha"
                  type="password"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  required
                  placeholder="Digite a nova senha (mín. 8 caracteres)"
                  minLength={8}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmarSenha">Confirmar Nova Senha</Label>
                <Input
                  id="confirmarSenha"
                  type="password"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  required
                  placeholder="Confirme a nova senha"
                  minLength={8}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Atualizando..." : "Atualizar Senha"}
              </Button>
            </form>
        </div>
      </div>
    </div>
  );
};

export default AlterarSenha;
