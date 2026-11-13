using System.Security.Claims;
using DoceControle.Api.Dados;
using DoceControle.Api.Dominio;
using DoceControle.Api.Servicos;
using Microsoft.EntityFrameworkCore;

namespace DoceControle.Api.Endpoints;

public static class EndpointsPrescricao
{
    public static void MapPrescricao(this RouteGroupBuilder api)
    {
        api.MapGet("/prescricao", ObterVigente);
        api.MapPut("/prescricao", Registrar);
        api.MapGet("/jejum", ObterJejum);

        var lembretes = api.MapGroup("/lembretes");
        lembretes.MapGet("", ListarLembretes);
        lembretes.MapPost("", CriarLembrete);
        lembretes.MapPut("/{id:int}", AtualizarLembrete);
        lembretes.MapDelete("/{id:int}", ExcluirLembrete);
        lembretes.MapPost("/{id:int}/confirmar", ConfirmarLembrete);
    }

    private static async Task<IResult> ObterVigente(ClaimsPrincipal principal, ServicoDia dia, string? data)
    {
        var quando = Formatos.LerData(data, out var d) ? d : Formatos.Hoje();
        var vigente = await dia.VigenteAsync(principal.UsuarioId(), quando);
        return Results.Json(vigente?.ParaDto());
    }

    // RF03 / RF12: registrar ou atualizar a prescrição. Cada mudança vira uma nova prescrição,
    // vigente a partir de hoje, e o histórico continua usando os limites da época (RN13).
    private static async Task<IResult> Registrar(PrescricaoReq req, ClaimsPrincipal principal, BancoDeDados db)
    {
        // RN01: os valores só entram com a confirmação de que vieram de um profissional de saúde.
        if (!req.ConfirmaPrescricaoProfissional)
            return Erro.Invalido(
                "Confirme que estes valores foram prescritos por um profissional de saúde.", "sem_confirmacao");

        if (req.LimiteCarboDia is not (>= 1 and <= 1000))
            return Erro.Invalido("O limite diário de carboidratos deve ficar entre 1 e 1000 g.");
        if (req.GlicemiaMin is < 20 or > 600 || req.GlicemiaMax is < 20 or > 600)
            return Erro.Invalido("A faixa de glicemia deve ficar entre 20 e 600 mg/dL.");
        if (req.GlicemiaMin >= req.GlicemiaMax)
            return Erro.Invalido("A glicemia mínima precisa ser menor que a máxima.");
        if (req.MetaProteinaDia is not (null or (>= 1 and <= 500)))
            return Erro.Invalido("A meta de proteínas deve ficar entre 1 e 500 g.");
        if (req.JejumMaxMin is not (null or (>= 30 and <= 720)))
            return Erro.Invalido("O tempo máximo sem comer deve ficar entre 30 minutos e 12 horas.");

        var refeicoes = req.Refeicoes ?? [];
        if (refeicoes.Count is < 1 or > Regras.MaxRefeicoesPorDia)
            return Erro.Invalido($"Informe de 1 a {Regras.MaxRefeicoesPorDia} refeições.");

        var entradas = new List<(string Nome, TimeOnly Horario, double? LimiteCarbo)>();
        foreach (var r in refeicoes)
        {
            var nome = r.Nome?.Trim() ?? "";
            if (nome.Length is < 1 or > 40) return Erro.Invalido("Dê um nome a cada refeição (até 40 letras).");
            if (!Formatos.LerHora(r.Horario, out var horario))
                return Erro.Invalido($"Informe o horário de \"{nome}\".");
            if (entradas.Any(e => Conversoes.MesmoNome(e.Nome, nome)))
                return Erro.Invalido($"Há duas refeições chamadas \"{nome}\".");
            if (req.DivisaoPersonalizada && r.LimiteCarbo is not >= 0)
                return Erro.Invalido($"Informe os carboidratos de \"{nome}\".");
            entradas.Add((nome, horario, r.LimiteCarbo));
        }

        var usuarioId = principal.UsuarioId();
        var hoje = Formatos.LerData(req.Hoje, out var informado) ? informado : Formatos.Hoje();

        var prescricao = new Prescricao
        {
            UsuarioId = usuarioId,
            VigenteDesde = hoje,
            LimiteCarboDia = req.LimiteCarboDia,
            GlicemiaMin = req.GlicemiaMin,
            GlicemiaMax = req.GlicemiaMax,
            MetaProteinaDia = req.MetaProteinaDia,
            JejumMaxMin = req.JejumMaxMin,
            DivisaoPersonalizada = req.DivisaoPersonalizada,
            CriadaEm = DateTime.Now,
        };

        try
        {
            prescricao.GerarDieta(entradas.OrderBy(e => e.Horario).ToList());
        }
        catch (InvalidOperationException ex)
        {
            return Erro.Invalido(ex.Message, "divisao_acima_do_limite"); // RI03
        }

        // Duas alterações no mesmo dia: vale a última.
        await db.Prescricoes.Where(p => p.UsuarioId == usuarioId && p.VigenteDesde == hoje).ExecuteDeleteAsync();
        db.Prescricoes.Add(prescricao);
        await db.SaveChangesAsync();
        return Results.Ok(prescricao.ParaDto());
    }

