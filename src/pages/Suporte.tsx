const PERGUNTAS = [
  {
    pergunta: "Esqueci minha senha, e agora?",
    resposta: `Na tela de login, toque em "Esqueci minha senha" e siga as instruções enviadas pro seu
    e-mail cadastrado.`,
  },
  {
    pergunta: "Sou treinador e quero cancelar minha assinatura",
    resposta: `Entre no app, vá em Configurações → Assinatura e toque em "Cancelar assinatura". Seu
    acesso continua ativo até o fim do período já pago.`,
  },
  {
    pergunta: "Sou aluno, como acesso o app?",
    resposta: `Seu treinador cria sua conta e te envia um link de acesso (por e-mail ou WhatsApp). Se você
    ainda não recebeu esse link, fale diretamente com seu treinador.`,
  },
  {
    pergunta: "Não estou recebendo notificações",
    resposta: `Verifique se as notificações estão liberadas nas permissões do seu celular (ou do navegador,
    se estiver usando pela web) para o app ORBI Health.`,
  },
  {
    pergunta: "Encontrei um problema ou tenho outra dúvida",
    resposta: `Escreva pra gente em contato@orbihealth.com.br descrevendo o que aconteceu — se puder,
    inclua prints da tela. Respondemos o mais rápido possível.`,
  },
];

const formatarResposta = (resposta: string): string =>
  resposta.replace(/\s*\n\s*/g, " ").trim();

const Suporte = () => {
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

        <h1 className="text-2xl font-bold text-white mb-1">Suporte</h1>
        <p className="text-sm text-white/40 mb-10">Como podemos ajudar?</p>

        <div
          className="rounded-2xl p-5 mb-10"
          style={{ background: "#111814", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <p className="text-sm text-white/70 leading-relaxed">
            Precisa falar com a gente? Escreva pra{" "}
            <a href="mailto:contato@orbihealth.com.br" className="font-semibold text-white underline">
              contato@orbihealth.com.br
            </a>
            . Respondemos o mais rápido possível.
          </p>
        </div>

        <h2 className="text-base font-semibold text-white mb-4">Perguntas frequentes</h2>
        <div className="space-y-6">
          {PERGUNTAS.map((p) => (
            <section key={p.pergunta}>
              <h3 className="text-sm font-semibold text-white mb-1.5">{p.pergunta}</h3>
              <p className="text-sm text-white/60 leading-relaxed">{formatarResposta(p.resposta)}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Suporte;
