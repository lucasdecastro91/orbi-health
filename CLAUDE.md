# CLAUDE.md — ORBI Health SaaS

> Leia este arquivo no início de cada sessão. Ele contém todo o contexto necessário para continuar o desenvolvimento sem perder histórico.

---

## 1. Produto

**Nome:** ORBI Health — **ORBI Pro** (treino + dieta) e **ORBI Motion** (só treino) são os planos pagos, não o nome da plataforma.  
**Domínio de produção:** `app.orbihealth.com.br`  
**Conceito:** Plataforma white-label para personal trainers, nutricionistas e coaches venderem seus serviços online. Cada profissional tem sua própria URL (`app.orbihealth.com.br/lucas`), logo, cores e tema — sem o cliente saber que é uma plataforma compartilhada.

**Perfis de usuário previstos:**
| Perfil | `tipo_usuario` | Interface |
|---|---|---|
| Personal Trainer | `treinador` | Treinos, alunos, biblioteca de exercícios |
| Nutricionista | `nutricionista` | Dietas, refeições, substituições |
| Personal + Nutricionista | `personal_nutri` | Tudo acima combinado |

> ⚠️ Atualmente só `treinador` e `aluno` estão implementados. Os outros perfis são próximos passos.

---

## 2. Stack técnica

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Estilo | Tailwind CSS (`darkMode: ["class"]`) + shadcn/ui |
| Backend | Supabase (PostgreSQL + Auth + Storage + Edge Functions) |
| Roteamento | React Router v6 |
| Package manager | Bun (também funciona com npm) |
| Deploy previsto | Netlify ou Vercel + Supabase Cloud |

---

## 3. Arquitetura multi-tenancy

### Roteamento por slug
```
/:slug/treinador/*     → área do coach
/:slug/aluno/*         → área do aluno
/:slug                 → OrgIndex (redirect inteligente)
/auth                  → login
/cadastro              → cadastro do treinador (cria org)
```

### TenantContext (`src/contexts/TenantContext.tsx`)
- Lê o `slug` de `useParams()`
- Busca a `organization` no banco pelo slug
- Aplica o tema da org no `<html>` (classes `dark` / `light`)
- Aplica a `primary_color` da org via CSS var `--primary`
- Expõe: `{ org, orgId, slug, userRole, isLoading, reload }`

**Regra absoluta:** qualquer query que dependa da org deve usar `orgId` do contexto — nunca hardcodar IDs ou slugs.

```tsx
// ✅ Correto
const { orgId, slug } = useTenantContext();

// ❌ Errado
const orgId = "uuid-fixo";
```

---

## 4. Sistema de temas (dark / light)

### Como funciona
- `tailwind.config.ts` usa `darkMode: ["class"]`
- `src/index.css`: `:root` tem valores **dark por padrão** (evita flash branco antes do JS)
- `.dark` repete os mesmos valores dark (necessário para utilitários `dark:` do Tailwind)
- `.light` tem os valores claros
- `TenantContext` aplica/remove as classes `dark` e `light` no `<html>`
- `index.html` e `src/main.tsx` forçam `dark` antes do React montar

### Overrides de light mode (em `src/index.css`)
Para que o light mode funcione sem reescrever todo JSX, existe um bloco de overrides em `@layer utilities` que usa seletores `.light .bg-zinc-950`, `.light .text-white`, etc. para inverter cores hardcoded do Tailwind quando o tema claro está ativo.

### Regras de código para novos componentes
```tsx
// ✅ Use variáveis semânticas sempre que possível
className="bg-background text-foreground"
className="bg-card text-card-foreground"
className="border-border"

// ⚠️ Se usar cores hardcoded dark, o light mode será coberto pelos overrides
// em index.css — mas prefira semântico para novos arquivos
className="bg-zinc-950 text-white"  // funciona, mas não é ideal
```

---

## 5. Banco de dados — tabelas principais

```
auth.users               → gerenciado pelo Supabase Auth
profiles                 → id, nome, avatar_url, tipo_usuario (user_type enum)
user_roles               → user_id, role (app_role enum: treinador | aluno)
organizations            → id, name, slug (único), owner_id, logo_url,
                           primary_color, theme (dark|light), plan, active
organization_members     → org_id, user_id, role (owner|trainer|student)
alunos                   → id, user_id, treinador_id, org_id, ativo, observacoes
exercicios_base          → id, nome, grupo_muscular, descricao, video_url, org_id
modelos_treino           → id, nome, descricao, org_id, treinador_id
```

### Enums PostgreSQL
- `public.app_role` → `treinador` | `aluno`
- `public.user_type` → `treinador` | `aluno`

