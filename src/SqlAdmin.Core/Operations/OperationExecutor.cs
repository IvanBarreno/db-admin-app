using System.Data.Common;
using SqlAdmin.Core.Engines;
using SqlAdmin.Core.Execution;

namespace SqlAdmin.Core.Operations;

/// <summary>What <c>preview</c> returns: the exact SQL that would run, nothing executed yet.</summary>
public sealed record OperationPlan(string OperationId, IReadOnlyList<string> Batches);

/// <summary>
/// Renders an operation's template against supplied parameter values and either returns the
/// plan (preview) or runs it on an open connection (execute). <see cref="OperationScope.AllDatabases"/>
/// and the destructive-operation confirm-token flow are Phase 3/4 — this covers
/// <see cref="OperationScope.Server"/> and <see cref="OperationScope.Database"/>.
/// </summary>
public static class OperationExecutor
{
    public static OperationPlan Plan(
        OperationDefinition operation,
        IReadOnlyDictionary<string, string?> values,
        ISqlDialect dialect)
    {
        var rendered = TemplateRenderer.Render(operation, values, dialect);
        var batches = BatchSplitter.Split(rendered.Sql, dialect.BatchSeparator);
        return new OperationPlan(operation.Id, batches);
    }

    public static async Task<ScriptResult> ExecuteAsync(
        OperationDefinition operation,
        IReadOnlyDictionary<string, string?> values,
        DbConnection connection,
        ISqlDialect dialect,
        int commandTimeoutSeconds,
        List<string> messages,
        CancellationToken ct)
    {
        var rendered = TemplateRenderer.Render(operation, values, dialect);
        var batches = BatchSplitter.Split(rendered.Sql, dialect.BatchSeparator);

        return await SqlScriptExecutor.ExecuteAsync(
            connection, batches, rendered.Parameters, commandTimeoutSeconds, messages, ct);
    }
}
