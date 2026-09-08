# Clavos Brasil

Plataforma mobile-first para gestão de carteira de crédito comercial, pagamentos recorrentes, verificação de identidade, histórico de pagamento e análise de risco.

> O produto deve ser usado apenas para operações juridicamente válidas. A plataforma não deve ocultar custo financeiro, viabilizar coerção, vigilância clandestina ou contornar exigências regulatórias.

## Arquitetura

- `apps/merchant` — aplicação dos credores e equipes de cobrança.
- `apps/admin` — Control Center da equipe Clavos Brasil.
- `apps/holder` — portal do titular/comerciante cadastrado.
- `workers/api` — API principal.
- `workers/jobs` — processamento assíncrono.
- `packages/core` — regras de domínio.
- `packages/permissions` — RBAC.
- `packages/audit` — eventos de auditoria.
- `migrations` — esquema do Cloudflare D1.
- `docs` — arquitetura, segurança e decisões técnicas.

## Stack prevista

Cloudflare Workers, D1, R2 privado, Queues, Turnstile e Rate Limiting. Os frontends serão mobile-first e desacoplados da API.

## Princípios

1. `Pessoa != crédito != pagamento`.
2. Crédito e pagamentos usam ledger; não há sobrescrita silenciosa de histórico.
3. Toda ação administrativa sensível gera auditoria.
4. Documentos ficam fora do D1 e nunca recebem URL pública permanente.
5. Permissões são granulares; não existe senha mestra.
6. Correções administrativas preservam estado anterior.
7. Ambientes `dev`, `staging` e `production` serão isolados.

## Estado atual

Fundação inicial do projeto. Não há deploy de produção nem credenciais no repositório.
