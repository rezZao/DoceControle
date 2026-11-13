using System.Security.Claims;
using DoceControle.Api.Dados;
using DoceControle.Api.Dominio;
using DoceControle.Api.Servicos;
using Microsoft.EntityFrameworkCore;

namespace DoceControle.Api.Endpoints;

/// <summary>
/// Base de alimentos (RF05) e alimentos criados pelo usuário. Os alimentos criados são visíveis só para quem os criou
/// e entram no cálculo como qualquer outro: os nutrientes de uma refeição saem sempre da tabela de alimentos (RN06).
/// </summary>
public static class EndpointsAlimentos
{
    private const int MaxAlimentosProprios = 300;

    public static void MapAlimentos(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/alimentos");
        g.MapGet("", Buscar);
        g.MapPost("", Criar);
        g.MapDelete("/{id:int}", Excluir);
        g.MapGet("/codigo/{codigo}", PorCodigo);
    }

    private static async Task<IResult> Buscar(ClaimsPrincipal principal, BancoDeDados db, string? busca, int? limite)
    {
        var usuarioId = principal.UsuarioId();
        var termos = Regras.Normalizar(busca ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var todos = await db.Alimentos.AsNoTracking()
            .Where(a => a.UsuarioId == null || a.UsuarioId == usuarioId)
            .OrderBy(a => a.Ordem).ThenBy(a => a.Id)
            .ToListAsync();

        var encontrados = todos
            .Where(a => termos.All(t => a.NomeBusca.Contains(t)))
            .OrderBy(a => termos.Length > 0 && a.NomeBusca.StartsWith(termos[0]) ? 0 : 1)
            .ThenBy(a => a.UsuarioId is null ? 1 : 0) // os criados pelo usuário aparecem primeiro
            .Take(Math.Clamp(limite ?? 20, 1, 400))
            .Select(a => a.ParaDto());
        return Results.Ok(encontrados);
    }

    private static async Task<IResult> Criar(NovoAlimentoReq req, ClaimsPrincipal principal, BancoDeDados db)
    {
        if (req.Origem == OrigemAlimento.Base) return Erro.Invalido("Origem inválida.");

        var codigo = string.IsNullOrWhiteSpace(req.CodigoBarras) ? null : req.CodigoBarras.Trim();
        if (Regras.ValidarAlimento(req.Nome, req.CarboPor100g, req.ProteinaPor100g, req.GorduraPor100g, req.PorcaoPadraoG, req.PorcaoDescricao, codigo)
            is { } mensagem)
            return Erro.Invalido(mensagem);
        if (codigo is not null) codigo = Regras.NormalizarCodigoDeBarras(codigo);

        var usuarioId = principal.UsuarioId();
        if (await db.Alimentos.CountAsync(a => a.UsuarioId == usuarioId) >= MaxAlimentosProprios)
            return Erro.Invalido($"O limite é de {MaxAlimentosProprios} alimentos criados por você.");

        // Nomes iguais deixariam a busca e a IA ambíguas.
        var nome = req.Nome!.Trim();
        var nomeBusca = Regras.Normalizar(nome);
        if (await db.Alimentos.AnyAsync(a => a.NomeBusca == nomeBusca && (a.UsuarioId == null || a.UsuarioId == usuarioId)))
            return Erro.Status(409, "Já existe um alimento com esse nome. Use outro nome ou escolha o que já existe.", "nome_em_uso");

        var alimento = new Alimento
        {
            UsuarioId = usuarioId,
            Origem = req.Origem,
            CodigoBarras = codigo,
            Nome = nome,
            NomeBusca = nomeBusca,
            Categoria = string.IsNullOrWhiteSpace(req.Categoria) ? "Meus alimentos" : req.Categoria.Trim(),
            CarboPor100g = Math.Round(req.CarboPor100g, 1),
            ProteinaPor100g = Math.Round(req.ProteinaPor100g, 1),
            GorduraPor100g = Math.Round(req.GorduraPor100g, 1),
            PorcaoPadraoG = Math.Round(req.PorcaoPadraoG, 1),
            PorcaoDescricao = string.IsNullOrWhiteSpace(req.PorcaoDescricao) ? "1 porção" : req.PorcaoDescricao.Trim(),
            Tipos = "", // alimentos criados pelo usuário não entram nas porções de exemplo da dieta
            Ordem = 100000,
        };
        db.Alimentos.Add(alimento);
        await db.SaveChangesAsync();
        return Results.Ok(alimento.ParaDto());
    }

    private static async Task<IResult> Excluir(int id, ClaimsPrincipal principal, BancoDeDados db)
    {
        var usuarioId = principal.UsuarioId();
        if (!await db.Alimentos.AnyAsync(a => a.Id == id && a.UsuarioId == usuarioId)) return Results.NotFound();
        // Excluir mudaria o histórico de quem já registrou refeições com o alimento.
        if (await db.ItensRefeicao.AnyAsync(i => i.AlimentoId == id))
            return Erro.Status(409, "Este alimento já foi usado em refeições e não pode ser excluído.", "alimento_em_uso");

        await db.Alimentos.Where(a => a.Id == id && a.UsuarioId == usuarioId).ExecuteDeleteAsync();
        return Results.Ok();
    }

    // Código de barras: se o alimento já existe, devolve ele; se não, uma proposta para o usuário conferir.
    private static async Task<IResult> PorCodigo(
        string codigo, ClaimsPrincipal principal, BancoDeDados db, IConsultaCodigoBarras consulta, CancellationToken ct)
    {
        codigo = codigo.Trim();
        if (!Regras.CodigoDeBarrasValido(codigo)) return Erro.Invalido("Código de barras inválido.", "codigo_invalido");
        codigo = Regras.NormalizarCodigoDeBarras(codigo);

        var usuarioId = principal.UsuarioId();
        var existente = await db.Alimentos.AsNoTracking()
            .Where(a => a.CodigoBarras == codigo && (a.UsuarioId == null || a.UsuarioId == usuarioId))
            .OrderBy(a => a.UsuarioId == null ? 1 : 0)
            .FirstOrDefaultAsync(ct);
        if (existente is not null) return Results.Ok(new CodigoBarrasDto(existente.ParaDto(), null));

        ProdutoCodigo? produto;
        try
        {
            produto = await consulta.ConsultarAsync(codigo, ct);
        }
        catch (ConsultaCodigoIndisponivelException ex)
        {
            return Erro.Status(503, ex.Message + " Você pode cadastrar o alimento manualmente.", "consulta_indisponivel");
        }
        if (produto is null)
            return Erro.Status(404, "Esse produto não está na base de códigos de barras. Cadastre-o manualmente.", "produto_nao_encontrado");

        var incompleto = produto.CarboPor100g is null || produto.ProteinaPor100g is null || produto.GorduraPor100g is null;
        return Results.Ok(new CodigoBarrasDto(null, new PropostaAlimentoDto(
            produto.Nome.Length > 0 ? produto.Nome : $"Produto {codigo}",
            "Industrializados",
            produto.CarboPor100g, produto.ProteinaPor100g, produto.GorduraPor100g,
            produto.PorcaoG ?? 100, produto.PorcaoDescricao ?? (produto.PorcaoG is null ? "100 g" : "1 porção"),
            OrigemAlimento.CodigoBarras, codigo,
            incompleto
                ? "Produto encontrado, mas sem todos os valores nutricionais: complete pelo rótulo."
                : "Dados do Open Food Facts, uma base colaborativa. Confira com o rótulo antes de salvar.")));
    }
}
