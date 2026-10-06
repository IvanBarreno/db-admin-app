using SqlAdmin.Core.Operations;

namespace SqlAdmin.Infrastructure.Operations;

/// <summary>
/// Loads every YAML operation once at startup (singleton) and indexes it by id. A future
/// code-based <c>IOperation</c> would be merged in here too — the rest of the app only ever
/// sees <see cref="OperationDefinition"/>, never the YAML files themselves.
/// </summary>
public sealed class OperationRegistry : IOperationRegistry
{
    private readonly Dictionary<string, OperationDefinition> byId;

    public OperationRegistry(string operationsDirectory)
    {
        var loaded = YamlOperationLoader.LoadFromDirectory(operationsDirectory);

        var duplicate = loaded.GroupBy(o => o.Id).FirstOrDefault(g => g.Count() > 1);
        if (duplicate is not null)
        {
            throw new InvalidOperationException($"Duplicate operation id '{duplicate.Key}' in {operationsDirectory}.");
        }

        byId = loaded.ToDictionary(o => o.Id);
    }

    public IReadOnlyList<OperationDefinition> All => byId.Values.ToList();

    public OperationDefinition? Find(string id) => byId.GetValueOrDefault(id);

    public IReadOnlyList<OperationDefinition> ForEngine(string engineId) =>
        byId.Values.Where(o => o.Engines.Contains(engineId)).ToList();
}
