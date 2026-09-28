const SECOES = [
  {
    titulo: "1. Quem somos",
    corpo: `A ORBI Health ("nós", "plataforma") é um aplicativo de gestão de treinos, dieta e acompanhamento
    de alunos para personal trainers, nutricionistas e coaches. É operado por Lucas de Castro, responsável
    pelo tratamento dos dados pessoais descritos nesta política, nos termos da Lei Geral de Proteção
    de Dados (Lei nº 13.709/2018 — LGPD).`,
  },
  {
    titulo: "2. Quais dados coletamos",
    corpo: `Coletamos os dados necessários para o funcionamento da plataforma:

    • Dados de cadastro: nome, e-mail, telefone/WhatsApp, senha (armazenada de forma criptografada,
    nunca em texto puro) e foto de perfil.

    • Dados de saúde e desempenho físico, fornecidos por você ou pelo seu treinador: peso, medidas
    corporais, respostas de anamnese (histórico de saúde, lesões, condições preexistentes), fotos de
    avaliação postural e de evolução física, treinos realizados (cargas, séries, repetições), plano
    alimentar e refeições registradas, consumo de água, sessões de cardio e pontuação de gamificação
    (XP, sequência de dias).

    • Dados financeiros: para treinadores, dados da assinatura da ORBI (plano, status, histórico de
    pagamento) e, quando aplicável, dados de conta bancária/chave Pix para recebimento. Para alunos,
    apenas o registro de cobranças geradas pelo próprio treinador dentro da plataforma (valor, data,
    status). Não armazenamos número de cartão de crédito — o pagamento é processado por um parceiro
    especializado (ver seção 4).

    • Dados de uso: mensagens trocadas no chat interno entre treinador e aluno, token de notificação
    push do dispositivo, preferências de notificação, e registros técnicos de acesso (endereço IP,
    data/hora, tipo de dispositivo/navegador).`,
  },
  {
    titulo: "3. Como usamos os dados",
    corpo: `Usamos os dados coletados para: viabilizar o funcionamento do app (login, sincronização entre
    dispositivos, exibição de treinos/dieta/evolução); permitir que o treinador acompanhe e monte o
    plano de treino/dieta do aluno; processar pagamentos e cobranças; enviar notificações relevantes
    (novo treino, mensagem, lembrete de hidratação/refeição, vencimento de assinatura); e melhorar a
    segurança e a estabilidade da plataforma.

    Não vendemos dados pessoais a terceiros, nem os usamos para publicidade de terceiros.`,
  },
  {
    titulo: "4. Compartilhamento com terceiros",
    corpo: `Para operar a plataforma, compartilhamos dados com prestadores de serviço que atuam como
    operadores de dados em nosso nome, sob obrigação contratual de confidencialidade e segurança:

    • Provedor de hospedagem e banco de dados — armazenamento seguro de dados de cadastro, treino,
    dieta e arquivos (fotos, PDFs), e autenticação de login.

    • Provedor de hospedagem do aplicativo web.

    • Asaas — processamento de pagamentos e cobranças (certificado PCI-DSS); dados de cartão de
    crédito são tratados diretamente por eles, nunca chegam aos nossos servidores.

    • Serviços de notificação push (no app nativo e no navegador) — entrega de notificações.

    • Serviço de build e distribuição do aplicativo nativo; não tem acesso a dados de uso dos alunos
    ou treinadores.

    Não compartilhamos dados de saúde ou financeiros com nenhuma outra finalidade além das listadas
    acima, e não os cedemos a terceiros para fins comerciais próprios deles.`,
  },
  {
    titulo: "5. Dados sensíveis de saúde",
    corpo: `Dados de saúde (anamnese, avaliação postural, medidas e evolução física) são considerados
    dados pessoais sensíveis pela LGPD. Eles são coletados apenas com a finalidade de permitir que
    seu treinador monte e ajuste seu plano de treino/dieta, e ficam visíveis apenas para você e para
    o treinador/equipe responsável pela sua conta — nunca para outros alunos ou treinadores da
    plataforma.`,
  },
  {
    titulo: "6. Cookies e armazenamento local",
    corpo: `Usamos armazenamento local do navegador (localStorage) para manter sua sessão logada e
    lembrar preferências como tema claro/escuro. Não usamos cookies de rastreamento publicitário de
    terceiros.`,
  },
  {
    titulo: "7. Segurança",
    corpo: `Os dados trafegam sempre criptografados (HTTPS/TLS). O acesso ao banco de dados é
    controlado por regras de segurança em nível de linha (Row Level Security), que garantem que cada
    usuário só acesse os dados aos quais tem permissão — um aluno nunca vê dados de outro aluno, e um
    treinador só vê os dados dos seus próprios alunos.`,
  },
  {
    titulo: "8. Por quanto tempo guardamos os dados",
    corpo: `Mantemos os dados enquanto sua conta estiver ativa. Após o encerramento da conta, os dados
    são removidos ou anonimizados, exceto quando a lei exigir sua manutenção por período determinado
    (por exemplo, registros financeiros e fiscais, mantidos pelo prazo legal aplicável).`,
  },
  {
    titulo: "9. Seus direitos",
    corpo: `Nos termos da LGPD, você pode solicitar a qualquer momento: confirmação de que tratamos
    seus dados; acesso aos dados que temos sobre você; correção de dados incompletos ou desatualizados;
    anonimização, bloqueio ou eliminação de dados desnecessários; portabilidade dos dados a outro
    fornecedor; informação sobre com quem compartilhamos seus dados; e a exclusão dos dados tratados
    com base no seu consentimento. Para exercer qualquer um desses direitos, entre em contato pelo
    e-mail abaixo.`,
  },
  {
    titulo: "10. Menores de idade",
    corpo: `A plataforma não é destinada ao uso autônomo por crianças. Quando um aluno menor de idade
    é cadastrado, isso é feito sob responsabilidade do treinador e/ou responsável legal, que autoriza
    e supervisiona o tratamento dos dados de saúde necessários ao acompanhamento.`,
  },
  {
    titulo: "11. Alterações nesta política",
    corpo: `Esta política pode ser atualizada periodicamente para refletir mudanças na plataforma ou na
    legislação. A data da última atualização está sempre indicada no topo desta página.`,
  },
  {
    titulo: "12. Contato",
    corpo: `Dúvidas, solicitações sobre seus dados ou qualquer assunto relacionado a esta política podem
    ser enviados para contato@orbihealth.com.br.`,
  },
];

// Os textos acima são escritos com quebra de linha manual só por legibilidade
// no código — aqui juntamos cada parágrafo numa linha só, mantendo apenas as
// quebras entre parágrafos/itens de lista (linha em branco no texto original).
const formatarCorpo = (corpo: string): string =>
  corpo
    .split(/\n\s*\n/)
    .map((paragrafo) => paragrafo.replace(/\s*\n\s*/g, " ").trim())
    .join("\n\n");

const Privacidade = () => {
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

        <h1 className="text-2xl font-bold text-white mb-1">Política de Privacidade</h1>
        <p className="text-sm text-white/40 mb-10">Última atualização: 5 de setembro de 2026</p>

        <p className="text-sm text-white/70 leading-relaxed mb-10">
          Esta política explica quais dados a ORBI Health coleta, para que os usamos e quais direitos
          você tem sobre eles. Ela se aplica a todos os usuários da plataforma — treinadores, alunos e
          demais perfis.
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

export default Privacidade;
