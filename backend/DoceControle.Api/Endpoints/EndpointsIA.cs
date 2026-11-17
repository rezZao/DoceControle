using System.Security.Claims;
using System.Text.Json;
using DoceControle.Api.Dados;
using DoceControle.Api.Dominio;
using DoceControle.Api.Servicos;
using DoceControle.Api.Servicos.IA;
using Microsoft.EntityFrameworkCore;

namespace DoceControle.Api.Endpoints;

public static class EndpointsIA
{
    private const int MaxCaracteresDescricao = 600;
    private const int MaxBytesFoto = 4 * 1024 * 1024;

    public static void MapIA(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/ia");
        g.MapPost("/sugestoes/texto", SugerirRefeicaoPorTexto);
        g.MapPost("/sugestoes/foto", SugerirRefeicaoPorFoto);
        g.MapDelete("/sugestoes/{id:int}", Descartar);
        g.MapPost("/alimentos/texto", EstimarAlimentoPorTexto);
        g.MapPost("/alimentos/foto", EstimarAlimentoPorFoto);
        g.MapPost("/prescricao", LerPrescricao);
    }

    // Regras comuns a todo uso da IA

    private sealed record Autorizacao(Usuario Usuario, UsoIA? Uso, int? Limite);

    private static async Task<(Autorizacao? Autorizacao, IResult? Erro)> AutorizarAsync(
        ClaimsPrincipal principal, BancoDeDados db, IServicoIA ia, IConfiguration config, bool exigePremium, CancellationToken ct)
    {
        var usuario = await db.Usuarios.FirstAsync(u => u.Id == principal.UsuarioId(), ct);

        if (!ia.Configurada)
            return (null, Erro.Status(503, "A IA ainda não foi configurada neste servidor. Você pode registrar manualmente.", "ia_nao_configurada"));

        if (usuario.ConsentimentoIAEm is null)
            return (null, Erro.Status(403, "Ative o consentimento para o uso da IA na sua conta.", "sem_consentimento_ia"));

        if (exigePremium && usuario.Plano != Plano.Premium)
            return (null, Erro.Status(403, "O registro por foto faz parte do plano premium.", "premium_necessario"));

        var hoje = Formatos.Hoje();
        var limite = Sessao.LimiteDiarioIA(config, usuario.Plano);
        var uso = await db.UsosIA.FirstOrDefaultAsync(x => x.UsuarioId == usuario.Id && x.Data == hoje, ct);
        if (limite is { } maximo && uso is { } atual && atual.Quantidade >= maximo)
            return (null, Erro.Status(429, "Você atingiu o limite de usos da IA por hoje. O registro manual continua disponível.", "limite_diario"));

        return (new Autorizacao(usuario, uso, limite), null);
    }

    private static async Task<int?> ConsumirAsync(BancoDeDados db, Autorizacao autorizacao, CancellationToken ct)
    {
        var uso = autorizacao.Uso ?? db.UsosIA.Add(new UsoIA { UsuarioId = autorizacao.Usuario.Id, Data = Formatos.Hoje() }).Entity;
        uso.Quantidade++;
        await db.SaveChangesAsync(ct);
        return autorizacao.Limite is { } limite ? Math.Max(0, limite - uso.Quantidade) : null;
    }

    private static IResult Falha(IAIndisponivelException ex) =>
        Erro.Status(503, ex.Message + " Você pode registrar manualmente.", "ia_indisponivel");

    private static bool TentarLerFoto(string? base64, out byte[] foto, out IResult? erro)
    {
        foto = [];
        erro = null;
        try
        {
            var bytes = Convert.FromBase64String(base64 ?? "");
            if (bytes.Length is 0 or > MaxBytesFoto)
            {
                erro = Erro.Invalido("A foto está vazia ou é grande demais.");
                return false;
            }
            foto = LimpadorDeFoto.RemoverMetadados(bytes);
            return true;
        }
        catch (Exception ex) when (ex is FormatException or InvalidDataException)
        {
            erro = Erro.Invalido("Não foi possível ler a foto. Envie uma imagem JPEG.");
            return false;
        }
    }

    private static async Task<List<Alimento>> AlimentosDoUsuarioAsync(BancoDeDados db, int usuarioId, CancellationToken ct) =>
        await db.Alimentos.AsNoTracking()
            .Where(a => a.UsuarioId == null || a.UsuarioId == usuarioId)
            .OrderBy(a => a.Ordem).ThenBy(a => a.Id)
            .ToListAsync(ct);

    // Refeição

    private static async Task<IResult> SugerirRefeicaoPorTexto(
        SugestaoTextoReq req, ClaimsPrincipal principal, BancoDeDados db, IServicoIA ia, IConfiguration config, CancellationToken ct)
    {
        var descricao = req.Descricao?.Trim() ?? "";
        if (descricao.Length is < 2 or > MaxCaracteresDescricao)
            return Erro.Invalido($"Descreva a refeição em até {MaxCaracteresDescricao} letras.");

        return await SugerirRefeicaoAsync(
            principal, db, ia, config, EntradaIA.Texto, exigePremium: false,
            alimentos => ia.IdentificarPorTextoAsync(descricao, alimentos, ct), ct);
    }

