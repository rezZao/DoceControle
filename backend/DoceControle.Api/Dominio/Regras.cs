using System.Globalization;
using System.Text;

namespace DoceControle.Api.Dominio;

public record PorcaoExemplo(int AlimentoId, string Nome, string Porcao, double PorcaoG, double Carbo, double Proteina);

public record AvaliacaoJejum(EstadoJejum Estado, int Minutos, int RestanteMin);

/// <summary>
/// Regras fixas de cálculo (seção 4 do documento). São funções puras, sem banco e sem IA (RN21),
/// para que o mesmo dado de entrada gere sempre o mesmo resultado (RNF07).
/// </summary>
public static class Regras
{
    public const int MaxRefeicoesPorDia = 10;
    public const int MaxExemplosPorRefeicao = 5;

    public static double Arredondar(double valor) => Math.Round(valor, 1, MidpointRounding.AwayFromZero);

    /// <summary>
    /// RN06: nutriente = quantidade consumida (g) × nutriente por 100 g ÷ 100.
    /// </summary>
    public static double Nutriente(double quantidadeG, double por100g) => quantidadeG * por100g / 100.0;

    /// <summary>
    /// RN03: divide o limite diário em partes iguais. Cada parte é truncada em uma casa decimal,
    /// de modo que a soma nunca ultrapasse o limite (RI03).
    /// </summary>
    public static double[] DividirIgualmente(double limiteDia, int refeicoes)
    {
        if (refeicoes <= 0) throw new ArgumentOutOfRangeException(nameof(refeicoes));
        if (limiteDia <= 0) throw new ArgumentOutOfRangeException(nameof(limiteDia));

        var parte = Math.Floor((decimal)limiteDia / refeicoes * 10m) / 10m;
        return Enumerable.Repeat((double)parte, refeicoes).ToArray();
    }

    /// <summary>RN03 / RI03: nenhuma parte negativa e soma menor ou igual ao limite diário.</summary>
    public static bool DivisaoRespeitaLimite(double limiteDia, IEnumerable<double> partes)
    {
        var lista = partes.ToList();
        return lista.All(p => p >= 0) && lista.Sum(p => (decimal)p) <= (decimal)limiteDia;
    }

    /// <summary>RN08: só classifica o valor em relação à faixa prescrita. Não diagnostica (RI04).</summary>
    public static SituacaoGlicemia ClassificarGlicemia(int valor, Prescricao? vigente)
    {
        if (vigente is null) return SituacaoGlicemia.SemPrescricao;
        if (valor < vigente.GlicemiaMin) return SituacaoGlicemia.Abaixo;
        if (valor > vigente.GlicemiaMax) return SituacaoGlicemia.Acima;
        return SituacaoGlicemia.NaFaixa;
    }

    /// <summary>
    /// RN05: porções de exemplo vêm da base de alimentos e só aparecem quando cabem
    /// no limite restante da refeição. Uma por categoria, da maior para a menor em carboidratos.
    /// </summary>
    public static List<PorcaoExemplo> PorcoesDeExemplo(
        IEnumerable<Alimento> baseAlimentos, string nomeRefeicao, double restanteCarbo,
        int maximo = MaxExemplosPorRefeicao)
    {
        if (restanteCarbo <= 0) return [];

        var tipo = TipoDaRefeicao(nomeRefeicao);

        return baseAlimentos
            .Where(a => a.Tipos.Length > 0 && (tipo is null || a.Tipos.Split(',').Contains(tipo)))
            .Select(a => new
            {
                Alimento = a,
                Carbo = Nutriente(a.PorcaoPadraoG, a.CarboPor100g),
                Proteina = Nutriente(a.PorcaoPadraoG, a.ProteinaPor100g),
            })
            .Where(x => x.Carbo <= restanteCarbo)
            .GroupBy(x => x.Alimento.Categoria)
            .Select(g => g.OrderByDescending(x => x.Carbo).ThenBy(x => x.Alimento.Ordem).First())
            .OrderByDescending(x => x.Carbo)
            .ThenBy(x => x.Alimento.Ordem)
            .Take(maximo)
            .Select(x => new PorcaoExemplo(
                x.Alimento.Id, x.Alimento.Nome, x.Alimento.PorcaoDescricao, x.Alimento.PorcaoPadraoG,
                Arredondar(x.Carbo), Arredondar(x.Proteina)))
            .ToList();
    }

    /// <summary>Classifica a refeição pelo nome para escolher exemplos coerentes. Nulo = qualquer tipo.</summary>
    public static string? TipoDaRefeicao(string nome)
    {
        var n = Normalizar(nome);
        if (n.Contains("almoc") || n.Contains("jant")) return "principal";
        if (n.Contains("cafe") || n.Contains("desjejum")) return "cafe";
        if (n.Contains("lanche") || n.Contains("ceia") || n.Contains("colacao")) return "lanche";
        return null;
    }

