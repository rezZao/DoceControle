namespace DoceControle.Api.Dominio;

// classes do diagrama de classes, com nomes sem acento

public enum Plano { Gratuito = 0, Premium = 1 }

public enum EntradaIA { Texto = 0, Foto = 1 }

public enum SituacaoGlicemia { SemPrescricao = 0, NaFaixa = 1, Abaixo = 2, Acima = 3 }

public enum OrigemAlimento { Base = 0, Manual = 1, IA = 2, CodigoBarras = 3 }

public enum EstadoJejum { SemLimite = 0, Aguardando = 1, Contando = 2, Excedido = 3, Encerrado = 4 }

public class Usuario
{
    public int Id { get; set; }
    public string Nome { get; set; } = "";
    public string Email { get; set; } = "";
    public string SenhaHash { get; set; } = "";

    public DateTime ConsentimentoEm { get; set; }

    public DateTime? ConsentimentoIAEm { get; set; }

    public Plano Plano { get; set; } = Plano.Gratuito;

    public DateTime CriadoEm { get; set; }

    public List<Prescricao> Prescricoes { get; set; } = [];
    public List<LembreteInsulina> Lembretes { get; set; } = [];
    public List<RegistroRefeicao> Refeicoes { get; set; } = [];
    public List<RegistroGlicemia> Glicemias { get; set; } = [];
}

public class Prescricao
{
    public int Id { get; set; }
    public int UsuarioId { get; set; }

    public DateOnly VigenteDesde { get; set; }

    public double LimiteCarboDia { get; set; }
    public int GlicemiaMin { get; set; }
    public int GlicemiaMax { get; set; }

    public double? MetaProteinaDia { get; set; }

    public int? JejumMaxMin { get; set; }

    public bool DivisaoPersonalizada { get; set; }
    public DateTime CriadaEm { get; set; }

    public List<MetaDeRefeicao> Metas { get; set; } = [];

    public void GerarDieta(IReadOnlyList<(string Nome, TimeOnly Horario, double? LimiteCarbo)> refeicoes)
    {
        if (refeicoes.Count == 0) throw new ArgumentException("Informe ao menos uma refeição.");

        var personalizada = DivisaoPersonalizada;
        var partes = personalizada
            ? refeicoes.Select(r => r.LimiteCarbo ?? 0).ToArray()
            : Regras.DividirIgualmente(LimiteCarboDia, refeicoes.Count);

        if (!Regras.DivisaoRespeitaLimite(LimiteCarboDia, partes))
            throw new InvalidOperationException("A soma das refeições ultrapassa o limite diário de carboidratos.");

        double? proteinaPorRefeicao = MetaProteinaDia is { } meta
            ? Regras.DividirIgualmente(meta, refeicoes.Count)[0]
            : null;

        Metas = refeicoes
            .Select((r, i) => new MetaDeRefeicao
            {
                Nome = r.Nome,
                Horario = r.Horario,
                LimiteCarbo = partes[i],
                MetaProteina = proteinaPorRefeicao,
                Ordem = i,
            })
            .ToList();
    }
}

public class MetaDeRefeicao
{
    public int Id { get; set; }
    public int PrescricaoId { get; set; }
    public string Nome { get; set; } = "";
    public TimeOnly Horario { get; set; }
    public double LimiteCarbo { get; set; }
    public double? MetaProteina { get; set; }
    public int Ordem { get; set; }
}

public class Alimento
{
    public int Id { get; set; }
    public string Nome { get; set; } = "";

    public string NomeBusca { get; set; } = "";

    public string Categoria { get; set; } = "";
    public double CarboPor100g { get; set; }
    public double ProteinaPor100g { get; set; }
    public double GorduraPor100g { get; set; }

    public double PorcaoPadraoG { get; set; }
    public string PorcaoDescricao { get; set; } = "";

    public string Tipos { get; set; } = "";

    public int Ordem { get; set; }

    public int? UsuarioId { get; set; }

    public OrigemAlimento Origem { get; set; }

    public string? CodigoBarras { get; set; }
}

public class RegistroRefeicao
{
    public int Id { get; set; }
    public int UsuarioId { get; set; }
    public DateTime DataHora { get; set; }

    public string Refeicao { get; set; } = "";

    public List<ItemRefeicao> Itens { get; set; } = [];

    public double TotalCarbo() => Itens.Sum(i => i.Carbo());

    public double TotalProteina() => Itens.Sum(i => i.Proteina());

    public double TotalGordura() => Itens.Sum(i => i.Gordura());
}

public class ItemRefeicao
{
    public int Id { get; set; }
    public int RegistroRefeicaoId { get; set; }
    public int AlimentoId { get; set; }
    public Alimento Alimento { get; set; } = null!;
    public double QuantidadeG { get; set; }

    public int? SugestaoIAId { get; set; }

    public double Carbo() => Regras.Nutriente(QuantidadeG, Alimento.CarboPor100g);

    public double Proteina() => Regras.Nutriente(QuantidadeG, Alimento.ProteinaPor100g);

    public double Gordura() => Regras.Nutriente(QuantidadeG, Alimento.GorduraPor100g);
}

public class SugestaoIA
{
    public int Id { get; set; }
    public int UsuarioId { get; set; }
    public EntradaIA Entrada { get; set; }
    public bool Confirmada { get; set; }
    public DateTime CriadaEm { get; set; }

    public string ItensJson { get; set; } = "[]";

    public void Confirmar()
    {
        if (Confirmada) throw new InvalidOperationException("Esta sugestão já foi confirmada.");
        Confirmada = true;
    }
}

public class RegistroGlicemia
{
    public int Id { get; set; }
    public int UsuarioId { get; set; }

    // mg/dL
    public int Valor { get; set; }

    public DateTime DataHora { get; set; }

    public bool ForaDaFaixa(Prescricao? vigente) =>
        Regras.ClassificarGlicemia(Valor, vigente) is SituacaoGlicemia.Abaixo or SituacaoGlicemia.Acima;
}

public class LembreteInsulina
{
    public int Id { get; set; }
    public int UsuarioId { get; set; }
    public TimeOnly Horario { get; set; }

    public double? DoseInformada { get; set; }

    public string? Descricao { get; set; }
    public int RepeticaoMin { get; set; } = 5;
    public bool Ativo { get; set; } = true;

    public List<ConfirmacaoLembrete> Confirmacoes { get; set; } = [];
}

public class ConfirmacaoLembrete
{
    public int Id { get; set; }
    public int LembreteInsulinaId { get; set; }
    public DateOnly Data { get; set; }
    public DateTime ConfirmadoEm { get; set; }
}

public class UsoIA
{
    public int Id { get; set; }
    public int UsuarioId { get; set; }
    public DateOnly Data { get; set; }
    public int Quantidade { get; set; }
}
