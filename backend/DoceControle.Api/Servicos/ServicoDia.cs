using System.Globalization;
using DoceControle.Api.Dados;
using DoceControle.Api.Dominio;
using Microsoft.EntityFrameworkCore;

namespace DoceControle.Api.Servicos;

public static class Formatos
{
    public static string Hora(TimeOnly h) => h.ToString("HH:mm", CultureInfo.InvariantCulture);
    public static string Data(DateOnly d) => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    public static bool LerHora(string? texto, out TimeOnly hora) =>
        TimeOnly.TryParseExact(texto, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out hora);

    public static bool LerData(string? texto, out DateOnly data) =>
        DateOnly.TryParseExact(texto, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out data);

    public static DateOnly Hoje() => DateOnly.FromDateTime(DateTime.Now);
}

public static class Conversoes
{
    public static AlimentoDto ParaDto(this Alimento a) => new(
        a.Id, a.Nome, a.Categoria, a.CarboPor100g, a.ProteinaPor100g, a.PorcaoPadraoG, a.PorcaoDescricao,
        a.Origem, a.CodigoBarras, a.UsuarioId is not null);

    public static MetaDto ParaDto(this MetaDeRefeicao m) =>
        new(m.Nome, Formatos.Hora(m.Horario), m.LimiteCarbo, m.MetaProteina);

    public static PrescricaoDto ParaDto(this Prescricao p) => new(
        p.Id, Formatos.Data(p.VigenteDesde), p.LimiteCarboDia, p.GlicemiaMin, p.GlicemiaMax,
        p.MetaProteinaDia, p.JejumMaxMin, p.DivisaoPersonalizada,
        p.Metas.OrderBy(m => m.Ordem).Select(m => m.ParaDto()).ToList());

    public static RegistroRefeicaoDto ParaDto(this RegistroRefeicao r) => new(
        r.Id, r.DataHora, r.Refeicao, Regras.Arredondar(r.TotalCarbo()), Regras.Arredondar(r.TotalProteina()),
        r.Itens.Select(i => new ItemDto(
            i.AlimentoId, i.Alimento.Nome, i.QuantidadeG,
            Regras.Arredondar(i.Carbo()), Regras.Arredondar(i.Proteina()), i.SugestaoIAId is not null)).ToList());

    public static GlicemiaDto ParaDto(this RegistroGlicemia g, Prescricao? vigente)
    {
        var situacao = Regras.ClassificarGlicemia(g.Valor, vigente);
        return new GlicemiaDto(g.Id, g.Valor, g.DataHora, situacao, Textos.AvisoGlicemia(situacao));
    }

    public static bool MesmoNome(string a, string b) =>
        string.Equals(Regras.Normalizar(a), Regras.Normalizar(b), StringComparison.Ordinal);
}

/// <summary>
/// Monta a visão de um dia (painel e dieta), o histórico e o relatório.
/// Só usa regras fixas: a IA não participa de nada aqui (RN21).
/// </summary>
public class ServicoDia(BancoDeDados db)
{
    /// <summary>RN13: vale a prescrição mais recente cuja vigência começou até a data consultada.</summary>
    public static Prescricao? Vigente(IEnumerable<Prescricao> prescricoes, DateOnly data) =>
        prescricoes
            .Where(p => p.VigenteDesde <= data)
            .OrderByDescending(p => p.VigenteDesde)
            .ThenByDescending(p => p.Id)
            .FirstOrDefault();

    public async Task<List<Prescricao>> PrescricoesAsync(int usuarioId) =>
        await db.Prescricoes.AsNoTracking().Include(p => p.Metas)
            .Where(p => p.UsuarioId == usuarioId).ToListAsync();

    public async Task<Prescricao?> VigenteAsync(int usuarioId, DateOnly data) =>
        Vigente(await PrescricoesAsync(usuarioId), data);

