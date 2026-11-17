using DoceControle.Api.Dominio;

namespace DoceControle.Api;

// horários trafegam como "HH:mm" e datas como "yyyy-MM-dd"; a hora dos registros é a local do navegador, sem fuso

public record Erro(string Mensagem, string? Codigo = null)
{
    public static IResult Invalido(string mensagem, string? codigo = null) =>
        Results.BadRequest(new Erro(mensagem, codigo));

    public static IResult Status(int status, string mensagem, string? codigo = null) =>
        Results.Json(new Erro(mensagem, codigo), statusCode: status);
}

// Conta
public record CadastroReq(string? Nome, string? Email, string? Senha, bool ConsentimentoDadosSaude, bool ConsentimentoIA);
public record EntrarReq(string? Email, string? Senha);
public record ConsentimentoIAReq(bool Consentir);
public record ExcluirContaReq(string? Senha);
public record IaEstadoDto(bool Configurada, bool Consentida, int? LimiteDiario, int UsosHoje, bool FotoLiberada);
public record ContaDto(
    string Nome, string Email, Plano Plano, DateTime ConsentimentoEm, bool TemPrescricao,
    IaEstadoDto Ia, bool PagamentoSimulado, int MinutosSessao);

// Prescrição
public record MetaReq(string? Nome, string? Horario, double? LimiteCarbo);
public record PrescricaoReq(
    double LimiteCarboDia, int GlicemiaMin, int GlicemiaMax, double? MetaProteinaDia, int? JejumMaxMin,
    bool DivisaoPersonalizada, List<MetaReq>? Refeicoes, bool ConfirmaPrescricaoProfissional, string? Hoje);
public record MetaDto(string Nome, string Horario, double LimiteCarbo, double? MetaProteina);
public record PrescricaoDto(
    int Id, string VigenteDesde, double LimiteCarboDia, int GlicemiaMin, int GlicemiaMax,
    double? MetaProteinaDia, int? JejumMaxMin, bool DivisaoPersonalizada, List<MetaDto> Refeicoes);

public record JejumDto(EstadoJejum Estado, int Minutos, int? LimiteMin, int RestanteMin, string? Aviso);

// Lembretes
public record LembreteReq(string? Horario, double? DoseInformada, string? Descricao, int? RepeticaoMin, bool Ativo);
public record ConfirmarLembreteReq(string? Data);
public record LembreteDto(
    int Id, string Horario, double? DoseInformada, string? Descricao, int RepeticaoMin, bool Ativo,
    bool ConfirmadoHoje);

// Alimentos
public record AlimentoDto(
    int Id, string Nome, string Categoria, double CarboPor100g, double ProteinaPor100g, double GorduraPor100g,
    double PorcaoPadraoG, string PorcaoDescricao, OrigemAlimento Origem, string? CodigoBarras, bool Proprio);

public record NovoAlimentoReq(
    string? Nome, string? Categoria, double CarboPor100g, double ProteinaPor100g, double GorduraPor100g, double PorcaoPadraoG,
    string? PorcaoDescricao, OrigemAlimento Origem, string? CodigoBarras);

public record PropostaAlimentoDto(
    string Nome, string Categoria, double? CarboPor100g, double? ProteinaPor100g, double? GorduraPor100g, double PorcaoPadraoG,
    string PorcaoDescricao, OrigemAlimento Origem, string? CodigoBarras, string? Observacao);

public record CodigoBarrasDto(AlimentoDto? Existente, PropostaAlimentoDto? Proposta);

public record SugestaoAlimentoTextoReq(string? Descricao);
public record SugestaoAlimentoFotoReq(string? ImagemBase64, string? Descricao);

// Refeições
public record ItemReq(int AlimentoId, double QuantidadeG, bool DaSugestao);
public record RefeicaoReq(DateTime DataHora, string? Refeicao, List<ItemReq>? Itens, int? SugestaoId);
public record ItemDto(
    int AlimentoId, string Nome, double QuantidadeG, double Carbo, double Proteina, double Gordura, bool DaIA);
public record RegistroRefeicaoDto(
    int Id, DateTime DataHora, string Refeicao, double TotalCarbo, double TotalProteina, double TotalGordura,
    List<ItemDto> Itens);
public record RefeicaoGravadaDto(RegistroRefeicaoDto Registro, List<string> Avisos);

// Glicemia
public record GlicemiaReq(int Valor, DateTime DataHora);
public record GlicemiaDto(int Id, int Valor, DateTime DataHora, SituacaoGlicemia Situacao, string? Aviso);

// Dia (painel e dieta)
public record RefeicaoDoDiaDto(
    string Nome, string Horario, double LimiteCarbo, double? MetaProteina,
    double CarboConsumido, double ProteinaConsumida, double GorduraConsumida, double CarboRestante, bool LimiteUltrapassado,
    List<RegistroRefeicaoDto> Registros, List<PorcaoExemplo> Exemplos);
public record DiaDto(
    string Data, PrescricaoDto? Prescricao,
    double CarboConsumido, double? CarboLimite, double? CarboRestante, bool LimiteUltrapassado,
    double ProteinaConsumida, double? ProteinaMeta, double GorduraConsumida,
    List<RefeicaoDoDiaDto> Refeicoes, List<RegistroRefeicaoDto> OutrosRegistros,
    List<GlicemiaDto> Glicemias, string AvisoOrientacao);

// Histórico e relatório
public record DiaHistoricoDto(
    string Data, double CarboConsumido, double? CarboLimite, bool LimiteUltrapassado,
    double ProteinaConsumida, double? ProteinaMeta, double GorduraConsumida, int Refeicoes,
    int Medicoes, int? GlicemiaMin, int? GlicemiaMax, double? GlicemiaMedia, int MedicoesForaDaFaixa,
    int? FaixaMin, int? FaixaMax);
public record LembreteRelatorioDto(string Horario, double? DoseInformada, string? Descricao, int DiasConfirmados, int DiasNoPeriodo);
public record RelatorioDto(
    string Nome, string De, string Ate, PrescricaoDto? PrescricaoVigente, List<DiaHistoricoDto> Dias,
    List<GlicemiaDto> Glicemias, List<LembreteRelatorioDto> Lembretes, string AvisoOrientacao);

// IA
public record SugestaoTextoReq(string? Descricao);
public record SugestaoFotoReq(string? ImagemBase64);
public record ItemSugeridoDto(
    string Descricao, double QuantidadeG, AlimentoDto? Alimento, double? Carbo, double? Proteina, double? Gordura);
public record SugestaoDto(int Id, EntradaIA Entrada, List<ItemSugeridoDto> Itens, int? UsosRestantes);
public record AlimentoEstimadoDto(PropostaAlimentoDto Proposta, int? UsosRestantes);
