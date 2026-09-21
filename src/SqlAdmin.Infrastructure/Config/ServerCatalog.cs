using Microsoft.Extensions.Options;
using SqlAdmin.Core.Config;

namespace SqlAdmin.Infrastructure.Config;

/// <summary>
/// Turns the bound <see cref="ServersOptions"/> into immutable <see cref="ServerDefinition"/>s,
/// applying the three-layer merge: Defaults ← Item ← Override.
/// Registered as a singleton, so the merge happens once at startup.
/// </summary>
public sealed class ServerCatalog : IServerCatalog
{
    private readonly Dictionary<string, ServerDefinition> _byName;

    // IOptions<T> is how DI hands us the bound + validated configuration object.
    // (IOptionsMonitor<T> would let us react to file changes at runtime; not needed here.)
    public ServerCatalog(IOptions<ServersOptions> options)
    {
        var o = options.Value; // triggers binding + validation on first access

        _byName = o.Items
            .Select(item => Merge(o.Defaults, item, o.Overrides.GetValueOrDefault(item.Name!)))
            .ToDictionary(s => s.Name, StringComparer.OrdinalIgnoreCase);

        All = _byName.Values.OrderBy(s => s.Name, StringComparer.OrdinalIgnoreCase).ToList();
    }

    public IReadOnlyList<ServerDefinition> All { get; }

    public ServerDefinition? Find(string name) => _byName.GetValueOrDefault(name);

    /// <summary>
    /// Precedence per field: override value if set, else item value if set, else default.
    /// The validator already guaranteed Name/Host/Auth are present and that Auth/Environment
    /// parse cleanly, hence the <c>!</c> and the unchecked <see cref="Enum.Parse{TEnum}(string, bool)"/> calls.
    /// </summary>
    private static ServerDefinition Merge(ServerDefaults defaults, ServerItem item, ServerOverride? ovr) => new()
    {
        Name = item.Name!,
        Host = ovr?.Host ?? item.Host!,
        Port = ovr?.Port ?? item.Port,
        Engine = item.Engine ?? defaults.Engine,
        Auth = Enum.Parse<AuthMode>(ovr?.Auth ?? item.Auth!, ignoreCase: true),
        UsernameSecret = ovr?.UsernameSecret ?? item.UsernameSecret,
        PasswordSecret = ovr?.PasswordSecret ?? item.PasswordSecret,
        DefaultDatabase = ovr?.DefaultDatabase ?? item.DefaultDatabase,
        Environment = string.IsNullOrWhiteSpace(item.Environment)
            ? ServerEnvironment.Development
            : Enum.Parse<ServerEnvironment>(item.Environment, ignoreCase: true),
        Tags = item.Tags.AsReadOnly(),
        Encrypt = item.Encrypt ?? defaults.Encrypt,
        TrustServerCertificate = ovr?.TrustServerCertificate ?? item.TrustServerCertificate ?? defaults.TrustServerCertificate,
        CommandTimeoutSeconds = ovr?.CommandTimeoutSeconds ?? item.CommandTimeoutSeconds ?? defaults.CommandTimeoutSeconds,
    };
}