    // Tempo desde a última refeição em relação ao máximo que o médico orientou ficar sem comer.
    // Só sinaliza: não indica conduta (RI04). O navegador manda a hora local, como nos demais registros.
    private static async Task<IResult> ObterJejum(
        ClaimsPrincipal principal, BancoDeDados db, ServicoDia servico, string? agora)
    {
        var momento = DateTime.TryParse(agora, System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.None, out var informado) ? informado : DateTime.Now;
        var dia = DateOnly.FromDateTime(momento);
        var usuarioId = principal.UsuarioId();

        var prescricao = await servico.VigenteAsync(usuarioId, dia);
        if (prescricao?.JejumMaxMin is not { } limite)
            return Results.Ok(new JejumDto(EstadoJejum.SemLimite, 0, null, 0, null));

        var inicio = dia.ToDateTime(TimeOnly.MinValue);
        var registros = await db.Refeicoes.AsNoTracking()
            .Where(r => r.UsuarioId == usuarioId && r.DataHora >= inicio && r.DataHora < inicio.AddDays(1) && r.DataHora <= momento)
            .Select(r => new { r.DataHora, r.Refeicao })
            .ToListAsync();

        var metas = prescricao.Metas.OrderBy(m => m.Horario).ToList();
        DateTime? ultima = registros.Count > 0 ? registros.Max(r => r.DataHora) : null;
        // Registrar a última refeição do plano encerra a contagem: o resto do dia é descanso, não jejum.
        var encerrado = metas.Count > 0 && registros.Any(r => Conversoes.MesmoNome(r.Refeicao, metas[^1].Nome));

        var avaliacao = Regras.AvaliarJejum(
            momento, limite, ultima, metas.Count > 0 ? metas[0].Horario : null, encerrado);
        return Results.Ok(new JejumDto(
            avaliacao.Estado, avaliacao.Minutos, limite, avaliacao.RestanteMin,
            avaliacao.Estado == EstadoJejum.Excedido ? Textos.JejumExcedido : null));
    }

    // Lembretes de insulina (RF10). São opcionais: o site funciona sem eles (RN12, RI07).

    private static async Task<IResult> ListarLembretes(ClaimsPrincipal principal, BancoDeDados db, string? data)
    {
        var dia = Formatos.LerData(data, out var d) ? d : Formatos.Hoje();
        var usuarioId = principal.UsuarioId();
        var lista = await db.Lembretes.AsNoTracking()
            .Where(l => l.UsuarioId == usuarioId)
            .OrderBy(l => l.Horario)
            .Select(l => new { Lembrete = l, Confirmado = l.Confirmacoes.Any(c => c.Data == dia) })
            .ToListAsync();
        return Results.Ok(lista.Select(x => ParaDto(x.Lembrete, x.Confirmado)));
    }

