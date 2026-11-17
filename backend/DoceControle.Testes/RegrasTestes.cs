using DoceControle.Api.Dominio;
using DoceControle.Api.Servicos;
using DoceControle.Api.Servicos.IA;

namespace DoceControle.Testes;

public class RegrasDeNutrientesTestes
{
    [Fact]
    public void RN06_exemplo_do_documento_alimento_com_20g_por_100g_usa_20g()
    {
        Assert.Equal(20, Regras.Nutriente(quantidadeG: 100, por100g: 20));
    }

    [Theory]
    [InlineData(50, 58.6, 29.3)]
    [InlineData(150, 28.1, 42.15)]
    [InlineData(0, 99.5, 0)]
    public void RN06_nutriente_e_proporcional_a_quantidade(double quantidade, double por100g, double esperado)
    {
        Assert.Equal(esperado, Regras.Nutriente(quantidade, por100g), precision: 6);
    }

    [Fact]
    public void RN06_total_da_refeicao_e_a_soma_dos_itens()
    {
        var arroz = new Alimento { Nome = "Arroz", CarboPor100g = 28.1, ProteinaPor100g = 2.5 };
        var feijao = new Alimento { Nome = "Feijão", CarboPor100g = 13.6, ProteinaPor100g = 4.8 };
        var registro = new RegistroRefeicao
        {
            Itens =
            [
                new ItemRefeicao { Alimento = arroz, QuantidadeG = 100 },
                new ItemRefeicao { Alimento = feijao, QuantidadeG = 90 },
            ],
        };

        Assert.Equal(28.1 + 12.24, registro.TotalCarbo(), precision: 6);
        Assert.Equal(2.5 + 4.32, registro.TotalProteina(), precision: 6);
    }
}

public class RegrasDeDivisaoTestes
{
    [Fact]
    public void RN03_exemplo_do_documento_180g_em_6_refeicoes_reserva_30g()
    {
        Assert.Equal([30, 30, 30, 30, 30, 30], Regras.DividirIgualmente(180, 6));
    }

    [Theory]
    [InlineData(100, 3)]
    [InlineData(65.1, 3)]
    [InlineData(150, 7)]
    [InlineData(1, 10)]
    [InlineData(200.5, 4)]
    public void RI03_a_divisao_igual_nunca_ultrapassa_o_limite(double limite, int refeicoes)
    {
        var partes = Regras.DividirIgualmente(limite, refeicoes);

        Assert.Equal(refeicoes, partes.Length);
        Assert.True(Regras.DivisaoRespeitaLimite(limite, partes));
        Assert.True(limite - partes.Sum() < 0.1 * refeicoes, "A sobra deve ser menor que 0,1 g por refeição.");
    }

    [Fact]
    public void RNF07_a_mesma_entrada_gera_sempre_o_mesmo_resultado()
    {
        Assert.Equal(Regras.DividirIgualmente(137.5, 5), Regras.DividirIgualmente(137.5, 5));
    }

    [Fact]
    public void RN03_divisao_personalizada_e_aceita_ate_o_limite()
    {
        Assert.True(Regras.DivisaoRespeitaLimite(180, [40, 60, 20, 60]));
        Assert.False(Regras.DivisaoRespeitaLimite(180, [40, 60, 20, 60.1]));
        Assert.False(Regras.DivisaoRespeitaLimite(180, [-10, 60]));
    }

    [Fact]
    public void RN03_gerar_dieta_cria_uma_meta_por_refeicao()
    {
        var prescricao = new Prescricao { LimiteCarboDia = 180, MetaProteinaDia = 90, GlicemiaMin = 70, GlicemiaMax = 180 };

        prescricao.GerarDieta(
        [
            ("Café da manhã", new TimeOnly(7, 0), null),
            ("Almoço", new TimeOnly(12, 0), null),
            ("Jantar", new TimeOnly(19, 0), null),
        ]);

        Assert.Equal(3, prescricao.Metas.Count);
        Assert.All(prescricao.Metas, m => Assert.Equal(60, m.LimiteCarbo));
        Assert.All(prescricao.Metas, m => Assert.Equal(30, m.MetaProteina));
        Assert.Equal(["Café da manhã", "Almoço", "Jantar"], prescricao.Metas.Select(m => m.Nome));
    }

