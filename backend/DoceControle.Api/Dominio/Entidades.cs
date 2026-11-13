namespace DoceControle.Api.Dominio;

// Classes do diagrama de classes (seção 5.2 do documento), com nomes sem acento.

public enum Plano { Gratuito = 0, Premium = 1 }

public enum EntradaIA { Texto = 0, Foto = 1 }

public enum SituacaoGlicemia { SemPrescricao = 0, NaFaixa = 1, Abaixo = 2, Acima = 3 }

/// <summary>De onde veio o alimento. "Base" é a base nutricional pública; os demais são criados pelo usuário.</summary>
public enum OrigemAlimento { Base = 0, Manual = 1, IA = 2, CodigoBarras = 3 }

public enum EstadoJejum { SemLimite = 0, Aguardando = 1, Contando = 2, Excedido = 3, Encerrado = 4 }

public class Usuario
{
    public int Id { get; set; }
    public string Nome { get; set; } = "";
    public string Email { get; set; } = "";
    public string SenhaHash { get; set; } = "";

    /// <summary>Momento do consentimento para tratar dados de saúde (RF01, RN14).</summary>
    public DateTime ConsentimentoEm { get; set; }

    /// <summary>Consentimento separado para enviar o conteúdo da refeição à IA (RN20). Nulo = não consentiu.</summary>
    public DateTime? ConsentimentoIAEm { get; set; }

    /// <summary>Só o estado da assinatura fica no sistema (RN26).</summary>
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

    /// <summary>Um usuário tem várias prescrições ao longo do tempo; o histórico usa a vigente em cada data (RN13).</summary>
    public DateOnly VigenteDesde { get; set; }

    public double LimiteCarboDia { get; set; }
    public int GlicemiaMin { get; set; }
    public int GlicemiaMax { get; set; }

    /// <summary>Opcional: só existe quando o usuário informa (RN04).</summary>
    public double? MetaProteinaDia { get; set; }

    /// <summary>Opcional: tempo máximo, em minutos, que o médico orientou ficar sem comer.</summary>
    public int? JejumMaxMin { get; set; }

    public bool DivisaoPersonalizada { get; set; }
    public DateTime CriadaEm { get; set; }

    public List<MetaDeRefeicao> Metas { get; set; } = [];

    /// <summary>
    /// gerarDieta(): produz as metas das refeições a partir dos limites (RN03).
    /// Sem partes personalizadas, o limite diário é dividido em partes iguais.
    /// </summary>
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

    /// <summary>Nome sem acentos e em minúsculas, para a busca.</summary>
    public string NomeBusca { get; set; } = "";

    public string Categoria { get; set; } = "";
    public double CarboPor100g { get; set; }
    public double ProteinaPor100g { get; set; }
    public double GorduraPor100g { get; set; }

    /// <summary>Porção caseira de referência, em gramas, e a sua descrição ("1 fatia").</summary>
    public double PorcaoPadraoG { get; set; }
    public string PorcaoDescricao { get; set; } = "";

    /// <summary>Em quais refeições o alimento aparece como exemplo: "cafe", "principal", "lanche". Vazio = não é sugerido.</summary>
    public string Tipos { get; set; } = "";

    public int Ordem { get; set; }

    /// <summary>Nulo = alimento da base pública. Preenchido = alimento criado por esse usuário, visível só para ele.</summary>
    public int? UsuarioId { get; set; }

    public OrigemAlimento Origem { get; set; }

    /// <summary>EAN/UPC do produto, quando o alimento veio de um código de barras.</summary>
    public string? CodigoBarras { get; set; }
}

public class RegistroRefeicao
{
    public int Id { get; set; }
    public int UsuarioId { get; set; }
    public DateTime DataHora { get; set; }

    /// <summary>Nome da refeição do dia a que o registro pertence ("Almoço").</summary>
    public string Refeicao { get; set; } = "";

    public List<ItemRefeicao> Itens { get; set; } = [];

    /// <summary>totalCarbo(): soma pelo cálculo da RN06.</summary>
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

    /// <summary>Preenchido quando o item veio de uma sugestão da IA confirmada pelo usuário.</summary>
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

    /// <summary>O que a IA propôs (alimentos e quantidades). Nunca a descrição nem a foto (RN22).</summary>
    public string ItensJson { get; set; } = "[]";

    /// <summary>confirmar(): só depois disso a sugestão gera itens de refeição (RN17).</summary>
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

    /// <summary>mg/dL</summary>
    public int Valor { get; set; }

    public DateTime DataHora { get; set; }

    /// <summary>foraDaFaixa(): compara com a faixa da prescrição vigente (RN08).</summary>
    public bool ForaDaFaixa(Prescricao? vigente) =>
        Regras.ClassificarGlicemia(Valor, vigente) is SituacaoGlicemia.Abaixo or SituacaoGlicemia.Acima;
}

public class LembreteInsulina
{
    public int Id { get; set; }
    public int UsuarioId { get; set; }
    public TimeOnly Horario { get; set; }

    /// <summary>Apenas informação exibida no lembrete. Nunca entra em cálculo (RN10, RI01).</summary>
    public double? DoseInformada { get; set; }

    public string? Descricao { get; set; }
    public int RepeticaoMin { get; set; } = 5;
    public bool Ativo { get; set; } = true;

    public List<ConfirmacaoLembrete> Confirmacoes { get; set; } = [];
}

/// <summary>Registro de que o lembrete de um dia foi confirmado (apoio ao RF10 e ao relatório).</summary>
public class ConfirmacaoLembrete
{
    public int Id { get; set; }
    public int LembreteInsulinaId { get; set; }
    public DateOnly Data { get; set; }
    public DateTime ConfirmadoEm { get; set; }
}

/// <summary>Contador diário de usos da IA por usuário (RNF13, RN23).</summary>
public class UsoIA
{
    public int Id { get; set; }
    public int UsuarioId { get; set; }
    public DateOnly Data { get; set; }
    public int Quantidade { get; set; }
}