### Trigger principal: `handle_new_user`
Criado automaticamente em `auth.users`. Para um treinador:
1. Cria `profiles` com nome e tipo
2. Cria `user_roles`
3. Cria `organizations` com slug gerado/passado via metadata
4. Cria `organization_members` como `owner`

O bloco de criação da org usa `BEGIN...EXCEPTION` — falha silenciosa para não reverter o perfil.

---

## 6. Migrations aplicadas

| Arquivo | Conteúdo |
|---|---|
| `20260415000001` | Tabelas `organizations` + `organization_members` + helpers RLS + `slugify()` |
| `20260415000002` | Colunas `org_id` em `alunos`, `exercicios_base`, `modelos_treino` + triggers de auto-preenchimento |
| `20260415000003` | `handle_new_user` atualizado + RLS org-based |
| `20260415000004` | Fix no trigger: cast explícito `'aluno'::public.app_role`, isolamento de exceção na criação da org |
| `20260729000001` | `semanas.data_inicio`/`data_fim` (datas por bloco do macrociclo) + índices `exercicios(treino_id, ordem)`, `treinos(semana_id)`, `planos_treino(aluno_id)` — ver seção 15, timeout ao carregar exercícios. Aplicada em 2026-07-29. |
| `20260730000001` | RPC `reordenar_exercicios(jsonb)` — reordena/move exercícios num único UPDATE atômico, `SECURITY DEFINER` com `is_org_staff` validado no exercício e no treino de destino. Ver seção 15, timeout ao arrastar. Aplicada em 2026-07-30. |

> As migrations são cumulativas. Para um Supabase novo, rodar na ordem 1 → 4.  
> Rodar via: Supabase Dashboard → SQL Editor → colar e executar cada arquivo.

---

## 7. Arquivos-chave do frontend

```
src/
├── contexts/
│   └── TenantContext.tsx       ← provider de org, slug, tema e cor primária
├── pages/
│   ├── Auth.tsx                ← login com redirect para /:slug/treinador ou /:slug/aluno
│   ├── Signup.tsx              ← cadastro de treinador (2 etapas: dados + org/slug/tema)
│   ├── OrgIndex.tsx            ← /:slug → redirect inteligente
│   └── coach/
│       ├── Dashboard.tsx       ← lista de alunos com CRUD
│       └── Settings.tsx        ← perfil + tema da org + segurança
├── components/
│   ├── coach/
│   │   └── CoachLayout.tsx     ← sidebar + mobile drawer + nav links com slug
│   └── student/
│       └── StudentLayout.tsx   ← header + bottom nav com slug
├── App.tsx                     ← roteamento completo
└── index.css                   ← design system + variáveis de tema + overrides light mode
```

---

## 8. Edge Functions (Supabase)

| Função | O que faz |
|---|---|
| `create-student` | Cria usuário aluno no Supabase Auth + perfil + registro em `alunos` |
| `asaas-webhook` | Recebe status de pagamento do Asaas, fluxo **A** (treinador cobra aluno — ver seção 1, nota abaixo). Usa `ASAAS_WEBHOOK_TOKEN` (secret) — já trocado pra produção. |
| `asaas-create-charge` / `create-asaas-subscription` | Geram cobrança/assinatura no Asaas, fluxo **A** (ex: Lucas cobrando os clientes da própria consultoria — não é a ORBI cobrando o treinador, isso ainda não existe, ver abaixo). Usam `ASAAS_API_KEY` + `ASAAS_ENVIRONMENT` (`"sandbox"` \| `"production"`, **padrão é `"sandbox"` se a variável não for setada**). ⚠️ **`ASAAS_ENVIRONMENT` está em `"production"` desde antes de 2026-07-27 — NÃO é sandbox.** Toda cobrança criada é real, com dinheiro real envolvido. A nota antiga de 2026-07-08 dizendo "ainda em sandbox" estava desatualizada e já causou suposição errada mais de uma vez — **nunca presuma sandbox neste projeto sem confirmar `ASAAS_ENVIRONMENT` primeiro.** |

> **Fluxo B (ORBI cobra o treinador pelos planos ORBI Motion/Pro) já existe e está implementado** — `PlanSelection.tsx` + `create-asaas-subscription` + `asaas-webhook` (trial 7 dias, R$5 no 1º mês, valor cheio depois). Checkout com cartão tokenizado desde o commit `fb9e6d7` (2026-08-11). `organizations` tem `custom_price`/`custom_trial_days` (override manual por org, pra parcerias) e `referred_by` (schema de indicação de afiliado pronto, mas a captura via `?ref=CODIGO` no cadastro e o relatório de comissão ainda não foram construídos). Não confundir com o fluxo A acima. Esta nota estava desatualizada e já causou uma afirmação errada numa sessão (2026-08-16) — checar o código antes de repetir "ainda não existe" sobre qualquer fluxo deste projeto.

