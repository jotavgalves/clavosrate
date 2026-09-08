# Cloudflare deployment

O Clavos Brasil usa três frontends e um Worker de API. Nenhum segredo deve ser versionado no GitHub.

## Recursos

- D1: `clavos-production`
- R2 privado: `clavos-documents-production`
- Queue: `clavos-jobs-production`
- Worker: `clavos-api`
- Frontend merchant: `app.clavosbrasil.com`
- Frontend admin: `admin.clavosbrasil.com`
- API: `api.clavosbrasil.com`

## Variáveis e secrets

Variáveis não secretas:

```text
APP_ENV=production
CORS_ALLOWED_ORIGINS=https://app.clavosbrasil.com,https://admin.clavosbrasil.com
```

Secrets do Worker:

```text
CPF_HMAC_SECRET=<segredo aleatório forte>
CPF_ENCRYPTION_KEY_B64=<32 bytes aleatórios em base64>
```

Nunca reutilizar a chave de criptografia como chave HMAC.

## Migrações

Aplicar em ordem:

```text
0001_initial.sql
0002_auth_sessions.sql
0003_document_workflow.sql
```

## Frontends

Definir em cada build:

```text
VITE_API_BASE=https://api.clavosbrasil.com
```

O frontend envia `credentials: include`; a API aceita apenas origens explicitamente presentes em `CORS_ALLOWED_ORIGINS` em produção.

## Documentos

Os arquivos não possuem URL pública. O merchant envia `multipart/form-data` para `POST /api/v1/documents`; o Worker grava o arquivo no binding R2 `PRIVATE_DOCUMENTS` e grava somente metadados no D1. A visualização administrativa passa por `GET /api/v1/admin/documents/:id/content`, exige RBAC e gera `DOCUMENT_VIEWED` no audit log.

Limites atuais:

- PDF, JPEG, PNG e WEBP;
- máximo de 8 MB por arquivo;
- papéis: `IDENTITY`, `LOAN_EVIDENCE`, `PAYMENT_EVIDENCE`.

## Bootstrap do superadmin

Não criar senha ou hash em arquivo versionado. Gerar o hash localmente conforme `docs/security.md`, inserir o usuário diretamente no D1 por canal administrativo seguro e associá-lo a `platform_user_roles` com `SUPERADMIN`.

## Antes do primeiro deploy público

1. Tornar o repositório privado.
2. Criar recursos D1/R2/Queue reais e substituir os placeholders no Wrangler de produção.
3. Definir os dois secrets do Worker.
4. Aplicar as três migrações.
5. Criar o primeiro `SUPERADMIN`.
6. Configurar `VITE_API_BASE` nos dois frontends.
7. Configurar domínios e `CORS_ALLOWED_ORIGINS`.
8. Executar smoke test: cadastro, login, consulta, novo crédito, upload, revisão documental, pagamento e auditoria.
