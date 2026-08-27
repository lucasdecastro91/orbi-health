// update-asaas-pix-key — salva/atualiza a chave Pix de destino do saque da
// subconta do treinador. Guardada só na nossa base (ver comentário na
// migration 20260826000003) — a Asaas não tem endpoint de "cadastrar" chave
// Pix antes, ela é enviada direto em cada /v3/transfers.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const VALID_KEY_TYPES = new Set(["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Validação leve só pra pegar erro de digitação óbvio — a Asaas valida de
// verdade na hora da transferência (retorna failReason se a chave não existir
// no DICT do Banco Central).
function looksValid(type: string, key: string): boolean {
  const digits = key.replace(/\D/g, "");
  switch (type) {
    case "CPF":   return digits.length === 11;
    case "CNPJ":  return digits.length === 14;
    case "PHONE": return digits.length >= 10 && digits.length <= 13;
    case "EMAIL": return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key);
    case "EVP":   return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
    default:      return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  const { organization_id, pix_key, pix_key_type } = await req.json();
  if (!organization_id || !pix_key || !pix_key_type) {
    return json({ error: "Campos obrigatórios ausentes" }, 400);
  }
  if (!VALID_KEY_TYPES.has(pix_key_type)) {
    return json({ error: "Tipo de chave Pix inválido" }, 400);
  }
  if (!looksValid(pix_key_type, pix_key)) {
    return json({ error: "Chave Pix não parece válida pro tipo selecionado" }, 400);
  }

  // Fail-closed: só o dono da org mexe na chave de saque dela
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id, owner_id")
    .eq("id", organization_id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (orgErr || !org) return json({ error: "forbidden_not_owner" }, 403);

  const { data: sub, error: subErr } = await supabase
    .from("asaas_subaccounts")
    .select("status")
    .eq("org_id", organization_id)
    .maybeSingle();
  if (subErr || !sub) return json({ error: "Você ainda não tem uma conta criada." }, 400);

  // Exigência da própria Asaas: só dá pra receber/sacar com a conta 100%
  // aprovada (identidade verificada) — ver ROADMAP.md, seção de Subcontas.
  if (sub.status !== "aprovado") {
    return json({ error: "Sua conta ainda está em verificação. Aguarde a aprovação antes de cadastrar a chave Pix." }, 403);
  }

  const { error: updateErr } = await supabase
    .from("asaas_subaccounts")
    .update({ pix_key, pix_key_type, updated_at: new Date().toISOString() })
    .eq("org_id", organization_id);
  if (updateErr) {
    console.error("[update-asaas-pix-key]", updateErr);
    return json({ error: "Falha ao salvar a chave Pix." }, 500);
  }

  return json({ success: true });
});
