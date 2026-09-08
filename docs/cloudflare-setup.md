# Configuração Cloudflare — desenvolvimento

## Recursos necessários

Crie recursos separados para desenvolvimento:

- D1: `clavos-dev`
- R2 privado: `clavos-documents-dev`
- Queue: `clavos-jobs-dev`

Atualize somente o `database_id` de desenvolvimento no `workers/api/wrangler.toml`. Não grave tokens ou secrets no arquivo.

## Aplicar migrations

Após criar o D1:

```bash
npx wrangler d1 migrations apply clavos-dev --local
npx wrangler d1 migrations apply clavos-dev --remote
```

As migrations atuais são:

1. `0001_initial.sql` — domínio principal.
2. `0002_auth_sessions.sql` — sessões e papéis administrativos.

## Secrets

```bash
npx wrangler secret put CPF_HMAC_SECRET --config workers/api/wrangler.toml
npx wrangler secret put CPF_ENCRYPTION_KEY_B64 --config workers/api/wrangler.toml
```

Gere `CPF_HMAC_SECRET` com pelo menos 32 bytes aleatórios e a chave AES com exatamente 32 bytes antes da codificação Base64.

## Rodar localmente

Na raiz:

```bash
npm install
npm run dev:api
```

Em terminais separados:

```bash
npm run dev:merchant
npm run dev:admin
```

## Ordem segura para primeiro ambiente

1. Criar D1/R2/Queue de desenvolvimento.
2. Preencher `database_id` do D1.
3. Aplicar migrations.
4. Configurar secrets.
5. Criar `SUPERADMIN` pelo processo descrito em `docs/security.md`.
6. Rodar API localmente e validar `/health`.
7. Validar cadastro de organização e login.
8. Validar isolamento entre duas organizações de teste.
9. Somente depois conectar os frontends à API.

## Produção

Não reutilizar nenhum recurso de desenvolvimento em produção. Production deve ter D1, R2, Queue, secrets e domínios próprios.