    private static async Task<IResult> SugerirRefeicaoPorFoto(
        SugestaoFotoReq req, ClaimsPrincipal principal, BancoDeDados db, IServicoIA ia, IConfiguration config, CancellationToken ct)
    {
        var plano = await db.Usuarios.AsNoTracking()
            .Where(u => u.Id == principal.UsuarioId()).Select(u => u.Plano).FirstAsync(ct);
        if (plano != Plano.Premium)
            return Erro.Status(403, "O registro por foto faz parte do plano premium.", "premium_necessario");
        if (!TentarLerFoto(req.ImagemBase64, out var foto, out var erro)) return erro!;

        return await SugerirRefeicaoAsync(
            principal, db, ia, config, EntradaIA.Foto, exigePremium: true,
            alimentos => ia.IdentificarPorFotoAsync(foto, alimentos, ct), ct);
    }

    private static async Task<IResult> SugerirRefeicaoAsync(
        ClaimsPrincipal principal, BancoDeDados db, IServicoIA ia, IConfiguration config, EntradaIA entrada, bool exigePremium,
        Func<IReadOnlyList<Alimento>, Task<ResultadoIA>> identificar, CancellationToken ct)
    {
        var (autorizacao, negado) = await AutorizarAsync(principal, db, ia, config, exigePremium, ct);
        if (negado is not null) return negado;
        var usuario = autorizacao!.Usuario;

        var alimentos = await AlimentosDoUsuarioAsync(db, usuario.Id, ct);

        ResultadoIA resultado;
        try
        {
            resultado = await identificar(alimentos);
        }
        catch (IAIndisponivelException ex)
        {
            return Falha(ex);
        }

        var porNome = alimentos.GroupBy(a => a.NomeBusca).ToDictionary(g => g.Key, g => g.First());
        var itens = resultado.Itens
            .Where(i => !string.IsNullOrWhiteSpace(i.Descricao))
            .Take(25)
            .Select(i =>
            {
                var quantidade = double.IsFinite(i.QuantidadeG) ? Math.Clamp(Math.Round(i.QuantidadeG), 0, 5000) : 0;
                var alimento = i.AlimentoBase is { } nome ? porNome.GetValueOrDefault(Regras.Normalizar(nome)) : null;
                return alimento is null
                    ? new ItemSugeridoDto(i.Descricao.Trim(), quantidade, null, null, null, null)
                    : new ItemSugeridoDto(
                        i.Descricao.Trim(), quantidade, alimento.ParaDto(),
                        Regras.Arredondar(Regras.Nutriente(quantidade, alimento.CarboPor100g)),
                        Regras.Arredondar(Regras.Nutriente(quantidade, alimento.ProteinaPor100g)),
                        Regras.Arredondar(Regras.Nutriente(quantidade, alimento.GorduraPor100g)));
            })
            .ToList();

        var restantes = await ConsumirAsync(db, autorizacao, ct);

        // Só uma sugestão pendente por usuário; as anteriores não confirmadas são descartadas.
        await db.SugestoesIA.Where(s => s.UsuarioId == usuario.Id && !s.Confirmada).ExecuteDeleteAsync(ct);
        var sugestao = new SugestaoIA
        {
            UsuarioId = usuario.Id,
            Entrada = entrada,
            CriadaEm = DateTime.Now,
            ItensJson = JsonSerializer.Serialize(
                itens.Select(i => new { i.Descricao, i.QuantidadeG, AlimentoId = i.Alimento?.Id })),
        };
        db.SugestoesIA.Add(sugestao);
        await db.SaveChangesAsync(ct);

        return Results.Ok(new SugestaoDto(sugestao.Id, entrada, itens, restantes));
    }

    private static async Task<IResult> Descartar(int id, ClaimsPrincipal principal, BancoDeDados db)
    {
        var usuarioId = principal.UsuarioId();
        await db.SugestoesIA.Where(s => s.Id == id && s.UsuarioId == usuarioId && !s.Confirmada).ExecuteDeleteAsync();
        return Results.Ok();
    }

    // Alimento novo

    private static async Task<IResult> EstimarAlimentoPorTexto(
        SugestaoAlimentoTextoReq req, ClaimsPrincipal principal, BancoDeDados db, IServicoIA ia, IConfiguration config,
        CancellationToken ct)
    {
        var descricao = req.Descricao?.Trim() ?? "";
        if (descricao.Length is < 2 or > MaxCaracteresDescricao)
            return Erro.Invalido($"Descreva o alimento em até {MaxCaracteresDescricao} letras.");

        return await EstimarAlimentoAsync(principal, db, ia, config, exigePremium: false, () => ia.EstimarAlimentoPorTextoAsync(descricao, ct), ct);
    }

