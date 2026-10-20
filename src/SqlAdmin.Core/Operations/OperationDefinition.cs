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

    /// <summary>True: after a successful run the result sets are saved to <c>snapshots/</c> (see <see cref="SnapshotWriter"/>).</summary>
    public bool SaveSnapshot { get; init; }

    /// <summary>
    /// For operations that are only destructive in some modes (e.g. role ADD vs DROP): the operation
    /// needs a confirm token when this parameter holds one of the listed values. Ignored when
    /// <see cref="Destructive"/> is already true.
    /// </summary>
    public DestructiveCondition? DestructiveWhen { get; init; }

    public IReadOnlyList<OperationParameter> Params { get; init; } = [];
    /// <summary>
    /// The template SQL. Value placeholders are real parameters (<c>@name</c>, bound as
    /// <see cref="System.Data.Common.DbParameter"/>); identifiers that must be inlined use
    /// <c>{{ident:name}}</c> and go through <see cref="Engines.ISqlDialect.QuoteIdentifier"/>.
    /// </summary>
    public required string Sql { get; init; }

    /// <summary>True when running with these values must go through the confirm-token flow.</summary>
    public bool RequiresConfirmation(IReadOnlyDictionary<string, string?> values) =>
        Destructive
        || (DestructiveWhen is { } when_
            && values.GetValueOrDefault(when_.Param) is { } v
            && when_.Values.Contains(v, StringComparer.OrdinalIgnoreCase));
}

/// <summary>"Destructive when <see cref="Param"/> is one of <see cref="Values"/>."</summary>
public sealed record DestructiveCondition(string Param, IReadOnlyList<string> Values);