    /// <summary>
    /// Tempo desde a última refeição em relação ao máximo que o médico orientou ficar sem comer.
    /// Só sinaliza o tempo: não indica conduta (RI04). A contagem parte da última refeição registrada hoje
    /// ou, se ainda não houve registro, do horário da primeira refeição do plano. Encerra quando a última
    /// refeição do plano é registrada (o resto do dia é descanso, não jejum).
    /// </summary>
    public static AvaliacaoJejum AvaliarJejum(
        DateTime agora, int? limiteMin, DateTime? ultimaRefeicao, TimeOnly? primeiraMeta, bool planoEncerrado)
    {
        if (limiteMin is not > 0) return new(EstadoJejum.SemLimite, 0, 0);
        if (planoEncerrado) return new(EstadoJejum.Encerrado, 0, 0);

        var referencia = ultimaRefeicao
                         ?? (primeiraMeta is { } hora ? DateOnly.FromDateTime(agora).ToDateTime(hora) : (DateTime?)null);
        if (referencia is null || agora < referencia) return new(EstadoJejum.Aguardando, 0, 0);

        var minutos = (int)Math.Floor((agora - referencia.Value).TotalMinutes);
        var restante = limiteMin.Value - minutos;
        // Exatamente no limite ainda está dentro do tempo orientado.
        return new(restante < 0 ? EstadoJejum.Excedido : EstadoJejum.Contando, minutos, restante);
    }

    /// <summary>Confere o formato e o dígito verificador de EAN-8, UPC-A (12), EAN-13 e GTIN-14.</summary>
    public static bool CodigoDeBarrasValido(string? codigo)
    {
        if (string.IsNullOrEmpty(codigo) || codigo.Length is not (8 or 12 or 13 or 14)) return false;
        if (!codigo.All(char.IsAsciiDigit)) return false;

        var soma = 0;
        // Da direita para a esquerda, ignorando o dígito verificador: pesos 3, 1, 3, 1...
        for (var i = codigo.Length - 2; i >= 0; i--)
        {
            var peso = (codigo.Length - 2 - i) % 2 == 0 ? 3 : 1;
            soma += (codigo[i] - '0') * peso;
        }
        return (10 - soma % 10) % 10 == codigo[^1] - '0';
    }

    /// <summary>UPC-A (12 dígitos) é o mesmo código que o EAN-13 com um zero na frente; guardamos sempre assim.</summary>
    public static string NormalizarCodigoDeBarras(string codigo) =>
        codigo.Length == 12 ? "0" + codigo : codigo;

    /// <summary>Valida um alimento criado pelo usuário. Devolve a mensagem de erro, ou nulo se estiver tudo certo.</summary>
    public static string? ValidarAlimento(
        string? nome, double carboPor100g, double proteinaPor100g, double gorduraPor100g, double porcaoG,
        string? porcaoDescricao,
        string? codigoBarras)
    {
        var nomeLimpo = nome?.Trim() ?? "";
        if (nomeLimpo.Length is < 2 or > 80) return "Dê um nome ao alimento, com até 80 letras.";
        if (!double.IsFinite(carboPor100g) || carboPor100g is < 0 or > 100)
            return "Os carboidratos devem ficar entre 0 e 100 g por 100 g do alimento.";
        if (!double.IsFinite(proteinaPor100g) || proteinaPor100g is < 0 or > 100)
            return "As proteínas devem ficar entre 0 e 100 g por 100 g do alimento.";
        if (!double.IsFinite(gorduraPor100g) || gorduraPor100g is < 0 or > 100)
            return "As gorduras devem ficar entre 0 e 100 g por 100 g do alimento.";
        // Os três macronutrientes juntos não passam de 100 g em 100 g (com folga para arredondamento).
        if (carboPor100g + proteinaPor100g + gorduraPor100g > 100.5)
            return "Carboidratos, proteínas e gorduras somados não podem passar de 100 g por 100 g do alimento.";
        if (!double.IsFinite(porcaoG) || porcaoG is <= 0 or > 2000)
            return "A porção de referência deve ficar entre 1 e 2000 g.";
        if ((porcaoDescricao?.Trim().Length ?? 0) > 40) return "A descrição da porção pode ter até 40 letras.";
        if (!string.IsNullOrEmpty(codigoBarras) && !CodigoDeBarrasValido(codigoBarras))
            return "O código de barras não é válido.";
        return null;
    }

    /// <summary>Minúsculas e sem acentos, para comparar nomes.</summary>
    public static string Normalizar(string texto)
    {
        var decomposto = texto.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposto.Length);
        foreach (var c in decomposto)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) sb.Append(c);
        }
        return sb.ToString().Normalize(NormalizationForm.FormC);
    }
}

/// <summary>
/// Textos fixos de saúde (RN08, RN15). Não indicam conduta nem tratamento.
/// PROVISÓRIOS: precisam da revisão de um profissional de saúde antes de qualquer uso real.
/// </summary>
public static class Textos
{
    public const string NaoSubstituiOrientacao =
        "O DoceControle não substitui a orientação do seu médico ou nutricionista " +
        "e não calcula nem sugere doses de insulina.";

    public const string GlicemiaAbaixo =
        "Este valor está abaixo da faixa informada pelo seu médico. Procure a sua equipe de saúde. " +
        "Se estiver se sentindo mal, busque atendimento de urgência.";

    public const string GlicemiaAcima =
        "Este valor está acima da faixa informada pelo seu médico. Procure a sua equipe de saúde. " +
        "Se estiver se sentindo mal, busque atendimento de urgência.";

    public const string JejumExcedido =
        "Já passou do tempo máximo sem comer que o seu médico informou. Siga a orientação da sua equipe de saúde.";

    public static string? AvisoGlicemia(SituacaoGlicemia situacao) => situacao switch
    {
        SituacaoGlicemia.Abaixo => GlicemiaAbaixo,
        SituacaoGlicemia.Acima => GlicemiaAcima,
        _ => null,
    };
}
