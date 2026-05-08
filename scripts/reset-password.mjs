/**
 * Script temporário — reset de senha via Supabase Admin API
 * Uso: node scripts/reset-password.mjs <email> <nova_senha>
 * Ex:  node scripts/reset-password.mjs lucas.melo1991@gmail.com MinhaNovaSenh@123
 */

const SUPABASE_URL        = process.env.SUPABASE_URL        || "https://mdbqhmkblzyllkyxjhrd.supabase.co";
const SERVICE_ROLE_KEY    = process.env.SUPABASE_SERVICE_KEY || "";

const email    = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("❌  Uso: node scripts/reset-password.mjs <email> <nova_senha>");
  process.exit(1);
}

if (password.length < 6) {
  console.error("❌  A senha deve ter pelo menos 6 caracteres.");
  process.exit(1);
}

const headers = {
  "Content-Type":  "application/json",
  "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
  "apikey":        SERVICE_ROLE_KEY,
};

// 1. Busca o usuário pelo e-mail
console.log(`🔍  Buscando usuário com e-mail: ${email} …`);

const listRes  = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, { headers });
const listData = await listRes.json();

if (!listRes.ok) {
  console.error("❌  Erro ao listar usuários:", listData);
  process.exit(1);
}

const users = listData.users ?? [];
const user  = users.find(u => u.email?.toLowerCase() === email.toLowerCase());

if (!user) {
  console.error(`❌  Nenhum usuário encontrado com o e-mail: ${email}`);
  process.exit(1);
}

console.log(`✅  Usuário encontrado — ID: ${user.id}`);

// 2. Atualiza a senha
console.log("🔑  Atualizando senha …");

const updateRes  = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
  method:  "PUT",
  headers,
  body: JSON.stringify({ password }),
});
const updateData = await updateRes.json();

if (!updateRes.ok) {
  console.error("❌  Erro ao atualizar senha:", updateData);
  process.exit(1);
}

console.log("✅  Senha atualizada com sucesso!");
console.log(`📧  E-mail : ${email}`);
console.log(`🔐  Nova senha definida — faça login em http://localhost:8080`);
