using System.Data.Common;
using System.Text.Json;
using System.Text.Json.Serialization;
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

        // generate_for_each: one password per item of a list parameter.
        //   IN  (from the form):  {"alice": "typed by the DBA"}      — only the items with a typed password
        //   OUT (to the script):  {"alice": {"p": "typed…", "g": false}, "bob": {"p": "generated…", "g": true}}
        // An item without a typed password gets a generated one. "g" tells the script which passwords were
        // generated: only those are shown in the result grid (a typed one is already known to the DBA).
        // These are NOT added to `generated`: the caller shows that dictionary only when the whole run
        // succeeded, but a list run can succeed for some items and fail for others. The script therefore
        // reports each generated password next to the item it was really set for.
        foreach (var p in PerItemSecretParams(operation))
        {
            var items = MultiValues.Parse(completed.GetValueOrDefault(p.GenerateForEach!));
            var typed = ParseTypedSecrets(p, completed.GetValueOrDefault(p.Name), items);
            var perItem = new Dictionary<string, PerItemSecret>(StringComparer.Ordinal);
            foreach (var item in items)
            {
                perItem[item] = typed.TryGetValue(item, out var own)
                    ? new PerItemSecret(own, Generated: false)
                    : new PerItemSecret(SecretGenerator.GeneratePassword(), Generated: true);
            }
            completed[p.Name] = JsonSerializer.Serialize(perItem);
        }
        return (completed, generated);
    }

    /// <summary>
    /// Checks the passwords the DBA typed for a <c>generate_for_each</c> parameter WITHOUT generating anything:
    /// preview calls it so a bad value is reported before the confirm step, not when the run starts.
    /// Throws <see cref="TemplateRenderException"/> (HTTP 400). Messages name the item, never the password.
    /// </summary>
    public static void ValidatePerItemSecrets(OperationDefinition operation, IReadOnlyDictionary<string, string?> values)
    {
        foreach (var p in PerItemSecretParams(operation))
        {
            var items = MultiValues.Parse(values.GetValueOrDefault(p.GenerateForEach!));
            ParseTypedSecrets(p, values.GetValueOrDefault(p.Name), items);
        }
    }

    private static IEnumerable<OperationParameter> PerItemSecretParams(OperationDefinition operation) =>
        operation.Params.Where(p => p.GenerateForEach is not null && p.Type == OperationParameterType.Password);

    /// <summary>What the script receives per item. Short JSON names keep the bound value small.</summary>
    private sealed record PerItemSecret(
        [property: JsonPropertyName("p")] string Password,
        [property: JsonPropertyName("g")] bool Generated);

    /// <summary>SQL Server's own limit for a login password.</summary>
    private const int MaxPasswordLength = 128;

    /// <summary>
    /// The typed passwords of a <c>generate_for_each</c> parameter, for the items that are really in the list.
    /// Blank entries mean "generate it"; entries for names that are not in the list are dropped (the DBA
    /// unticked that login after typing a password for it).
    /// </summary>
    private static Dictionary<string, string> ParseTypedSecrets(
        OperationParameter param, string? raw, IReadOnlyList<string> items)
    {
        var typed = new Dictionary<string, string>(StringComparer.Ordinal);
        if (string.IsNullOrWhiteSpace(raw)) return typed;

        Dictionary<string, string?>? sent;
        try
        {
            sent = JsonSerializer.Deserialize<Dictionary<string, string?>>(raw);
        }
        catch (JsonException)
        {
            // Never echo `raw` here: it contains passwords.
            throw new TemplateRenderException($"'{param.Name}' must be a JSON object of item → password.");
        }

        if (sent is null) return typed; // the JSON text "null"

        var listed = items.ToHashSet(StringComparer.Ordinal);
        foreach (var (key, value) in sent)
        {
            var item = key.Trim();
            if (string.IsNullOrEmpty(value) || !listed.Contains(item)) continue;
            if (value.Length > MaxPasswordLength)
                throw new TemplateRenderException($"The password for '{item}' is longer than {MaxPasswordLength} characters.");
            typed[item] = value;
        }
        return typed;
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
        CancellationToken ct,
        bool dryRun = false)
    {
        var rendered = TemplateRenderer.Render(operation, values, dialect, dryRun);
        var batches = BatchSplitter.Split(rendered.Sql, dialect.BatchSeparator);

        return await SqlScriptExecutor.ExecuteAsync(
            connection, batches, rendered.Parameters, commandTimeoutSeconds, messages, ct);
    }
}
