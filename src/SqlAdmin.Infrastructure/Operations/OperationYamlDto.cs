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
    public List<OperationParameterYamlDto> Params { get; set; } = [];
    public string Sql { get; set; } = "";
}

public sealed class OperationParameterYamlDto
{
    public string Name { get; set; } = "";
    public string Type { get; set; } = "";
    public bool Required { get; set; } = true;
    public string? Default { get; set; }
    public List<string>? Choices { get; set; }
}
