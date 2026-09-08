# Arquitetura do Clavos Brasil

## Superfícies do produto

### Merchant App
Aplicação usada por credores, gerentes e cobradores. Responsável por clientes, créditos, parcelas, pagamentos e carteira.

### Admin Control Center
Aplicação separada para operação interna da plataforma. Inclui usuários, organizações, documentos, risco, contestações, auditoria, planos e configurações.

### Holder Portal
Portal do titular para consultar dados próprios, acompanhar registros, solicitar correções e abrir contestações.

## Domínio

Entidades centrais:

- `organization`: operação/empresa credora.
- `user`: identidade autenticada.
- `person`: comerciante/tomador cadastrado.
- `loan`: operação de crédito registrada.
- `installment`: obrigação prevista por data.
- `payment`: lançamento financeiro imutável.
- `document`: referência a arquivo privado no R2.
- `score`: estado materializado da classificação atual.
- `dispute`: contestação formal.
- `audit_log`: trilha de auditoria administrativa e operacional.

## Regras estruturais

1. Pagamento é append-only. Correções devem gerar eventos compensatórios, não apagar o lançamento original.
2. Nenhum documento sensível é armazenado diretamente no D1.
3. CPF deve possuir campo recuperável criptografado e HMAC separado para lookup.
4. A classificação nunca é gravada manualmente pelo credor; deriva de fatos verificados.
5. Identidade verificada e crédito verificado são estados independentes.
6. Ações administrativas sensíveis exigem justificativa e auditoria.
7. O modo suporte deve ser temporário, identificado e preferencialmente somente leitura.
8. O Superadmin não é uma senha universal. Continua sujeito a autenticação forte, autorização e auditoria.

## Fluxo de criação de crédito

1. Buscar pessoa por identificadores normalizados.
2. Criar cadastro quando inexistente.
3. Receber documento de identidade em armazenamento privado.
4. Registrar operação financeira e termos declarados.
5. Gerar cronograma de parcelas.
6. Submeter para revisão quando exigido.
7. Registrar eventos de pagamento sem sobrescrever histórico.
8. Recalcular score de forma assíncrona após eventos relevantes.

## Cloudflare

- Workers: APIs e autorização.
- D1: dados relacionais e estado transacional do MVP.
- R2: documentos e evidências privadas.
- Queues: score, análise assíncrona, notificações e jobs.
- Turnstile: proteção contra automação abusiva.
- Rate limiting: contenção de abuso; quotas comerciais exatas permanecem no banco.

## Ambientes

Dev, staging e production devem possuir bancos, buckets, filas e secrets independentes.

## Observabilidade

Cada requisição sensível deve carregar um `request_id`. Erros internos não devem retornar stack trace ao cliente. Eventos administrativos relevantes devem gerar `audit_log` e, quando aplicável, evento de segurança.
