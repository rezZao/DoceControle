using System.Security.Claims;
using DoceControle.Api.Dados;
using DoceControle.Api.Dominio;
using DoceControle.Api.Servicos;
using Microsoft.EntityFrameworkCore;

namespace DoceControle.Api.Endpoints;

public static class EndpointsRegistros
{
    public static void MapRegistros(this RouteGroupBuilder api)
    {
        api.MapGet("/dia", ObterDia);
        api.MapGet("/historico", ObterHistorico);
        api.MapGet("/relatorio", ObterRelatorio);

        var refeicoes = api.MapGroup("/refeicoes");
        refeicoes.MapGet("/{id:int}", ObterRefeicao);
        refeicoes.MapPost("", CriarRefeicao);
        refeicoes.MapPut("/{id:int}", AtualizarRefeicao);
        refeicoes.MapDelete("/{id:int}", ExcluirRefeicao);

        var glicemias = api.MapGroup("/glicemias");
        glicemias.MapPost("", CriarGlicemia);
        glicemias.MapPut("/{id:int}", AtualizarGlicemia);
        glicemias.MapDelete("/{id:int}", ExcluirGlicemia);
    }

    private static async Task<IResult> ObterDia(ClaimsPrincipal principal, ServicoDia servico, string? data)
    {
        var dia = Formatos.LerData(data, out var d) ? d : Formatos.Hoje();
        return Results.Ok(await servico.MontarDiaAsync(principal.UsuarioId(), dia));
    }

    private static (DateOnly De, DateOnly Ate) Periodo(string? ate, int? dias)
    {
        var fim = Formatos.LerData(ate, out var d) ? d : Formatos.Hoje();
        return (fim.AddDays(-(Math.Clamp(dias ?? 7, 1, 90) - 1)), fim);
    }

    private static async Task<IResult> ObterHistorico(
        ClaimsPrincipal principal, ServicoDia servico, string? ate, int? dias)
    {
        var (de, fim) = Periodo(ate, dias);
        return Results.Ok(await servico.HistoricoAsync(principal.UsuarioId(), de, fim));
    }

    private static async Task<IResult> ObterRelatorio(
        ClaimsPrincipal principal, ServicoDia servico, BancoDeDados db, string? ate, int? dias)
    {
        var (de, fim) = Periodo(ate, dias);
        var usuario = await db.Usuarios.AsNoTracking().FirstAsync(u => u.Id == principal.UsuarioId());
        return Results.Ok(await servico.RelatorioAsync(usuario, de, fim));
    }

    private static IQueryable<RegistroRefeicao> ComItens(BancoDeDados db) =>
        db.Refeicoes.Include(r => r.Itens).ThenInclude(i => i.Alimento);

