import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getColorEntry } from "@/lib/colors";

// ----------------------------------------------------------------
// Constante — owner da org Get Shape
// ----------------------------------------------------------------
const GET_SHAPE_EMAIL = "lucas.melo1991@gmail.com";

// ----------------------------------------------------------------
// Tipos
// ----------------------------------------------------------------

export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  logo_url: string | null;
  /** Logo específica pra tela de login — opcional, cai em logo_url se null.
   *  Existe porque o header do app é sempre escuro (a logo dele pode assumir
   *  texto branco sempre), mas o login segue o tema da org — uma logo pensada
   *  só pra fundo escuro fica ilegível se a org estiver no tema claro. */
  login_logo_url: string | null;
  /** Ícone quadrado (favicon, ícone PWA). Null = sem ícone customizado. */
  icon_url: string | null;
  primary_color: string;
  theme: "dark" | "light";
  plan: "free" | "pro" | "enterprise";
  /** Plano de produto — controla quais módulos estão disponíveis */
  plan_type?: "motion" | "pro" | "balance" | "clinic";
  active: boolean;
  created_at: string;
  updated_at: string;
  /** Se true, toda a org usa branding Get Shape */
  is_gs_brand: boolean;
  /** Descrições globais por tipo de série, editáveis pelo treinador */
  serie_config?: Record<string, string> | null;
  /** True quando o treinador completou ou dispensou o checklist de onboarding */
  onboarding_completed: boolean;
  /** Tipos de agendamento configuráveis (Agenda) — label + cor, editável pelo dono da org */
  agendamento_tipos?: { key: string; label: string; color: string }[] | null;
  /** Meta de faturamento mensal (barra de progresso no topo), editável pelo treinador */
  meta_faturamento: number;
}

export type OrgRole = "owner" | "trainer" | "student";

interface TenantContextValue {
  /** Dados completos da organização do slug atual */
  org: Organization | null;
  /** Atalho para org.id */
  orgId: string | null;
  /** Slug lido da URL (/:slug/) */
  slug: string | null;
  /** Papel do usuário logado dentro desta org */
  userRole: OrgRole | null;
  /** True enquanto carrega a org do banco */
  isLoading: boolean;
  /** True se a org atual é a Get Shape (branding personalizado) */
  isGetShapeOrg: boolean;
  /** Recarrega os dados da org (útil após atualizar configurações) */
  reload: () => void;
}

// ----------------------------------------------------------------
// Contexto
// ----------------------------------------------------------------

const TenantContext = createContext<TenantContextValue>({
  org: null,
  orgId: null,
  slug: null,
  userRole: null,
  isLoading: true,
  isGetShapeOrg: false,
  reload: () => {},
});

export const useTenantContext = (): TenantContextValue =>
  useContext(TenantContext);

// ----------------------------------------------------------------
// Provider
// ----------------------------------------------------------------

interface TenantProviderProps {
  children: ReactNode;
}

