-- Biblioteca global de exercícios: só o superadmin (Lucas) decide quais
-- exercícios da PRÓPRIA org ficam visíveis/usáveis por outras orgs. Nasce
-- false — nada muda de visibilidade até ele liberar explicitamente.
-- Escrever a flag continua passando pela policy normal de UPDATE
-- (treinador_id = auth.uid()) — como só o Lucas tem exercícios na org dele
-- hoje, isso já restringe a alteração a ele sozinho, sem precisar de RPC
-- nova; se um dia ele adicionar colaboradores na própria org, cada um só
-- poderia flagar os exercícios que ELE MESMO criou, nunca os do Lucas.
ALTER TABLE public.exercicios_base
  ADD COLUMN liberado_outras_orgs boolean NOT NULL DEFAULT false;

-- Qualquer usuário autenticado (de qualquer org) pode LER exercícios
-- liberados de outras orgs, além dos da própria org (já coberto pelas
-- policies existentes org_id/treinador_id). Não abre pra edição/exclusão —
-- as policies de UPDATE/DELETE continuam exigindo treinador_id = auth.uid(),
-- então um exercício liberado só pode ser editado por quem o criou.
CREATE POLICY "exercicios_base_liberados_select"
  ON public.exercicios_base
  FOR SELECT
  TO authenticated
  USING (liberado_outras_orgs = true);