    private static LembreteDto ParaDto(LembreteInsulina l, bool confirmado) => new(
        l.Id, Formatos.Hora(l.Horario), l.DoseInformada, l.Descricao, l.RepeticaoMin, l.Ativo, confirmado);

    private static IResult? Validar(LembreteReq req, out TimeOnly horario)
    {
        if (!Formatos.LerHora(req.Horario, out horario)) return Erro.Invalido("Informe o horário do lembrete.");
        if (req.DoseInformada is not (null or (> 0 and <= 300)))
            return Erro.Invalido("A dose informada deve ficar entre 0 e 300 unidades.");
        if (req.RepeticaoMin is not (null or (>= 1 and <= 60)))
            return Erro.Invalido("O intervalo de repetição deve ficar entre 1 e 60 minutos.");
        if (req.Descricao?.Trim().Length > 60) return Erro.Invalido("A descrição pode ter até 60 letras.");
        return null;
    }

    private static void Aplicar(LembreteInsulina lembrete, LembreteReq req, TimeOnly horario)
    {
        lembrete.Horario = horario;
        lembrete.DoseInformada = req.DoseInformada; // RN10: só informação; nunca entra em cálculo.
        lembrete.Descricao = string.IsNullOrWhiteSpace(req.Descricao) ? null : req.Descricao.Trim();
        lembrete.RepeticaoMin = req.RepeticaoMin ?? 5; // RN09: padrão de 5 minutos.
        lembrete.Ativo = req.Ativo;
    }

    private static async Task<IResult> CriarLembrete(LembreteReq req, ClaimsPrincipal principal, BancoDeDados db)
    {
        if (Validar(req, out var horario) is { } erro) return erro;
        var usuarioId = principal.UsuarioId();
        if (await db.Lembretes.CountAsync(l => l.UsuarioId == usuarioId) >= 20)
            return Erro.Invalido("O máximo é de 20 lembretes.");

        var lembrete = new LembreteInsulina { UsuarioId = usuarioId };
        Aplicar(lembrete, req, horario);
        db.Lembretes.Add(lembrete);
        await db.SaveChangesAsync();
        return Results.Ok(ParaDto(lembrete, false));
    }

    private static async Task<IResult> AtualizarLembrete(
        int id, LembreteReq req, ClaimsPrincipal principal, BancoDeDados db)
    {
        if (Validar(req, out var horario) is { } erro) return erro;
        var usuarioId = principal.UsuarioId();
        var lembrete = await db.Lembretes.FirstOrDefaultAsync(l => l.Id == id && l.UsuarioId == usuarioId);
        if (lembrete is null) return Results.NotFound();

        Aplicar(lembrete, req, horario);
        await db.SaveChangesAsync();
        return Results.Ok(ParaDto(lembrete, false));
    }

    private static async Task<IResult> ExcluirLembrete(int id, ClaimsPrincipal principal, BancoDeDados db)
    {
        var usuarioId = principal.UsuarioId();
        var apagados = await db.Lembretes.Where(l => l.Id == id && l.UsuarioId == usuarioId).ExecuteDeleteAsync();
        return apagados == 0 ? Results.NotFound() : Results.Ok();
    }

    private static async Task<IResult> ConfirmarLembrete(
        int id, ConfirmarLembreteReq req, ClaimsPrincipal principal, BancoDeDados db)
    {
        var usuarioId = principal.UsuarioId();
        if (!await db.Lembretes.AnyAsync(l => l.Id == id && l.UsuarioId == usuarioId)) return Results.NotFound();

        var dia = Formatos.LerData(req.Data, out var d) ? d : Formatos.Hoje();
        if (!await db.ConfirmacoesLembrete.AnyAsync(c => c.LembreteInsulinaId == id && c.Data == dia))
        {
            db.ConfirmacoesLembrete.Add(new ConfirmacaoLembrete
            {
                LembreteInsulinaId = id, Data = dia, ConfirmadoEm = DateTime.Now,
            });
            await db.SaveChangesAsync();
        }
        return Results.Ok();
    }
}
