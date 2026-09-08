# Configuração Cloudflare — desenvolvimento

## Recursos necessários

Crie recursos separados para desenvolvimento:

- D1: `clavos-dev`
- R2 privado: `clavos-documents-dev`
- Queue: `clavos-jobs-dev`

Atualize somente o `database_id` de desenvolvimento no `workers/api/wrangler.toml`. Não grave tokens ou secrets no arquivo.

O `wrangler.toml` aponta `migrations_dir` para `../../migrations`, portanto as migrations permanecem centralizadas na raiz do monorepo.

## Aplicar migrations

Após criar o D1, execute a partir de `workers/api` ou informe explicitamente o config:

```bash
npx wrangler d1 migrations apply clavos-dev --local --config workers/api/wrangler.toml
npx wrangler d1 migrations apply clavos-dev --remote --config workers/api/wrangler.toml
```

As migrations atuais são:

1. `0001_initial.sql` — domínio principal.
2. `0002_auth_sessions.sql` — sessões e papéis administrativos.
3. `0003_document_workflow.sql` — metadados, revisão e vínculo de documentos privados.
4. `0004_operations_intelligence.sql` — alocação pagamento/parcela, casos de risco e idempotência da Queue.

## Queue

A mesma Queue é usada como producer e consumer do Worker de API. O consumer processa eventos como:

- `LOAN_CREATED`
- `PAYMENT_RECORDED`
- `DOCUMENT_REVIEW_REQUESTED`
- `DOCUMENT_REVIEW_COMPLETED`

O processamento atual:

- distribui pagamentos por parcelas em FIFO;
- marca parcelas como pagas no prazo, pagas com atraso, parciais, vencidas ou futuras;
- recalcula o estado do crédito;
- ativa o crédito somente depois de identidade e evidência da operação aprovadas;
- recalcula o score apenas com operações verificadas;
- detecta reutilização do mesmo arquivo documental em pessoas diferentes;
- grava mensagens processadas para reduzir efeitos de reentrega da Queue.

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

1. Tornar o repositório privado antes de inserir configuração operacional real.
2. Criar D1, R2 e Queue de desenvolvimento.
3. Preencher `database_id` do D1.
4. Aplicar as quatro migrations em ordem.
5. Configurar os dois secrets criptográficos.
6. Criar o `SUPERADMIN` pelo processo descrito em `docs/security.md`.
7. Rodar a API e validar `/health`.
8. Validar cadastro de organização e login.
9. Validar isolamento entre duas organizações de teste.
10. Validar upload R2 e revisão administrativa.
11. Validar pagamento parcial e alocação das parcelas.
12. Validar Queue, score e geração de casos de risco.
13. Somente então publicar os frontends.

## Produção

Não reutilize nenhum recurso de desenvolvimento em produção. Produção deve ter D1, R2, Queue, secrets, allowlist CORS e domínios próprios.
