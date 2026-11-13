using DoceControle.Api.Dominio;

namespace DoceControle.Api.Servicos.IA;

/// <summary>
/// O que a IA devolve ao identificar uma refeição: apenas alimentos e quantidades estimadas (RN16).
/// Os carboidratos e as proteínas da refeição são sempre calculados pela base de alimentos (RN06).
/// </summary>
public record ItemIdentificado(string Descricao, string? AlimentoBase, double QuantidadeG);

public record ResultadoIA(List<ItemIdentificado> Itens);

/// <summary>
/// Valores por 100 g propostos pela IA para um alimento NOVO (ou lidos do rótulo, quando a foto mostra a tabela
/// nutricional). É só uma proposta: o usuário confere e corrige antes de gravar, e o alimento fica marcado como
/// "estimado pela IA". Os nutrientes de uma refeição continuam vindo da base, nunca da resposta da IA (RI11).
/// </summary>
public record AlimentoEstimado(
    string Nome, string Categoria, double CarboPor100g, double ProteinaPor100g, double PorcaoPadraoG,
    string PorcaoDescricao, string? Observacao);

/// <summary>A IA falhou ou não está disponível. O registro manual continua valendo (RN19).</summary>
public class IAIndisponivelException(string mensagem, Exception? causa = null) : Exception(mensagem, causa);

/// <summary>
/// Provedor de IA externo (ator "Serviço de IA" do diagrama de casos de uso).
/// Recebe só o conteúdo da refeição ou do alimento, sem nome, e-mail nem prescrição (RNF11, RI12).
/// </summary>
public interface IServicoIA
{
    /// <summary>Falso quando o servidor não tem chave de um provedor de IA. Nesse caso nada é simulado.</summary>
    bool Configurada { get; }

    Task<ResultadoIA> IdentificarPorTextoAsync(
        string descricao, IReadOnlyList<Alimento> baseAlimentos, CancellationToken ct);

    Task<ResultadoIA> IdentificarPorFotoAsync(
        byte[] jpegSemMetadados, IReadOnlyList<Alimento> baseAlimentos, CancellationToken ct);

    Task<AlimentoEstimado> EstimarAlimentoPorTextoAsync(string descricao, CancellationToken ct);

    Task<AlimentoEstimado> EstimarAlimentoPorFotoAsync(byte[] jpegSemMetadados, string? descricao, CancellationToken ct);

    /// <summary>Transcreve a prescrição de uma foto (JPEG sem metadados) ou de um PDF.</summary>
    Task<PrescricaoLida> LerPrescricaoAsync(byte[] arquivo, bool pdf, CancellationToken ct);
}

/// <summary>Usado quando não há chave de API: a IA fica desativada e o registro manual segue disponível.</summary>
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
