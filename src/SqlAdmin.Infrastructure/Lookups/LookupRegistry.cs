using SqlAdmin.Core.Lookups;

namespace SqlAdmin.Infrastructure.Lookups;

/// <summary>
/// Loads every lookup once at startup. The same id may be defined several times as long as no engine is
/// listed twice (e.g. <c>logins</c> for sqlserver and another for azuresql).
/// </summary>
public sealed class LookupRegistry : ILookupRegistry
{
    private readonly IReadOnlyList<LookupDefinition> all;

    public LookupRegistry(string lookupsDirectory)
    {
        all = YamlLookupLoader.LoadFromDirectory(lookupsDirectory);

        var clash = all
            .SelectMany(l => l.Engines.Select(e => (l.Id, Engine: e)))
            .GroupBy(x => x)
            .FirstOrDefault(g => g.Count() > 1);
        if (clash is not null)
        {
            throw new InvalidOperationException(
                $"Lookup '{clash.Key.Id}' is defined more than once for engine '{clash.Key.Engine}' in {lookupsDirectory}.");
        }
    }

    public IReadOnlyList<LookupDefinition> All => all;

    public LookupDefinition? Find(string id, string engineId) =>
        all.FirstOrDefault(l => l.Id == id && l.Engines.Contains(engineId));
}
