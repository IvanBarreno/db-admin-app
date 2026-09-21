namespace SqlAdmin.Core.Config;

/// <summary>
/// Read-only list of configured servers after all merging (defaults + items + personal overrides).
/// Implemented in Infrastructure on top of the .NET configuration system.
/// </summary>
public interface IServerCatalog
{
    IReadOnlyList<ServerDefinition> All { get; }

    /// <summary>Case-insensitive lookup by <see cref="ServerDefinition.Name"/>; null when unknown.</summary>
    ServerDefinition? Find(string name);
}
