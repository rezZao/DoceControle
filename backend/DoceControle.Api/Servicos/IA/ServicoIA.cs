using DoceControle.Api.Dominio;

namespace DoceControle.Api.Servicos.IA;

public record ItemIdentificado(string Descricao, string? AlimentoBase, double QuantidadeG);

public record ResultadoIA(List<ItemIdentificado> Itens);

public record AlimentoEstimado(
    string Nome, string Categoria, double CarboPor100g, double ProteinaPor100g, double GorduraPor100g, double PorcaoPadraoG,
    string PorcaoDescricao, string? Observacao);

public class IAIndisponivelException(string mensagem, Exception? causa = null) : Exception(mensagem, causa);

public interface IServicoIA
{
    bool Configurada { get; }

    Task<ResultadoIA> IdentificarPorTextoAsync(
        string descricao, IReadOnlyList<Alimento> baseAlimentos, CancellationToken ct);

    Task<ResultadoIA> IdentificarPorFotoAsync(
        byte[] jpegSemMetadados, IReadOnlyList<Alimento> baseAlimentos, CancellationToken ct);

    Task<AlimentoEstimado> EstimarAlimentoPorTextoAsync(string descricao, CancellationToken ct);

    Task<AlimentoEstimado> EstimarAlimentoPorFotoAsync(byte[] jpegSemMetadados, string? descricao, CancellationToken ct);

    Task<PrescricaoLida> LerPrescricaoAsync(byte[] arquivo, bool pdf, CancellationToken ct);
}

public class ServicoIANaoConfigurado : IServicoIA
{
    private static IAIndisponivelException Erro() =>
        new("A IA ainda não foi configurada neste servidor.");

    public bool Configurada => false;

    public Task<ResultadoIA> IdentificarPorTextoAsync(string d, IReadOnlyList<Alimento> b, CancellationToken ct) =>
        throw Erro();

    public Task<ResultadoIA> IdentificarPorFotoAsync(byte[] j, IReadOnlyList<Alimento> b, CancellationToken ct) =>
        throw Erro();

    public Task<AlimentoEstimado> EstimarAlimentoPorTextoAsync(string d, CancellationToken ct) => throw Erro();

    public Task<AlimentoEstimado> EstimarAlimentoPorFotoAsync(byte[] j, string? d, CancellationToken ct) =>
        throw Erro();

    public Task<PrescricaoLida> LerPrescricaoAsync(byte[] a, bool pdf, CancellationToken ct) => throw Erro();
}
