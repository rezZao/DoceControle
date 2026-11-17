using DoceControle.Api.Dominio;
using DoceControle.Api.Servicos.IA;

namespace DoceControle.Testes;

public class TempoSemComerTestes
{
    private static readonly DateTime Hoje = new(2026, 11, 12);
    private static readonly TimeOnly Cafe = new(7, 0);

    private static AvaliacaoJejum Avaliar(DateTime agora, int? limite, DateTime? ultima = null, bool encerrado = false) =>
        Regras.AvaliarJejum(agora, limite, ultima, Cafe, encerrado);

    [Theory]
    [InlineData(null)]
    [InlineData(0)]
    public void Sem_limite_orientado_nao_ha_contagem(int? limite)
    {
        Assert.Equal(EstadoJejum.SemLimite, Avaliar(Hoje.AddHours(15), limite).Estado);
    }

    [Fact]
    public void Antes_da_primeira_refeicao_do_plano_aguarda()
    {
        Assert.Equal(EstadoJejum.Aguardando, Avaliar(Hoje.AddHours(6), 240).Estado);
    }

    [Fact]
    public void Sem_registro_conta_a_partir_do_horario_da_primeira_refeicao()
    {
        var r = Avaliar(Hoje.AddHours(9), 240); // 7h00 -> 9h00

        Assert.Equal(EstadoJejum.Contando, r.Estado);
        Assert.Equal(120, r.Minutos);
        Assert.Equal(120, r.RestanteMin);
    }

    [Fact]
    public void Conta_a_partir_da_ultima_refeicao_registrada()
    {
        var r = Avaliar(Hoje.AddHours(15), 240, ultima: Hoje.AddHours(12).AddMinutes(30)); // 12h30 -> 15h00

        Assert.Equal(EstadoJejum.Contando, r.Estado);
        Assert.Equal(150, r.Minutos);
        Assert.Equal(90, r.RestanteMin);
    }

    [Fact]
    public void Exatamente_no_limite_ainda_esta_dentro_do_tempo()
    {
        var r = Avaliar(Hoje.AddHours(11), 240, ultima: Hoje.AddHours(7));

        Assert.Equal(EstadoJejum.Contando, r.Estado);
        Assert.Equal(0, r.RestanteMin);
    }

    [Fact]
    public void Passando_do_limite_fica_excedido()
    {
        var r = Avaliar(Hoje.AddHours(11).AddMinutes(1), 240, ultima: Hoje.AddHours(7));

        Assert.Equal(EstadoJejum.Excedido, r.Estado);
        Assert.Equal(241, r.Minutos);
        Assert.Equal(-1, r.RestanteMin);
    }

    [Fact]
    public void Registrar_uma_refeicao_zera_a_contagem()
    {
        var antes = Avaliar(Hoje.AddHours(12), 240, ultima: Hoje.AddHours(7));
        var depois = Avaliar(Hoje.AddHours(12), 240, ultima: Hoje.AddHours(12));

        Assert.Equal(EstadoJejum.Excedido, antes.Estado);
        Assert.Equal(EstadoJejum.Contando, depois.Estado);
        Assert.Equal(0, depois.Minutos);
    }

    [Fact]
    public void Plano_encerrado_nao_conta_o_resto_do_dia()
    {
        Assert.Equal(EstadoJejum.Encerrado, Avaliar(Hoje.AddHours(23), 240, ultima: Hoje.AddHours(21), encerrado: true).Estado);
    }
}

public class CodigoDeBarrasTestes
{
    [Theory]
    [InlineData("7891000100103")] // EAN-13
    [InlineData("3017620422003")] // EAN-13
    [InlineData("036000291452")]  // UPC-A (12)
    [InlineData("96385074")]      // EAN-8
    public void Aceita_codigos_com_digito_verificador_correto(string codigo)
    {
        Assert.True(Regras.CodigoDeBarrasValido(codigo));
    }