---

## 9. O que já está pronto ✅

- [x] Design premium dark (zinc-950 + amber-gold como acento)
- [x] Sistema de temas dark/light com CSS variables + toggle no painel
- [x] Multi-tenancy: slug-based routing + `TenantContext`
- [x] Cadastro de treinador com escolha de slug, nome da org e tema
- [x] Login com redirect automático para área correta (treinador/aluno)
- [x] CRUD de alunos (dashboard do treinador)
- [x] Upload de avatar (Supabase Storage, bucket `avatars`)
- [x] Migrations 1–4 documentadas e funcionais
- [x] Trigger `handle_new_user` robusto (com retry e isolamento de exceção)
- [x] RLS em todas as tabelas (por `treinador_id` e por `org_id`)

---

## 10. O que falta implementar 🔜

### Etapa 3 — Gestão de vídeos / exercícios
- Conta admin mantém biblioteca global de links YouTube
- Cada treinador registra seus próprios exercícios com vídeo
- Filtros por grupo muscular, busca por nome

### Etapa 4 — White-label visual completo
- Painel para o treinador customizar: logo, nome da plataforma, cor primária
- Upload de logo para Supabase Storage
- Preview em tempo real
- Exportar como PWA com ícone da marca do treinador

### Etapa 5 — Dieta estruturada
- Tabela de substituições alimentares (o dono vai fornecer uma planilha)
- Criação de planos alimentares com refeições
- Aluno vê dieta do dia com opções de substituição
- Registro de refeições realizadas (check-in alimentar)

### Etapa 6 — Pagamentos (Asaas)
- Treinador configura planos de assinatura
- Aluno paga para liberar acesso
- Webhook Asaas → ativa/desativa aluno automaticamente

### Etapa 7 — Admin dashboard
- Visão geral de todas as orgs (superadmin)
- Métricas: orgs ativas, alunos totais, receita MRR
- Gerenciar planos: free / pro / enterprise

### Etapa 8 — Deploy e CI/CD
- Frontend: Netlify ou Vercel com build automático no push
- Supabase: projeto de produção separado do dev
- Variáveis de ambiente: `.env.production` com URLs corretas
- Domínio customizado por org (CNAME para treinadores pro)

### Etapa 9 — WhatsApp via Evolution API (em beta, 2026-07)
- Decisão: Evolution API auto-hospedada (não a API oficial da Meta) — motivo: custo fixo e previsível (VPS) em vez de custo variável por instância/mensagem (ex: Z-API cobra por número/mês).
- Infra: VPS Hostinger (`wpp.orbihealth.com.br`, IP no painel Hostinger), separado do Supabase/Vercel — Evolution API não roda em serverless, precisa de processo persistente pra manter o WebSocket com o WhatsApp. Docker Compose (Evolution API + Postgres dedicado + Redis + Caddy/TLS) em `infra/evolution-api/`. Plano inicial: KVM1 (1 vCPU/4GB), ~R$52,99/mês, sem contrato longo — fase de teste.
- Fase atual: **beta fechado com 2-3 treinadores parceiros**. Escopo cresceu de "só lembretes" para **chat completo (via e volta)** dentro do ORBI, tipo CRM — decidido em 2026-07-26 depois de simular as duas opções.
- Schema aplicado: `organizations.whatsapp_status`/`whatsapp_instance_name` (migration `20260726000003`); `alunos.telefone`, `whatsapp_messages` (vinculada a `aluno_id` OU `lead_id`, nunca os dois — CRM de leads usa a mesma tabela/tela), `whatsapp_connection_events`, `whatsapp_message_queue` (migration `20260726000004`). Realtime ligado em `whatsapp_messages`.
- Edge Functions: `whatsapp-instance` (QR/status, JWT), `whatsapp-webhook` (recebe conexão + mensagens da Evolution API, token por query string, sem JWT), `whatsapp-send-message` (envia texto avulso, JWT).
- **Problema conhecido, resolvido:** alunos migrados de outra plataforma não têm anamnese preenchida, então `anamneses.whatsapp` sozinho não bastava como fonte do telefone. `alunos.telefone` é a fonte oficial (obrigatório no cadastro de aluno novo daqui pra frente); `anamneses.whatsapp` fica só como fallback de leitura. Falta construir a tela de "completar números" pros alunos já ativos sem telefone.
- Matching de número (WhatsApp → aluno/lead) compara só os últimos 8 dígitos, pra não depender de formatação exata de DDI/9º dígito.
- **Chat via WhatsApp é só pra Leads (CRM), não pra aluno já ativo** — decidido em 2026-07-27. Já existe um chat interno completo (tabela `mensagens`, tempo real + push) entre treinador e aluno em `src/pages/coach/Mensagens.tsx` / `src/pages/student/MensagensAluno.tsx`. Construir um chat via WhatsApp na ficha do aluno (`StudentDetails.tsx`) seria redundante — não faz parte do escopo.
- **Envio de áudio no chat de WhatsApp**: adiado, não é prioridade agora. Quando for feito, é só no chat de Leads (`Leads.tsx`), que é o único chat via WhatsApp existente.
- **Notificações de cobrança e atualização agora são multi-canal** (decidido em 2026-07-27): antes só existia notificação interna (sino) pra cobrança, e só push pra atualização. Agora:
  - Cobrança nova/vencida (`asaas-create-charge`, `asaas-webhook` no evento `PAYMENT_OVERDUE` da cobrança avulsa): sino + push + WhatsApp + email (`enviar-email` com `type: "cobranca_gerada"` / `"cobranca_atrasada"`).
  - Atualização vencendo/vencida (`notify-scheduled`, `handleUpdateReminder`): sino + push + WhatsApp (sem email — decidido que email é overkill pra um lembrete rotineiro).
  - Todas essas integrações de WhatsApp reusam a mesma lógica de `toWhatsappNumber()` (prefixa `55`) e só disparam se `organizations.whatsapp_status === "connected"` — nunca bloqueiam o fluxo principal se falharem (best-effort, erro só vai pro log).
