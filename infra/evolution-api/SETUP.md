# Setup da Evolution API — VPS Hostinger (beta WhatsApp)

Siga nessa ordem assim que o VPS estiver ativo e você tiver o IP.

## 1. Apontar o subdomínio

No painel de DNS da Hostinger (mesma conta dos seus domínios), crie um registro:

```
Tipo: A
Nome: wpp
Valor: <IP do VPS>
TTL: padrão
```

Isso deixa `wpp.orbihealth.com.br` apontando pro servidor. Pode levar de alguns minutos a algumas horas pra propagar.

## 2. Conectar no VPS via SSH

No painel da Hostinger, copie o IP do servidor. No terminal do seu computador:

```bash
ssh root@SEU_IP_AQUI
```

Vai pedir a senha root que você salvou no gerenciador de senhas.

## 3. Instalar Docker

Dentro do servidor (já conectado via SSH):

```bash
curl -fsSL https://get.docker.com | sh
```

Isso instala Docker e Docker Compose de uma vez.

## 4. Subir os arquivos pro servidor

De volta no seu computador (outro terminal, sem sair do SSH), envie a pasta `infra/evolution-api`:

```bash
scp -r "infra/evolution-api" root@SEU_IP_AQUI:/root/evolution-api
```

## 5. Configurar o .env

De volta no SSH, dentro da pasta:

```bash
cd /root/evolution-api
cp .env.example .env
nano .env
```

Preencha:
- `POSTGRES_PASSWORD` e `REDIS_PASSWORD` — gere com `openssl rand -hex 24`
- `EVOLUTION_API_KEY` — gere com `openssl rand -hex 32` (essa é a chave que a Edge Function vai usar pra falar com a Evolution API — guarde ela, não vai aparecer em nenhum lugar do frontend)
- `EVOLUTION_PUBLIC_URL` — o subdomínio do passo 1
- `SUPABASE_WEBHOOK_URL` — deixa como está por enquanto, eu preencho o valor certo quando a Edge Function estiver pronta

Salve com `Ctrl+O`, `Enter`, `Ctrl+X`.

## 6. Subir a stack

```bash
docker compose up -d
```

Verifique se os 4 containers subiram:

```bash
docker compose ps
```

## 7. Testar

```bash
curl https://wpp.orbihealth.com.br
```

Se responder algo (mesmo que um erro de rota), o TLS e o proxy estão funcionando. Se der timeout, o DNS ainda não propagou — espere um pouco e tente de novo.

## 8. Não fazer ainda

Não crie nenhuma instância/QR code ainda — isso a gente faz junto, depois de aplicar a migration do schema e ter a Edge Function do webhook no ar, pra já nascer conectado ao painel do ORBI.

---

**Se travar em algum passo, me manda o print do terminal que eu ajudo a debugar.**
