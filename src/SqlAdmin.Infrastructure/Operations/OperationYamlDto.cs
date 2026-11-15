namespace SqlAdmin.Infrastructure.Operations;

// Plain DTOs matching operations/**/*.yaml 1:1 (snake_case via YamlDotNet's naming convention).
// Kept separate from SqlAdmin.Core.Operations.OperationDefinition so the domain model never
// depends on the file format — YamlOperationLoader is the only place that maps between them.
//
// Each file holds a LIST of operations under "operations:" — one file per category
// (operations/audit.yaml, operations/provisioning.yaml, ...), not one file per query.

public sealed class OperationFileDto
{
    public List<OperationYamlDto> Operations { get; set; } = [];

    /// <summary>Shared help text (see <see cref="GlossaryYamlDto"/>); any file may contribute entries.</summary>
    public GlossaryYamlDto? Glossary { get; set; }
}

/// <summary>
/// Help text written once and reused: operation descriptions by id, parameter label/help by parameter name, and what
/// each choice value means. An operation or parameter can still override any of it in its own YAML.
/// </summary>
public sealed class GlossaryYamlDto
{
    public Dictionary<string, string> Operations { get; set; } = [];
    public Dictionary<string, GlossaryParameterYamlDto> Parameters { get; set; } = [];
    public Dictionary<string, string> Choices { get; set; } = [];
}

public sealed class GlossaryParameterYamlDto
{
    public string? Label { get; set; }
    public string? Help { get; set; }
}

public sealed class OperationYamlDto
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Category { get; set; } = "";
    public string Scope { get; set; } = "";
    public List<string> Engines { get; set; } = [];
    public bool Destructive { get; set; }
    public string? Description { get; set; }

    /// <summary>Only reads (audits, the snapshot): may look at protected logins. Operations in the "audit" category are always read-only.</summary>
    public bool ReadOnly { get; set; }
    public bool SaveSnapshot { get; set; }
    public DestructiveWhenYamlDto? DestructiveWhen { get; set; }
    public List<OperationParameterYamlDto> Params { get; set; } = [];
    public List<OperationCheckYamlDto> Checks { get; set; } = [];
    public string Sql { get; set; } = "";
}

/// <summary><c>checks: - { id, severity: error|warning, message, sql }</c> — sql returns a row when violated.</summary>
public sealed class OperationCheckYamlDto
{
    public string Id { get; set; } = "";
    public string Severity { get; set; } = "error";
    public string Message { get; set; } = "";
    public string Sql { get; set; } = "";
}

public sealed class OperationParameterYamlDto
{
    public string Name { get; set; } = "";
    public string Type { get; set; } = "";
    public bool Required { get; set; } = true;
    public string? Default { get; set; }
    public List<string>? Choices { get; set; }
    public bool Generate { get; set; }
    public string? Source { get; set; }
    public List<string>? DependsOn { get; set; }
    public bool MustExist { get; set; }
    public bool Multi { get; set; }
    public bool DefaultAll { get; set; }
    public string? ChecklistGroup { get; set; }
    public string? ChecklistAction { get; set; }
    public ParameterSuggestionYamlDto? Suggest { get; set; }
    public string? Label { get; set; }
    public string? Help { get; set; }
    public Dictionary<string, string>? ChoiceHelp { get; set; }

    /// <summary><c>protect: false</c> on a login that only RECEIVES something (a new owner): a protected login is allowed there.</summary>
    public bool Protect { get; set; } = true;
    public bool Advanced { get; set; }
    public string? PrefixLookup { get; set; }
    public List<LockRuleYamlDto>? LockWhen { get; set; }
}

/// <summary><c>lock_when: [{ column: type, not_in: [SQL_LOGIN], reason: "…", if_param: action, if_value: ENABLE }]</c></summary>
public sealed class LockRuleYamlDto
{
    public string Column { get; set; } = "";
    public List<string>? In { get; set; }
    public List<string>? NotIn { get; set; }
    public string Reason { get; set; } = "";
    public string? IfParam { get; set; }
    public string? IfValue { get; set; }
}

/// <summary><c>suggest: { lookup, column, depends_on: [...], map: { "true": ENABLE } }</c></summary>
public sealed class ParameterSuggestionYamlDto
{
    public string Lookup { get; set; } = "";
    public string Column { get; set; } = "";
    public List<string> DependsOn { get; set; } = [];
    public Dictionary<string, string> Map { get; set; } = [];
}

/// <summary><c>destructive_when: { param: action, values: [DROP] }</c></summary>
public sealed class DestructiveWhenYamlDto
{
    public string Param { get; set; } = "";
    public List<string> Values { get; set; } = [];

    /// <summary><c>not_empty: true</c> — destructive when this LIST parameter has any item (instead of matching <c>values</c>).</summary>
    public bool NotEmpty { get; set; }
}
