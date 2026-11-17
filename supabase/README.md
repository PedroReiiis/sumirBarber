# Banco (Supabase)

## Preparar a máquina (uma vez)

É preciso ter o [Node.js](https://nodejs.org) 18 ou mais novo. Na raiz do repositório:

```sh
npm install
npm run db:login                                      # abre o navegador para autorizar
npx supabase link --project-ref fdbrxglmjoiwlutcelxb  # liga a pasta ao projeto SumirBarber
```

## Alterar tabelas

Nunca altere tabelas direto pelo painel do Supabase. Crie uma migration, para a mudança ficar registrada no repositório:

```sh
npm run db:new nome_da_mudanca   # cria supabase/migrations/<data>_nome_da_mudanca.sql
# escreva o SQL no arquivo criado
npm run db:push                  # aplica no banco (pede confirmação)
```

Depois, commite o arquivo da migration.

## Modelo

| Tabela            | Visitante do site                 | Administrador |
|-------------------|-----------------------------------|---------------|
| `servicos`        | lê os ativos                      | tudo          |
| `configuracoes`   | lê                                | lê e altera   |
| `agendamentos`    | só pela função `book_appointment` | tudo          |
| `bloqueios`       | só pela função `get_busy`         | tudo          |
| `lista_negra`     | nada                              | tudo          |
| `administradores` | nada                              | vê a si mesmo |

- `get_busy(data)`: intervalos ocupados do dia, sem nome nem telefone.
- `book_appointment(servico, data, inicio, nome, telefone)`: valida horário de funcionamento, almoço, bloqueios, lista negra, antecedência e conflito, e grava. O telefone vai no formato `55DDDNUMERO`.
- Dois agendamentos confirmados no mesmo horário são barrados pelo próprio banco, mesmo quando chegam ao mesmo tempo.

## Do zero (projeto novo)

Só se for preciso recriar o banco em outro projeto:

1. Crie o projeto em https://supabase.com/dashboard, na região **South America (São Paulo)**, com "Automatically expose new tables" **desmarcado**.
2. Rode `npx supabase link --project-ref <ref-do-projeto-novo>` e depois `npm run db:push`.
3. Em **Authentication > Sign In / Providers**, desmarque "Allow new users to sign up".
4. Crie o usuário administrador (veja "Acesso ao painel" no README principal).
5. Atualize a URL e a chave em `assets/js/supabase-config.js` e o `connect-src` da Content-Security-Policy em `agendamento.html` e `admin.html`.
