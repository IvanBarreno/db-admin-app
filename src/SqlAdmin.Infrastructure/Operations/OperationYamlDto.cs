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
}

public sealed class OperationYamlDto
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Category { get; set; } = "";
    public string Scope { get; set; } = "";
    public List<string> Engines { get; set; } = [];
    public bool Destructive { get; set; }
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