    [Fact]
    public void RN04_sem_meta_de_proteina_as_refeicoes_ficam_sem_meta()
    {
        var prescricao = new Prescricao { LimiteCarboDia = 120 };
        prescricao.GerarDieta([("Almoço", new TimeOnly(12, 0), null)]);

        Assert.Null(prescricao.Metas[0].MetaProteina);
    }

    [Fact]
    public void RI03_gerar_dieta_recusa_divisao_acima_do_limite()
    {
        var prescricao = new Prescricao { LimiteCarboDia = 100, DivisaoPersonalizada = true };

        Assert.Throws<InvalidOperationException>(() => prescricao.GerarDieta(
        [
            ("Almoço", new TimeOnly(12, 0), 60),
            ("Jantar", new TimeOnly(19, 0), 50),
        ]));
    }
}

public class RegrasDeGlicemiaTestes
{
    private static readonly Prescricao Faixa = new() { GlicemiaMin = 70, GlicemiaMax = 180 };

    [Theory]
    [InlineData(69, SituacaoGlicemia.Abaixo)]
    [InlineData(70, SituacaoGlicemia.NaFaixa)]
    [InlineData(120, SituacaoGlicemia.NaFaixa)]
    [InlineData(180, SituacaoGlicemia.NaFaixa)]
    [InlineData(181, SituacaoGlicemia.Acima)]
    public void RN08_classifica_pela_faixa_prescrita(int valor, SituacaoGlicemia esperada)
    {
        Assert.Equal(esperada, Regras.ClassificarGlicemia(valor, Faixa));
        Assert.Equal(
            esperada is SituacaoGlicemia.Abaixo or SituacaoGlicemia.Acima,
            new RegistroGlicemia { Valor = valor }.ForaDaFaixa(Faixa));
    }

    [Fact]
    public void RI02_sem_prescricao_nao_ha_faixa_padrao()
    {
        Assert.Equal(SituacaoGlicemia.SemPrescricao, Regras.ClassificarGlicemia(300, null));
        Assert.False(new RegistroGlicemia { Valor = 300 }.ForaDaFaixa(null));
    }

    [Fact]
    public void RN08_o_aviso_orienta_procurar_a_equipe_de_saude()
    {
        Assert.Contains("equipe de saúde", Textos.AvisoGlicemia(SituacaoGlicemia.Abaixo));
        Assert.Contains("equipe de saúde", Textos.AvisoGlicemia(SituacaoGlicemia.Acima));
        Assert.Null(Textos.AvisoGlicemia(SituacaoGlicemia.NaFaixa));
    }
}

public class PorcoesDeExemploTestes
{
    private static readonly List<Alimento> Base =
    [
        new() { Id = 1, Nome = "Arroz", Categoria = "Cereais", CarboPor100g = 28, PorcaoPadraoG = 100, PorcaoDescricao = "4 colheres", Tipos = "principal", Ordem = 0 },
        new() { Id = 2, Nome = "Macarrão", Categoria = "Cereais", CarboPor100g = 30, PorcaoPadraoG = 110, PorcaoDescricao = "1 pegador", Tipos = "principal", Ordem = 1 },
        new() { Id = 3, Nome = "Feijão", Categoria = "Leguminosas", CarboPor100g = 14, PorcaoPadraoG = 90, PorcaoDescricao = "1 concha", Tipos = "principal", Ordem = 2 },
        new() { Id = 4, Nome = "Pão", Categoria = "Pães", CarboPor100g = 58, PorcaoPadraoG = 50, PorcaoDescricao = "1 unidade", Tipos = "cafe,lanche", Ordem = 3 },
        new() { Id = 5, Nome = "Refrigerante", Categoria = "Bebidas", CarboPor100g = 9, PorcaoPadraoG = 200, PorcaoDescricao = "1 copo", Tipos = "", Ordem = 4 },
    ];

