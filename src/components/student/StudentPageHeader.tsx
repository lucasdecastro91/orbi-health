import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

/**
 * Cabeçalho colorido das telas do aluno — título centralizado, voltar
 * opcional à esquerda, ação opcional à direita e abas opcionais (segmented
 * control) dentro do bloco colorido. Referência: telas da Prime, aprovado
 * pelo Lucas em 2026-09-27 via preview.
 *
 * Regra: o cabeçalho carrega só navegação, nunca dado (nome da dieta,
 * contadores etc. ficam no conteúdo). As abas trocam de ROTA — cada aba é
 * uma página própria (ex: /treinos ↔ /treinos/historico).
 *
 * O conteúdo logo abaixo deve subir por cima com `marginTop: -24` +
 * `rounded-t-[28px]`, igual às telas que já usavam o cabeçalho antigo.
 */
export interface StudentPageHeaderTab {
  label: string;
  to: string;
  active: boolean;
}

interface StudentPageHeaderProps {
  title: string;
  /** Destino do botão voltar; sem ele, o botão não aparece */
  backTo?: string;
  /** Alternativa ao backTo pra telas com fases internas (voltar de fase,
   *  não de rota — ex: Avaliação Postural). Tem prioridade sobre backTo. */
  onBack?: () => void;
  /** Botão/ação à direita (ícone branco, 32px) */
  right?: ReactNode;
  tabs?: StudentPageHeaderTab[];
}

const StudentPageHeader = ({ title, backTo, onBack, right, tabs }: StudentPageHeaderProps) => {
  const navigate = useNavigate();

  return (
    <div
      className="relative px-4 pb-9"
      style={{
        // Sobe por baixo da faixa de status (hora/bateria) no app nativo —
        // --safe-top vem do StudentLayout; 0 no desktop/Safari.
        marginTop: "calc(-1 * var(--safe-top, 0px))",
        paddingTop: "calc(0.75rem + var(--safe-top, 0px))",
        background: "linear-gradient(to top, var(--cp-400) 0%, var(--cp-600) 45%, var(--cp-600) 100%)",
        color: "#fff",
      }}
    >
      <div className="relative flex items-center justify-center h-8">
        {(onBack || backTo) && (
          <button
            type="button"
            onClick={() => (onBack ? onBack() : navigate(backTo!))}
            className="absolute left-0 w-8 h-8 -ml-1 flex items-center justify-center"
            aria-label="Voltar"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        <h1 className="text-[17px] font-semibold truncate px-10">{title}</h1>
        {right && <div className="absolute right-0 flex items-center">{right}</div>}
      </div>

      {tabs && tabs.length > 0 && (
        <div
          className="flex mt-3 p-[3px] rounded-[14px]"
          style={{ backgroundColor: "rgba(255,255,255,0.18)" }}
          role="tablist"
        >
          {tabs.map((tab) => (
            <button
              key={tab.to}
              type="button"
              role="tab"
              aria-selected={tab.active}
              onClick={() => { if (!tab.active) navigate(tab.to, { replace: true }); }}
              className="flex-1 h-8 rounded-[11px] text-[13px] font-semibold transition-colors"
              style={tab.active
                ? { backgroundColor: "#fff", color: "var(--cp-600)" }
                : { color: "rgba(255,255,255,0.9)" }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentPageHeader;