    [Theory]
    [InlineData("7891000100104")] // dígito verificador errado
    [InlineData("789100010010")]  // 12 dígitos, verificador errado
    [InlineData("12345")]         // curto demais
    [InlineData("78910001001A3")] // não numérico
    [InlineData("")]
    [InlineData(null)]
    public void Recusa_codigos_invalidos(string? codigo)
    {
        Assert.False(Regras.CodigoDeBarrasValido(codigo));
    }

    [Fact]
    public void UPC_A_e_guardado_como_EAN_13_com_zero_na_frente()
    {
        Assert.Equal("0036000291452", Regras.NormalizarCodigoDeBarras("036000291452"));
        Assert.True(Regras.CodigoDeBarrasValido(Regras.NormalizarCodigoDeBarras("036000291452")));
        Assert.Equal("7891000100103", Regras.NormalizarCodigoDeBarras("7891000100103"));
    }
}

public class AlimentoCriadoPeloUsuarioTestes
{
    private static string? Validar(
        string? nome = "Pão de queijo", double carbo = 34.2, double proteina = 5.1, double gordura = 24.6,
        double porcao = 40, string? descricao = "2 unidades", string? codigo = null) =>
        Regras.ValidarAlimento(nome, carbo, proteina, gordura, porcao, descricao, codigo);

    [Fact]
    public void Alimento_correto_e_aceito() => Assert.Null(Validar());

    [Fact]
    public void Alimento_sem_carboidratos_e_aceito() => Assert.Null(Validar(carbo: 0, proteina: 25));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("a")]
    public void Exige_nome(string? nome) => Assert.NotNull(Validar(nome: nome));

    [Theory]
    [InlineData(-1, 5, 0)]
    [InlineData(101, 0, 0)]
    [InlineData(10, -0.1, 0)]
    [InlineData(double.NaN, 5, 0)]
    [InlineData(60, 50, 0)]   // carboidratos e proteínas somados passam de 100 g em 100 g
    [InlineData(10, 5, -1)]   // gordura negativa
    [InlineData(10, 5, 101)]  // gordura acima de 100 g
    [InlineData(10, 5, double.NaN)]
    [InlineData(40, 30, 40)]  // os três somados passam de 100 g em 100 g
    public void Recusa_valores_nutricionais_impossiveis(double carbo, double proteina, double gordura)
    {
        Assert.NotNull(Validar(carbo: carbo, proteina: proteina, gordura: gordura));
    }

    [Fact]
    public void Aceita_alimento_so_de_gordura() => Assert.Null(Validar(carbo: 0, proteina: 0.5, gordura: 82.4));

    [Fact]
    public void Gordura_e_calculada_pela_base_como_os_outros_macronutrientes()
    {
        var queijo = new Alimento { Nome = "Queijo", CarboPor100g = 3, ProteinaPor100g = 22.6, GorduraPor100g = 24.2 };
        var pao = new Alimento { Nome = "Pão", CarboPor100g = 58.6, ProteinaPor100g = 8, GorduraPor100g = 3.1 };
        var registro = new RegistroRefeicao
        {
            Itens =
            [
                new ItemRefeicao { Alimento = queijo, QuantidadeG = 50 },
                new ItemRefeicao { Alimento = pao, QuantidadeG = 100 },
            ],
        };

        Assert.Equal(12.1 + 3.1, registro.TotalGordura(), precision: 6);
        Assert.Equal(1.5 + 58.6, registro.TotalCarbo(), precision: 6);
        Assert.Equal(11.3 + 8, registro.TotalProteina(), precision: 6);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    [InlineData(2001)]
    public void Recusa_porcao_fora_de_faixa(double porcao) => Assert.NotNull(Validar(porcao: porcao));

    [Fact]
    public void Recusa_codigo_de_barras_invalido() => Assert.NotNull(Validar(codigo: "7891000100104"));

    [Fact]
    public void Aceita_codigo_de_barras_valido() => Assert.Null(Validar(codigo: "7891000100103"));
}

public class LeituraDePrescricaoTestes
{
    private static PrescricaoLida Lida(
        double? limite = 180, double? gmin = 70, double? gmax = 180, double? proteina = 90, double? jejumHoras = 3.5,
        List<RefeicaoLida>? refeicoes = null, List<LembreteLido>? lembretes = null) =>
        new(limite, gmin, gmax, proteina, jejumHoras, refeicoes ?? [], lembretes ?? [], null);

