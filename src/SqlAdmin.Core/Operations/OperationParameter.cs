namespace SqlAdmin.Core.Operations;

/// <summary>Primitive kind of a parameter — drives both the generated <c>ParamForm</c> input and
/// how <see cref="TemplateRenderer"/> treats the value (bound as a value vs. quoted as an identifier).</summary>
public enum OperationParameterType
{
    /// <summary>Database/role/schema identifier name — safe only via <see cref="Engines.ISqlDialect.QuoteIdentifier"/>.</summary>
    Sysname,
    String,
    Int,
    Bool,
    /// <summary>Never logged in plain text; redacted in the audit trail.</summary>
    Password,
    /// <summary>One of <see cref="OperationParameter.Choices"/>.</summary>
    Choice,
    /// <summary>A database name on the target server, for a picker.</summary>
    Database,
    /// <summary>A login name on the target server, for a picker.</summary>
    Login,
}

/// <summary>One parameter an operation's template expects, described for validation and for the
/// frontend's generic <c>ParamForm</c> to render the right input.</summary>
public sealed record OperationParameter
{
    public required string Name { get; init; }
    public required OperationParameterType Type { get; init; }
    public bool Required { get; init; } = true;
    public string? Default { get; init; }
    public IReadOnlyList<string>? Choices { get; init; }
}
