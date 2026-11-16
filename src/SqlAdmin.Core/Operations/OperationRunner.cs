using SqlAdmin.Core.Engines;
using SqlAdmin.Core.Execution;

namespace SqlAdmin.Core.Operations;

/// <summary>What one run of one operation produced.</summary>
/// <param name="Script">Combined result sets, messages and failure info.</param>
/// <param name="DatabaseSteps">One entry per database for <see cref="OperationScope.AllDatabases"/>, otherwise null.</param>
/// <param name="SnapshotPath">File written for <c>save_snapshot</c> operations, otherwise null.</param>
public sealed record OperationRun(
    ScriptResult Script,
    IReadOnlyList<DatabaseStep>? DatabaseSteps,
    string? SnapshotPath);

/// <summary>
/// Runs ONE already-validated operation against a server: opens the right connection(s), executes,
/// and saves the snapshot file when the operation asks for it. Shared by the single-operation
/// endpoint and by <see cref="WorkflowRunner"/>, so both behave identically.
/// Confirm tokens, generated secrets and auditing stay with the caller.
/// </summary>
public static class OperationRunner
{
    public static async Task<OperationRun> RunAsync(
        OperationDefinition operation,
        IReadOnlyDictionary<string, string?> values,
        string serverName,
        string? database,
        IServerConnectionFactory connections,
        string snapshotDirectory,
        CancellationToken ct,
        bool dryRun = false)
    {
        ScriptResult script;
        IReadOnlyList<DatabaseStep>? databaseSteps = null;

        if (operation.Scope == OperationScope.AllDatabases)
        {
            // The executor opens its own connections (one per database).
            var all = await AllDatabasesExecutor.ExecuteAsync(operation, values, serverName, connections, ct, dryRun);
            script = all.Combined;
            databaseSteps = all.Steps;
        }
        else
        {
            await using var conn = await connections.OpenAsync(serverName, database, ct);
            var messages = new List<string>();
            using var subscription = conn.Engine.SubscribeToMessages(conn.Connection, messages);

            script = await OperationExecutor.ExecuteAsync(
                operation, values, conn.Connection, conn.Engine.Dialect,
                conn.Server.CommandTimeoutSeconds, messages, ct, dryRun);
        }

        // Rollback reference: keep the report as a file next to the exe (snapshots/ is git-ignored).
        string? snapshotPath = null;
        if (operation.SaveSnapshot && !script.Failed && !dryRun)
        {
            snapshotPath = await SnapshotWriter.WriteAsync(
                snapshotDirectory, serverName, operation, values, script.ResultSets, DateTimeOffset.UtcNow, ct);
        }

        return new OperationRun(script, databaseSteps, snapshotPath);
    }
}
