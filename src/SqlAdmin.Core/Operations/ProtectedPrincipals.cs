using SqlAdmin.Core.Engines;
using SqlAdmin.Core.Lookups;

namespace SqlAdmin.Core.Operations;

/// <summary>The logins the app refuses to change on one server, and why.</summary>
public sealed class ProtectedSet
{
    private readonly HashSet<string> names = new(StringComparer.OrdinalIgnoreCase);
    private readonly string? appLogin;

    public ProtectedSet(string? appLogin, IEnumerable<string> configured)
    {
        this.appLogin = appLogin;
        if (!string.IsNullOrWhiteSpace(appLogin)) names.Add(appLogin);
        foreach (var name in configured.Where(n => !string.IsNullOrWhiteSpace(n))) names.Add(name.Trim());
    }

    public bool Contains(string? name) => !string.IsNullOrWhiteSpace(name) && names.Contains(name);

    /// <summary>Why a name is protected, in words for the DBA.</summary>
    public string Reason(string name) =>
        string.Equals(name, appLogin, StringComparison.OrdinalIgnoreCase)
            ? "the account this app connects with"
            : "listed in ProtectedLogins for this server";
}

/// <summary>
/// "View only" rule for the account the app works with: if it could be disabled, dropped, re-roled or given a new
/// password from inside the tool, the tool could lock itself out. So every operation that is not read-only is refused
/// when one of its login / user parameters (or an item of a list parameter) is a protected login: the login the app
/// connects with (<c>ORIGINAL_LOGIN()</c>) plus the server's <c>ProtectedLogins</c>. Audits, the Explorer and the
/// snapshot can still look at it, and a protected login may still be the new OWNER of someone else's objects
/// (<c>protect: false</c> on that parameter). Custom SQL is deliberately unrestricted (every DBA here is an admin).
/// </summary>
public static class ProtectedPrincipals
{
    /// <summary>One login or user an operation is about to change.</summary>
    public sealed record Target(string Parameter, string Name, bool IsUser);

    public static async Task<ProtectedSet> ResolveAsync(ServerConnection conn, CancellationToken ct) =>
        new(await conn.Engine.GetConnectedLoginAsync(conn.Connection, ct), conn.Server.ProtectedLogins);

    /// <summary>The principals this run would change (pure: no server needed).</summary>
    public static IReadOnlyList<Target> TargetsOf(OperationDefinition operation, IReadOnlyDictionary<string, string?> values)
    {
        var targets = new List<Target>();
        foreach (var param in operation.Params.Where(p => p.Protect))
        {
            var value = values.GetValueOrDefault(param.Name);
            if (string.IsNullOrWhiteSpace(value)) continue;

            if (param.Multi && param.EffectiveSource == "logins")
                targets.AddRange(MultiValues.Parse(value).Select(login => new Target(param.Name, login, IsUser: false)));
            else if (!param.Multi && param.Type == OperationParameterType.Login)
                targets.Add(new Target(param.Name, value.Trim(), IsUser: false));
            else if (!param.Multi && param.Type == OperationParameterType.User)
                targets.Add(new Target(param.Name, value.Trim(), IsUser: true));
        }

        return targets;
    }

    /// <summary>One blocking result per protected principal the operation would change. Read-only operations pass.</summary>
    public static async Task<IReadOnlyList<CheckResult>> CheckAsync(
        OperationDefinition operation, IReadOnlyDictionary<string, string?> values, ServerConnection conn, CancellationToken ct)
    {
        if (operation.ReadOnly) return [];

        var targets = TargetsOf(operation, values);
        if (targets.Count == 0) return [];

        var set = await ResolveAsync(conn, ct);
        var results = new List<CheckResult>();
        foreach (var target in targets)
        {
            var login = target.IsUser ? await conn.Engine.GetUserLoginAsync(conn.Connection, target.Name, ct) : target.Name;
            var hit = set.Contains(target.Name) ? target.Name : set.Contains(login) ? login : null;
            if (hit is null) continue;

            var what = target.IsUser && !string.Equals(hit, target.Name, StringComparison.OrdinalIgnoreCase)
                ? $"User [{target.Name}] is mapped to [{hit}]"
                : $"[{hit}]";
            results.Add(new CheckResult("protected_principal", CheckSeverity.Error, false,
                $"{what} is {set.Reason(hit)}: it is view-only here ('{target.Parameter}'). Use another admin account if it really must change."));
        }

        return results;
    }

    /// <summary>
    /// Marks the rows of a principal lookup (<see cref="LookupDefinition.Principal"/>) that are protected, with
    /// <c>is_protected</c> and <c>protected_reason</c>, so pickers can lock them. Rows of other lookups are untouched.
    /// </summary>
    public static async Task<LookupResult> AnnotateAsync(
        LookupDefinition lookup, LookupResult result, ServerConnection conn, CancellationToken ct)
    {
        if (lookup.Principal is null || result.Items.Count == 0) return result;

        var set = await ResolveAsync(conn, ct);
        var items = result.Items.Select(item =>
        {
            var login = lookup.Principal == "user" && item.Extra.TryGetValue("login_name", out var l) ? l as string : null;
            var hit = set.Contains(item.Value) ? item.Value : set.Contains(login) ? login : null;
            if (hit is null) return item;

            var extra = new Dictionary<string, object?>(item.Extra)
            {
                ["is_protected"] = true,
                ["protected_reason"] = set.Reason(hit),
            };
            return item with { Extra = extra };
        }).ToList();

        return result with { Items = items };
    }
}
