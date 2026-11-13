# DoceControle

Site que transforma os limites de carboidratos e de glicose prescritos pelo médico em uma dieta do dia, com
registro de refeições (manual, por descrição com IA e, no premium, por foto), alimentos criados pelo usuário,
leitura de código de barras, glicemia, lembretes de insulina, tempo máximo sem comer, histórico e relatório.
Implementa o documento do projeto (RF01–RF20, RN01–RN26, RI01–RI15).

- **Backend:** C# / ASP.NET Core 10, EF Core + SQLite (`backend/DoceControle.Api`)
- **Frontend:** TypeScript / React + Vite (`frontend`)
- **Testes:** xUnit, regras de cálculo (`backend/DoceControle.Testes`)

## Como rodar

Pré-requisitos: .NET SDK 10 e Node 20+. Na raiz do projeto:

```bash
npm --prefix frontend install
npm --prefix frontend run build
dotnet run --project backend/DoceControle.Api
```

O site abre em http://localhost:5187 (o build do frontend vai para `backend/DoceControle.Api/wwwroot`).

Para desenvolver o frontend com recarga automática: deixe a API rodando e, em outro terminal,
`npm --prefix frontend run dev` (http://localhost:5173, com `/api` repassado para a API).

Testes: `dotnet test` na raiz.

> No Windows, mantenha o projeto em um caminho curto (ex.: `C:\Projetos\DoceControle`):
> caminhos muito longos passam do limite de 260 caracteres na compilação.

## IA

A IA usa **somente um provedor real**: Claude, pela API da Anthropic (SDK oficial para C#). Não existe modo
simulado. Sem chave, a IA fica desativada e o registro manual continua funcionando.

Para ativar, defina a chave **fora do repositório**:

```bash
# PowerShell
$env:ANTHROPIC_API_KEY = "sua-chave"
```

ou use `IA:ChaveApi` em um `appsettings.Local.json` (ignorado pelo Git). Nunca coloque a chave em arquivo versionado.

O que a IA faz (sempre com consentimento da conta e limite diário de usos):

| Uso | Plano | O que acontece |
|---|---|---|
| Descrever a refeição | Gratuito | Devolve alimentos e quantidades. Os nutrientes saem da base de alimentos (RN06, RN16). |
| Foto da refeição | Premium | Lê o código de barras no aparelho; sem código, a IA identifica os alimentos. |
| Criar alimento com IA | Gratuito (texto) / Premium (foto do rótulo) | Propõe os valores por 100 g para o usuário conferir e salvar. |
| Ler a prescrição | Gratuito | Transcreve foto ou PDF para o formulário. Pede confirmação a cada envio. |

Em todos, a IA só **propõe**: nada é gravado até o usuário conferir e confirmar (RN17). Nenhuma foto ou
documento é guardado, e fotos seguem sem metadados (RN22).

### Exceção às regras do documento

O documento proíbe obter carboidratos e proteínas da resposta da IA (RI11, RN16). Isso continua valendo para
**refeições**: os nutrientes de uma refeição sempre saem da tabela de alimentos. A exceção, pedida na
implementação, é a **criação de um alimento novo**: a IA pode estimar os valores por 100 g (ou copiá-los do
rótulo, quando a foto mostra a tabela nutricional). Esses alimentos ficam marcados como "estimado por IA",
valem só para a conta do usuário e ele confere e corrige antes de salvar.

Da mesma forma, a leitura da prescrição por IA **transcreve** valores escritos no documento; ela não define
limites nem calcula doses (RI01, RI10).

## Código de barras

A leitura da foto é feita no navegador (`BarcodeDetector` nativo ou uma leitora em WebAssembly servida pelo
próprio site). O servidor consulta o produto no [Open Food Facts](https://world.openfoodfacts.org) enviando
**apenas o número do código**. A base é colaborativa: os valores vêm como proposta e o usuário confere antes de salvar.

## Configuração (`appsettings.json`)

| Chave | Para que serve |
|---|---|
| `IA:ChaveApi` (ou variável `ANTHROPIC_API_KEY`) | Chave do provedor de IA. |
| `IA:Modelo` | Modelo do Claude (padrão `claude-opus-5-5`). |
| `IA:LimiteDiarioGratuito` / `IA:LimiteDiarioPremium` | Limite diário de usos da IA por usuário (RNF13). |
| `CodigoBarras:UrlBase` | Base de consulta de código de barras (padrão Open Food Facts). |
| `Sessao:MinutosInatividade` | Tempo até encerrar a sessão sem atividade (RNF04). |

## Estrutura

- `Dominio/` — classes do diagrama UML (`Entidades.cs`) e regras fixas de cálculo (`Regras.cs`).
- `Servicos/` — visão do dia, histórico e relatório; IA (`IA/`); código de barras; pagamento simulado; limpeza de metadados da foto.
- `Endpoints/` — API REST (`/api/conta`, `/prescricao`, `/jejum`, `/lembretes`, `/alimentos`, `/refeicoes`, `/glicemias`, `/dia`, `/historico`, `/relatorio`, `/ia`, `/assinatura`).
- `Dados/alimentos.json` — base de alimentos (carboidratos e proteínas por 100 g).

## Limites desta versão (escopo acadêmico)

- **Base de alimentos:** valores aproximados, inspirados na TACO. Precisam ser conferidos com a tabela oficial antes de qualquer uso real.
- **Textos de saúde** (`Textos` em `Regras.cs`): provisórios, pendentes de revisão por profissional de saúde.
- **Pagamento:** simulado (`ProvedorPagamentoSimulado`); nenhum valor é cobrado.
- **Banco:** criado com `EnsureCreated`; as colunas novas são acrescentadas na inicialização para não perder dados. Uma versão comercial deve usar migrações do EF.
- **IA real:** o código foi verificado com um servidor que imita a API, mas ainda não com uma chave real.
- **Leitura de código de barras:** testada na consulta ao Open Food Facts; a leitura da foto no navegador ainda não foi testada com fotos reais.
- O DoceControle não substitui a orientação médica e não calcula nem sugere doses de insulina.
