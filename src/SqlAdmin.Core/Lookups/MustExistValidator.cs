using SqlAdmin.Core.Engines;
using SqlAdmin.Core.Operations;

namespace SqlAdmin.Core.Lookups;

/// <summary>
/// Server-side half of <c>must_exist: true</c>: before preview/execute, every such parameter is looked up
/// on the target server. The form already restricts the choice, but the API must not trust the form.
/// Degrades like the pickers do: if the catalog cannot be read (warning) the check is skipped.
/// </summary>
public static class MustExistValidator
{
    /// <exception cref="TemplateRenderException">A value is not in its lookup (mapped to 400 by the API).</exception>
    public static async Task ValidateAsync(
        OperationDefinition operation,
        IReadOnlyDictionary<string, string?> values,
        string serverName,
        string? database,
        ILookupRegistry lookups,
        IServerConnectionFactory connections,
        CancellationToken ct)
    {
        foreach (var param in operation.Params.Where(p => p.MustExist))
        {
            var value = values.GetValueOrDefault(param.Name);
            if (string.IsNullOrWhiteSpace(value)) continue; // "required" is the renderer's job

            var sourceId = param.EffectiveSource
                ?? throw new InvalidOperationException($"Parameter '{param.Name}' has must_exist but no source.");

            // Database-scoped lookups (users, roles...) need the page's database; without one we cannot check.
            await using var probe = await connections.OpenAsync(serverName, database: null, ct);
            var lookup = lookups.Find(sourceId, probe.Engine.Id);
            if (lookup is null) continue; // no variant for this engine → nothing to validate against

            ServerConnection? scoped = null;
            try
            {
                var conn = probe;
                var target = lookup.DatabaseToOpen(database);
                if (lookup.Scope == LookupScope.Database && string.IsNullOrWhiteSpace(target)) continue;
                if (target is not null)
                {
                    try
                    {
                        scoped = await connections.OpenAsync(serverName, target, ct);
                    }
                    catch (System.Data.Common.DbException)
                    {
                        continue; // e.g. this login cannot connect to master on Azure: cannot validate, degrade
                    }

                    conn = scoped;
                }

                var args = lookup.Args.ToDictionary(a => a, a => values.GetValueOrDefault(a));
                var result = await LookupRunner.RunAsync(
                    lookup, conn.Connection, conn.Engine.Dialect, args, conn.Server.CommandTimeoutSeconds, ct);

                if (result.Warning is not null) continue;

                // A list parameter must have EVERY item in the lookup; a single value just itself.
                var wanted = param.Multi ? MultiValues.Parse(value) : [value];
                if (wanted.Contains(MultiValues.NoneSentinel))
                    throw new TemplateRenderException($"Nothing is selected for '{param.Name}': tick at least one item, or leave this step out.");
                var missing = wanted
                    .Where(w => !result.Items.Any(i => string.Equals(i.Value, w, StringComparison.OrdinalIgnoreCase)))
                    .ToList();
                if (missing.Count > 0)
                {
                    throw new TemplateRenderException(
                        $"{string.Join(", ", missing.Select(m => $"'{m}'"))} {(missing.Count == 1 ? "is not a valid value" : "are not valid values")} for '{param.Name}': not found on {serverName} ({lookup.Name}).");
                }
            }
            finally
            {
                if (scoped is not null) await scoped.DisposeAsync();
            }
        }
    }
}