- Ver seção 14 pra regra de arquitetura (WhatsApp é sempre camada adicional, nunca substitui push/email) e pro padrão visual (cards `#141417` + `var(--cp-gradient)`/`var(--cp-text)`, nunca cor hardcoded no botão).

---

## 11. Padrões de desenvolvimento

### Sempre usar
```tsx
// Contexto da org em qualquer página dentro de /:slug/*
const { org, orgId, slug } = useTenantContext();

// Toast para feedback
const { toast } = useToast();
toast({ title: "Sucesso!", description: "..." });
toast({ title: "Erro", description: err.message, variant: "destructive" });

// Navegação preservando o slug
const navigate = useNavigate();
navigate(`/${slug}/treinador/configuracoes`);
```

### Estilo dos componentes
```tsx
// Botão primário (padrão do projeto)
<Button
  className="h-10 px-5 rounded-xl text-black font-semibold"
  style={{ background: "linear-gradient(135deg, hsl(42 95% 58%), hsl(35 92% 44%))" }}
>

// Card/seção
<div className="rounded-2xl border border-white/6 bg-white/3">

// Input
<Input className="bg-white/5 border-white/10 text-white rounded-xl h-11 focus:border-amber-500/50" />

// Label
<Label className="text-xs text-white/50 uppercase tracking-wider">
```

### Queries Supabase
```tsx
// Sempre usar maybeSingle() em vez de single() quando o registro pode não existir
const { data } = await supabase.from("tabela").select("*").eq("id", id).maybeSingle();

// Verificar sessão antes de queries autenticadas
const { data: { session } } = await supabase.auth.getSession();
if (!session) { navigate("/auth"); return; }
```

### RLS — como funciona
- Todas as tabelas têm RLS ativo
- Queries do cliente são automaticamente filtradas pela sessão do usuário
- Funções `is_org_owner(org_id)` e `is_org_member(org_id)` usam `auth.uid()` internamente
- Edge Functions usam `service_role` key e bypassam RLS — cuidado com permissões

---

## 12. Variáveis de ambiente

```env
# .env.local (não commitar)
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

O cliente Supabase está em `src/integrations/supabase/client.ts`.

---

## 13. Como rodar localmente

```bash
# Instalar dependências
bun install   # ou: npm install

# Rodar em dev
bun dev       # ou: npm run dev
# Abre em http://localhost:8080

