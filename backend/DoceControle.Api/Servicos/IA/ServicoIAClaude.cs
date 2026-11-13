using System.Globalization;
using System.Text;
using System.Text.Json;
using Anthropic;
using Anthropic.Exceptions;
using Anthropic.Models.Messages;
using DoceControle.Api.Dominio;

namespace DoceControle.Api.Servicos.IA;

/// <summary>
/// Provedor de IA: Claude, pela API da Anthropic (SDK oficial para C#). As respostas são restritas por
/// esquema JSON, então a IA devolve só os campos pedidos, nunca texto livre.
/// </summary>
public class ServicoIAClaude : IServicoIA
{
    private const string TextoOuNulo = """{ "anyOf": [ { "type": "string" }, { "type": "null" } ] }""";

    private static readonly string EsquemaRefeicao = $$"""
        {
          "type": "object",
          "properties": {
            "itens": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "descricao": { "type": "string" },
                  "alimentoBase": {{TextoOuNulo}},
                  "quantidadeG": { "type": "number" }
                },
                "required": ["descricao", "alimentoBase", "quantidadeG"],
                "additionalProperties": false
              }
            }
          },
          "required": ["itens"],
          "additionalProperties": false
        }
        """;

    private static readonly string EsquemaAlimento = $$"""
        {
          "type": "object",
          "properties": {
            "nome": { "type": "string" },
            "categoria": { "type": "string" },
            "carboPor100g": { "type": "number" },
            "proteinaPor100g": { "type": "number" },
            "gorduraPor100g": { "type": "number" },
            "porcaoPadraoG": { "type": "number" },
            "porcaoDescricao": { "type": "string" },
            "observacao": {{TextoOuNulo}}
          },
          "required": ["nome", "categoria", "carboPor100g", "proteinaPor100g", "gorduraPor100g", "porcaoPadraoG", "porcaoDescricao", "observacao"],
          "additionalProperties": false
        }
        """;

    private const string NumeroOuNulo = """{ "anyOf": [ { "type": "number" }, { "type": "null" } ] }""";

    private static readonly string EsquemaPrescricao = $$"""
        {
          "type": "object",
          "properties": {
            "limiteCarboDia": {{NumeroOuNulo}},
            "glicemiaMin": {{NumeroOuNulo}},
            "glicemiaMax": {{NumeroOuNulo}},
            "metaProteinaDia": {{NumeroOuNulo}},
            "jejumMaxHoras": {{NumeroOuNulo}},
            "refeicoes": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "nome": { "type": "string" },
                  "horario": {{TextoOuNulo}},
                  "limiteCarbo": {{NumeroOuNulo}}
                },
                "required": ["nome", "horario", "limiteCarbo"],
                "additionalProperties": false
              }
            },
            "lembretes": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "horario": { "type": "string" },
                  "descricao": {{TextoOuNulo}},
                  "doseInformada": {{NumeroOuNulo}}
                },
                "required": ["horario", "descricao", "doseInformada"],
                "additionalProperties": false
              }
            },
            "observacao": {{TextoOuNulo}}
          },
          "required": ["limiteCarboDia", "glicemiaMin", "glicemiaMax", "metaProteinaDia", "jejumMaxHoras", "refeicoes", "lembretes", "observacao"],
          "additionalProperties": false
        }
        """;

    private static readonly JsonSerializerOptions OpcoesJson = new(JsonSerializerDefaults.Web);

    private readonly AnthropicClient _cliente;
    private readonly string _modelo;
    private readonly TimeSpan _tempoLimite;
    private readonly ILogger<ServicoIAClaude> _log;

    public ServicoIAClaude(IConfiguration config, ILogger<ServicoIAClaude> log)
    {
        var chave = config["IA:ChaveApi"];
        // Sem chave no appsettings, o SDK lê a variável de ambiente ANTHROPIC_API_KEY.
        _cliente = string.IsNullOrWhiteSpace(chave) ? new AnthropicClient() : new AnthropicClient { ApiKey = chave };
        _modelo = config["IA:Modelo"] ?? "claude-opus-5-5";
        _tempoLimite = TimeSpan.FromSeconds(config.GetValue("IA:TempoLimiteSegundos", 45));
        _log = log;
    }

    public bool Configurada => true;

    private static Dictionary<string, JsonElement> Esquema(string json) =>
        JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!;

    // Refeição

    public Task<ResultadoIA> IdentificarPorTextoAsync(
        string descricao, IReadOnlyList<Alimento> baseAlimentos, CancellationToken ct) =>
        ChamarAsync<ResultadoIA>(
            [new TextBlockParam { Text = "Descrição da refeição:\n" + descricao }],
            InstrucoesRefeicao(baseAlimentos), EsquemaRefeicao, ct);