    private async Task<List<RegistroRefeicao>> RefeicoesAsync(int usuarioId, DateOnly de, DateOnly ate)
    {
        var inicio = de.ToDateTime(TimeOnly.MinValue);
        var fim = ate.AddDays(1).ToDateTime(TimeOnly.MinValue);
        return await db.Refeicoes.AsNoTracking()
            .Include(r => r.Itens).ThenInclude(i => i.Alimento)
            .Where(r => r.UsuarioId == usuarioId && r.DataHora >= inicio && r.DataHora < fim)
            .OrderBy(r => r.DataHora).ToListAsync();
    }

    private async Task<List<RegistroGlicemia>> GlicemiasAsync(int usuarioId, DateOnly de, DateOnly ate)
    {
        var inicio = de.ToDateTime(TimeOnly.MinValue);
        var fim = ate.AddDays(1).ToDateTime(TimeOnly.MinValue);
        return await db.Glicemias.AsNoTracking()
            .Where(g => g.UsuarioId == usuarioId && g.DataHora >= inicio && g.DataHora < fim)
            .OrderBy(g => g.DataHora).ToListAsync();
    }

    public async Task<DiaDto> MontarDiaAsync(int usuarioId, DateOnly data)
    {
        var prescricao = await VigenteAsync(usuarioId, data);
        var registros = await RefeicoesAsync(usuarioId, data, data);
        var glicemias = await GlicemiasAsync(usuarioId, data, data);

        var carbo = registros.Sum(r => r.TotalCarbo());
        var proteina = registros.Sum(r => r.TotalProteina());
        var glicemiasDto = glicemias.Select(g => g.ParaDto(prescricao)).ToList();

        // RN02: sem prescrição a dieta não é gerada; o painel mostra só o consumo.
        if (prescricao is null)
        {
            return new DiaDto(
                Formatos.Data(data), null, Regras.Arredondar(carbo), null, null, false,
                Regras.Arredondar(proteina), null, [], registros.Select(r => r.ParaDto()).ToList(),
                glicemiasDto, Textos.NaoSubstituiOrientacao);
        }

        var baseExemplos = await db.Alimentos.AsNoTracking().Where(a => a.Tipos != "").ToListAsync();
        var metas = prescricao.Metas.OrderBy(m => m.Ordem).ToList();

        var refeicoes = metas.Select(meta =>
        {
            var daRefeicao = registros.Where(r => Conversoes.MesmoNome(r.Refeicao, meta.Nome)).ToList();
            var consumido = daRefeicao.Sum(r => r.TotalCarbo());
            var restante = meta.LimiteCarbo - consumido;
            return new RefeicaoDoDiaDto(
                meta.Nome, Formatos.Hora(meta.Horario), meta.LimiteCarbo, meta.MetaProteina,
                Regras.Arredondar(consumido), Regras.Arredondar(daRefeicao.Sum(r => r.TotalProteina())),
                Regras.Arredondar(restante), Regras.Arredondar(consumido) > meta.LimiteCarbo,
                daRefeicao.Select(r => r.ParaDto()).ToList(),
                Regras.PorcoesDeExemplo(baseExemplos, meta.Nome, restante));
        }).ToList();

        var outros = registros
            .Where(r => !metas.Any(m => Conversoes.MesmoNome(r.Refeicao, m.Nome)))
            .Select(r => r.ParaDto()).ToList();

        return new DiaDto(
            Formatos.Data(data), prescricao.ParaDto(),
            Regras.Arredondar(carbo), prescricao.LimiteCarboDia,
            Regras.Arredondar(prescricao.LimiteCarboDia - carbo),
            Regras.Arredondar(carbo) > prescricao.LimiteCarboDia,
            Regras.Arredondar(proteina), prescricao.MetaProteinaDia,
            refeicoes, outros, glicemiasDto, Textos.NaoSubstituiOrientacao);
    }

