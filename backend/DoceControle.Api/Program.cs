using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using DoceControle.Api.Dados;
using DoceControle.Api.Dominio;
using DoceControle.Api.Endpoints;
using DoceControle.Api.Servicos;
using DoceControle.Api.Servicos.IA;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

// o programa pode ser aberto de qualquer pasta; fora do desenvolvimento usa a pasta do executável
var emDesenvolvimento = string.Equals(
    Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT"), "Development", StringComparison.OrdinalIgnoreCase);
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = emDesenvolvimento ? null : AppContext.BaseDirectory,
});
var config = builder.Configuration;

// dados e configuração ficam em %LOCALAPPDATA%\DoceControle, fora da pasta do programa
var pastaDoUsuario = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DoceControle");

// appsettings.Local.json fica fora do Git: é onde vai a chave da IA
builder.Configuration.AddJsonFile(Path.Combine(AppContext.BaseDirectory, "appsettings.Local.json"), optional: true);
builder.Configuration.AddJsonFile(Path.Combine(pastaDoUsuario, "appsettings.Local.json"), optional: true);

// fase de teste: só neste computador, em HTTP no localhost (fora dele precisa de HTTPS)
var hospedagemLocal = config.GetValue("Hospedagem:Local", true);
var abrirNavegador = config.GetValue("Hospedagem:AbrirNavegador", !emDesenvolvimento);

// o banco fica na pasta do usuário tanto no .exe quanto no dotnet run
Directory.CreateDirectory(pastaDoUsuario);
var textoConexao = config.GetConnectionString("Padrao") ?? "Data Source=dococontrole.db";
if (textoConexao == "Data Source=dococontrole.db")
    textoConexao = $"Data Source={Path.Combine(pastaDoUsuario, "dococontrole.db")}";

// nome da aplicação e chaves fixos, para o login valer em qualquer cópia do programa
builder.Services.AddDataProtection()
    .SetApplicationName("DoceControle")
    .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(pastaDoUsuario, "chaves")));

// sem endereço definido, usa a primeira porta livre a partir da 5187
if (string.IsNullOrWhiteSpace(config["urls"]))
    builder.WebHost.UseUrls($"http://localhost:{PortaLivre(5187)}");

builder.Services.AddDbContext<BancoDeDados>(o => o.UseSqlite(textoConexao));

builder.Services.AddScoped<ServicoDia>();
builder.Services.AddSingleton<IPasswordHasher<Usuario>, PasswordHasher<Usuario>>();
builder.Services.AddSingleton<IProvedorPagamento, ProvedorPagamentoSimulado>();

// sem chave, a IA fica desativada e o registro manual continua funcionando
var temChaveIA = !string.IsNullOrWhiteSpace(config["IA:ChaveApi"]) ||
                 !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY"));
if (temChaveIA) builder.Services.AddSingleton<IServicoIA, ServicoIAClaude>();
else builder.Services.AddSingleton<IServicoIA, ServicoIANaoConfigurado>();

builder.Services.AddHttpClient<IConsultaCodigoBarras, ConsultaOpenFoodFacts>(cliente =>
{
    cliente.BaseAddress = new Uri(config["CodigoBarras:UrlBase"] ?? "https://world.openfoodfacts.org/");
    cliente.Timeout = TimeSpan.FromSeconds(8);
    cliente.DefaultRequestHeaders.UserAgent.ParseAdd("DoceControle/1.0 (projeto academico)");
});

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// sessão em cookie HttpOnly, encerrada por inatividade
builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o =>
    {
        o.Cookie.Name = "dococontrole.sessao";
        o.Cookie.HttpOnly = true;
        o.Cookie.SameSite = SameSiteMode.Strict;
        o.Cookie.SecurePolicy = emDesenvolvimento || hospedagemLocal
            ? CookieSecurePolicy.SameAsRequest
            : CookieSecurePolicy.Always;
        o.ExpireTimeSpan = TimeSpan.FromMinutes(config.GetValue("Sessao:MinutosInatividade", 60));
        o.SlidingExpiration = true;
        // É uma API: responde 401/403 em vez de redirecionar para uma página de login.
        o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = 401; return Task.CompletedTask; };
        o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = 403; return Task.CompletedTask; };
    });
builder.Services.AddAuthorization();

// Freia tentativas repetidas de login e de cadastro vindas do mesmo endereço.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("entrada", http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "desconhecido",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
});

var app = builder.Build();

using (var escopo = app.Services.CreateScope())
{
    var db = escopo.ServiceProvider.GetRequiredService<BancoDeDados>();
    await CargaInicial.PrepararAsync(db, Path.Combine(AppContext.BaseDirectory, "Dados", "alimentos.json"));
}

if (!emDesenvolvimento && !hospedagemLocal)
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

var api = app.MapGroup("/api").RequireAuthorization();
api.MapConta();
api.MapPrescricao();
api.MapAlimentos();
api.MapRegistros();
api.MapIA();
api.MapFallback(() => Results.NotFound()).AllowAnonymous();

// O site (frontend compilado em wwwroot) cuida das demais rotas.
app.MapFallbackToFile("index.html").AllowAnonymous();

// Ao iniciar, mostra onde está o site e, se for o caso, abre o navegador.
app.Lifetime.ApplicationStarted.Register(() =>
{
    var endereco = app.Urls.FirstOrDefault() ?? "http://localhost:5187";
    if (!emDesenvolvimento)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Console.WriteLine();
        Console.WriteLine("  DoceControle está rodando (versão de teste, só para este computador).");
        Console.WriteLine($"  Endereço: {endereco}");
        Console.WriteLine($"  Seus dados ficam em: {pastaDoUsuario}");
        Console.WriteLine(temChaveIA
            ? "  IA: ativada."
            : "  IA: desativada (sem chave). Veja o LEIA-ME.txt para ativar. O registro manual funciona normalmente.");
        Console.WriteLine();
        Console.WriteLine("  Para encerrar, feche esta janela.");
        Console.WriteLine();
    }

    if (!abrirNavegador) return;
    try
    {
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(endereco) { UseShellExecute = true });
    }
    catch (Exception)
    {
        Console.WriteLine($"  Não consegui abrir o navegador. Abra este endereço nele: {endereco}");
    }
});

app.Run();

static int PortaLivre(int inicial)
{
    for (var porta = inicial; porta < inicial + 20; porta++)
    {
        try
        {
            var teste = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, porta);
            teste.Start();
            teste.Stop();
            return porta;
        }
        catch (System.Net.Sockets.SocketException)
        {
            // Porta ocupada: tenta a próxima.
        }
    }
    return inicial;
}

public partial class Program;