    public Task<ResultadoIA> IdentificarPorFotoAsync(
        byte[] jpegSemMetadados, IReadOnlyList<Alimento> baseAlimentos, CancellationToken ct) =>
        ChamarAsync<ResultadoIA>(
            [Foto(jpegSemMetadados), new TextBlockParam { Text = "Identifique os alimentos desta foto de refeição." }],
            InstrucoesRefeicao(baseAlimentos), EsquemaRefeicao, ct);

    // Alimento novo

    public Task<AlimentoEstimado> EstimarAlimentoPorTextoAsync(string descricao, CancellationToken ct) =>
        ChamarAsync<AlimentoEstimado>(
            [new TextBlockParam { Text = "Alimento a cadastrar:\n" + descricao }],
            InstrucoesAlimento, EsquemaAlimento, ct);

    public Task<AlimentoEstimado> EstimarAlimentoPorFotoAsync(byte[] jpegSemMetadados, string? descricao, CancellationToken ct) =>
        ChamarAsync<AlimentoEstimado>(
            [
                Foto(jpegSemMetadados),
                new TextBlockParam
                {
                    Text = string.IsNullOrWhiteSpace(descricao)
                        ? "Cadastre o alimento ou produto desta foto."
                        : "Cadastre o alimento ou produto desta foto. Informação do usuário: " + descricao,
                },
            ],
            InstrucoesAlimento, EsquemaAlimento, ct);

    // Prescrição

    public Task<PrescricaoLida> LerPrescricaoAsync(byte[] arquivo, bool pdf, CancellationToken ct)
    {
        ContentBlockParam documento = pdf
            ? new DocumentBlockParam { Source = new Base64PdfSource { Data = Convert.ToBase64String(arquivo) } }
            : Foto(arquivo);

        return ChamarAsync<PrescricaoLida>(
            [documento, new TextBlockParam { Text = "Transcreva os limites e orientações desta prescrição." }],
            InstrucoesPrescricao, EsquemaPrescricao, ct);
    }

    private static ImageBlockParam Foto(byte[] jpeg) => new()
    {
        Source = new Base64ImageSource { Data = Convert.ToBase64String(jpeg), MediaType = MediaType.ImageJpeg },
    };

    private async Task<T> ChamarAsync<T>(
        List<ContentBlockParam> conteudo, string instrucoes, string esquema, CancellationToken ct)
    {
        var parametros = new MessageCreateParams
        {
            Model = _modelo,
            MaxTokens = 16000,
            System = instrucoes,
            // Extração simples: esforço baixo responde mais rápido (meta do RNF10) e custa menos (RNF13).
            OutputConfig = new OutputConfig
            {
                Effort = Effort.Low,
                Format = new JsonOutputFormat { Schema = Esquema(esquema) },
            },
            Messages = [new UserMessageParam { Content = conteudo }],
        };

        using var limite = CancellationTokenSource.CreateLinkedTokenSource(ct);
        limite.CancelAfter(_tempoLimite);

        Message resposta;
        try
        {
            resposta = await _cliente.Messages.Create(parametros, cancellationToken: limite.Token);
        }
        catch (AnthropicRateLimitException ex)
        {
            _log.LogWarning("IA: limite de requisições do provedor atingido.");
            throw new IAIndisponivelException("A IA está com muitas solicitações agora.", ex);
        }
        catch (AnthropicUnauthorizedException ex)
        {
            _log.LogError("IA: chave de API recusada pelo provedor.");
            throw new IAIndisponivelException("A IA não está configurada corretamente.", ex);
        }
        catch (AnthropicApiException ex)
        {
            _log.LogWarning("IA: o provedor devolveu erro {Status}.", ex.StatusCode);
            throw new IAIndisponivelException("A IA não respondeu.", ex);
        }
        catch (Exception ex) when (ex is AnthropicException or HttpRequestException or OperationCanceledException)
        {
            if (ct.IsCancellationRequested) throw;
            _log.LogWarning("IA: falha de comunicação ({Tipo}).", ex.GetType().Name);
            throw new IAIndisponivelException("A IA não respondeu a tempo.", ex);
        }

        // "refusal" e "max_tokens" não trazem um JSON completo: trata como indisponível (RN19).
        if (resposta.StopReason != "end_turn")
        {
            _log.LogWarning("IA: resposta encerrada com motivo inesperado.");
            throw new IAIndisponivelException("A IA não conseguiu analisar este conteúdo.");
        }

        var texto = string.Concat(resposta.Content.Select(b => b.Value).OfType<TextBlock>().Select(t => t.Text));
        try
        {
            return JsonSerializer.Deserialize<T>(texto, OpcoesJson) ?? throw new JsonException("Resposta vazia.");
        }
        catch (JsonException ex)
        {
            throw new IAIndisponivelException("A IA devolveu uma resposta que não foi possível ler.", ex);
        }
    }