    /// <summary>RN07: avisos de limite ultrapassado depois de gravar. Nunca bloqueiam o registro.</summary>
    public async Task<List<string>> AvisosDeLimiteAsync(int usuarioId, RegistroRefeicao registro)
    {
        var dia = await MontarDiaAsync(usuarioId, DateOnly.FromDateTime(registro.DataHora));
        var avisos = new List<string>();
        if (dia.Prescricao is null) return avisos;

        var refeicao = dia.Refeicoes.FirstOrDefault(r => Conversoes.MesmoNome(r.Nome, registro.Refeicao));
        if (refeicao is { LimiteUltrapassado: true })
        {
            avisos.Add($"O limite de carboidratos de \"{refeicao.Nome}\" foi ultrapassado " +
                       $"({refeicao.CarboConsumido:0.#} g de {refeicao.LimiteCarbo:0.#} g).");
        }
        if (dia.LimiteUltrapassado)
        {
            avisos.Add($"O limite diário de carboidratos foi ultrapassado " +
                       $"({dia.CarboConsumido:0.#} g de {dia.CarboLimite:0.#} g).");
        }
        return avisos;
    }

    public async Task<List<DiaHistoricoDto>> HistoricoAsync(int usuarioId, DateOnly de, DateOnly ate)
    {
        var prescricoes = await PrescricoesAsync(usuarioId);
        var refeicoes = (await RefeicoesAsync(usuarioId, de, ate)).ToLookup(r => DateOnly.FromDateTime(r.DataHora));
        var glicemias = (await GlicemiasAsync(usuarioId, de, ate)).ToLookup(g => DateOnly.FromDateTime(g.DataHora));

        var dias = new List<DiaHistoricoDto>();
        for (var dia = de; dia <= ate; dia = dia.AddDays(1))
        {
            // RN13: cada dia é comparado com os limites vigentes naquela data.
            var vigente = Vigente(prescricoes, dia);
            var carbo = Regras.Arredondar(refeicoes[dia].Sum(r => r.TotalCarbo()));
            var valores = glicemias[dia].Select(g => g.Valor).ToList();

            dias.Add(new DiaHistoricoDto(
                Formatos.Data(dia), carbo, vigente?.LimiteCarboDia,
                vigente is not null && carbo > vigente.LimiteCarboDia,
                Regras.Arredondar(refeicoes[dia].Sum(r => r.TotalProteina())), vigente?.MetaProteinaDia,
                refeicoes[dia].Count(),
                valores.Count,
                valores.Count > 0 ? valores.Min() : null,
                valores.Count > 0 ? valores.Max() : null,
                valores.Count > 0 ? Regras.Arredondar(valores.Average()) : null,
                glicemias[dia].Count(g => g.ForaDaFaixa(vigente)),
                vigente?.GlicemiaMin, vigente?.GlicemiaMax));
        }
        return dias;
    }

    public async Task<RelatorioDto> RelatorioAsync(Usuario usuario, DateOnly de, DateOnly ate)
    {
        var prescricoes = await PrescricoesAsync(usuario.Id);
        var dias = await HistoricoAsync(usuario.Id, de, ate);
        var glicemias = (await GlicemiasAsync(usuario.Id, de, ate))
            .Select(g => g.ParaDto(Vigente(prescricoes, DateOnly.FromDateTime(g.DataHora)))).ToList();

        var lembretes = await db.Lembretes.AsNoTracking()
            .Where(l => l.UsuarioId == usuario.Id && l.Ativo)
            .OrderBy(l => l.Horario)
            .Select(l => new
            {
                Lembrete = l,
                Confirmados = l.Confirmacoes.Count(c => c.Data >= de && c.Data <= ate),
            })
            .ToListAsync();

        var diasNoPeriodo = ate.DayNumber - de.DayNumber + 1;
        return new RelatorioDto(
            usuario.Nome, Formatos.Data(de), Formatos.Data(ate), Vigente(prescricoes, ate)?.ParaDto(), dias, glicemias,
            lembretes.Select(x => new LembreteRelatorioDto(
                Formatos.Hora(x.Lembrete.Horario), x.Lembrete.DoseInformada, x.Lembrete.Descricao,
                x.Confirmados, diasNoPeriodo)).ToList(),
            Textos.NaoSubstituiOrientacao);
    }
}
