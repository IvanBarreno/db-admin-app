namespace SqlAdmin.Core.Config;

/// <summary>How the app authenticates against a server.</summary>
public enum AuthMode
{
    /// <summary>SQL Server login + password (credentials resolved from secrets).</summary>
    Sql,
    /// <summary>Integrated Security: the Windows identity running the exe. Windows only.</summary>
    Windows,
    /// <summary>Microsoft Entra ID (Azure AD). Used for Azure SQL; interactive browser sign-in.</summary>
    EntraId,
}

/// <summary>Drives UI safety: production servers get a banner and stricter confirmations.</summary>
public enum ServerEnvironment
{
    Development,
    Test,
    Production,
}

/// <summary>
/// One fully-resolved server entry: shared defaults, the item from servers.json and any
/// personal override from servers.local.json have already been merged.
/// This is what the rest of the application works with — it never reads JSON itself.
/// </summary>
/// <remarks>
/// A record with <c>init</c> properties instead of a positional record: there are many fields,
/// and named initialisation (<c>new ServerDefinition { Name = "...", Host = "..." }</c>)
/// reads better than a 12-argument constructor.
/// <c>required</c> makes the compiler refuse to create one without those members set.
/// </remarks>
public sealed record ServerDefinition
{
    /// <summary>Unique, human-friendly identifier used in URLs and the audit log (e.g. "PROD-IVR").</summary>
    public required string Name { get; init; }

    /// <summary>Host name, IP, or instance ("localhost\SQLEXPRESS", "myserver.database.windows.net").</summary>
    public required string Host { get; init; }

    /// <summary>TCP port. Null = driver default (1433) or named-instance resolution via SQL Browser.</summary>
    public int? Port { get; init; }

    /// <summary>Engine id resolved through <see cref="Engines.IEngineRegistry"/>: "sqlserver", "azuresql", ...</summary>
    public required string Engine { get; init; }

    public required AuthMode Auth { get; init; }

    /// <summary>Secret NAME (never the value) looked up through <see cref="ISecretResolver"/>. Required for <see cref="AuthMode.Sql"/>.</summary>
    public string? UsernameSecret { get; init; }

    /// <summary>Secret NAME (never the value). Required for <see cref="AuthMode.Sql"/>.</summary>
    public string? PasswordSecret { get; init; }

    /// <summary>Default database for the connection; null = the login's default (usually master).
    /// Azure SQL logins often have no access to master, so set it there.</summary>
    public string? DefaultDatabase { get; init; }

    public ServerEnvironment Environment { get; init; } = ServerEnvironment.Development;

    public IReadOnlyList<string> Tags { get; init; } = [];

    /// <summary>TLS on the wire. Should be true everywhere; Azure SQL enforces it.</summary>
    public bool Encrypt { get; init; } = true;

    /// <summary>Accept self-signed certificates. Only for internal servers without proper certs.</summary>
    public bool TrustServerCertificate { get; init; }

    /// <summary>Per-command timeout applied to every query we run on this server.</summary>
    public int CommandTimeoutSeconds { get; init; } = 30;

    /// <summary>Convenience for UI/guards: production servers are treated more carefully.</summary>
    public bool IsProduction => Environment == ServerEnvironment.Production;
}