    private static string InstrucoesRefeicao(IReadOnlyList<Alimento> baseAlimentos)
    {
        var sb = new StringBuilder();
        sb.AppendLine("""
            Você apoia o registro de refeições de um diário alimentar usado no Brasil.
            Sua única tarefa é identificar os alimentos de uma refeição e estimar quanto foi consumido de cada um.

            Para cada alimento, devolva:
            - descricao: o alimento como a pessoa descreveu ou como aparece na foto, em poucas palavras.
            - alimentoBase: o nome, copiado exatamente da lista abaixo, do alimento mais próximo. Use null quando
              nenhum item da lista corresponder de forma razoável; é melhor devolver null do que forçar um item
              diferente, porque a pessoa poderá escolher ou criar o alimento depois.
            - quantidadeG: a quantidade consumida, em gramas. Converta medidas caseiras (fatia, colher, concha,
              copo, unidade) usando a porção de referência da lista quando houver. Sem quantidade informada,
              estime uma porção usual.

            Pratos compostos devem ser separados nos seus alimentos principais (por exemplo, "arroz com feijão"
            vira dois itens). Não calcule carboidratos, calorias nem outro nutriente, e não dê orientação de saúde:
            os nutrientes são calculados depois, a partir de uma base nutricional, e a pessoa confere cada item
            antes de gravar. Se a entrada não tiver comida nem bebida, devolva a lista vazia.

            Lista de alimentos da base (nome | porção de referência):
            """);
        foreach (var a in baseAlimentos)
        {
            sb.Append(a.Nome).Append(" | ").Append(a.PorcaoDescricao).Append(" = ")
              .Append(a.PorcaoPadraoG.ToString("0.#", CultureInfo.InvariantCulture)).AppendLine(" g");
        }
        return sb.ToString();
    }

    private const string InstrucoesPrescricao = """
        Você transcreve para um formulário os valores escritos em uma prescrição médica ou nutricional de uma
        pessoa com diabetes (foto ou PDF, em português do Brasil). Sua função é COPIAR o que está no documento,
        nada além disso: não calcule, não deduza, não complete, não sugira e não corrija valores. Se um dado não
        estiver escrito de forma clara, devolva null para ele. Na dúvida, devolva null.

        Campos:
        - limiteCarboDia: total diário de carboidratos permitido, em gramas.
        - glicemiaMin e glicemiaMax: faixa de glicemia desejada, em mg/dL.
        - metaProteinaDia: meta diária de proteínas, em gramas.
        - jejumMaxHoras: tempo máximo que a pessoa pode ficar sem comer, em horas (3h30 vira 3.5).
        - refeicoes: as refeições listadas, na ordem do documento, com o nome como está escrito, o horário no
          formato HH:mm e os gramas de carboidratos daquela refeição, quando o documento trouxer.
        - lembretes: horários de aplicação de insulina escritos no documento, com a descrição (ex.: "insulina
          rápida") e a dose em unidades SOMENTE se estiver escrita ao lado do horário. Nunca calcule nem estime uma dose.
        - observacao: uma frase curta dizendo o que não foi possível ler ou o que ficou ambíguo, ou null.

        Não devolva nome do paciente, do médico, CRM, endereço ou qualquer dado pessoal. Se o arquivo não for
        uma prescrição, devolva tudo nulo e listas vazias, explicando na observacao.
        """;

    private const string InstrucoesAlimento = """
        Você ajuda a cadastrar um alimento novo em um diário alimentar usado no Brasil, para contagem de
        carboidratos. A partir da descrição (e, se houver, da foto do alimento, do produto ou do rótulo),
        devolva os valores POR 100 g do alimento como ele é consumido (cozido ou pronto para comer):

        - nome: nome curto e claro do alimento, em português do Brasil, com a marca só se ela aparecer na entrada.
        - categoria: uma destas: Cereais e massas, Pães e biscoitos, Tubérculos e raízes, Leguminosas, Frutas,
          Verduras e legumes, Carnes e ovos, Leites e derivados, Oleaginosas, Bebidas, Doces e açúcares, Outros.
        - carboPor100g: carboidratos totais, em gramas por 100 g.
        - proteinaPor100g: proteínas, em gramas por 100 g.
        - gorduraPor100g: gorduras totais, em gramas por 100 g.
        - porcaoPadraoG e porcaoDescricao: uma porção usual em gramas e sua medida caseira ("1 fatia", "2 colheres de sopa").
        - observacao: diga em uma frase de onde vêm os números. Se a foto mostra a tabela nutricional, use os valores
          impressos (convertendo para 100 g quando a tabela for por porção) e diga que foram lidos do rótulo.
          Sem tabela legível, estime a partir de composições típicas (como a TACO) e diga que é uma estimativa a
          conferir no rótulo. Nunca invente um valor que o rótulo mostre diferente.

        Não dê orientação de saúde, não calcule doses nem diga se o alimento é adequado para alguém. A pessoa vai
        conferir e corrigir os valores antes de salvar.
        """;
}
