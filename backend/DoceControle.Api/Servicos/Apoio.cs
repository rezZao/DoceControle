using DoceControle.Api.Dominio;

namespace DoceControle.Api.Servicos;

/// <summary>
/// Provedor de pagamento externo (RF19). O sistema nunca recebe nem guarda dados de cartão (RI14);
/// só registra se a assinatura está ativa (RN26).
/// </summary>
public interface IProvedorPagamento
{
    bool Simulado { get; }

    /// <summary>Devolve verdadeiro quando o provedor confirma a assinatura.</summary>
    Task<bool> AssinarAsync(Usuario usuario, CancellationToken ct);

    Task CancelarAsync(Usuario usuario, CancellationToken ct);
}

/// <summary>
/// Simulação para o escopo acadêmico: aprova na hora e não movimenta dinheiro.
/// Uma versão comercial troca esta classe pela integração com um provedor real.
/// </summary>
public class ProvedorPagamentoSimulado : IProvedorPagamento
{
    public bool Simulado => true;
    public Task<bool> AssinarAsync(Usuario usuario, CancellationToken ct) => Task.FromResult(true);
    public Task CancelarAsync(Usuario usuario, CancellationToken ct) => Task.CompletedTask;
}

/// <summary>
/// RN22 / RI13: a foto segue para a IA sem metadados (EXIF, GPS, comentários) e não é armazenada.
/// O navegador já reencoda a imagem; esta é a segunda barreira, no servidor.
/// </summary>
public static class LimpadorDeFoto
{
    public static bool EhJpeg(ReadOnlySpan<byte> dados) =>
        dados.Length > 4 && dados[0] == 0xFF && dados[1] == 0xD8 && dados[2] == 0xFF;

    /// <summary>Copia o JPEG descartando os segmentos APP1..APP15 e COM. Mantém APP0 (JFIF) e os dados da imagem.</summary>
    public static byte[] RemoverMetadados(byte[] jpeg)
    {
        if (!EhJpeg(jpeg)) throw new InvalidDataException("A imagem precisa estar em JPEG.");

        using var saida = new MemoryStream(jpeg.Length);
        saida.Write(jpeg, 0, 2); // SOI
        var i = 2;

        while (i + 4 <= jpeg.Length)
        {
            if (jpeg[i] != 0xFF) throw new InvalidDataException("JPEG inválido.");
            var marcador = jpeg[i + 1];

            // Início dos dados comprimidos: daqui em diante copia tudo como está.
            if (marcador == 0xDA)
            {
                saida.Write(jpeg, i, jpeg.Length - i);
                return saida.ToArray();
            }

            var tamanho = (jpeg[i + 2] << 8) | jpeg[i + 3];
            if (tamanho < 2 || i + 2 + tamanho > jpeg.Length) throw new InvalidDataException("JPEG inválido.");

            var ehMetadado = marcador is >= 0xE1 and <= 0xEF or 0xFE;
            if (!ehMetadado) saida.Write(jpeg, i, 2 + tamanho);
            i += 2 + tamanho;
        }

        throw new InvalidDataException("JPEG inválido.");
    }
}