# Build de produção
bun run build
```

---

## 14. Decisões de arquitetura tomadas

| Decisão | Motivo |
|---|---|
| Slug na URL em vez de subdomínio | Mais simples de hospedar, sem DNS wildcard. Possível migrar para subdomínio no futuro. |
| Tema salvo na `organizations` em vez de `localStorage` | Multi-dispositivo, afeta todos os usuários da org automaticamente |
| `:root` dark por padrão no CSS | Evita flash branco antes do JS aplicar a classe `dark` |
| CSS overrides `.light .text-white` em vez de reescrever todos os componentes | Pragmático: cobre 100% dos casos sem tocar em cada arquivo |
| `handle_new_user` cria org em bloco `BEGIN...EXCEPTION` | Perfil é crítico; falha na org não pode reverter o perfil |
| `maybeSingle()` em vez de `single()` | `single()` lança erro quando não encontra; `maybeSingle()` retorna null |
| WhatsApp (Evolution API) é sempre canal adicional, nunca substitui push/email | Automação não-oficial tem risco real de banimento de número (não é zero). Se um número for banido, o treinador não pode ficar sem lembrete de um dia pro outro — a lógica de envio deve sempre manter push/email funcionando independente do status do WhatsApp, nunca gatear um recurso só por ele |
| URL do servidor Evolution API guardada por organização, não hardcoded | Modelo atual é 1 instância compartilhada pra todas as orgs do beta; se crescer, vai precisar dividir orgs entre vários servidores (sharding) — guardar a URL por org desde o início evita reescrever a integração depois |
| Botões/elementos de destaque em componentes novos usam `var(--cp-gradient)` + `var(--cp-text)` (nunca cor hardcoded) | `--cp-*` já é a cor primária configurável por org (definida em `TenantContext.tsx`/`lib/colors.ts`); hardcodar uma cor quebra o white-label pra orgs que não usam essa cor. `--cp-text` hoje sempre resolve pra branco nos presets existentes |
| Cards elevados usam `#141417` + borda `rgba(255,255,255,0.09)` + sombra dupla (`0 10px 28px rgba(0,0,0,.45)` + inset), não `bg-zinc-950` simples | Padrão "alto relevo" já em uso no `Dashboard.tsx` (`CARD_BG`/`CARD_SHADOW`) — manter consistência visual entre telas novas e o dashboard |

---

## 15. Bugs conhecidos e histórico de correções

