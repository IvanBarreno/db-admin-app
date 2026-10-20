using SqlAdmin.Core.Operations;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

namespace SqlAdmin.Infrastructure.Operations;

public sealed class OperationYamlException(string file, string message)
    : Exception($"Invalid operation file '{file}': {message}");

/// <summary>Scans a folder for <c>*.yaml</c> files and parses each into an <see cref="OperationDefinition"/>.</summary>
public static class YamlOperationLoader
{
    private static readonly IDeserializer Deserializer = new DeserializerBuilder()
        .WithNamingConvention(UnderscoredNamingConvention.Instance)
        .Build();

    public static IReadOnlyList<OperationDefinition> LoadFromDirectory(string path)
    {
        if (!Directory.Exists(path)) return [];

        return Directory.EnumerateFiles(path, "*.yaml", SearchOption.AllDirectories)
            .OrderBy(f => f, StringComparer.Ordinal) // deterministic order across machines/OSes
            .SelectMany(LoadFile)
            .ToList();
    }

    private static IReadOnlyList<OperationDefinition> LoadFile(string file)
    {
        var yaml = File.ReadAllText(file);
        OperationFileDto fileDto;
        try
        {
            fileDto = Deserializer.Deserialize<OperationFileDto>(yaml);
        }
        catch (Exception ex)
        {
            throw new OperationYamlException(file, $"could not parse YAML: {ex.Message}");
        }

        return fileDto.Operations.Select(dto => MapOperation(dto, file)).ToList();
    }

    private static OperationDefinition MapOperation(OperationYamlDto dto, string file)
    {
        if (string.IsNullOrWhiteSpace(dto.Id)) throw new OperationYamlException(file, "'id' is required.");
        if (string.IsNullOrWhiteSpace(dto.Name)) throw new OperationYamlException(file, "'name' is required.");
        if (string.IsNullOrWhiteSpace(dto.Sql)) throw new OperationYamlException(file, "'sql' is required.");
        if (dto.Engines.Count == 0) throw new OperationYamlException(file, "'engines' must list at least one engine id.");

        // YAML says "all_databases"; the enum member is AllDatabases — drop underscores before parsing.
        if (!Enum.TryParse<OperationScope>(dto.Scope?.Replace("_", ""), ignoreCase: true, out var scope))
        {
            throw new OperationYamlException(file,
                $"operation '{dto.Id}': 'scope' must be one of server, database, all_databases — got '{dto.Scope}'.");
        }

        DestructiveCondition? destructiveWhen = null;
        if (dto.DestructiveWhen is { } dw)
        {
            var target = dto.Params.FirstOrDefault(p => p.Name == dw.Param);
            if (target is null || (dw.NotEmpty ? !target.Multi : dw.Values.Count == 0))
                throw new OperationYamlException(file,
                    $"operation '{dto.Id}': 'destructive_when' needs a 'param' that exists and either a non-empty 'values' list or 'not_empty: true' on a multi parameter.");
            destructiveWhen = new DestructiveCondition(dw.Param, dw.Values, dw.NotEmpty);
        }

        return new OperationDefinition
        {
            Id = dto.Id,
            Name = dto.Name,
            Category = dto.Category,
            Scope = scope,
            Engines = dto.Engines,
            Destructive = dto.Destructive,
            SaveSnapshot = dto.SaveSnapshot,
            DestructiveWhen = destructiveWhen,
            Sql = dto.Sql,
            Params = dto.Params.Select(p => MapParameter(p, file)).ToList(),
            Checks = dto.Checks.Select(c => MapCheck(c, dto.Id, file)).ToList(),
        };
    }

    private static OperationCheck MapCheck(OperationCheckYamlDto c, string operationId, string file)
    {
        if (string.IsNullOrWhiteSpace(c.Id) || string.IsNullOrWhiteSpace(c.Message) || string.IsNullOrWhiteSpace(c.Sql))
            throw new OperationYamlException(file, $"operation '{operationId}': every check needs 'id', 'message' and 'sql'.");
        if (!Enum.TryParse<CheckSeverity>(c.Severity, ignoreCase: true, out var severity))
            throw new OperationYamlException(file, $"operation '{operationId}': check '{c.Id}' severity must be error or warning — got '{c.Severity}'.");
        return new OperationCheck(c.Id, severity, c.Message, c.Sql);
    }

    private static OperationParameter MapParameter(OperationParameterYamlDto p, string file)
    {
        if (string.IsNullOrWhiteSpace(p.Name))
            throw new OperationYamlException(file, "a parameter is missing 'name'.");

        if (!Enum.TryParse<OperationParameterType>(p.Type, ignoreCase: true, out var type))
        {
            throw new OperationYamlException(file,
                $"parameter '{p.Name}': 'type' must be one of sysname, string, int, bool, password, choice, database, login, user — got '{p.Type}'.");
        }

        if (p.Generate && type != OperationParameterType.Password)
            throw new OperationYamlException(file, $"parameter '{p.Name}': 'generate' only applies to type password.");

        var hasSource = p.Source is not null || type is OperationParameterType.Login or OperationParameterType.User or OperationParameterType.Database;
        if (p.MustExist && !hasSource)
            throw new OperationYamlException(file, $"parameter '{p.Name}': 'must_exist' needs a 'source' (or a login/user/database type).");
        if (p.DependsOn is { Count: > 0 } && !hasSource)
            throw new OperationYamlException(file, $"parameter '{p.Name}': 'depends_on' needs a 'source'.");

        if (p.Multi && !hasSource)
            throw new OperationYamlException(file, $"parameter '{p.Name}': 'multi' needs a 'source' (the lookup that lists the items).");
        if (p.DefaultAll && !p.Multi)
            throw new OperationYamlException(file, $"parameter '{p.Name}': 'default_all' only applies to 'multi' parameters.");
        if ((p.ChecklistGroup is not null) != (p.ChecklistAction is not null))
            throw new OperationYamlException(file, $"parameter '{p.Name}': 'checklist_group' and 'checklist_action' go together.");
        if (p.ChecklistAction is not null and not ("add" or "drop"))
            throw new OperationYamlException(file, $"parameter '{p.Name}': 'checklist_action' must be add or drop — got '{p.ChecklistAction}'.");
        if (p.ChecklistGroup is not null && !p.Multi)
            throw new OperationYamlException(file, $"parameter '{p.Name}': a checklist group needs 'multi: true'.");

        ParameterSuggestion? suggest = null;
        if (p.Suggest is { } s)
        {
            if (s.Lookup.Length == 0 || s.Column.Length == 0 || s.Map.Count == 0)
                throw new OperationYamlException(file, $"parameter '{p.Name}': 'suggest' needs 'lookup', 'column' and a non-empty 'map'.");
            suggest = new ParameterSuggestion(s.Lookup, s.Column, s.DependsOn, s.Map);
        }

        return new OperationParameter
        {
            Suggest = suggest,
            Multi = p.Multi,
            DefaultAll = p.DefaultAll,
            ChecklistGroup = p.ChecklistGroup,
            ChecklistAction = p.ChecklistAction,
            Source = p.Source,
            DependsOn = p.DependsOn,
            MustExist = p.MustExist,
            Generate = p.Generate,
            Name = p.Name,
            Type = type,
            Required = p.Required,
            Default = p.Default,
            Choices = p.Choices,
        };
    }
}
