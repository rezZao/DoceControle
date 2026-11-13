using DoceControle.Api.Servicos;

namespace DoceControle.Api.Servicos.IA;

// A IA só TRANSCREVE o que está escrito no documento da prescrição. Ela não define limites, não calcula
// nem sugere doses (RI01, RI10). O resultado só preenche o formulário: o usuário confere tudo e confirma
// que os valores foram prescritos por um profissional de saúde antes de gravar (RN01).

public record RefeicaoLida(string? Nome, string? Horario, double? LimiteCarbo);

public record LembreteLido(string? Horario, string? Descricao, double? DoseInformada);

/// <summary>Como a IA devolve a leitura. Todo campo que não está no documento vem nulo.</summary>
public record PrescricaoLida(
    double? LimiteCarboDia, double? GlicemiaMin, double? GlicemiaMax, double? MetaProteinaDia,
    double? JejumMaxHoras, List<RefeicaoLida>? Refeicoes, List<LembreteLido>? Lembretes, string? Observacao);

public record RefeicaoLidaDto(string Nome, string? Horario, double? LimiteCarbo);

public record LembreteLidoDto(string Horario, string? Descricao, double? DoseInformada);

/// <summary>Leitura já conferida pelo servidor: valores fora de faixa viram nulos em vez de irem para o formulário.</summary>
public record PrescricaoLidaDto(
    double? LimiteCarboDia, int? GlicemiaMin, int? GlicemiaMax, double? MetaProteinaDia, int? JejumMaxMin,
    List<RefeicaoLidaDto> Refeicoes, List<LembreteLidoDto> Lembretes, string? Observacao);

public record PrescricaoLidaRespostaDto(PrescricaoLidaDto Leitura, int UsosRestantes);

public static class SaneadorPrescricao
{
    public static PrescricaoLidaDto Sanear(PrescricaoLida lida)
    {
        var limite = Faixa(lida.LimiteCarboDia, 1, 1000);
        int? min = Inteiro(lida.GlicemiaMin, 20, 600);
        int? max = Inteiro(lida.GlicemiaMax, 20, 600);
        // A faixa só vale se vier completa e coerente.
        if (min is null || max is null || min >= max) (min, max) = (null, null);

        int? jejum = lida.JejumMaxHoras is { } horas && double.IsFinite(horas)
            ? (int)Math.Round(horas * 60)
            : null;
        if (jejum is < 30 or > 720) jejum = null;

        var refeicoes = (lida.Refeicoes ?? [])
            .Select(r => new { Nome = r.Nome?.Trim() ?? "", r.Horario, r.LimiteCarbo })
            .Where(r => r.Nome.Length is >= 1 and <= 40)
            .Take(Dominio.Regras.MaxRefeicoesPorDia)
            .Select(r => new RefeicaoLidaDto(
                r.Nome,
                Formatos.LerHora(r.Horario, out var h) ? Formatos.Hora(h) : null,
                Faixa(r.LimiteCarbo, 0, 1000)))
            .ToList();

        var lembretes = (lida.Lembretes ?? [])
            .Where(l => Formatos.LerHora(l.Horario, out _))
            .Take(20)
            .Select(l =>
            {
                Formatos.LerHora(l.Horario, out var h);
                var descricao = l.Descricao?.Trim();
                return new LembreteLidoDto(
                    Formatos.Hora(h),
                    string.IsNullOrEmpty(descricao) ? null : descricao[..Math.Min(60, descricao.Length)],
                    Faixa(l.DoseInformada, 0.1, 300));
            })
            .ToList();

        return new PrescricaoLidaDto(
            limite, min, max, Faixa(lida.MetaProteinaDia, 1, 500), jejum, refeicoes, lembretes,
            string.IsNullOrWhiteSpace(lida.Observacao) ? null : lida.Observacao.Trim());
    }

    private static double? Faixa(double? valor, double min, double max) =>
        valor is { } v && double.IsFinite(v) && v >= min && v <= max ? Math.Round(v, 1) : null;

    private static int? Inteiro(double? valor, int min, int max) =>
        valor is { } v && double.IsFinite(v) && Math.Round(v) >= min && Math.Round(v) <= max ? (int)Math.Round(v) : null;
}