    private static async Task<IResult> EstimarAlimentoPorFoto(
        SugestaoAlimentoFotoReq req, ClaimsPrincipal principal, BancoDeDados db, IServicoIA ia, IConfiguration config,
        CancellationToken ct)
    {
        var plano = await db.Usuarios.AsNoTracking()
            .Where(u => u.Id == principal.UsuarioId()).Select(u => u.Plano).FirstAsync(ct);
        if (plano != Plano.Premium)
            return Erro.Status(403, "O cadastro de alimentos por foto faz parte do plano premium.", "premium_necessario");
        if (!TentarLerFoto(req.ImagemBase64, out var foto, out var erro)) return erro!;
        var dica = req.Descricao?.Trim();
        if (dica?.Length > MaxCaracteresDescricao) return Erro.Invalido($"Use até {MaxCaracteresDescricao} letras na descrição.");

        return await EstimarAlimentoAsync(principal, db, ia, config, exigePremium: true, () => ia.EstimarAlimentoPorFotoAsync(foto, dica, ct), ct);
    }

    private static async Task<IResult> EstimarAlimentoAsync(
        ClaimsPrincipal principal, BancoDeDados db, IServicoIA ia, IConfiguration config, bool exigePremium,
        Func<Task<AlimentoEstimado>> estimar, CancellationToken ct)
    {
        var (autorizacao, negado) = await AutorizarAsync(principal, db, ia, config, exigePremium, ct);
        if (negado is not null) return negado;

        AlimentoEstimado estimado;
        try
        {
            estimado = await estimar();
        }
        catch (IAIndisponivelException ex)
        {
            return Falha(ex);
        }

        var restantes = await ConsumirAsync(db, autorizacao!, ct);
        var proposta = new PropostaAlimentoDto(
            Limpo(estimado.Nome, 80), Limpo(estimado.Categoria, 40, "Outros"),
            Numero(estimado.CarboPor100g, 100), Numero(estimado.ProteinaPor100g, 100), Numero(estimado.GorduraPor100g, 100),
            Numero(estimado.PorcaoPadraoG, 2000) is > 0 and var porcao ? porcao : 100,
            Limpo(estimado.PorcaoDescricao, 40, "1 porção"), OrigemAlimento.IA, null,
            string.IsNullOrWhiteSpace(estimado.Observacao) ? null : Limpo(estimado.Observacao, 300));
        return Results.Ok(new AlimentoEstimadoDto(proposta, restantes));
    }

    private static string Limpo(string? texto, int max, string padrao = "")
    {
        var t = texto?.Trim() ?? "";
        return t.Length == 0 ? padrao : t[..Math.Min(max, t.Length)];
    }

    private static double Numero(double valor, double max) =>
        double.IsFinite(valor) ? Math.Clamp(Math.Round(valor, 1), 0, max) : 0;

    // Prescrição

    // prescrição é dado sensível: além do consentimento geral, pede confirmação a cada envio; o arquivo não é guardado
    private static async Task<IResult> LerPrescricao(
        LerPrescricaoReq req, ClaimsPrincipal principal, BancoDeDados db, IServicoIA ia, IConfiguration config, CancellationToken ct)
    {
        if (!req.ConfirmaEnvio)
            return Erro.Invalido("Confirme que concorda com o envio deste documento à IA.", "sem_confirmacao_envio");

        byte[] arquivo;
        bool pdf;
        try
        {
            var bytes = Convert.FromBase64String(req.ArquivoBase64 ?? "");
            if (bytes.Length is 0 or > MaxBytesFoto)
                return Erro.Invalido("O arquivo está vazio ou é grande demais (o limite é de 4 MB).");

            pdf = bytes.Length > 4 && bytes[0] == 0x25 && bytes[1] == 0x50 && bytes[2] == 0x44 && bytes[3] == 0x46; // "%PDF"
            arquivo = pdf ? bytes : LimpadorDeFoto.RemoverMetadados(bytes);
        }
        catch (Exception ex) when (ex is FormatException or InvalidDataException)
        {
            return Erro.Invalido("Não foi possível ler o arquivo. Envie uma foto (JPEG) ou um PDF.");
        }

        var (autorizacao, negado) = await AutorizarAsync(principal, db, ia, config, exigePremium: false, ct);
        if (negado is not null) return negado;

        PrescricaoLida lida;
        try
        {
            lida = await ia.LerPrescricaoAsync(arquivo, pdf, ct);
        }
        catch (IAIndisponivelException ex)
        {
            return Erro.Status(503, ex.Message + " Você pode preencher a prescrição manualmente.", "ia_indisponivel");
        }

        var restantes = await ConsumirAsync(db, autorizacao!, ct);
        return Results.Ok(new PrescricaoLidaRespostaDto(SaneadorPrescricao.Sanear(lida), restantes));
    }
}

public record LerPrescricaoReq(string? ArquivoBase64, bool ConfirmaEnvio);