| Bug | Causa raiz | Solução aplicada |
|---|---|---|
| App inteiro parou de responder ("Disk IO Budget" esgotado no painel Supabase, compute Nano), 2026-08-27 | `cron.job_run_details` (231MB) + `net._http_response` (85MB) — logs internos do pg_cron/pg_net, nunca limpos — somavam 316MB de um banco de 353MB. 3 cron jobs rodando a cada minuto geravam volume alto de inserts nessas tabelas, esgotando o orçamento de IO do compute pequeno. Storage/imagens **não tinham nada a ver** — são recursos separados do disco do Postgres, apagar imagens não teve efeito nenhum nisso. | Restart do projeto (destravou conexões na hora, não devolveu o IO Budget sozinho) + `TRUNCATE` manual das duas tabelas (banco caiu pra 37MB) + cron job novo `limpar-logs-cron-net` (roda 3h da manhã, apaga logs com mais de 3 dias) pra nunca mais acumular sem limite. |
| Cards brancos no modo dark | `:root` tinha valores light; sem a classe `.dark` tudo ficava branco | `:root` agora tem valores dark; `.dark` é redundante mas necessário para Tailwind |
| "Perfil não encontrado" após cadastro | `COALESCE(..., 'aluno')` falhava por incompatibilidade de tipo com `app_role` enum | Cast explícito: `'aluno'::public.app_role` (migration 4) |
| Trigger revertia profile quando org falhava | Sem `EXCEPTION` block, erro na org fazia rollback do profile | Bloco `BEGIN...EXCEPTION WHEN OTHERS THEN RAISE WARNING` (migration 4) |
| Light mode não aplicava em todas as telas | Componentes usavam `bg-zinc-950`, `text-white` hardcoded | Overrides CSS em `.light` + `:root` defaults dark |
| Preview dark card virava claro no light mode | `bg-zinc-950` no card de preview era afetado pelo override CSS | Trocado por `style={{ backgroundColor: '#09090b' }}` inline |
| Notificação de aluno inativo podia ser reenviada antes do período passar | Não checava se já existia notificação de `inatividade` recente antes de inserir uma nova | Checa `created_at > NOW() - 7 dias` antes de inserir (migration `20260609000002_inatividade_dedup_7dias.sql`) |
| Envio de WhatsApp pra lead/aluno falhava com `evolution_api_error` (2026-07-27) | `alunos.telefone`/`leads.whatsapp` são salvos só com DDD (10-11 dígitos, sem `55`). A Evolution API interpreta o DDD como código de país — ex: DDD 82 é lido como Coreia do Sul — e rejeita o envio | `whatsapp-send-message` agora usa `toWhatsappNumber()`, que prefixa `55` quando o número tem 10 ou 11 dígitos, antes de chamar `sendText` |
| Lembretes automáticos (refeição/hidratação/treino/motivacional) nunca disparavam | `notify-scheduled` consultava tabelas que não existem (`dieta_refeicoes`, `hydration_logs`, etc.); `error` do Supabase nunca era checado, então falhava silenciosamente | Reescrito contra o schema real (`diets`/`diet_meals`, `registros_agua`, `trainingSchedule.ts` portado) — ver ROADMAP.md, 2026-07-07 |
| `notification_logs` não existia — dedup de `update_reminder` duplicava notificação todo dia | Mesma causa acima: insert/select em tabela inexistente, erro ignorado | Tabela criada (migration `20260707000004_notification_logs.sql`) |
| Nenhuma notificação push jamais foi entregue de verdade, nem as que "já funcionavam" | `notify-scheduled` mandava `{ subscriptions: [...] }` pra `send-push`, que espera `{ user_ids: [...] }` desde uma reescrita anterior (ver `src/lib/push.ts` pro formato certo) — `send-push` sempre respondia 400 | `sendPush()` corrigido pra usar `user_ids` (v12, 2026-07-08), testado ponta a ponta. ✅ `notify-trainer-action/index.ts` (v9) checado em 2026-08-16, já usa `user_ids` corretamente — bug já não existe mais nessa função (não foi possível identificar quando foi corrigido, mas está confirmado no código atual). |
| Ícone do app (splash screen) trocado em Configurações nunca aparecia — ficava preso no ícone antigo (bug recorrente, já tinha acontecido antes) | `App.tsx` cacheava `icon_url` em `localStorage["gs_icon_url"]` na primeira visita e nunca revalidava contra o banco — Camadas 1 e 2 do fluxo de detecção de brand liam só o cache e retornavam sem consultar o Supabase. O `Settings.tsx` grava o `icon_url` novo certinho na tabela `organizations`; o problema era 100% do lado da leitura. | Camadas 1 e 2 agora sempre fazem uma query leve (`select icon_url`) pra revalidar antes de finalizar o carregamento, atualizando o cache com o valor fresco a cada load — nunca mais confia só no localStorage pro ícone. Testado ao vivo: mudei o `icon_url` direto no banco, recarreguei a página, confirmei que o cache atualizou pro valor novo (2026-07-12). |
| `canceling statement due to statement timeout` ao abrir a aba Treinos de um aluno — as colunas de sessão ficavam em "Carregando..." e depois erravam (2026-07-29) | **Era o número de queries simultâneas, não o custo de cada uma.** Cada coluna de sessão (`TrainingExercises`) buscava por conta própria: `exercicios` do seu treino + `exercicios_base` da org + `custom_techniques` da org. Com 5 sessões = **15 requisições concorrentes** no mount, das quais 10 eram idênticas entre si. Cada uma paga planning (~110ms, por causa das 3 policies RLS de `exercicios`) + latência de rede, contra uma instância que já tem carga de fundo constante (Realtime com 1,45M eventos WAL, 3 cron jobs por minuto, pg_net). O `statement_timeout` do role `authenticated` é **8s**. | `WeekDetails` passou a fazer **uma query aninhada** `treinos + exercicios(*)` para o bloco inteiro e repassa os exercícios por prop; `exercicios_base` e `custom_techniques` são buscadas 1× por bloco, não 1× por coluna. De 15 requisições para 3. É o mesmo padrão que o app do **aluno** já usava (`semanas → treinos → exercicios` numa query) e que nunca deu timeout. Medido: 122ms para os 72 exercícios de um plano inteiro. |
| ⚠️ Duas hipóteses **descartadas** para o timeout acima — não repetir a investigação (2026-07-29) | (1) **Índices de FK faltando**: era verdade que nenhuma FK do caminho `planos_treino → semanas → treinos → exercicios` tinha índice, e corrigir isso deu ganho real e mensurável (custo 111.872 → 1.212, 92×, plano virou `Index Scan`) — migration `20260729000001`. **Mas o timeout continuou depois.** (2) **`auth_rls_initplan`**: o advisor aponta que a policy "Ver exercícios" reavalia `auth.uid()` por linha. Testado com `ALTER POLICY` dentro de transação + rollback, usando `(select auth.uid())`: tempos **idênticos** ao controle (107/5.5/4.1ms vs 124/5.7/4.1ms), porque com Index Scan só 8 linhas são varridas. | Lição: nesta base a query de exercícios custa **4ms com plano cacheado** e ~110ms no primeiro planning — nenhuma chega perto dos 8s. Ao investigar timeout aqui, **contar quantas requisições a tela dispara em paralelo antes de otimizar query individual**. `pg_stat_statements` acumula desde `stats_reset` (57 dias na época), então médias e máximos ali **não** refletem o efeito de uma migration recente. |
| Arrastar exercício "travava" e não dava pra soltar acima/abaixo de outro, nem em outra sessão (2026-07-29) | **Duas causas somadas.** (1) Um `useDroppable` foi colocado envolvendo a **coluna inteira** (pra permitir reordenar sessões). Sob `collisionDetection={pointerWithin}` esse alvo gigante contém o ponteiro ao mesmo tempo que os `row:<id>` de cada exercício e disputa com eles — quando a coluna ganha, o `overData` não tem `exerciseId` e o exercício vai pro fim da lista em vez da posição sob o cursor. (2) O card arrastado usava `transform` no próprio nó, dentro de um container com `overflow-x-auto`; ao sair da coluna ele era **cortado pelo clipping do overflow**, o que dava a sensação de arraste travado. | (1) O droppable da coluna cobre só o **header** (`colhead:<id>`), nunca a coluna toda — o handler de coluna lê apenas `overData.trainingId`, então header, `col:` ou `row:` servem todos como destino. (2) `<DragOverlay>` do dnd-kit renderiza o card num portal fora do container, imune ao clipping; o nó original só baixa a opacidade. Somado a isso, `borderTop` na cor primária no card sob o cursor, que antes não tinha **nenhuma** pista visual de onde o item ia cair (o `isOver` alimentava só um `data-over` sem CSS). |
| `statement timeout` ao arrastar exercício, mesmo com a leitura já otimizada (2026-07-29/30) | **Qualquer UPDATE em `public.exercicios` custa ~160ms nesta base**, mesmo por chave primária (medido; não é o `treino_id`, não é REPLICA IDENTITY — as tabelas nem estão na publicação do Realtime). O drag reindexava a coluna inteira com N updates individuais: primeiro em `Promise.all` (disputa de lock), depois em série (soma + 1 round-trip HTTP por linha). Medido: **8 updates em série = 1021ms** no banco, contra 193ms de um único update em massa. Pior que a lentidão: N statements independentes gravavam **parcialmente** quando um estourava, deixando a coluna meio reordenada até o próximo reload. | RPC `reordenar_exercicios(jsonb)` (migration `20260730000001`): recebe `[{id, treino_id, ordem}]` e faz **um** UPDATE atômico. Medido: 8 linhas em **26ms** (40× mais rápido). É `SECURITY DEFINER`, então valida permissão explicitamente e em dobro — `is_org_staff` no exercício **e** no treino de destino (sem o segundo, um payload forjado moveria exercícios pra outra org). Testado: aluno não-staff chamando a função afeta 0 linhas. No client, update otimista no estado + 1 chamada. **Regra prática: reordenação em lote neste projeto vai por RPC, nunca N updates.** |
| ⚠️ Ordens duplicadas em `exercicios` (`treino_id`, `ordem`) — 18 grupos encontrados em 2026-07-30 | `ordem` não tem constraint de unicidade. `handleBulkAddExercises` calcula `startOrdem` com `Math.max(...exercises.map(e => e.ordem))` sobre o estado **local** — quando esse estado estava defasado (ver bug do `exercisesByTraining` acima), o número colidia. `handleDuplicateWeek`/`handleDuplicateTraining` também copiam `ordem: ex.ordem` como está, propagando duplicatas existentes. | Com ordem duplicada o `.order("ordem")` devolve ordem **indefinida** entre os empatados, e a lista pode alternar entre reloads (parece que "a ordem voltou"). O novo `handleDragEnd` grava `0..N-1` para a coluna inteira, então **qualquer arraste normaliza aquela coluna** — as duplicatas se resolvem conforme o uso. Se precisar limpar de uma vez: `UPDATE ... SET ordem = t.rn-1 FROM (SELECT id, row_number() OVER (PARTITION BY treino_id ORDER BY ordem, created_at) rn ...)`. |
| Classes `green-*` do Tailwind não produzem verde — e a variante com opacidade escapa da regra (2026-07-30) | `src/index.css` (bloco "green → primary", ~linha 815) reescreve `.text-green-400/500/600`, `.bg-green-500/600`, `.border-`, `.ring-`, `.fill-`, `.stroke-` para a **cor primária da org**, com `!important` — verde era a cor original do app e virou o gancho do white-label. Mas o override casa com o seletor exato: `text-green-500/70` gera `.text-green-500\/70`, que **não** é alcançado. Resultado observado: kcal do alimento principal (`text-green-500`) saía âmbar e o do substituto (`text-green-500/70`) saía verde de verdade, lado a lado. | Para "cor primária", usar as vars explicitamente (`var(--cp-400)`, `rgba(var(--cp-rgb), 0.6)`) em vez de depender do override — fica claro na leitura e a opacidade funciona. Para verde de verdade, usar outra família (`emerald-*`, `lime-*`), que não é reescrita. **Nunca assumir que `green-*` pinta verde neste projeto.** |
| Cor primária da org não aplicava (contorno/borda saía branco) em código novo | Uso de variáveis CSS que **não existem**: `var(--cp-color)`, `hsl(var(--cp-hsl-1))`. CSS inválido é descartado silenciosamente e a propriedade cai no valor herdado (branco), sem erro no console — daí passar batido. | As vars reais são só estas, documentadas em `src/lib/colors.ts:6-15` e setadas por `TenantContext`/`CoachLayout`/`Login`/`Settings`: `--cp-gradient`, `--cp-rgb` (`"r, g, b"`, pra `rgba(var(--cp-rgb), 0.3)`), `--cp-400`/`--cp-500`/`--cp-600` (já vêm como `hsl(...)` completo, usar direto como cor) e `--cp-text`. Não inventar nomes novos — conferir em `colors.ts` antes. |

