namespace SqlAdmin.Core.Operations;

/// <summary>
/// All known operations, indexed by id. Populated at startup by scanning YAML files
/// (<c>Infrastructure.Operations.YamlOperationLoader</c>); a code-based <c>IOperation</c>
/// would register here too once Phase 4 introduces it.
/// </summary>
public interface IOperationRegistry
{
    IReadOnlyList<OperationDefinition> All { get; }

    OperationDefinition? Find(string id);

    /// <summary>Operations whose <see cref="OperationDefinition.Engines"/> includes <paramref name="engineId"/>.</summary>
    IReadOnlyList<OperationDefinition> ForEngine(string engineId);
}
