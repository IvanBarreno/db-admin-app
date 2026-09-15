using SqlAdmin.Core.Config;

namespace SqlAdmin.Infrastructure.Config;

// These are "options classes": plain mutable objects that the .NET configuration binder
// fills from JSON. The binder matches property names to JSON keys (case-insensitive) and
// parses enums by name, so "Auth": "Sql" becomes AuthMode.Sql automatically.
//
// They mirror the JSON shape, not the domain shape — ServerCatalog turns them into
// immutable ServerDefinition records that the rest of the app uses.

/// <summary>Root of the "Servers" section, merged from servers.json and servers.local.json.</summary>
public sealed class ServersOptions
{
    public const string SectionName = "Servers";

    /// <summary>Values applied to every item unless the item sets its own.</summary>
    public ServerDefaults Defaults { get; set; } = new();

    /// <summary>The shared server list (servers.json).</summary>
    public List<ServerItem> Items { get; set; } = [];

    /// <summary>
    /// Personal overrides keyed by server Name (servers.local.json).
    /// A dictionary rather than a second array on purpose: the configuration system merges
    /// arrays by INDEX (item 0 overrides item 0), which is useless for "override PROD-IVR".
    /// Dictionary keys merge by name, which is exactly what we want.
    /// </summary>
    public Dictionary<string, ServerOverride> Overrides { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class ServerDefaults
{
    public string Engine { get; set; } = "sqlserver";
    public bool Encrypt { get; set; } = true;
    public bool TrustServerCertificate { get; set; }
    public int CommandTimeoutSeconds { get; set; } = 30;
}

/// <summary>One entry of the shared list. Nullable properties fall back to <see cref="ServerDefaults"/>.</summary>
public sealed class ServerItem
{
    public string? Name { get; set; }
    public string? Host { get; set; }
    public int? Port { get; set; }
    public string? Engine { get; set; }

    /// <summary>Raw string from JSON; parsed against <see cref="AuthMode"/> by the validator
    /// instead of bound directly, so a bad value is a collected error, not a binder crash.</summary>
    public string? Auth { get; set; }
    public string? UsernameSecret { get; set; }
    public string? PasswordSecret { get; set; }
    public string? DefaultDatabase { get; set; }

    /// <summary>Raw string from JSON; parsed against <see cref="ServerEnvironment"/> by the
    /// validator instead of bound directly, so a bad value is a collected error, not a binder crash.</summary>
    public string? Environment { get; set; }
    public List<string> Tags { get; set; } = [];
    public bool? Encrypt { get; set; }
    public bool? TrustServerCertificate { get; set; }
    public int? CommandTimeoutSeconds { get; set; }
}

/// <summary>Fields a DBA may change for themselves. Everything is optional: only set values override.</summary>
public sealed class ServerOverride
{
    public string? Host { get; set; }
    public int? Port { get; set; }

    /// <summary>Raw string from JSON; parsed against <see cref="AuthMode"/> by the validator
    /// instead of bound directly, so a bad value is a collected error, not a binder crash.</summary>
    public string? Auth { get; set; }
    public string? UsernameSecret { get; set; }
    public string? PasswordSecret { get; set; }
    public string? DefaultDatabase { get; set; }
    public bool? TrustServerCertificate { get; set; }
    public int? CommandTimeoutSeconds { get; set; }
}
