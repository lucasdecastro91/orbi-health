import { forwardRef, useImperativeHandle, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

// Formulário de cartão + endereço de cobrança (CEP/número), reaproveitado
// entre PlanSelection.tsx (Fluxo B — assinatura do ORBI) e Pagamento.tsx
// (Fluxo A — aluno pagando o treinador). A lógica (formatação, busca ViaCEP,
// campos exigidos pela Asaas) é idêntica nos dois lugares; só o tema visual
// muda (Fluxo B é dark full-page, Fluxo A é um card claro), por isso o
// componente é "burro" de estilo — recebe as classes de input via prop.

export interface CardFields {
  card_holder_name: string;
  card_holder_cpf: string;
  card_number: string;
  card_exp_month: string;
  card_exp_year: string;
  card_ccv: string;
  cardCep: string;
  cardAddressNumber: string;
  cardAddressComplement: string;
}

export interface AsaasCardFieldsHandle {
  getValues: () => CardFields;
  /** true se todos os campos obrigatórios (cartão + CEP + número) estão preenchidos */
  isComplete: () => boolean;
}

export const formatCPF = (v: string) =>
  v.replace(/\D/g, "").slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");

interface AsaasCardFieldsProps {
  /** Classes do <Input>, pra bater com o tema da tela (dark vs light) */
  inputClassName: string;
  labelClassName: string;
}

// "*" nos campos obrigatórios — Rua/Bairro/Cidade-UF/Complemento ficam de
// fora porque não são exigidos pela Asaas (só CEP + Número são enviados;
// o resto é preenchido automático via ViaCEP só pra conferência visual).
const RequiredLabel = ({ className, children }: { className: string; children: string }) => (
  <Label className={className}>
    {children} <span className="text-red-500">*</span>
  </Label>
);

const AsaasCardFields = forwardRef<AsaasCardFieldsHandle, AsaasCardFieldsProps>(
  ({ inputClassName, labelClassName }, ref) => {
    const [card, setCard] = useState<Omit<CardFields, "cardCep" | "cardAddressNumber" | "cardAddressComplement">>({
      card_holder_name: "",
      card_holder_cpf: "",
      card_number: "",
      card_exp_month: "",
      card_exp_year: "",
      card_ccv: "",
    });
    const [cardCep, setCardCep] = useState("");
    const [cardAddressNumber, setCardAddressNumber] = useState("");
    const [cardAddressComplement, setCardAddressComplement] = useState("");
    const [rua, setRua] = useState("");
    const [bairro, setBairro] = useState("");
    const [cidadeUf, setCidadeUf] = useState("");
    const [cepLoading, setCepLoading] = useState(false);
    const [cepNotFound, setCepNotFound] = useState(false);

    useImperativeHandle(ref, () => ({
      getValues: () => ({ ...card, cardCep, cardAddressNumber, cardAddressComplement }),
      isComplete: () =>
        Object.values(card).every((v) => v.trim() !== "") &&
        cardCep.trim() !== "" && cardAddressNumber.trim() !== "",
    }));

    const handleCepChange = async (raw: string) => {
      const digits = raw.replace(/\D/g, "").slice(0, 8);
      const formatted = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
      setCardCep(formatted);
      setCepNotFound(false);
      if (digits.length !== 8) return;

      setCepLoading(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        const data = await res.json();
        if (data.erro) {
          setCepNotFound(true);
        } else {
          setRua(data.logradouro ?? "");
          setBairro(data.bairro ?? "");
          setCidadeUf(data.localidade && data.uf ? `${data.localidade}/${data.uf}` : "");
        }
      } catch {
        // Falha na busca não bloqueia o pagamento — CEP + Número já são
        // suficientes pra Asaas, a busca é só confirmação visual. Os campos
        // continuam editáveis pra digitar manualmente se preciso.
      } finally {
        setCepLoading(false);
      }
    };

    const field = (
      key: keyof typeof card,
      label: string,
      placeholder: string,
      maxLength?: number,
    ) => (
      <div className="space-y-1.5">
        <RequiredLabel className={labelClassName}>{label}</RequiredLabel>
        <Input
          value={card[key]}
          onChange={(e) => setCard((c) => ({ ...c, [key]: key === "card_holder_cpf" ? formatCPF(e.target.value) : e.target.value }))}
          placeholder={placeholder}
          maxLength={maxLength}
          className={inputClassName}
        />
      </div>
    );

    return (
      <div className="space-y-3">
        {field("card_holder_name", "Nome no cartão", "Como aparece no cartão")}
        {field("card_holder_cpf", "CPF do titular", "CPF de quem é o cartão (pode ser diferente)", 14)}
        {field("card_number", "Número do cartão", "0000 0000 0000 0000", 19)}
        <div className="grid grid-cols-3 gap-3">
          {field("card_exp_month", "Mês", "MM", 2)}
          {field("card_exp_year", "Ano", "AAAA", 4)}
          {field("card_ccv", "CVV", "123", 4)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <RequiredLabel className={labelClassName}>CEP</RequiredLabel>
            <div className="relative">
              <Input value={cardCep} onChange={(e) => handleCepChange(e.target.value)}
                placeholder="00000-000" maxLength={9} className={inputClassName} />
              {cepLoading && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 opacity-50" />}
            </div>
            {cepNotFound && <p className="text-xs text-red-400">CEP não encontrado — preencha o endereço manualmente.</p>}
          </div>
          <div className="space-y-1.5">
            <RequiredLabel className={labelClassName}>Número</RequiredLabel>
            <Input value={cardAddressNumber} onChange={(e) => setCardAddressNumber(e.target.value)}
              placeholder="123" className={inputClassName} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5 col-span-2">
            <Label className={labelClassName}>Endereço</Label>
            <Input value={rua} onChange={(e) => setRua(e.target.value)}
              placeholder="Rua, avenida..." className={inputClassName} />
          </div>
          <div className="space-y-1.5">
            <Label className={labelClassName}>Complemento</Label>
            <Input value={cardAddressComplement} onChange={(e) => setCardAddressComplement(e.target.value)}
              placeholder="Apto, bloco... (opcional)" className={inputClassName} />
          </div>
          <div className="space-y-1.5">
            <Label className={labelClassName}>Bairro</Label>
            <Input value={bairro} onChange={(e) => setBairro(e.target.value)}
              placeholder="Bairro" className={inputClassName} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label className={labelClassName}>Cidade / UF</Label>
            <Input value={cidadeUf} onChange={(e) => setCidadeUf(e.target.value)}
              placeholder="Cidade/UF" className={inputClassName} />
          </div>
        </div>
      </div>
    );
  }
);

AsaasCardFields.displayName = "AsaasCardFields";

export default AsaasCardFields;
