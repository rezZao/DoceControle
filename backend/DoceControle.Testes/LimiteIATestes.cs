using DoceControle.Api.Dominio;
using DoceControle.Api.Endpoints;
using Microsoft.Extensions.Configuration;

namespace DoceControle.Testes;

public class LimiteIATestes
{
    private static IConfiguration Config(params (string Chave, string Valor)[] valores) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(valores.Select(v => new KeyValuePair<string, string?>(v.Chave, v.Valor)))
            .Build();

    [Fact]
    public void Gratuito_usa_5_usos_por_dia_quando_nada_foi_configurado() =>
        Assert.Equal(5, Sessao.LimiteDiarioIA(Config(), Plano.Gratuito));

    [Fact]
    public void Gratuito_usa_o_limite_configurado() =>
        Assert.Equal(3, Sessao.LimiteDiarioIA(Config(("IA:LimiteDiarioGratuito", "3")), Plano.Gratuito));

    [Fact]
    public void Premium_nao_tem_limite_quando_nada_foi_configurado() =>
        Assert.Null(Sessao.LimiteDiarioIA(Config(), Plano.Premium));

    [Fact]
    public void Premium_ignora_o_limite_do_gratuito() =>
        Assert.Null(Sessao.LimiteDiarioIA(Config(("IA:LimiteDiarioGratuito", "3")), Plano.Premium));

    [Fact]
    public void Premium_aceita_um_teto_opcional() =>
        Assert.Equal(100, Sessao.LimiteDiarioIA(Config(("IA:LimiteDiarioPremium", "100")), Plano.Premium));

    [Theory]
    [InlineData("0")]
    [InlineData("-1")]
    [InlineData("")]
    public void Premium_com_teto_zero_negativo_ou_vazio_continua_sem_limite(string valor) =>
        Assert.Null(Sessao.LimiteDiarioIA(Config(("IA:LimiteDiarioPremium", valor)), Plano.Premium));
}
