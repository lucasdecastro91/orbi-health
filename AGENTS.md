# AGENTS.md — ORBI Pro SaaS

> Leia este arquivo no início de cada sessão. Ele contém todo o contexto necessário para continuar o desenvolvimento sem perder histórico.

---

## 1. Produto

**Nome:** ORBI Pro  
**Domínio de produção:** `app.orbipro.com.br`  
**Conceito:** Plataforma white-label para personal trainers, nutricionistas e coaches venderem seus serviços online. Cada profissional tem sua própria URL (`app.orbipro.com.br/lucas`), logo, cores e tema — sem o cliente saber que é uma plataforma compartilhada.

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

---

## 15. Bugs conhecidos e histórico de correções

| Bug | Causa raiz | Solução aplicada |
|---|---|---|
| Cards brancos no modo dark | `:root` tinha valores light; sem a classe `.dark` tudo ficava branco | `:root` agora tem valores dark; `.dark` é redundante mas necessário para Tailwind |
| "Perfil não encontrado" após cadastro | `COALESCE(..., 'aluno')` falhava por incompatibilidade de tipo com `app_role` enum | Cast explícito: `'aluno'::public.app_role` (migration 4) |
| Trigger revertia profile quando org falhava | Sem `EXCEPTION` block, erro na org fazia rollback do profile | Bloco `BEGIN...EXCEPTION WHEN OTHERS THEN RAISE WARNING` (migration 4) |
| Light mode não aplicava em todas as telas | Componentes usavam `bg-zinc-950`, `text-white` hardcoded | Overrides CSS em `.light` + `:root` defaults dark |
| Preview dark card virava claro no light mode | `bg-zinc-950` no card de preview era afetado pelo override CSS | Trocado por `style={{ backgroundColor: '#09090b' }}` inline |
