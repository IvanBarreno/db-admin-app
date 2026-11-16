using SqlAdmin.Core.Engines;
using SqlAdmin.Core.Execution;

namespace SqlAdmin.Core.Operations;

/// <summary>One database's outcome inside an <see cref="OperationScope.AllDatabases"/> run.</summary>
/// <param name="Database">Database the script ran in.</param>
/// <param name="Status">"OK" or "ERROR".</param>
/// <param name="RowCount">Rows returned across all result sets for this database.</param>
/// <param name="Message">Error text when <paramref name="Status"/> is "ERROR".</param>
public sealed record DatabaseStep(string Database, string Status, int RowCount, string? Message);

/// <summary>Merged result sets of every database plus one <see cref="DatabaseStep"/> per database.</summary>
public sealed record AllDatabasesResult(ScriptResult Combined, IReadOnlyList<DatabaseStep> Steps);

/// <summary>
/// Runs one rendered operation once per online user database and unions the grids.
///
/// Design note: we open a fresh connection per database (Initial Catalog = that database)
/// instead of issuing <c>USE [db]</c>. It works the same on SQL Server and Azure SQL
/// (<see cref="EngineCapabilities.SupportsUseDatabase"/> is false there), so there is a single
/// code path; pooling makes the extra connections cheap for a few dozen databases.
/// </summary>
public static class AllDatabasesExecutor
{
    /// <summary>Column prepended to every unioned result set so rows say which DB they came from.</summary>
    public const string DatabaseColumn = "database_name";

    /// <summary>Name of the optional list parameter that limits an all_databases run to some databases.</summary>
    public const string SelectedDatabasesParameter = "databases";

    public static async Task<AllDatabasesResult> ExecuteAsync(
        OperationDefinition operation,
        IReadOnlyDictionary<string, string?> values,
        string serverName,
        IServerConnectionFactory connections,
        CancellationToken ct,
        bool dryRun = false)
    {
        // 1. Discover target databases on a server-level connection, then release it.
        IReadOnlyList<DatabaseInfo> databases;
        ISqlDialect dialect;
        await using (var master = await connections.OpenAsync(serverName, database: null, ct))
        {
            dialect = master.Engine.Dialect;
            databases = await master.Engine.ListDatabasesAsync(master.Connection, ct);
        }

        // 2. Render once: the SQL is identical for every database, only the connection changes.
        var rendered = TemplateRenderer.Render(operation, values, dialect, dryRun);
        var batches = BatchSplitter.Split(rendered.Sql, dialect.BatchSeparator);

        var steps = new List<DatabaseStep>();
        var messages = new List<string>();
        // Union key = batch index + column names, so grids of the same shape merge into one.
        var merged = new Dictionary<string, (int BatchIndex, List<string> Columns, List<IReadOnlyList<object?>> Rows)>();

        // An operation may declare a list parameter named "databases": only those are visited.
        // Empty / absent = every online database (the original behaviour).
        var selected = operation.Params.Any(p => p.Name == SelectedDatabasesParameter && p.Multi)
            ? MultiValues.Parse(values.GetValueOrDefault(SelectedDatabasesParameter))
            : [];

        foreach (var db in databases.Where(d => d.IsOnline
                     && (selected.Count == 0 || selected.Contains(d.Name, StringComparer.OrdinalIgnoreCase))))
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                await using var conn = await connections.OpenAsync(serverName, db.Name, ct);
                var dbMessages = new List<string>();
                using var subscription = conn.Engine.SubscribeToMessages(conn.Connection, dbMessages);

                var result = await SqlScriptExecutor.ExecuteAsync(
                    conn.Connection, batches, rendered.Parameters,
                    conn.Server.CommandTimeoutSeconds, dbMessages, ct);

                messages.AddRange(dbMessages.Select(m => $"[{db.Name}] {m}"));

                var rowCount = 0;
                foreach (var rs in result.ResultSets)
                {
                    rowCount += rs.Rows.Count;
                    var key = $"{rs.BatchIndex}|{string.Join("|", rs.Columns)}";
                    if (!merged.TryGetValue(key, out var bucket))
                    {
                        bucket = (rs.BatchIndex, [DatabaseColumn, .. rs.Columns], []);
                        merged[key] = bucket;
                    }
                    foreach (var row in rs.Rows)
                    {
                        bucket.Rows.Add([db.Name, .. row]);
                    }
                }

                steps.Add(result.Failed
                    ? new DatabaseStep(db.Name, "ERROR", rowCount, result.Error)
                    : new DatabaseStep(db.Name, "OK", rowCount, null));
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // One unreachable/denied database must not abort the other 46.
                steps.Add(new DatabaseStep(db.Name, "ERROR", 0, ex.Message));
            }
        }

        var failed = steps.Count(s => s.Status == "ERROR");
        var combined = new ScriptResult(
            merged.Values.OrderBy(b => b.BatchIndex)
                .Select(b => new ResultSet(b.BatchIndex, b.Columns, b.Rows)).ToList(),
            messages,
            Failed: failed > 0,
            FailedBatchIndex: null,
            Error: failed > 0 ? $"{failed} of {steps.Count} databases failed." : null);

        return new AllDatabasesResult(combined, steps);
    }
}
