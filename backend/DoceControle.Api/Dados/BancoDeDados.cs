using System.Text.Json;
using DoceControle.Api.Dominio;
using Microsoft.EntityFrameworkCore;

namespace DoceControle.Api.Dados;

public class BancoDeDados(DbContextOptions<BancoDeDados> opcoes) : DbContext(opcoes)
{
    public DbSet<Usuario> Usuarios => Set<Usuario>();
    public DbSet<Prescricao> Prescricoes => Set<Prescricao>();
    public DbSet<MetaDeRefeicao> MetasDeRefeicao => Set<MetaDeRefeicao>();
    public DbSet<Alimento> Alimentos => Set<Alimento>();
    public DbSet<RegistroRefeicao> Refeicoes => Set<RegistroRefeicao>();
    public DbSet<ItemRefeicao> ItensRefeicao => Set<ItemRefeicao>();
    public DbSet<SugestaoIA> SugestoesIA => Set<SugestaoIA>();
    public DbSet<RegistroGlicemia> Glicemias => Set<RegistroGlicemia>();
    public DbSet<LembreteInsulina> Lembretes => Set<LembreteInsulina>();
    public DbSet<ConfirmacaoLembrete> ConfirmacoesLembrete => Set<ConfirmacaoLembrete>();
    public DbSet<UsoIA> UsosIA => Set<UsoIA>();

    protected override void OnModelCreating(ModelBuilder m)
    {
        // Excluir o usuário exclui todos os dados dele (RF14, RN14).
        m.Entity<Usuario>(e =>
        {
            e.HasIndex(u => u.Email).IsUnique();
            e.HasMany(u => u.Prescricoes).WithOne().HasForeignKey(p => p.UsuarioId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(u => u.Lembretes).WithOne().HasForeignKey(l => l.UsuarioId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(u => u.Refeicoes).WithOne().HasForeignKey(r => r.UsuarioId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(u => u.Glicemias).WithOne().HasForeignKey(g => g.UsuarioId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany<SugestaoIA>().WithOne().HasForeignKey(s => s.UsuarioId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany<UsoIA>().WithOne().HasForeignKey(x => x.UsuarioId).OnDelete(DeleteBehavior.Cascade);
        });

        m.Entity<Prescricao>(e =>
        {
            e.HasIndex(p => new { p.UsuarioId, p.VigenteDesde });
            e.HasMany(p => p.Metas).WithOne().HasForeignKey(x => x.PrescricaoId).OnDelete(DeleteBehavior.Cascade);
        });

        m.Entity<RegistroRefeicao>(e =>
        {
            e.HasIndex(r => new { r.UsuarioId, r.DataHora });
            e.HasMany(r => r.Itens).WithOne().HasForeignKey(i => i.RegistroRefeicaoId).OnDelete(DeleteBehavior.Cascade);
        });

        m.Entity<ItemRefeicao>(e =>
        {
            e.HasOne(i => i.Alimento).WithMany().HasForeignKey(i => i.AlimentoId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<SugestaoIA>().WithMany().HasForeignKey(i => i.SugestaoIAId).OnDelete(DeleteBehavior.SetNull);
        });

        m.Entity<RegistroGlicemia>().HasIndex(g => new { g.UsuarioId, g.DataHora });

        m.Entity<LembreteInsulina>()
            .HasMany(l => l.Confirmacoes).WithOne().HasForeignKey(c => c.LembreteInsulinaId)
            .OnDelete(DeleteBehavior.Cascade);

        m.Entity<ConfirmacaoLembrete>().HasIndex(c => new { c.LembreteInsulinaId, c.Data }).IsUnique();
        m.Entity<UsoIA>().HasIndex(x => new { x.UsuarioId, x.Data }).IsUnique();
        m.Entity<Alimento>(e =>
        {
            e.HasIndex(a => a.NomeBusca);
            e.HasIndex(a => a.CodigoBarras);
            // Alimentos criados pelo usuário saem junto com a conta (RF14).
            e.HasOne<Usuario>().WithMany().HasForeignKey(a => a.UsuarioId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}

public static class CargaInicial
{
    private record AlimentoJson(
        string Nome, string Categoria, double Carbo, double Proteina, double PorcaoG, string Porcao, string Tipos);

    /// <summary>
    /// O banco é criado com EnsureCreated, que não altera tabelas já existentes. Para não perder os dados de
    /// quem já usa o site, as colunas novas são acrescentadas aqui. Uma versão comercial deve usar migrações do EF.
    /// </summary>
    private static async Task AtualizarEsquemaAsync(BancoDeDados db)
    {
        (string Tabela, string Coluna, string Definicao)[] novas =
        [
            ("Prescricoes", "JejumMaxMin", "INTEGER NULL"),
            ("Alimentos", "UsuarioId", "INTEGER NULL REFERENCES Usuarios(Id) ON DELETE CASCADE"),
            ("Alimentos", "Origem", "INTEGER NOT NULL DEFAULT 0"),
            ("Alimentos", "CodigoBarras", "TEXT NULL"),
        ];

        foreach (var (tabela, coluna, definicao) in novas)
        {
            var existentes = await db.Database
                .SqlQueryRaw<string>("SELECT name AS Value FROM pragma_table_info({0})", tabela)
                .ToListAsync();
            if (existentes.Contains(coluna)) continue;
            // Nomes de tabela e coluna não podem ser parâmetros em DDL; vêm só da lista fixa acima, nunca do usuário.
#pragma warning disable EF1002
            await db.Database.ExecuteSqlRawAsync($"ALTER TABLE {tabela} ADD COLUMN {coluna} {definicao}");
#pragma warning restore EF1002
        }
        await db.Database.ExecuteSqlRawAsync(
            "CREATE INDEX IF NOT EXISTS IX_Alimentos_CodigoBarras ON Alimentos (CodigoBarras)");
    }

    /// <summary>Cria o banco (se não existir) e carrega a base de alimentos.</summary>
    public static async Task PrepararAsync(BancoDeDados db, string caminhoAlimentos)
    {
        await db.Database.EnsureCreatedAsync();
        await AtualizarEsquemaAsync(db);
        if (await db.Alimentos.AnyAsync()) return;

        await using var arquivo = File.OpenRead(caminhoAlimentos);
        var itens = await JsonSerializer.DeserializeAsync<List<AlimentoJson>>(
            arquivo, new JsonSerializerOptions(JsonSerializerDefaults.Web)) ?? [];

        db.Alimentos.AddRange(itens.Select((a, i) => new Alimento
        {
            Nome = a.Nome,
            NomeBusca = Regras.Normalizar(a.Nome),
            Categoria = a.Categoria,
            CarboPor100g = a.Carbo,
            ProteinaPor100g = a.Proteina,
            PorcaoPadraoG = a.PorcaoG,
            PorcaoDescricao = a.Porcao,
            Tipos = a.Tipos,
            Ordem = i,
        }));
        await db.SaveChangesAsync();
    }
}
