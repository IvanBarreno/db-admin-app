using System.Data.Common;

namespace SqlAdmin.Core.Execution;

/// <summary>
/// Runs a script (already split into batches by <see cref="BatchSplitter"/>) on one open
/// connection, in order, so session state — #temp tables, SET options, @@IDENTITY — carries
/// across batches exactly like it does in SSMS. Used by the custom SQL box and, later, by
/// multi-batch operation templates.
/// </summary>
public static class SqlScriptExecutor
{
    /// <summary>
    /// Executes every batch in order on <paramref name="connection"/>. A batch that throws
    /// stops execution of the remaining batches; batches already run keep their results.
    /// </summary>
    /// <param name="connection">Open connection to run every batch on, in order.</param>
    /// <param name="batches">Batches produced by <see cref="BatchSplitter"/>.</param>
    /// <param name="commandTimeoutSeconds">Per-batch command timeout.</param>
    /// <param name="messages">
    /// Collects provider messages (e.g. T-SQL PRINT / RAISERROR severity &lt;= 10). The caller
    /// wires this list into the provider-specific event — <c>SqlConnection</c> has no such
    /// event on the generic <see cref="DbConnection"/> base type — before calling this method.
    /// </param>
    /// <param name="ct">Cancelled when the caller (e.g. the HTTP request) aborts.</param>
    public static async Task<ScriptResult> ExecuteAsync(
        DbConnection connection,
        IReadOnlyList<string> batches,
        int commandTimeoutSeconds,
        List<string> messages,
        CancellationToken ct)
    {
        var resultSets = new List<ResultSet>();

        for (var batchIndex = 0; batchIndex < batches.Count; batchIndex++)
        {
            var batchSql = batches[batchIndex];
            await using var command = connection.CreateCommand();
            command.CommandText = batchSql;
            command.CommandTimeout = commandTimeoutSeconds;

            try
            {
                await using var reader = await command.ExecuteReaderAsync(ct);
                do
                {
                    var columns = Enumerable.Range(0, reader.FieldCount)
                        .Select(reader.GetName)
                        .ToList();

                    var rows = new List<IReadOnlyList<object?>>();
                    while (await reader.ReadAsync(ct))
                    {
                        var row = new object?[reader.FieldCount];
                        reader.GetValues(row!);
                        for (var i = 0; i < row.Length; i++)
                        {
                            if (row[i] is DBNull) row[i] = null;
                        }
                        rows.Add(row);
                    }

                    if (columns.Count > 0)
                    {
                        resultSets.Add(new ResultSet(batchIndex, columns, rows));
                    }
                }
                while (await reader.NextResultAsync(ct));
            }
            catch (DbException ex)
            {
                return new ScriptResult(resultSets, messages, Failed: true,
                    FailedBatchIndex: batchIndex, Error: ex.Message);
            }
        }

        return new ScriptResult(resultSets, messages, Failed: false, FailedBatchIndex: null, Error: null);
    }
}

/// <summary>One SELECT's worth of rows from one batch.</summary>
public sealed record ResultSet(int BatchIndex, IReadOnlyList<string> Columns, IReadOnlyList<IReadOnlyList<object?>> Rows);

/// <summary>Outcome of running a whole script: every result set produced, provider messages
/// (PRINT / RAISERROR with severity &lt;= 10), and whether/where it stopped.</summary>
public sealed record ScriptResult(
    IReadOnlyList<ResultSet> ResultSets,
    IReadOnlyList<string> Messages,
    bool Failed,
    int? FailedBatchIndex,
    string? Error);