    private static async Task<IResult> ObterRefeicao(int id, ClaimsPrincipal principal, BancoDeDados db)
    {
        var usuarioId = principal.UsuarioId();
        var registro = await ComItens(db).AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == id && r.UsuarioId == usuarioId);
        return registro is null ? Results.NotFound() : Results.Ok(registro.ParaDto());
    }

    private static bool DataHoraValida(DateTime dataHora) =>
        dataHora.Year >= 2000 && dataHora <= DateTime.Now.AddDays(2);

    private static async Task<(IResult? Erro, List<ItemRefeicao> Itens)> MontarItensAsync(
        RefeicaoReq req, BancoDeDados db, int? sugestaoId)
    {
        if (string.IsNullOrWhiteSpace(req.Refeicao) || req.Refeicao.Trim().Length > 40)
            return (Erro.Invalido("Escolha a refeição."), []);
        if (!DataHoraValida(req.DataHora)) return (Erro.Invalido("Informe a data e a hora da refeição."), []);

        var itens = req.Itens ?? [];
        if (itens.Count is < 1 or > 40) return (Erro.Invalido("Inclua pelo menos um alimento."), []);
        if (itens.Any(i => i.QuantidadeG is not (> 0 and <= 5000)))
            return (Erro.Invalido("Informe a quantidade de cada alimento, em gramas."), []);

        var ids = itens.Select(i => i.AlimentoId).Distinct().ToList();
        var alimentos = await db.Alimentos.Where(a => ids.Contains(a.Id)).ToDictionaryAsync(a => a.Id);
        if (alimentos.Count != ids.Count) return (Erro.Invalido("Algum alimento não existe na base."), []);

        return (null, itens.Select(i => new ItemRefeicao
        {
            AlimentoId = i.AlimentoId,
            Alimento = alimentos[i.AlimentoId],
            QuantidadeG = i.QuantidadeG,
            SugestaoIAId = i.DaSugestao ? sugestaoId : null,
        }).ToList());
    }

    private static async Task<IResult> CriarRefeicao(
        RefeicaoReq req, ClaimsPrincipal principal, BancoDeDados db, ServicoDia servico)
    {
        var usuarioId = principal.UsuarioId();

        SugestaoIA? sugestao = null;
        if (req.SugestaoId is { } sugestaoId)
        {
            sugestao = await db.SugestoesIA.FirstOrDefaultAsync(
                s => s.Id == sugestaoId && s.UsuarioId == usuarioId && !s.Confirmada);
            if (sugestao is null) return Erro.Invalido("Esta sugestão não está mais disponível.", "sugestao_invalida");
        }

        var (erro, itens) = await MontarItensAsync(req, db, sugestao?.Id);
        if (erro is not null) return erro;

        sugestao?.Confirmar();
        var registro = new RegistroRefeicao
        {
            UsuarioId = usuarioId, DataHora = req.DataHora, Refeicao = req.Refeicao!.Trim(), Itens = itens,
        };
        db.Refeicoes.Add(registro);
        await db.SaveChangesAsync();

        return Results.Ok(new RefeicaoGravadaDto(registro.ParaDto(), await servico.AvisosDeLimiteAsync(usuarioId, registro)));
    }

    private static async Task<IResult> AtualizarRefeicao(
        int id, RefeicaoReq req, ClaimsPrincipal principal, BancoDeDados db, ServicoDia servico)
    {
        var usuarioId = principal.UsuarioId();
        var registro = await ComItens(db).FirstOrDefaultAsync(r => r.Id == id && r.UsuarioId == usuarioId);
        if (registro is null) return Results.NotFound();

        var sugestaoOriginal = registro.Itens.Select(i => i.SugestaoIAId).FirstOrDefault(s => s is not null);
        var (erro, itens) = await MontarItensAsync(req, db, sugestaoOriginal);
        if (erro is not null) return erro;

        db.ItensRefeicao.RemoveRange(registro.Itens);
        registro.Itens = itens;
        registro.DataHora = req.DataHora;
        registro.Refeicao = req.Refeicao!.Trim();
        await db.SaveChangesAsync();

        return Results.Ok(new RefeicaoGravadaDto(registro.ParaDto(), await servico.AvisosDeLimiteAsync(usuarioId, registro)));
    }

    private static async Task<IResult> ExcluirRefeicao(int id, ClaimsPrincipal principal, BancoDeDados db)
    {
        var usuarioId = principal.UsuarioId();
        var apagados = await db.Refeicoes.Where(r => r.Id == id && r.UsuarioId == usuarioId).ExecuteDeleteAsync();
        return apagados == 0 ? Results.NotFound() : Results.Ok();
    }

    private static IResult? Validar(GlicemiaReq req)
    {
        if (req.Valor is < 10 or > 1000) return Erro.Invalido("Informe a glicemia em mg/dL (entre 10 e 1000).");
        if (!DataHoraValida(req.DataHora)) return Erro.Invalido("Informe a data e a hora da medição.");
        return null;
    }

    private static async Task<IResult> CriarGlicemia(
        GlicemiaReq req, ClaimsPrincipal principal, BancoDeDados db, ServicoDia servico)
    {
        if (Validar(req) is { } erro) return erro;
        var usuarioId = principal.UsuarioId();

        var registro = new RegistroGlicemia { UsuarioId = usuarioId, Valor = req.Valor, DataHora = req.DataHora };
        db.Glicemias.Add(registro);
        await db.SaveChangesAsync();

        var vigente = await servico.VigenteAsync(usuarioId, DateOnly.FromDateTime(req.DataHora));
        return Results.Ok(registro.ParaDto(vigente));
    }

    private static async Task<IResult> AtualizarGlicemia(
        int id, GlicemiaReq req, ClaimsPrincipal principal, BancoDeDados db, ServicoDia servico)
    {
        if (Validar(req) is { } erro) return erro;
        var usuarioId = principal.UsuarioId();
        var registro = await db.Glicemias.FirstOrDefaultAsync(g => g.Id == id && g.UsuarioId == usuarioId);
        if (registro is null) return Results.NotFound();

        registro.Valor = req.Valor;
        registro.DataHora = req.DataHora;
        await db.SaveChangesAsync();

        var vigente = await servico.VigenteAsync(usuarioId, DateOnly.FromDateTime(req.DataHora));
        return Results.Ok(registro.ParaDto(vigente));
    }

    private static async Task<IResult> ExcluirGlicemia(int id, ClaimsPrincipal principal, BancoDeDados db)
    {
        var usuarioId = principal.UsuarioId();
        var apagados = await db.Glicemias.Where(g => g.Id == id && g.UsuarioId == usuarioId).ExecuteDeleteAsync();
        return apagados == 0 ? Results.NotFound() : Results.Ok();
    }
}
