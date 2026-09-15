namespace SqlAdmin.Core.Engines;

/// <summary>
/// Finds the <see cref="IDatabaseEngine"/> for an engine id. Engines register themselves in
/// dependency injection; this registry simply indexes whatever was registered, so adding
/// an engine is one <c>services.AddSingleton&lt;IDatabaseEngine, PostgresEngine&gt;()</c> line.
/// </summary>
public interface IEngineRegistry
{
    IReadOnlyCollection<IDatabaseEngine> All { get; }

    /// <summary>Case-insensitive lookup; throws <see cref="UnknownEngineException"/> for ids nobody registered.</summary>
    IDatabaseEngine Get(string engineId);

    bool TryGet(string engineId, out IDatabaseEngine? engine);
}

/// <summary>Thrown when servers.json names an engine that has no implementation loaded.</summary>
public sealed class UnknownEngineException(string engineId)
    : Exception($"No database engine is registered with id '{engineId}'.")
{
    public string EngineId { get; } = engineId;
}
