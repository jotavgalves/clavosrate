# Segurança e bootstrap

## Secrets obrigatórios do Worker

Nunca salvar valores reais no GitHub.

Configure por ambiente com `wrangler secret put`:

- `CPF_HMAC_SECRET` — segredo aleatório longo usado para lookup de CPF via HMAC-SHA256.
- `CPF_ENCRYPTION_KEY_B64` — chave AES-256 em Base64/Base64URL que decodifique exatamente para 32 bytes.

Exemplo de geração local da chave AES:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Sessões

- Cookie: `clavos_session`.
- `HttpOnly` sempre.
- `SameSite=Lax`.
- `Secure` em produção.
- Vida padrão: 12 horas.
- O token bruto nunca é armazenado no D1; somente SHA-256 do token.
- Logout revoga a sessão no banco e expira o cookie.

## Senhas

Formato atual:

`pbkdf2_sha256$iterations$salt$hash`

O utilitário `scripts/generate-password-hash.mjs` gera um hash compatível para bootstrap administrativo.

## Criação inicial do SUPERADMIN

Não existe senha mestra nem credencial hardcoded.

1. Gere o hash localmente:

```bash
node scripts/generate-password-hash.mjs "SENHA-FORTE-AQUI"
```

2. Gere UUIDs locais para `user_id` e, se necessário, outros registros.
3. Insira o usuário diretamente no D1 administrativo durante o bootstrap controlado:

```sql
INSERT INTO users
  (id, email, password_hash, full_name, status, created_at, updated_at)
VALUES
  ('UUID_DO_USUARIO', 'admin@seu-dominio', 'HASH_GERADO', 'Administrador', 'ACTIVE', datetime('now'), datetime('now'));

INSERT INTO platform_user_roles
  (user_id, role, created_at, updated_at)
VALUES
  ('UUID_DO_USUARIO', 'SUPERADMIN', datetime('now'), datetime('now'));
```

4. Não mantenha scripts com e-mail, UUID ou hash reais no repositório.
5. Após o primeiro acesso administrativo, implemente 2FA antes de produção pública.

## Isolamento por organização

Toda rota merchant deve obter `organization_id` da sessão validada. O cliente não pode escolher livremente uma organização em parâmetros de leitura/escrita.

Créditos e pagamentos são sempre consultados com filtro de organização. O `loan_id` sozinho nunca autoriza acesso.

## CPF

O D1 mantém duas representações:

- `cpf_lookup_hmac` para busca determinística.
- `cpf_encrypted` para recuperação autorizada futura.

O CPF bruto não deve aparecer em logs, URLs, nomes de objetos R2 ou eventos de analytics.

## Documentos

Arquivos de identidade e evidências devem permanecer em bucket R2 privado. Nenhuma URL pública permanente deve ser criada. O acesso administrativo deverá usar autorização + URL temporária ou streaming autenticado.

## Produção

Antes de produção:

- habilitar 2FA administrativo;
- restringir CORS a origens explícitas;
- adicionar Turnstile em login/cadastro de alto risco;
- implementar rate limit de login e consulta;
- implementar rotação de secrets;
- criar política de retenção de documentos;
- revisar logs para garantir ausência de CPF/documentos;
- testar isolamento multi-tenant;
- tornar o repositório privado antes de incluir qualquer configuração operacional sensível.