    [Fact]
    public void Valores_corretos_passam_e_o_jejum_vira_minutos()
    {
        var r = SaneadorPrescricao.Sanear(Lida());

        Assert.Equal(180, r.LimiteCarboDia);
        Assert.Equal(70, r.GlicemiaMin);
        Assert.Equal(180, r.GlicemiaMax);
        Assert.Equal(90, r.MetaProteinaDia);
        Assert.Equal(210, r.JejumMaxMin);
    }

    [Fact]
    public void Valores_fora_de_faixa_viram_nulos_em_vez_de_irem_para_o_formulario()
    {
        var r = SaneadorPrescricao.Sanear(Lida(limite: 99999, proteina: -3, jejumHoras: 40));

        Assert.Null(r.LimiteCarboDia);
        Assert.Null(r.MetaProteinaDia);
        Assert.Null(r.JejumMaxMin);
    }

    [Theory]
    [InlineData(180.0, 70.0)]  // mínima maior que a máxima
    [InlineData(100.0, 100.0)] // iguais
    [InlineData(null, 180.0)]  // faixa incompleta
    [InlineData(5.0, 180.0)]   // fora de faixa
    public void Faixa_de_glicemia_so_vale_completa_e_coerente(double? minima, double? maxima)
    {
        var r = SaneadorPrescricao.Sanear(Lida(gmin: minima, gmax: maxima));

        Assert.Null(r.GlicemiaMin);
        Assert.Null(r.GlicemiaMax);
    }

    [Fact]
    public void Refeicoes_mantem_a_ordem_e_descartam_horario_invalido_sem_inventar()
    {
        var r = SaneadorPrescricao.Sanear(Lida(refeicoes:
        [
            new("Café da manhã", "07:00", 30),
            new("Almoço", "meio-dia", null),
            new("  ", "19:00", 30),
            new("Jantar", "19:00", 5000),
        ]));

        Assert.Equal(["Café da manhã", "Almoço", "Jantar"], r.Refeicoes.Select(x => x.Nome));
        Assert.Equal("07:00", r.Refeicoes[0].Horario);
        Assert.Null(r.Refeicoes[1].Horario); // o usuário preenche; a IA não chuta
        Assert.Null(r.Refeicoes[2].LimiteCarbo);
    }

    [Fact]
    public void Lembretes_exigem_horario_valido_e_dose_plausivel()
    {
        var r = SaneadorPrescricao.Sanear(Lida(lembretes:
        [
            new("08:00", "Insulina rápida", 6),
            new("amanhã", "Insulina", 4),
            new("22:00", "Insulina lenta", 9000),
        ]));

        Assert.Equal(["08:00", "22:00"], r.Lembretes.Select(l => l.Horario));
        Assert.Equal(6, r.Lembretes[0].DoseInformada);
        Assert.Null(r.Lembretes[1].DoseInformada);
    }

    [Fact]
    public void Documento_vazio_gera_leitura_vazia()
    {
        var r = SaneadorPrescricao.Sanear(new PrescricaoLida(null, null, null, null, null, null, null, "Não é uma prescrição."));

        Assert.Null(r.LimiteCarboDia);
        Assert.Empty(r.Refeicoes);
        Assert.Empty(r.Lembretes);
        Assert.Equal("Não é uma prescrição.", r.Observacao);
    }

    [Fact]
    public async Task Sem_provedor_configurado_a_IA_fica_indisponivel_em_vez_de_simular()
    {
        IServicoIA ia = new ServicoIANaoConfigurado();

        Assert.False(ia.Configurada);
        await Assert.ThrowsAsync<IAIndisponivelException>(() => ia.IdentificarPorTextoAsync("arroz", [], CancellationToken.None));
        await Assert.ThrowsAsync<IAIndisponivelException>(() => ia.EstimarAlimentoPorTextoAsync("arroz", CancellationToken.None));
        await Assert.ThrowsAsync<IAIndisponivelException>(() => ia.LerPrescricaoAsync([1, 2, 3], false, CancellationToken.None));
    }
}
