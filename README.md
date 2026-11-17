# Samir Barbearia

Site estático (HTML, CSS e JS puros, sem build) com agendamento online. Os dados ficam no Supabase.

| Página | Endereço |
|---|---|
| Site | https://pedroreiiis.github.io/sumirBarber/ |
| Agendamento | https://pedroreiiis.github.io/sumirBarber/agendamento |
| Painel do barbeiro | https://pedroreiiis.github.io/sumirBarber/admin |

## Publicar alterações

Não precisa instalar nada. O GitHub Pages publica sozinho a cada push na `main`, e em 1 a 2 minutos a nova versão está no ar.

O banco já está configurado no projeto **SumirBarber** do Supabase (região São Paulo), com tabelas, regras de acesso e um usuário administrador.

## Acesso ao painel

Entre em `/admin` com o e-mail e a senha de um usuário administrador.

Para criar outro usuário (por exemplo, um barbeiro novo):

1. Supabase > **Authentication > Users > Add user > Create new user**, com e-mail, senha e **Auto confirm user** marcado.
2. Supabase > **SQL Editor**:
   ```sql
   insert into public.administradores (usuario_id)
   select id from auth.users where email = 'email-do-usuario@exemplo.com';
   ```

Para trocar a senha: **Authentication > Users**, clique no usuário e use **Send password recovery** (ou exclua e recrie).

## Rodar localmente

É preciso ter o [Node.js](https://nodejs.org) 18 ou mais novo. Abra pelo servidor, não clicando duas vezes no arquivo (`file://` não funciona):

```sh
npx serve .
```

Depois acesse http://localhost:3000. Localmente o site usa o **mesmo banco de produção**, então apague pelo painel o que criar em testes.

## Mudar o banco

Só é necessário para criar ou alterar tabelas. O passo a passo está em [supabase/README.md](supabase/README.md).

## Atenção

- **Plano gratuito do Supabase:** o projeto é pausado após 7 dias sem nenhum acesso. Se o agendamento parar de carregar, entre no painel do Supabase e clique em **Restore project**.
- **Agendamentos antigos:** os que foram feitos antes desta versão ficavam salvos só no navegador e não foram migrados para o banco.

## Estrutura

```
index.html                 página institucional
agendamento.html           agendamento do cliente
admin.html                 painel do barbeiro (/admin)
assets/
  css/site.css             estilos do index
  css/agendamento.css      estilos do agendamento e do painel
  js/site.js               carrossel e mapa do index
  js/supabase-config.js    URL e chave pública do Supabase
  js/core.js               conexão com o banco, utilitários e cálculo de horários
  js/agendamento.js        fluxo de agendamento do cliente
  js/admin.js              painel do barbeiro
  img/
supabase/                  migrations e configuração do banco
```

## Segurança

- A chave em `supabase-config.js` é a **publishable**, pública por design. Quem protege os dados são as regras de acesso (RLS) do banco: visitantes não leem nome nem telefone de clientes e só agendam pela função `book_appointment`, que valida tudo no servidor.
- **Nunca** coloque a `secret` key (ou `service_role`) no código nem no repositório.
- O cadastro público está desativado. Só entra no painel quem está na tabela `administradores`.
- As páginas têm Content-Security-Policy, e o `supabase-js` é carregado com hash de integridade (SRI). Ao trocar a versão do `supabase-js`, atualize o `integrity` em `agendamento.html` e `admin.html`.
