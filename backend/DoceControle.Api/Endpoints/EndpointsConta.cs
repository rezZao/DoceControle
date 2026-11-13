using System.Net.Mail;
using System.Security.Claims;
using DoceControle.Api.Dados;
using DoceControle.Api.Dominio;
using DoceControle.Api.Servicos;
using DoceControle.Api.Servicos.IA;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace DoceControle.Api.Endpoints;

public static class Sessao
{
    public static int UsuarioId(this ClaimsPrincipal principal) =>
        int.Parse(principal.FindFirstValue(ClaimTypes.NameIdentifier)!);

    public static Task EntrarAsync(HttpContext http, Usuario usuario)
    {
        var identidade = new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, usuario.Id.ToString())],
            CookieAuthenticationDefaults.AuthenticationScheme);
        return http.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identidade));
    }

    public static int LimiteDiarioIA(IConfiguration config, Plano plano) => plano == Plano.Premium
        ? config.GetValue("IA:LimiteDiarioPremium", 30)
        : config.GetValue("IA:LimiteDiarioGratuito", 5);
}

public static class EndpointsConta
{
    public static void MapConta(this RouteGroupBuilder api)
    {
        var g = api.MapGroup("/conta");
        g.MapPost("/cadastro", Cadastrar).AllowAnonymous().RequireRateLimiting("entrada");
        g.MapPost("/entrar", Entrar).AllowAnonymous().RequireRateLimiting("entrada");
        g.MapPost("/sair", Sair).AllowAnonymous();
        g.MapGet("", Obter);
        g.MapPut("/consentimento-ia", MudarConsentimentoIA);
        g.MapPost("/excluir", Excluir);

        var assinatura = api.MapGroup("/assinatura");
        assinatura.MapPost("/assinar", Assinar);
        assinatura.MapPost("/cancelar", Cancelar);
    }

    // RF01: cadastro com consentimento específico e destacado. Sem ele, nada é gravado (RN14, RI06).
    private static async Task<IResult> Cadastrar(
        CadastroReq req, BancoDeDados db, IPasswordHasher<Usuario> hasher, HttpContext http)
    {
        var nome = req.Nome?.Trim() ?? "";
        var email = req.Email?.Trim().ToLowerInvariant() ?? "";
        var senha = req.Senha ?? "";

        if (!req.ConsentimentoDadosSaude)
            return Erro.Invalido(
                "Para criar a conta é preciso consentir com o tratamento dos seus dados de saúde.", "sem_consentimento");
        if (nome.Length is < 2 or > 80) return Erro.Invalido("Informe o seu nome.");
        if (email.Length > 160 || !MailAddress.TryCreate(email, out _) || !email.Contains('.'))
            return Erro.Invalido("Informe um e-mail válido.");
        if (senha.Length is < 8 or > 128) return Erro.Invalido("A senha precisa ter pelo menos 8 caracteres.");
        if (await db.Usuarios.AnyAsync(u => u.Email == email))
            return Erro.Status(409, "Já existe uma conta com este e-mail.", "email_em_uso");

        var agora = DateTime.Now;
        var usuario = new Usuario
        {
            Nome = nome,
            Email = email,
            ConsentimentoEm = agora,
            ConsentimentoIAEm = req.ConsentimentoIA ? agora : null,
            CriadoEm = agora,
        };
        usuario.SenhaHash = hasher.HashPassword(usuario, senha); // RNF04: senha só com hash.
        db.Usuarios.Add(usuario);
        await db.SaveChangesAsync();

        await Sessao.EntrarAsync(http, usuario);
        return Results.Ok();
    }

    // RF02
    private static async Task<IResult> Entrar(
        EntrarReq req, BancoDeDados db, IPasswordHasher<Usuario> hasher, HttpContext http)
    {
        var email = req.Email?.Trim().ToLowerInvariant() ?? "";
        var usuario = await db.Usuarios.FirstOrDefaultAsync(u => u.Email == email);

        var confere = usuario is not null &&
            hasher.VerifyHashedPassword(usuario, usuario.SenhaHash, req.Senha ?? "") != PasswordVerificationResult.Failed;
        if (!confere) return Erro.Status(401, "E-mail ou senha incorretos.", "credenciais");

        await Sessao.EntrarAsync(http, usuario!);
        return Results.Ok();
    }