    [Fact]
    public void RN05_so_mostra_porcoes_que_cabem_no_restante()
    {
        var exemplos = Regras.PorcoesDeExemplo(Base, "Almoço", restanteCarbo: 30);

        Assert.All(exemplos, e => Assert.True(e.Carbo <= 30));
        Assert.Contains(exemplos, e => e.Nome == "Arroz");
        Assert.DoesNotContain(exemplos, e => e.Nome == "Macarrão"); // 33 g não cabem em 30 g
    }

    [Fact]
    public void RN05_sem_restante_nao_ha_exemplos()
    {
        Assert.Empty(Regras.PorcoesDeExemplo(Base, "Almoço", restanteCarbo: 0));
        Assert.Empty(Regras.PorcoesDeExemplo(Base, "Almoço", restanteCarbo: -5));
    }

    [Fact]
    public void Exemplos_seguem_o_tipo_da_refeicao_e_ignoram_itens_nao_sugeridos()
    {
        var cafe = Regras.PorcoesDeExemplo(Base, "Café da manhã", restanteCarbo: 100);
        var semTipo = Regras.PorcoesDeExemplo(Base, "Refeição 3", restanteCarbo: 100);

        Assert.Equal(["Pão"], cafe.Select(e => e.Nome));
        Assert.DoesNotContain(semTipo, e => e.Nome == "Refrigerante");
    }

    [Fact]
    public void Exemplos_trazem_um_alimento_por_categoria()
    {
        var exemplos = Regras.PorcoesDeExemplo(Base, "Jantar", restanteCarbo: 100);

        Assert.Equal(exemplos.Count, exemplos.Select(e => Base.First(a => a.Id == e.AlimentoId).Categoria).Distinct().Count());
    }
}

public class HistoricoDePrescricaoTestes
{
    [Fact]
    public void RN13_cada_data_usa_a_prescricao_vigente_na_epoca()
    {
        var antiga = new Prescricao { Id = 1, VigenteDesde = new DateOnly(2026, 1, 10), LimiteCarboDia = 150 };
        var nova = new Prescricao { Id = 2, VigenteDesde = new DateOnly(2026, 3, 1), LimiteCarboDia = 180 };
        List<Prescricao> todas = [nova, antiga];

        Assert.Null(ServicoDia.Vigente(todas, new DateOnly(2026, 1, 9)));
        Assert.Same(antiga, ServicoDia.Vigente(todas, new DateOnly(2026, 2, 28)));
        Assert.Same(nova, ServicoDia.Vigente(todas, new DateOnly(2026, 3, 1)));
        Assert.Same(nova, ServicoDia.Vigente(todas, new DateOnly(2026, 12, 31)));
    }
}

public class LimpadorDeFotoTestes
{
    [Fact]
    public void RN22_remove_exif_e_comentarios_e_mantem_a_imagem()
    {
        byte[] jpeg =
        [
            0xFF, 0xD8,                                           // SOI
            0xFF, 0xE0, 0x00, 0x04, 0x4A, 0x46,                   // APP0 (JFIF): mantém
            0xFF, 0xE1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66,       // APP1 (EXIF): remove
            0xFF, 0xFE, 0x00, 0x04, 0x6F, 0x69,                   // COM: remove
            0xFF, 0xDB, 0x00, 0x03, 0x01,                         // DQT: mantém
            0xFF, 0xDA, 0x00, 0x02, 0x11, 0x22, 0xFF, 0xD9,       // SOS + dados + EOI
        ];

        var limpo = LimpadorDeFoto.RemoverMetadados(jpeg);

        byte[] esperado =
        [
            0xFF, 0xD8,
            0xFF, 0xE0, 0x00, 0x04, 0x4A, 0x46,
            0xFF, 0xDB, 0x00, 0x03, 0x01,
            0xFF, 0xDA, 0x00, 0x02, 0x11, 0x22, 0xFF, 0xD9,
        ];
        Assert.Equal(esperado, limpo);
    }

    [Fact]
    public void Recusa_arquivo_que_nao_e_jpeg()
    {
        Assert.Throws<InvalidDataException>(() => LimpadorDeFoto.RemoverMetadados([0x89, 0x50, 0x4E, 0x47, 0x0D]));
    }
}

