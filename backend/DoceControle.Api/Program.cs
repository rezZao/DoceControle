using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using DoceControle.Api.Dados;
using DoceControle.Api.Dominio;
using DoceControle.Api.Endpoints;
using DoceControle.Api.Servicos;
using DoceControle.Api.Servicos.IA;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

builder.Services.AddDbContext<BancoDeDados>(o =>
    o.UseSqlite(config.GetConnectionString("Padrao") ?? "Data Source=dococontrole.db"));

builder.Services.AddScoped<ServicoDia>();
builder.Services.AddSingleton<IPasswordHasher<Usuario>, PasswordHasher<Usuario>>();
builder.Services.AddSingleton<IProvedorPagamento, ProvedorPagamentoSimulado>();

// Provedor de IA: Claude, com a chave em IA:ChaveApi ou na variável ANTHROPIC_API_KEY. Sem chave, a IA fica
// desativada e o registro manual segue disponível: nada é simulado.
var temChaveIA = !string.IsNullOrWhiteSpace(config["IA:ChaveApi"]) ||
                 !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY"));
if (temChaveIA) builder.Services.AddSingleton<IServicoIA, ServicoIAClaude>();
else builder.Services.AddSingleton<IServicoIA, ServicoIANaoConfigurado>();

// Consulta de produtos por código de barras (Open Food Facts). Só o número do código sai do servidor.
builder.Services.AddHttpClient<IConsultaCodigoBarras, ConsultaOpenFoodFacts>(cliente =>
{
    cliente.BaseAddress = new Uri(config["CodigoBarras:UrlBase"] ?? "https://world.openfoodfacts.org/");
    cliente.Timeout = TimeSpan.FromSeconds(8);
    cliente.DefaultRequestHeaders.UserAgent.ParseAdd("DoceControle/1.0 (projeto academico)");
});

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// RNF04: sessão em cookie HttpOnly, encerrada após um período sem atividade.
builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o =>
    {
        o.Cookie.Name = "dococontrole.sessao";
        o.Cookie.HttpOnly = true;
        o.Cookie.SameSite = SameSiteMode.Strict;
        o.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
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

if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
    app.UseHttpsRedirection(); // RNF04
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

app.Run();

public partial class Program;
