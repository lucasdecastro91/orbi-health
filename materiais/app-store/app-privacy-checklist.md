# App Privacy (nutrition label) — checklist pra App Store Connect

> Isso não dá pra preencher por fora — é um formulário da própria Apple (App Store Connect → seu
> app → App Privacy). Este arquivo é o mapa de exatamente o que marcar em cada tela, baseado no
> que a ORBI Health realmente coleta (mesmo levantamento usado na Política de Privacidade).
>
> Fluxo do formulário da Apple, por categoria: você marca **se coleta** aquele tipo de dado e,
> se sim, responde 3 perguntas — **usado pra rastrear você** (sempre "Não" aqui), **vinculado à
> sua identidade** (Sim/Não) e **finalidade** (Apple dá uma lista fixa de opções pra marcar).

## Resumo rápido

**Nenhum dado da ORBI Health é usado pra rastreamento (advertising tracking) nem vendido/
compartilhado com corretores de dados.** Em todas as categorias abaixo, a resposta de
"Usado para rastrear você" é **Não**. A finalidade, em quase todas, é só **"Funcionalidade do
app"** (App Functionality) — não fazemos publicidade nem personalização de anúncios.

## Categorias a marcar como coletadas

| Categoria (Apple) | Subtipo | Vinculado à identidade? | Usado pra rastrear? | Finalidade |
|---|---|---|---|---|
| Informações de Contato | Nome | Sim | Não | Funcionalidade do app |
| Informações de Contato | E-mail | Sim | Não | Funcionalidade do app |
| Informações de Contato | Número de telefone | Sim | Não | Funcionalidade do app |
| Saúde e Fitness | Saúde (peso, medidas, anamnese, avaliação postural) | Sim | Não | Funcionalidade do app |
| Saúde e Fitness | Fitness (treinos realizados, cargas, séries) | Sim | Não | Funcionalidade do app |
| Conteúdo do Usuário | Fotos ou vídeos (foto de perfil, fotos de evolução/avaliação) | Sim | Não | Funcionalidade do app |
| Conteúdo do Usuário | E-mails ou mensagens de texto (chat treinador↔aluno) | Sim | Não | Funcionalidade do app |
| Informações Financeiras | Informações de pagamento (status/histórico de assinatura e cobranças — **não** inclui número de cartão, isso fica só com a Asaas) | Sim | Não | Funcionalidade do app |
| Identificadores | ID do dispositivo (token de notificação push) | Sim | Não | Funcionalidade do app |

## Categorias a marcar como **NÃO** coletadas

Marque "Não coletamos" (ou simplesmente não selecione) pra todas as outras categorias que a
Apple lista, incluindo: Localização, Contatos, Histórico de Navegação, Histórico de Busca,
Conteúdo de Jogos, Dados de Anúncio, Informações Confidenciais (raça, orientação sexual,
religião etc.), Áudio, Diagnóstico (crash/performance — isso é coletado pelo próprio sistema
operacional/Apple, não pela ORBI Health diretamente).

## Ponto de atenção: Dados de Uso (Usage Data)

Hoje a ORBI Health **não tem analytics de terceiros ativo** (Google Analytics, Mixpanel,
PostHog etc. — o PostHog está no roadmap mas não foi implementado ainda). Por isso, não marque
nada em "Dados de Uso" agora. **Se/quando o PostHog for implementado, esta seção do checklist
precisa ser atualizada e o formulário no App Store Connect também**, senão a declaração fica
desatualizada em relação ao que o app realmente coleta — o que é o tipo de coisa que a Apple
pode rejeitar numa auditoria.

## Perguntas que a Apple faz sobre a empresa (fora do nutrition label)

- **Third-Party Partners**: se pergunta se dados são compartilhados com terceiros que não
  processam em seu nome. Não é o caso aqui — Asaas, Supabase, Vercel etc. atuam como
  *operadores* (prestadores de serviço), não como terceiros independentes recebendo os dados
  pra uso próprio. Resposta: "dados usados apenas para fornecer o serviço".
