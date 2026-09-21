using SqlAdmin.Core.Config;
using SqlAdmin.Core.Engines;

namespace SqlAdmin.Api.Contracts;

/// <summary>
/// What the UI needs to know about a server. Deliberately a separate type from
/// <see cref="ServerDefinition"/>: it drops the secret NAMES (still not secrets, but nobody
/// outside the process needs them) and adds engine details for the picker.
/// </summary>
public sealed record ServerSummary(
    string Name,
    string Host,
    int? Port,
    string Engine,
    string EngineDisplayName,
    AuthMode Auth,
    ServerEnvironment Environment,
    string? DefaultDatabase,
    IReadOnlyList<string> Tags,
    EngineCapabilities Capabilities)
{
    public static ServerSummary From(ServerDefinition s, IDatabaseEngine engine) => new(
        s.Name, s.Host, s.Port, engine.Id, engine.DisplayName, s.Auth, s.Environment,
        s.DefaultDatabase, s.Tags, engine.Capabilities);
}

/// <summary>
/// Outcome of POST /api/servers/{name}/test. A failed connection is a NORMAL result of a
/// test (that's what the button is for), so it is reported in the body with 200, not as an error.
/// </summary>
public sealed record ConnectionTestResult(
    bool Success,
    long ElapsedMs,
    ServerInfo? Info,
    string? Error);