export const TenantProvider = ({ children }: TenantProviderProps) => {
  const { slug } = useParams<{ slug: string }>();

  const [org,             setOrg]             = useState<Organization | null>(null);
  const [userRole,        setUserRole]        = useState<OrgRole | null>(null);
  const [isLoading,       setIsLoading]       = useState(true);
  const [isGetShapeOrg,   setIsGetShapeOrg]   = useState(false);
  const [reloadKey,       setReloadKey]       = useState(0);

  const reload = () => setReloadKey((k) => k + 1);

  // ── Carrega org pelo slug ──────────────────────────────────────
  useEffect(() => {
    if (!slug) {
      setIsLoading(false);
      return;
    }
    loadOrg(slug);
  }, [slug, reloadKey]);

  // ── Aplica tema da org ao documento ───────────────────────────
  useEffect(() => {
    if (!org) return;

    if (org.theme === "light") {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
    }

    return () => {
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
    };
  }, [org?.theme]);

  // ── Aplica cor primária customizada da org ─────────────────────
  // gs_brand já está atualizado antes de setOrg() ser chamado em loadOrg,
  // garantindo que este effect leia o valor correto na primeira execução.
  useEffect(() => {
    if (!org) return;

    const effectiveColor = org.primary_color;
    const color = getColorEntry(effectiveColor);
    const isLightTheme = org.theme === "light";
    applyColorVars(color.hsl, color.rgb, color.gradient, color.light, color.mid, color.textOn, isLightTheme);

    return () => {
      const def = getColorEntry("#16a34a");
      applyColorVars(def.hsl, def.rgb, def.gradient, def.light, def.mid, def.textOn, isLightTheme);
    };
  }, [org?.primary_color, org?.theme, isGetShapeOrg]);

  // ── Aplica branding de aba (título + favicon) por tenant ──────
  useEffect(() => {
    if (!org) return;

    if (isGetShapeOrg) {
      document.title = "Get Shape";
      // GS: usa icon_url se disponível, senão favicon padrão Get Shape
      setFavicon(org.icon_url ?? "/favicon-gs.png");
      setAppleTouchIcon(org.icon_url ?? "/favicon-gs.png");
      setAppleWebAppTitle("Get Shape");
    } else {
      document.title = org.name ?? "ORBI Health";
      // Outros tenants: usa icon_url se disponível, senão o favicon padrão da
      // ORBI. Precisa SEMPRE setar um novo href (nunca só remover o <link>) —
      // o navegador não limpa visualmente o ícone da aba quando o elemento
      // some do DOM, só quando um href novo é aplicado. Sem isso, trocar de
      // uma org com favicon próprio (ex: Get Shape) pra uma sem, na mesma aba,
      // deixava o ícone "grudado" no anterior (achado ao vivo, 2026-08-26).
      setFavicon(org.icon_url ?? "/logos/orbi-app-icon-hd.png");
      setAppleTouchIcon(org.icon_url ?? "/logos/orbi-app-icon-hd.png");
      setAppleWebAppTitle(org.name ?? "ORBI Health");
    }

    return () => {
      document.title = "ORBI Health";
      setFavicon("/logos/orbi-app-icon-hd.png");
      setAppleTouchIcon("/logos/orbi-app-icon-hd.png");
      setAppleWebAppTitle("ORBI Health");
    };
  }, [org?.name, org?.icon_url, isGetShapeOrg]);

  // ── Função de carregamento ────────────────────────────────────
  const loadOrg = async (slugParam: string) => {
    setIsLoading(true);
    try {
      // 1. Busca a org pelo slug
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select("*")
        .eq("slug", slugParam)
        .eq("active", true)
        .maybeSingle();

      if (orgError || !orgData) {
        setOrg(null);
        setUserRole(null);
        setIsGetShapeOrg(false);
        return;
      }

      // 2. Busca usuário atual (uma única chamada para tudo abaixo)
      const { data: { user } } = await supabase.auth.getUser();

      // 3. ── Detecção da org Get Shape ──────────────────────────
      //
      // Estratégia em duas camadas:
      //
      // a) Owner logado: se o usuário atual É o dono desta org E tem o
      //    e-mail da Get Shape → persiste o org.id em gs_org_id.
      //    Isso serve de "âncora" para qualquer outro usuário no mesmo
      //    aparelho (alunos, outros coaches) reconhecerem a org.
      //
      // b) Qualquer usuário: se org.id bate com o gs_org_id persistido
      //    anteriormente → esta é a org Get Shape, ativa o branding.
      //
      // c) Org diferente: limpa gs_brand para não contaminar outros
      //    treinadores visitados no mesmo aparelho.

      const storedGsOrgId = localStorage.getItem("gs_org_id");
      let gsOrg = false;

      if (user?.email === GET_SHAPE_EMAIL && user?.id === orgData.owner_id) {
        // Camada 1: owner da Get Shape → ancora o org_id e o slug
        localStorage.setItem("gs_org_id",   orgData.id);
        localStorage.setItem("gs_org_slug", orgData.slug);
        localStorage.setItem("gs_brand",    "1");
        gsOrg = true;
      } else if (storedGsOrgId === orgData.id) {
        // Camada 2: aluno ou membro da GS no mesmo aparelho (localStorage já populado)
        localStorage.setItem("gs_brand", "1");
        gsOrg = true;
      } else if (orgData.is_gs_brand === true) {
        // Camada 3: dispositivo novo (aluno de outra máquina) — confia na flag do banco
        // Persiste as chaves para que visitas futuras usem a camada 2 (mais rápida)
        localStorage.setItem("gs_org_id",   orgData.id);
        localStorage.setItem("gs_org_slug", orgData.slug);
        localStorage.setItem("gs_brand",    "1");
        gsOrg = true;
      } else {
        // Org diferente — limpa flags para não vazar branding
        localStorage.removeItem("gs_brand");
      }

      // Atualiza estado ANTES de setOrg para que os effects
      // de cor/aba leiam os valores corretos na primeira renderização.
      setIsGetShapeOrg(gsOrg);

      // 4. Seta a org (dispara re-render + effects)
      setOrg(orgData as unknown as Organization);

      // 5. Busca papel do usuário nesta org
      if (user) {
        const { data: member } = await supabase
          .from("organization_members")
          .select("role")
          .eq("org_id", orgData.id)
          .eq("user_id", user.id)
          .maybeSingle();

        setUserRole((member?.role as OrgRole) ?? null);
      }
    } catch (err) {
      console.error("[TenantContext] Erro ao carregar org:", err);
      setOrg(null);
      setUserRole(null);
      setIsGetShapeOrg(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <TenantContext.Provider
      value={{
        org,
        orgId: org?.id ?? null,
        slug: slug ?? null,
        userRole,
        isLoading,
        isGetShapeOrg,
        reload,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

// ----------------------------------------------------------------
// Utilitário: troca o favicon da aba do navegador
// ----------------------------------------------------------------
function setFavicon(href: string) {
  const links = document.querySelectorAll<HTMLLinkElement>(
    'link[rel="icon"], link[rel="shortcut icon"]'
  );
  links.forEach((el) => { el.href = href; });

  if (links.length === 0) {
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = href;
    document.head.appendChild(link);
  }
}

// index.html tem 2 <link rel="apple-touch-icon"> estáticos (192/512px) —
// é o que o iOS usa pro ícone da tela de início ao "Adicionar à Tela de
// Início" (não lê o <link rel="icon"> normal, nem o manifest.json, pra
// esse fluxo). Mesmo padrão do setFavicon: reescreve os <link> existentes
// em vez de trocar por um só, então os dois tamanhos continuam declarados.
// Ressalva do próprio iOS: o ícone só é lido no momento do toque em
// "Adicionar à Tela de Início" — instalações já feitas antes dessa troca
// não atualizam sozinhas, precisa remover e adicionar de novo.
function setAppleTouchIcon(href: string) {
  const links = document.querySelectorAll<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  links.forEach((el) => { el.href = href; });

  if (links.length === 0) {
    const link = document.createElement("link");
    link.rel = "apple-touch-icon";
    link.href = href;
    document.head.appendChild(link);
  }
}

// Nome mostrado embaixo do ícone na tela de início do iOS — o Safari usa
// esse meta tag específico, não o <title> da página.
function setAppleWebAppTitle(title: string) {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "apple-mobile-web-app-title";
    document.head.appendChild(meta);
  }
  meta.content = title;
}

// ----------------------------------------------------------------
// Utilitário: aplica todas as CSS vars de cor no <html>
// ----------------------------------------------------------------
function applyColorVars(
  hsl: string,
  rgb: string,
  gradient: string,
  light: string,
  mid: string,
  textOn: string,
  isLightTheme: boolean = false,
) {
  const el = document.documentElement;
  el.style.setProperty("--primary",      hsl);
  el.style.setProperty("--ring",         hsl);
  el.style.setProperty("--accent",       hsl);
  el.style.setProperty("--cp-gradient",  gradient);
  el.style.setProperty("--cp-rgb",       rgb);
  // --cp-400/--cp-500 (paleta em colors.ts) foram calibrados pra contraste
  // em fundo escuro — em fundo claro ficam claros demais pra texto (achado
  // ao vivo pelo Lucas, ex: pills de dias da semana em DietManager). No
  // tema claro usamos a cor-base (--cp-600) pros três, que já é escura o
  // bastante pra ler em branco.
  el.style.setProperty("--cp-400",       isLightTheme ? `hsl(${hsl})` : light);
  el.style.setProperty("--cp-500",       isLightTheme ? `hsl(${hsl})` : mid);
  el.style.setProperty("--cp-600",       `hsl(${hsl})`);
  el.style.setProperty("--cp-text",      textOn);
}
