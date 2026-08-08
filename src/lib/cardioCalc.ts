/**
 * Estimativa de gasto calórico de uma sessão de cardio.
 *
 * Método preferido: fórmula de Keytel et al. (2005), baseada em bpm médio,
 * peso, idade e sexo — usada quando esses 4 dados estão disponíveis.
 * Fallback: estimativa por MET (só precisa do peso e do tipo de atividade),
 * usada quando idade/sexo não foram preenchidos (ex: alunos migrados que
 * nunca preencheram a anamnese).
 */

export type Sexo = "Masculino" | "Feminino" | string;

const MET_POR_TIPO: Record<string, number> = {
  Corrida: 9.8,
  Caminhada: 3.5,
  Bike: 7.5,
  Elíptico: 5.0,
  Remo: 7.0,
  Natação: 6.0,
  HIIT: 8.0,
  Outro: 5.0,
};

export interface KcalInput {
  tipo: string;
  duracaoMinutos: number;
  bpmMedio: number | null;
  idade: number | null;
  sexo: Sexo | null;
  pesoKg: number | null;
}

export interface KcalResult {
  kcal: number;
  metodo: "keytel" | "met";
}

/** Fórmula de Keytel — só é aplicável com sexo Masculino/Feminino definido */
const keytelKcalPorMinuto = (bpm: number, pesoKg: number, idade: number, sexo: Sexo): number | null => {
  if (sexo === "Masculino") {
    return (-55.0969 + 0.6309 * bpm + 0.1988 * pesoKg + 0.2017 * idade) / 4.184;
  }
  if (sexo === "Feminino") {
    return (-20.4022 + 0.4472 * bpm - 0.1263 * pesoKg + 0.074 * idade) / 4.184;
  }
  return null;
};

export const estimateKcal = (input: KcalInput): KcalResult => {
  const { tipo, duracaoMinutos, bpmMedio, idade, sexo, pesoKg } = input;

  if (bpmMedio != null && idade != null && pesoKg != null && sexo) {
    const kcalPorMinuto = keytelKcalPorMinuto(bpmMedio, pesoKg, idade, sexo);
    if (kcalPorMinuto != null && kcalPorMinuto > 0) {
      return { kcal: Math.round(kcalPorMinuto * duracaoMinutos), metodo: "keytel" };
    }
  }

  // Fallback por MET — só precisa do peso (usa um peso médio padrão se nem isso existir)
  const met = MET_POR_TIPO[tipo] ?? MET_POR_TIPO.Outro;
  const peso = pesoKg ?? 70;
  const kcal = met * peso * (duracaoMinutos / 60);
  return { kcal: Math.round(kcal), metodo: "met" };
};
