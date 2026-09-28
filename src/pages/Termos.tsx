const SECOES = [
  {
    titulo: "1. Aceitação dos termos",
    corpo: `Ao criar uma conta ou usar a ORBI Health, você concorda com estes Termos de Uso. Eles se
    aplicam a todos os usuários da plataforma — treinadores, alunos e demais perfis. Se você não
    concordar com algum ponto, não utilize a plataforma.`,
  },
  {
    titulo: "2. O que é a ORBI Health",
    corpo: `A ORBI Health é uma plataforma que permite a personal trainers, nutricionistas e coaches
    gerenciar treinos, dietas e alunos, e permite que os alunos acompanhem seu próprio plano de
    treino e dieta. Cada profissional opera sua própria conta de forma independente — a ORBI Health
    fornece a tecnologia, mas não presta diretamente serviço de personal trainer, nutrição ou
    acompanhamento de saúde.`,
  },
  {
    titulo: "3. Cadastro e conta",
    corpo: `O treinador cria sua própria conta e é responsável por convidar e cadastrar seus alunos.
    Cada usuário é responsável por manter a confidencialidade de sua senha e por todas as atividades
    realizadas em sua conta. Avise imediatamente pelo e-mail de contato caso suspeite de uso não
    autorizado.`,
  },
  {
    titulo: "4. Uso da plataforma e aviso de saúde",
    corpo: `Treinos e dietas disponíveis na plataforma são prescritos pelo profissional responsável
    por você (educador físico/personal trainer para o treino, nutricionista para a dieta), e o uso
    deles é por conta e risco do usuário. Se você tiver alguma condição de saúde preexistente que
    necessite de acompanhamento médico, também deve buscar orientação de um médico antes de iniciar
    o programa.

    É proibido usar a plataforma para fins ilícitos, enviar conteúdo ofensivo ou tentar acessar
    dados de outros usuários sem autorização.`,
  },
  {
    titulo: "5. Assinatura e pagamento (treinadores)",
    corpo: `Treinadores têm acesso a um período de teste gratuito, seguido de assinatura paga nos
    planos ORBI Motion ou ORBI Pro, com cobrança recorrente processada pelo parceiro de pagamentos
    Asaas. A assinatura é renovada automaticamente a cada ciclo até ser cancelada. O cancelamento
    pode ser feito a qualquer momento pelo próprio app (Configurações → Assinatura), e o acesso
    permanece ativo até o fim do período já pago — não há reembolso proporcional de período não
    utilizado, salvo quando exigido por lei.

    Alunos não pagam a ORBI Health diretamente; eventuais cobranças que aparecem para o aluno são
    geradas pelo próprio treinador, dentro da relação comercial entre eles, e não são de
    responsabilidade da ORBI Health.`,
  },
  {
    titulo: "6. Propriedade intelectual",
    corpo: `A plataforma, sua marca, layout e código são de propriedade da ORBI Health. Os dados que
    você insere (planos de treino, dietas, anotações, fotos) continuam sendo seus — a ORBI Health
    apenas os armazena e processa para viabilizar o funcionamento do serviço, conforme descrito na
    Política de Privacidade.`,
  },
  {
    titulo: "7. Suspensão e encerramento de conta",
    corpo: `Podemos suspender ou encerrar contas que violem estes termos, sem aviso prévio em casos
    graves. Você pode encerrar sua própria conta a qualquer momento entrando em contato pelo e-mail
    de suporte.`,
  },
  {
    titulo: "8. Disponibilidade do serviço",
    corpo: `Fazemos o possível para manter a plataforma sempre disponível, mas não garantimos operação
    ininterrupta ou livre de falhas. Manutenções programadas ou eventuais instabilidades podem
    ocorrer. Não nos responsabilizamos por perdas decorrentes de indisponibilidade temporária do
    serviço.`,
  },
  {
    titulo: "9. Alterações nestes termos",
    corpo: `Estes termos podem ser atualizados periodicamente. A data da última atualização está
    sempre indicada no topo desta página. O uso continuado da plataforma após uma alteração
    significa que você concorda com os novos termos.`,
  },
  {
    titulo: "10. Lei aplicável",
    corpo: `Estes termos são regidos pelas leis brasileiras. Eventuais disputas serão resolvidas no
    foro da comarca do responsável pela plataforma, salvo disposição legal em contrário.`,
  },
  {
    titulo: "11. Contato",
    corpo: `Dúvidas sobre estes termos podem ser enviadas para contato@orbihealth.com.br.`,
  },
];

const formatarCorpo = (corpo: string): string =>
  corpo
    .split(/\n\s*\n/)
    .map((paragrafo) => paragrafo.replace(/\s*\n\s*/g, " ").trim())
    .join("\n\n");

const Termos = () => {
  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: "#050505" }}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 60% 45% at 20% 0%, rgba(34,197,94,0.14) 0%, transparent 65%)" }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 55% 45% at 85% 100%, rgba(22,163,74,0.14) 0%, transparent 65%)" }}
      />

      <div className="relative z-10 max-w-2xl mx-auto px-6 py-16">
        <img src="/logos/orbi-logo-horizontal-dark.svg" alt="ORBI Health" className="h-10 w-auto object-contain mb-10" />

        <h1 className="text-2xl font-bold text-white mb-1">Termos de Uso</h1>
        <p className="text-sm text-white/40 mb-10">Última atualização: 5 de setembro de 2026</p>

        <p className="text-sm text-white/70 leading-relaxed mb-10">
          Estes termos explicam as regras de uso da ORBI Health. Eles se aplicam a todos os usuários
          da plataforma — treinadores, alunos e demais perfis.
        </p>

        <div className="space-y-8">
          {SECOES.map((s) => (
            <section key={s.titulo}>
              <h2 className="text-base font-semibold text-white mb-2">{s.titulo}</h2>
              <p className="text-sm text-white/60 leading-relaxed whitespace-pre-line">{formatarCorpo(s.corpo)}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Termos;
