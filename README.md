# DoceControle

Site que pega os limites de carboidratos e de glicose passados pelo médico e monta a dieta do dia. Também tem
registro de refeições (manual, por descrição com IA e, no plano premium, por foto), alimentos criados pelo próprio
usuário, leitura de código de barras, glicemia, lembretes de insulina, tempo máximo sem comer, histórico e
relatório para levar à consulta.

O site não substitui a orientação médica e não calcula nem sugere dose de insulina.

- Backend: C# com ASP.NET Core 10, EF Core e SQLite (`backend/DoceControle.Api`)
- Frontend: TypeScript com React e Vite (`frontend`)

## Como rodar

Precisa do .NET SDK 10 e do Node 20 ou mais novo. Na raiz do projeto:

```bash
npm --prefix frontend install
npm --prefix frontend run build
dotnet run --project backend/DoceControle.Api
```

O site abre em http://localhost:5187. O build do frontend vai para `backend/DoceControle.Api/wwwroot`.

Para mexer no frontend com recarga automática, deixe a API rodando e, em outro terminal, rode
`npm --prefix frontend run dev` (http://localhost:5173, com `/api` apontando para a API).

No Windows, deixe o projeto num caminho curto (como `C:\Projetos\DoceControle`), porque caminhos muito longos
passam do limite de 260 caracteres na compilação.

## Publicar na internet (Vercel + Render)

O site (React) vai para a Vercel e a API (C#) para o Render; a Vercel repassa tudo que começa com `/api` para o Render,
então o navegador fala só com um endereço e o login por cookie funciona.

1. Render: **New > Blueprint** com este repositório (usa o `render.yaml` e o `Dockerfile`). Se quiser a IA, preencha
   `IA__ChaveApi` nas variáveis do serviço. O endereço fica parecido com `https://docecontrole-api.onrender.com`.
2. Vercel: **Add New > Project** com este repositório, em **Root Directory** escolha `frontend`. O `vercel.json` já
   tem o comando de build e o repasse de `/api`; se o endereço do Render for outro, troque-o em `rewrites`.
3. Abra o endereço da Vercel e crie uma conta.

No plano gratuito do Render a API dorme depois de uns minutos parada (a primeira abertura demora) e o banco SQLite
é apagado quando o serviço reinicia. Para guardar os dados, use um disco persistente do Render montado em
`/var/data` (é a pasta onde o banco e as chaves de login ficam, definida em `Dados__Pasta`).

## Programa para Windows (versão de teste)

Para abrir com dois cliques, sem precisar do .NET instalado, gere o `DoceControle.exe` no PowerShell:

```powershell
.\publicar.ps1            # gera dist\DoceControle\DoceControle.exe
.\publicar.ps1 -Atalho    # gera e cria um atalho na Área de Trabalho
```

Ao abrir, o servidor sobe numa janela de texto e o navegador abre sozinho. A porta é a primeira livre a partir da
5187. Para encerrar, é só fechar a janela. Os dados ficam em `%LOCALAPPDATA%\DoceControle`, fora da pasta do
programa, então trocar o `.exe` não apaga nada.

É só para teste: roda neste computador, em HTTP no localhost, sem assinatura digital (o Windows pode avisar
"O Windows protegeu o computador"; use "Mais informações" e "Executar assim mesmo"). Qualquer uso fora do
computador precisa de HTTPS e de `Hospedagem:Local=false`.

## IA

A IA usa a API do Claude (Anthropic) pelo SDK oficial para C#. Sem chave, ela fica desativada e o registro manual
continua funcionando. Para ativar, coloque a chave fora do repositório, de um destes jeitos:

```powershell
$env:ANTHROPIC_API_KEY = "sua-chave"
```

ou em `IA:ChaveApi` num `appsettings.Local.json`, ao lado do programa ou em `%LOCALAPPDATA%\DoceControle` (o Git
ignora esse arquivo).

O que ela faz, sempre com o consentimento do usuário:

- descrever a refeição: devolve alimentos e quantidades (grátis, com limite diário);
- foto da refeição: lê o código de barras no aparelho e, se não houver, identifica os alimentos (premium);
- criar alimento: propõe os valores por 100 g para o usuário conferir (por texto é grátis, por foto do rótulo é premium);
- ler a prescrição: transcreve uma foto ou PDF para o formulário, pedindo confirmação a cada envio.

A IA só propõe. Nada é gravado antes de o usuário conferir e confirmar, e fotos e documentos não são guardados.
Os carboidratos e proteínas de uma refeição sempre saem da tabela de alimentos, nunca da resposta da IA. A única
exceção é o alimento novo criado com IA, que fica marcado como "estimado por IA".

## Código de barras

A foto é lida no próprio navegador (`BarcodeDetector` ou, quando não existe, uma leitora em WebAssembly servida
pelo site). O servidor consulta o produto no [Open Food Facts](https://world.openfoodfacts.org) mandando só o
número do código. Como a base é colaborativa, os valores vêm como proposta e o usuário confere antes de salvar.

## Configuração

Em `appsettings.json`:

- `IA:ChaveApi`, ou a variável `ANTHROPIC_API_KEY`: chave da IA
- `IA:Modelo`: modelo usado (padrão `claude-opus-5-5`)
- `IA:LimiteDiarioGratuito`: usos da IA por dia no plano gratuito (padrão 5)
- `IA:LimiteDiarioPremium`: opcional; sem ele o premium não tem limite
- `CodigoBarras:UrlBase`: base de consulta de código de barras (padrão Open Food Facts)
- `Sessao:MinutosInatividade`: tempo até encerrar a sessão parada

## Estrutura do backend

- `Dominio/`: entidades e regras de cálculo (`Regras.cs`)
- `Servicos/`: dia, histórico e relatório, IA, código de barras, pagamento simulado e limpeza de metadados da foto
- `Endpoints/`: rotas da API em `/api`
- `Dados/`: banco e a base de alimentos (`alimentos.json`)

## Limitações

- A base de alimentos tem valores aproximados, inspirados na TACO. Precisa ser conferida com a tabela oficial.
- Não calcula calorias, só carboidratos, proteínas e gorduras.
- Os textos de saúde (`Textos`, em `Regras.cs`) são provisórios e precisam de revisão de um profissional de saúde.
- O pagamento é simulado e nenhum valor é cobrado.
- O banco é criado com `EnsureCreated` e as colunas novas são acrescentadas na inicialização. Numa versão de
  verdade, o certo seria usar migrations.
- A IA foi testada só com um servidor que imita a API, ainda não com uma chave real.
- A leitura de código de barras por foto ainda não foi testada com fotos reais; só a consulta ao Open Food Facts foi.

## Licenças de terceiros

- Ícones: [Google Material Symbols](https://fonts.google.com/icons) (outlined), pacote `@material-symbols/svg-400`, Apache 2.0
- Dados de produtos: [Open Food Facts](https://world.openfoodfacts.org), ODbL
- Leitura de código de barras no navegador: `barcode-detector` e `zxing-wasm`, MIT
