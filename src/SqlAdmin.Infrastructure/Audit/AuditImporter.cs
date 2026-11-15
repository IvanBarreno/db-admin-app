using Microsoft.EntityFrameworkCore;
using SqlAdmin.Core.Audit;

namespace SqlAdmin.Infrastructure.Audit;

/// <summary>How an import went: rows found in the other file, rows added here, rows already present.</summary>
public sealed record AuditImportResult(int Read, int Imported, int Skipped);

/// <summary>
/// Merges ANOTHER audit database file into this one (<c>SqlAdmin import-audit path/to/audit.db</c>).
/// Each DBA has a local <c>audit.db</c>; this is how those per-machine histories become one feed
/// (plan §3b, "Audit log: SQLite first, portable by design").
/// </summary>
/// <remarks>
/// Safe to run twice: an entry is skipped when the target already holds one with the same time, user,
/// server and SQL text. The source file is never modified — it is copied to a temp folder first, and the
/// COPY is upgraded to the current schema, so a file written by an older version of the app imports too.
/// </remarks>
public static class AuditImporter
{
    public static async Task<AuditImportResult> ImportAsync(AuditDbContext target, string sourcePath, CancellationToken ct)
    {
        if (!File.Exists(sourcePath))
            throw new FileNotFoundException($"Audit database not found: {sourcePath}", sourcePath);

        var tempDir = Directory.CreateTempSubdirectory("sqladmin-import-").FullName;
        try
        {
            // SQLite in WAL mode keeps recent rows in "-wal" / "-shm" side files until a checkpoint, so they
            // travel with the main file when they exist. (Best is to close the app on the source machine first.)
            var copy = Path.Combine(tempDir, "audit.db");
            File.Copy(sourcePath, copy);
            foreach (var suffix in new[] { "-wal", "-shm" })
            {
                if (File.Exists(sourcePath + suffix)) File.Copy(sourcePath + suffix, copy + suffix);
            }

            // Pooling=False: the connection really closes on dispose, so the temp file can be deleted afterwards.
            var options = new DbContextOptionsBuilder<AuditDbContext>()
                .UseSqlite($"Data Source={copy};Pooling=False")
                .Options;
            await using var source = new AuditDbContext(options);
            await source.Database.MigrateAsync(ct); // bring an older file up to today's schema (on the copy only)

            // Include = load each entry together with its steps (one JOIN instead of a query per entry).
            var incoming = await source.AuditLog.AsNoTracking()
                .Include(e => e.Steps)
                .OrderBy(e => e.Id)
                .ToListAsync(ct);

            // What the target already has, as a set of "identity" keys. Ids cannot be used: every machine
            // numbers its own rows from 1. A HashSet makes each "is it there already?" check O(1).
            var existing = (await target.AuditLog.AsNoTracking()
                    .Select(e => new { e.ExecutedAtUtc, e.ExecutedBy, e.ServerName, e.Sql })
                    .ToListAsync(ct))
                .Select(e => Key(e.ExecutedAtUtc, e.ExecutedBy, e.ServerName, e.Sql))
                .ToHashSet();

            var imported = 0;
            foreach (var entry in incoming)
            {
                // HashSet.Add returns false when the key was already there (also catches duplicates inside the file).
                if (!existing.Add(Key(entry.ExecutedAtUtc, entry.ExecutedBy, entry.ServerName, entry.Sql))) continue;

                // A NEW object without Id: the target database assigns its own. Steps are copied the same way.
                target.AuditLog.Add(new AuditEntry
                {
                    ExecutedAtUtc = entry.ExecutedAtUtc,
                    ExecutedBy = entry.ExecutedBy,
                    ServerName = entry.ServerName,
                    Database = entry.Database,
                    Sql = entry.Sql,
                    Status = entry.Status,
                    Detail = entry.Detail,
                    ParametersJson = entry.ParametersJson,
                    Steps = entry.Steps.OrderBy(s => s.StepNo).Select(s => new AuditStep
                    {
                        StepNo = s.StepNo,
                        Database = s.Database,
                        Action = s.Action,
                        Status = s.Status,
                        RowsAffected = s.RowsAffected,
                        Message = s.Message,
                        ExecutedAtUtc = s.ExecutedAtUtc,
                    }).ToList(),
                });
                imported++;
            }

            // One SaveChanges = one transaction: either every new row is written or none is.
            await target.SaveChangesAsync(ct);
            return new AuditImportResult(incoming.Count, imported, incoming.Count - imported);
        }
        finally
        {
            try { Directory.Delete(tempDir, recursive: true); }
            catch (IOException) { /* a leftover temp folder must not turn a finished import into an error */ }
        }
    }

    // A value tuple compares by its members, so two entries with the same four values produce equal keys.
    private static (long Ticks, string By, string Server, string Sql) Key(
        DateTimeOffset executedAtUtc, string executedBy, string serverName, string sql) =>
        (executedAtUtc.UtcTicks, executedBy, serverName, sql);
}
