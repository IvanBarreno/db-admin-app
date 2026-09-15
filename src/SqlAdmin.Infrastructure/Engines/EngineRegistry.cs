using SqlAdmin.Core.Engines;

namespace SqlAdmin.Infrastructure.Engines;

/// <summary>
/// Indexes every <see cref="IDatabaseEngine"/> registered in DI by its id.
/// Asking for <c>IEnumerable&lt;IDatabaseEngine&gt;</c> in a constructor is a built-in DI feature:
/// the container hands over ALL registrations of that interface, in registration order.
/// </summary>
public sealed class EngineRegistry : IEngineRegistry
{
    private readonly Dictionary<string, IDatabaseEngine> _byId;

    public EngineRegistry(IEnumerable<IDatabaseEngine> engines)
    {
        _byId = engines.ToDictionary(e => e.Id, StringComparer.OrdinalIgnoreCase);
        All = _byId.Values.ToList();
    }

    public IReadOnlyCollection<IDatabaseEngine> All { get; }

    public IDatabaseEngine Get(string engineId) =>
        _byId.GetValueOrDefault(engineId) ?? throw new UnknownEngineException(engineId);

    public bool TryGet(string engineId, out IDatabaseEngine? engine) =>
        _byId.TryGetValue(engineId, out engine);
}