---

## 16. Regras de segurança na implementação

Antes de qualquer alteração de código:
1. Leia a estrutura/arquivo existente antes de refatorar — não assuma, confirme.
2. Prefira mudanças incrementais e testáveis a reescritas grandes de uma vez só.
3. Não quebre o que já funciona. Se notar que uma alteração está crescendo além do que foi pedido, pare e confirme antes de continuar.
4. Antes de uma mudança arriscada (migration, Edge Function, alteração de schema, cron job), avise o risco **antes** de implementar, não depois.
5. Teste localmente antes de qualquer deploy real — preview no navegador, `npx tsc --noEmit -p tsconfig.app.json`, ou invocar a Edge Function manualmente via SQL/MCP e conferir o resultado.
6. **Deploy do frontend (Vercel) é sempre manual, feito pelo Lucas — nunca execute `vercel --prod` ou equivalente**, mesmo que pareça conveniente ou seja pedido de forma casual. Migrations e deploys de Edge Function do Supabase pedem confirmação explícita antes de aplicar.
7. Sempre que um teste em preview/produção criar dados reais (linhas de teste, subscriptions, notificações), apague-os antes de encerrar a tarefa.
8. **Sempre que algo que está registrado como pendente/etapa no `ROADMAP.md` for concluído nesta sessão, pergunte ao Lucas se quer registrar como concluído no ROADMAP assim que terminar** — não espere ele pedir, e não marque como concluído sozinho sem perguntar primeiro. Motivo: o ROADMAP.md já teve mais de um item que continuava listado como pendente muito depois de já estar pronto/deployado (import de treino via PDF, cartão tokenizado — achados em 2026-08-20 já implementados há dias sem o arquivo refletir isso), o que gera trabalho de verificação repetido e desalinhamento sobre o que falta de verdade.

