interface PlanExpiredBannerProps {
  dataExpiracaoPlano: string | null;
}

/** true durante a carência (dias 0-6 após o vencimento). Exportado pro
 *  StudentLayout saber se o banner ocupa o topo da tela (ver --safe-top). */
export const isPlanExpiredBannerVisible = (dataExpiracaoPlano: string | null): boolean => {
  if (!dataExpiracaoPlano) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(`${dataExpiracaoPlano}T00:00:00`);
  const diffDays = Math.round((today.getTime() - due.getTime()) / 86400000);
  return diffDays >= 0 && diffDays <= 6;
};

// Aparece só durante a carência (dias 0-6 após o vencimento) — depois disso o
// aluno já está bloqueado pelo StudentAccessGate e nem chega a ver esta tela.
const PlanExpiredBanner = ({ dataExpiracaoPlano }: PlanExpiredBannerProps) => {
  if (!dataExpiracaoPlano || !isPlanExpiredBannerVisible(dataExpiracaoPlano)) return null;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(`${dataExpiracaoPlano}T00:00:00`);
  const diffDays = Math.round((today.getTime() - due.getTime()) / 86400000);

  const diasRestantes = 7 - diffDays;
  const texto = diffDays === 0
    ? "Seu plano venceu hoje. Renove em até 7 dias para não perder o acesso."
    : `Seu plano venceu há ${diffDays} dia${diffDays > 1 ? "s" : ""}. Renove em até ${diasRestantes} dia${diasRestantes > 1 ? "s" : ""} para não perder o acesso.`;

  return (
    <div
      className="px-4 py-2 text-xs font-semibold text-center"
      style={{ background: "var(--cp-gradient)", color: "var(--cp-text)" }}
    >
      {texto}
    </div>
  );
};

export default PlanExpiredBanner;
