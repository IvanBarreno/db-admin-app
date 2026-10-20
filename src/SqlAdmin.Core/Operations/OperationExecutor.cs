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

    /// <summary>
    /// Fills blank <c>generate: true</c> password parameters with a fresh random password. Returns
    /// the completed values plus the generated ones (name → password) so the caller can show them
    /// to the DBA once. Called at execute time only — preview never needs the real value.
    /// </summary>
    public static (Dictionary<string, string?> Values, Dictionary<string, string> Generated) ApplyGeneratedSecrets(
        OperationDefinition operation, IReadOnlyDictionary<string, string?> values)
    {
        var completed = new Dictionary<string, string?>(values);
        var generated = new Dictionary<string, string>();
        foreach (var p in operation.Params.Where(p => p.Generate && p.Type == OperationParameterType.Password))
        {
            if (!string.IsNullOrWhiteSpace(completed.GetValueOrDefault(p.Name))) continue;
            var password = SecretGenerator.GeneratePassword();
            completed[p.Name] = password;
            generated[p.Name] = password;
        }
        return (completed, generated);
    }

    /// <summary>
    /// The request's parameter values as JSON for the audit log, with every
    /// <see cref="OperationParameterType.Password"/> value replaced by <c>***</c>. Blank values are omitted.
    /// </summary>
    public static string RedactedParametersJson(
        OperationDefinition operation, IReadOnlyDictionary<string, string?> values)
    {
        var passwords = operation.Params
            .Where(p => p.Type == OperationParameterType.Password)
            .Select(p => p.Name)
            .ToHashSet(StringComparer.Ordinal);

        var redacted = values
            .Where(kv => !string.IsNullOrWhiteSpace(kv.Value))
            .OrderBy(kv => kv.Key, StringComparer.Ordinal)
            .ToDictionary(kv => kv.Key, kv => passwords.Contains(kv.Key) ? "***" : kv.Value);
        return System.Text.Json.JsonSerializer.Serialize(redacted);
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
