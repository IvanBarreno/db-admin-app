namespace SqlAdmin.Core.Operations;

/// <summary>
/// A registered operation: a parameterized T-SQL template plus metadata. Loaded from YAML
/// today (<c>Infrastructure/Operations/YamlOperationLoader</c>); a future code-based
/// <c>IOperation</c> exposes the same shape so both appear identically in the registry and UI.
/// </summary>
public sealed record OperationDefinition
{
    /// <summary>Stable id used in URLs and the audit log, e.g. "audit.server_roles".</summary>
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string Category { get; init; }
    public required OperationScope Scope { get; init; }
    /// <summary>Engine ids this operation supports; the registry only offers it for a server whose engine is listed.</summary>
    public required IReadOnlyList<string> Engines { get; init; }
    public bool Destructive { get; init; }
    public IReadOnlyList<OperationParameter> Params { get; init; } = [];
    /// <summary>
    /// The template SQL. Value placeholders are real parameters (<c>@name</c>, bound as
    /// <see cref="System.Data.Common.DbParameter"/>); identifiers that must be inlined use
    /// <c>{{ident:name}}</c> and go through <see cref="Engines.ISqlDialect.QuoteIdentifier"/>.
    /// </summary>
    public required string Sql { get; init; }
}
