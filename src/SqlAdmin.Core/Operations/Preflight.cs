using System.Data.Common;
using SqlAdmin.Core.Engines;

namespace SqlAdmin.Core.Operations;

public enum CheckSeverity
{
    /// <summary>Blocks the operation: no confirm token is issued and execute is refused.</summary>
    Error,
    /// <summary>Shown to the DBA but does not block.</summary>
    Warning,
}

/// <summary>
/// A read-only query declared in an operation's YAML (<c>checks:</c>). It returns a row when the
/// condition is VIOLATED and no rows when everything is fine. A column named <c>message</c> in the row,
/// if present, replaces <see cref="Message"/> (so a check can say which value is wrong).
/// Parameters are bound exactly like the operation's own SQL (<c>@login_name</c>...).
/// </summary>
public sealed record OperationCheck(string Id, CheckSeverity Severity, string Message, string Sql);

/// <summary>Outcome of one check. <paramref name="Ok"/> false = the condition was violated.</summary>
public sealed record CheckResult(string Id, CheckSeverity Severity, bool Ok, string Message)
{
    public bool Blocking => !Ok && Severity == CheckSeverity.Error;
}

/// <summary>Thrown by execute when a blocking check fails (mapped to HTTP 409 with the messages).</summary>
public sealed class PreflightFailedException(IReadOnlyList<CheckResult> failures)
    : Exception("Preflight checks failed: " + string.Join(" ", failures.Select(f => f.Message)))
{
    public IReadOnlyList<CheckResult> Failures { get; } = failures;
}

/// <summary>Runs the <see cref="OperationCheck"/>s of an operation on the target server.</summary>
public static class PreflightRunner
{
    /// <summary>
    /// One connection for all checks of the operation. A check that cannot run (no permission on a
    /// catalog, bad SQL) becomes a WARNING saying so — it must not silently pass, and must not block either.
    /// </summary>
    public static async Task<IReadOnlyList<CheckResult>> RunAsync(
        OperationDefinition operation,
        IReadOnlyDictionary<string, string?> values,
        string serverName,
        string? database,
        IServerConnectionFactory connections,
        CancellationToken ct)
    {
        if (operation.Checks.Count == 0) return [];

        // Database-scope operations are checked inside the chosen database; everything else at server level.
        var target = operation.Scope == OperationScope.Database ? database : null;
        await using var conn = await connections.OpenAsync(serverName, target, ct);

        var results = new List<CheckResult>();
        foreach (var check in operation.Checks)
        {
            results.Add(await RunOneAsync(operation, check, values, conn, ct));
        }

        return results;
    }

    /// <summary>Throws <see cref="PreflightFailedException"/> when any result is blocking.</summary>
    public static void ThrowIfBlocking(IReadOnlyList<CheckResult> results)
    {
        var failures = results.Where(r => r.Blocking).ToList();
        if (failures.Count > 0) throw new PreflightFailedException(failures);
    }

    private static async Task<CheckResult> RunOneAsync(
        OperationDefinition operation, OperationCheck check,
        IReadOnlyDictionary<string, string?> values, ServerConnection conn, CancellationToken ct)
    {
        try
        {
            // Reuse the renderer so @params are bound the same way; the check SQL replaces the operation SQL.
            var rendered = TemplateRenderer.Render(operation with { Sql = check.Sql }, values, conn.Engine.Dialect);

            await using var cmd = conn.Connection.CreateCommand();
            cmd.CommandText = rendered.Sql;
            cmd.CommandTimeout = conn.Server.CommandTimeoutSeconds;
            foreach (var (name, value) in rendered.Parameters)
            {
                var p = cmd.CreateParameter();
                p.ParameterName = name;
                p.Value = value;
                cmd.Parameters.Add(p);
            }

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            if (!await reader.ReadAsync(ct)) return new CheckResult(check.Id, check.Severity, true, check.Message);

            // A violated check: prefer the row's own message column.
            var messageIx = Enumerable.Range(0, reader.FieldCount)
                .Select(i => (i, name: reader.GetName(i)))
                .FirstOrDefault(c => c.name.Equals("message", StringComparison.OrdinalIgnoreCase));
            var message = messageIx.name is not null && !reader.IsDBNull(messageIx.i)
                ? Convert.ToString(reader.GetValue(messageIx.i)) ?? check.Message
                : check.Message;
            return new CheckResult(check.Id, check.Severity, false, message);
        }
        catch (DbException ex)
        {
            return new CheckResult(check.Id, CheckSeverity.Warning, false,
                $"Could not run check '{check.Id}' ({check.Message}): {ex.Message}");
        }
    }
}