Resposta padrão ao final de uma tarefa com mudanças de código:
```
Alterações realizadas:
- [mudança 1]
- [mudança 2]

Testado:
- [teste 1]
- [teste 2]

Atenção: [se houver]
```

---

## 17. Padrões de código

### Nomeação
- Componentes React: PascalCase (`MeusClientes.tsx`)
- Funções/hooks: camelCase (`criarPlano()`, `useTenantContext()`)
- Variáveis: camelCase (`planType`, `alunosCount`)
- Constantes: UPPER_SNAKE_CASE (`AGUA_META_ML`, `VAPID_PUBLIC_KEY`)

### Estrutura de pastas (dentro de `src/`)
```
src/
  components/   → componentes reutilizáveis
  pages/        → rotas
  hooks/        → custom hooks
  contexts/     → TenantContext e afins
  integrations/ → cliente Supabase
  lib/          → funções utilitárias, cálculos, tipos auxiliares
```

### TypeScript
- Tipifique props, retornos e variáveis críticas.
- Use interfaces para objetos complexos.
- `any` é aceitável (e comum no projeto) em resultados de query do Supabase com embeds/joins, onde o tipo inferido não reflete a estrutura real — mas evite em código novo que não depende de Supabase.

### Async/Await e erros do Supabase — regra crítica
Historicamente a causa raiz mais comum de bug silencioso neste projeto é ignorar o `error` de uma query. Sempre desestruture e cheque:
```tsx
const { data, error } = await supabase
  .from("tabela")
  .select("*")
  .eq("id", id)
  .maybeSingle();

if (error) {
  console.error("Erro:", error);
  return null;
}
```
Em 2026-07-07/08, três bugs reais de produção vieram exatamente disso: `notification_logs` não existia e o dedup de notificações falhava sem avisar; `push_subscriptions` tinha o nome de coluna errado e nenhum push chegava; `send-push` recebia um formato de payload que ela não lê mais, e sempre respondia 400 sem que ninguém percebesse (ver seção 15).

### Variáveis de ambiente
- `.env.local` pra desenvolvimento, nunca commitado.
- Prefixo obrigatório `VITE_*` pro Vite expor a variável no client (ex: `VITE_SUPABASE_URL`, `VITE_VAPID_PUBLIC_KEY`).
