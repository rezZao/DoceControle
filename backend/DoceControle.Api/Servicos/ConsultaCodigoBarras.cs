using System.Globalization;
using System.Text.Json;

namespace DoceControle.Api.Servicos;

public record ProdutoCodigo(
    string Nome, double? CarboPor100g, double? ProteinaPor100g, double? GorduraPor100g, double? PorcaoG,
    string? PorcaoDescricao);

public class ConsultaCodigoIndisponivelException(string mensagem, Exception? causa = null) : Exception(mensagem, causa);

public interface IConsultaCodigoBarras
{
    Task<ProdutoCodigo?> ConsultarAsync(string codigo, CancellationToken ct);
}

// Open Food Facts: só o número do código sai do servidor; os valores são colaborativos, o usuário confere
public class ConsultaOpenFoodFacts(HttpClient http, ILogger<ConsultaOpenFoodFacts> log) : IConsultaCodigoBarras
{
    public async Task<ProdutoCodigo?> ConsultarAsync(string codigo, CancellationToken ct)
    {
        JsonDocument documento;
        try
        {
            using var resposta = await http.GetAsync(
                $"api/v2/product/{Uri.EscapeDataString(codigo)}.json" +
                "?fields=product_name,product_name_pt,brands,nutriments,serving_size,serving_quantity", ct);

            if (resposta.StatusCode == System.Net.HttpStatusCode.NotFound) return null;
            resposta.EnsureSuccessStatusCode();
            documento = await JsonDocument.ParseAsync(await resposta.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            if (ct.IsCancellationRequested) throw;
            log.LogWarning("Código de barras: a consulta falhou ({Tipo}).", ex.GetType().Name);
            throw new ConsultaCodigoIndisponivelException("Não foi possível consultar o código de barras agora.", ex);
        }

        using (documento)
        {
            var raiz = documento.RootElement;
            if (raiz.TryGetProperty("status", out var status) && status.ValueKind == JsonValueKind.Number && status.GetInt32() == 0)
                return null;
            if (!raiz.TryGetProperty("product", out var produto) || produto.ValueKind != JsonValueKind.Object) return null;

            var nome = Texto(produto, "product_name_pt") ?? Texto(produto, "product_name") ?? "";
            var marca = Texto(produto, "brands")?.Split(',')[0].Trim();
            if (!string.IsNullOrEmpty(marca) && !nome.Contains(marca, StringComparison.OrdinalIgnoreCase))
                nome = nome.Length > 0 ? $"{nome} ({marca})" : marca;

            double? carbo = null, proteina = null, gordura = null;
            if (produto.TryGetProperty("nutriments", out var nutrientes) && nutrientes.ValueKind == JsonValueKind.Object)
            {
                carbo = Numero(nutrientes, "carbohydrates_100g");
                proteina = Numero(nutrientes, "proteins_100g");
                gordura = Numero(nutrientes, "fat_100g");
            }

            var porcao = Numero(produto, "serving_quantity");
            var descricao = Texto(produto, "serving_size");
            return new ProdutoCodigo(
                nome.Length > 80 ? nome[..80] : nome, carbo, proteina, gordura,
                porcao is > 0 ? porcao : null,
                descricao is { Length: > 0 and <= 40 } ? descricao : null);
        }
    }

    private static string? Texto(JsonElement e, string nome) =>
        e.TryGetProperty(nome, out var v) && v.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(v.GetString())
            ? v.GetString()!.Trim()
            : null;

    private static double? Numero(JsonElement e, string nome)
    {
        if (!e.TryGetProperty(nome, out var v)) return null;
        double? n = v.ValueKind switch
        {
            JsonValueKind.Number => v.GetDouble(),
            JsonValueKind.String when double.TryParse(v.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var d) => d,
            _ => null,
        };
        return n is { } x && double.IsFinite(x) && x >= 0 ? x : null;
    }
}
