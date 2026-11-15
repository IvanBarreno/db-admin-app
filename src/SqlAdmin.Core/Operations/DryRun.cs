using SqlAdmin.Core.Engines;

namespace SqlAdmin.Core.Operations;

/// <summary>One statement a run WILL execute. <paramref name="Database"/> is set for all_databases operations.</summary>
public sealed record DryRunStatement(string? Database, string Text);

/// <summary>
/// What a dry run produced. <paramref name="Error"/> is set when the script itself failed (a guard
/// THROW, a missing object): the same failure would stop the real run, so callers treat it as blocking.
/// </summary>
public sealed record DryRunResult(IReadOnlyList<DryRunStatement> Statements, string? Error);

/// <summary>
/// Runs an operation with <c>@dry_run = 1</c>: scripts built with <c>{{exec:@sql}}</c> return the exact
/// statements they would execute instead of executing them. Reads the server (so the statements reflect
/// the real sessions, roles, databases...) but changes nothing — a lint test keeps every statement in a
/// dry-runnable script behind the macro.
/// </summary>
public static class DryRunRunner
{
    /// <summary>Name of the column that carries the statement text in a dry run.</summary>
    public const string StatementColumn = "statement";

    /// <summary>Null when the operation does not support dry run.</summary>
    public static async Task<DryRunResult?> RunAsync(
        OperationDefinition operation,
        IReadOnlyDictionary<string, string?> values,
        string serverName,
        string? database,
        IServerConnectionFactory connections,
        CancellationToken ct)
    {
        if (!operation.SupportsDryRun) return null;

        try
        {
            var run = await OperationRunner.RunAsync(
                operation, values, serverName, database, connections, snapshotDirectory: "", ct, dryRun: true);
            return Extract(run.Script, run.DatabaseSteps);
        }
        catch (TemplateRenderException ex)
        {
            return new DryRunResult([], ex.Message);
        }
    }

    /// <summary>Keeps only the result sets that carry statements; the trailing "current state" SELECTs are noise here.</summary>
    public static DryRunResult Extract(Execution.ScriptResult script, IReadOnlyList<DatabaseStep>? databaseSteps)
    {
        var statements = new List<DryRunStatement>();
        foreach (var set in script.ResultSets)
        {
            var textIx = set.Columns.ToList().FindIndex(c => c.Equals(StatementColumn, StringComparison.OrdinalIgnoreCase));
            if (textIx < 0) continue;
            var dbIx = set.Columns.ToList().FindIndex(c => c.Equals(AllDatabasesExecutor.DatabaseColumn, StringComparison.OrdinalIgnoreCase));

            foreach (var row in set.Rows)
            {
                // Scripts end each statement with a newline; the trailing one is just noise.
                if (row[textIx]?.ToString()?.TrimEnd() is { Length: > 0 } text)
                    statements.Add(new DryRunStatement(dbIx >= 0 ? row[dbIx]?.ToString() : null, text));
            }
        }

        // Per-database failures (e.g. a database that denies access) are real problems for the real run too.
        var error = script.Failed
            ? script.Error ?? databaseSteps?.FirstOrDefault(s => s.Status == "ERROR")?.Message
            : null;
        return new DryRunResult(statements, error);
    }
}