    private static Task Sair(HttpContext http) =>
        http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);

    private static async Task<IResult> Obter(
        ClaimsPrincipal principal, BancoDeDados db, IServicoIA ia, IProvedorPagamento pagamento,
        IConfiguration config, HttpContext http)
    {
        var id = principal.UsuarioId();
        var usuario = await db.Usuarios.AsNoTracking().FirstOrDefaultAsync(u => u.Id == id);
        if (usuario is null)
        {
            await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.Unauthorized();
        }

        var hoje = Formatos.Hoje();
        var usos = await db.UsosIA.Where(x => x.UsuarioId == id && x.Data == hoje)
            .Select(x => x.Quantidade).FirstOrDefaultAsync();

        return Results.Ok(new ContaDto(
            usuario.Nome, usuario.Email, usuario.Plano, usuario.ConsentimentoEm,
            await db.Prescricoes.AnyAsync(p => p.UsuarioId == id),
            new IaEstadoDto(
                ia.Configurada, usuario.ConsentimentoIAEm is not null,
                Sessao.LimiteDiarioIA(config, usuario.Plano), usos,
                usuario.Plano == Plano.Premium),
            pagamento.Simulado,
            config.GetValue("Sessao:MinutosInatividade", 60)));
    }

    // RN20: consentimento separado para a IA, que pode ser dado ou revogado a qualquer momento.
    private static async Task<IResult> MudarConsentimentoIA(
        ConsentimentoIAReq req, ClaimsPrincipal principal, BancoDeDados db)
    {
        var usuario = await db.Usuarios.FirstAsync(u => u.Id == principal.UsuarioId());
        usuario.ConsentimentoIAEm = req.Consentir ? usuario.ConsentimentoIAEm ?? DateTime.Now : null;

        if (!req.Consentir)
        {
            // Sem consentimento, sugestões ainda não confirmadas deixam de ser guardadas.
            await db.SugestoesIA.Where(s => s.UsuarioId == usuario.Id && !s.Confirmada).ExecuteDeleteAsync();
        }
        await db.SaveChangesAsync();
        return Results.Ok();
    }

    // RF14 / RN14: excluir a conta apaga todos os dados do usuário (exclusão em cascata no banco).
    private static async Task<IResult> Excluir(
        ExcluirContaReq req, ClaimsPrincipal principal, BancoDeDados db, IPasswordHasher<Usuario> hasher,
        IProvedorPagamento pagamento, HttpContext http, CancellationToken ct)
    {
        var usuario = await db.Usuarios.AsNoTracking().FirstAsync(u => u.Id == principal.UsuarioId(), ct);
        if (hasher.VerifyHashedPassword(usuario, usuario.SenhaHash, req.Senha ?? "") == PasswordVerificationResult.Failed)
            return Erro.Status(403, "Senha incorreta.", "credenciais");

        if (usuario.Plano == Plano.Premium) await pagamento.CancelarAsync(usuario, ct);
        // Em ordem: as refeições saem antes dos alimentos criados pelo usuário, porque um alimento usado em
        // uma refeição não pode ser apagado sozinho. O restante sai em cascata junto com o usuário.
        await db.Refeicoes.Where(r => r.UsuarioId == usuario.Id).ExecuteDeleteAsync(ct);
        await db.Alimentos.Where(a => a.UsuarioId == usuario.Id).ExecuteDeleteAsync(ct);
        await db.Usuarios.Where(u => u.Id == usuario.Id).ExecuteDeleteAsync(ct);
        await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return Results.Ok();
    }

    // RF19: a assinatura passa pelo provedor externo; aqui só muda o estado (RN26).
    private static async Task<IResult> Assinar(
        ClaimsPrincipal principal, BancoDeDados db, IProvedorPagamento pagamento, CancellationToken ct)
    {
        var usuario = await db.Usuarios.FirstAsync(u => u.Id == principal.UsuarioId(), ct);
        if (usuario.Plano == Plano.Premium) return Results.Ok();

        if (!await pagamento.AssinarAsync(usuario, ct))
            return Erro.Status(402, "O provedor de pagamento não confirmou a assinatura.", "pagamento");

        usuario.Plano = Plano.Premium;
        await db.SaveChangesAsync(ct);
        return Results.Ok();
    }

    // RN25: ao cancelar, a foto é desativada e os registros já gravados são mantidos.
    private static async Task<IResult> Cancelar(
        ClaimsPrincipal principal, BancoDeDados db, IProvedorPagamento pagamento, CancellationToken ct)
    {
        var usuario = await db.Usuarios.FirstAsync(u => u.Id == principal.UsuarioId(), ct);
        if (usuario.Plano == Plano.Premium) await pagamento.CancelarAsync(usuario, ct);
        usuario.Plano = Plano.Gratuito;
        await db.SaveChangesAsync(ct);
        return Results.Ok();
    }
}
