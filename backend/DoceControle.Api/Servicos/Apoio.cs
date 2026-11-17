using DoceControle.Api.Dominio;

namespace DoceControle.Api.Servicos;

public interface IProvedorPagamento
{
    bool Simulado { get; }

    Task<bool> AssinarAsync(Usuario usuario, CancellationToken ct);

    Task CancelarAsync(Usuario usuario, CancellationToken ct);
}

// pagamento simulado: aprova na hora e não movimenta dinheiro
public class ProvedorPagamentoSimulado : IProvedorPagamento
{
    public bool Simulado => true;
    public Task<bool> AssinarAsync(Usuario usuario, CancellationToken ct) => Task.FromResult(true);
    public Task CancelarAsync(Usuario usuario, CancellationToken ct) => Task.CompletedTask;
}

// tira os metadados (EXIF, GPS) do JPEG antes de enviar à IA
public static class LimpadorDeFoto
{
    public static bool EhJpeg(ReadOnlySpan<byte> dados) =>
        dados.Length > 4 && dados[0] == 0xFF && dados[1] == 0xD8 && dados[2] == 0xFF;

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
