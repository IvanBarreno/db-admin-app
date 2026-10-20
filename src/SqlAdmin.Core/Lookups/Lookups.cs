using System.Data;
using System.Data.Common;
using SqlAdmin.Core.Engines;

namespace SqlAdmin.Core.Lookups;

/// <summary>Where a lookup runs: once per server (master) or inside one chosen database.</summary>
public enum LookupScope
{
    Server,
    /// <summary>The connection is opened against the database passed by the caller.</summary>
    Database,
}

/// <summary>
/// A read-only catalog query that feeds pickers, checklists and (later) the Explorer. Loaded from
/// <c>lookups/*.yaml</c>. The same id may appear once per engine family (e.g. <c>logins</c> for
/// SQL Server and another for Azure SQL); <see cref="ILookupRegistry.Find"/> picks the right one.
/// </summary>
public sealed record LookupDefinition
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required LookupScope Scope { get; init; }
    public required IReadOnlyList<string> Engines { get; init; }

    /// <summary>
    /// Fixed database to connect to (e.g. <c>master</c> for Azure SQL logins, which live only there).
    /// Null = no database for server scope, the caller's database for database scope.
    /// </summary>
    public string? ConnectTo { get; init; }

    /// <summary>The database to open the connection against for this lookup.</summary>
    public string? DatabaseToOpen(string? callerDatabase) =>
        ConnectTo ?? (Scope == LookupScope.Database ? callerDatabase : null);

    /// <summary>Names of extra inputs (bound as <c>@name</c>, NULL when the caller sent none), e.g. <c>login_name</c>.</summary>
    public IReadOnlyList<string> Args { get; init; } = [];

    /// <summary>
    /// Must return a <c>value</c> column (what goes into the parameter) and may return <c>label</c>
    /// (text for humans). Every other column travels as extra info (state, owner, is_disabled...).
    /// </summary>
    public required string Sql { get; init; }
}

public interface ILookupRegistry
{
    IReadOnlyList<LookupDefinition> All { get; }

    /// <summary>The definition with this id that supports the engine, or null.</summary>
    LookupDefinition? Find(string id, string engineId);
}

/// <summary>One row of a lookup: the value to store, a display label and the remaining columns.</summary>
public sealed record LookupItem(string Value, string Label, IReadOnlyDictionary<string, object?> Extra);

/// <summary>
/// Rows of a lookup. <paramref name="Warning"/> is set when the catalog could not be read (permission
/// denied, view missing on this engine): the list is then empty and the UI falls back to free text.
/// </summary>
public sealed record LookupResult(IReadOnlyList<LookupItem> Items, string? Warning = null);

/// <summary>Executes a <see cref="LookupDefinition"/> on an open connection.</summary>
public static class LookupRunner
{
    public static async Task<LookupResult> RunAsync(
        LookupDefinition lookup,
        DbConnection connection,
        ISqlDialect dialect,
        IReadOnlyDictionary<string, string?> args,
        int commandTimeoutSeconds,
        CancellationToken ct)
    {
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = lookup.Sql;
        cmd.CommandTimeout = commandTimeoutSeconds;

        foreach (var arg in lookup.Args)
        {
            var p = cmd.CreateParameter();
            p.ParameterName = dialect.ParameterPrefix + arg;
            p.Value = args.GetValueOrDefault(arg) is { Length: > 0 } v ? v : DBNull.Value;
            cmd.Parameters.Add(p);
        }

        try
        {
            var items = new List<LookupItem>();
            await using var reader = await cmd.ExecuteReaderAsync(ct);

            var names = Enumerable.Range(0, reader.FieldCount).Select(reader.GetName).ToList();
            var valueIx = names.FindIndex(n => n.Equals("value", StringComparison.OrdinalIgnoreCase));
            var labelIx = names.FindIndex(n => n.Equals("label", StringComparison.OrdinalIgnoreCase));
            if (valueIx < 0) throw new InvalidOperationException($"Lookup '{lookup.Id}' must return a 'value' column.");

            while (await reader.ReadAsync(ct))
            {
                var value = Convert.ToString(reader.GetValue(valueIx)) ?? "";
                var label = labelIx >= 0 && !reader.IsDBNull(labelIx) ? Convert.ToString(reader.GetValue(labelIx)) ?? value : value;

                var extra = new Dictionary<string, object?>();
                for (var i = 0; i < names.Count; i++)
                {
                    if (i == valueIx || i == labelIx) continue;
                    extra[names[i]] = reader.IsDBNull(i) ? null : reader.GetValue(i);
                }

                items.Add(new LookupItem(value, label, extra));
            }

            return new LookupResult(items);
        }
        catch (DbException ex)
        {
            // Typical cause: the login cannot read this catalog view. Degrade, don't fail the page.
            return new LookupResult([], $"Could not read '{lookup.Name}': {ex.Message}");
        }
    }
}
