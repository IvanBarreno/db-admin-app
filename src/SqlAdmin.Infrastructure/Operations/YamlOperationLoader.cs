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

        if (!Enum.TryParse<OperationScope>(dto.Scope, ignoreCase: true, out var scope))
        {
            throw new OperationYamlException(file,
                $"operation '{dto.Id}': 'scope' must be one of server, database, all_databases — got '{dto.Scope}'.");
        }

        return new OperationDefinition
        {
            Id = dto.Id,
            Name = dto.Name,
            Category = dto.Category,
            Scope = scope,
            Engines = dto.Engines,
            Destructive = dto.Destructive,
            Sql = dto.Sql,
            Params = dto.Params.Select(p => MapParameter(p, file)).ToList(),
        };
    }

    private static OperationParameter MapParameter(OperationParameterYamlDto p, string file)
    {
        if (string.IsNullOrWhiteSpace(p.Name))
            throw new OperationYamlException(file, "a parameter is missing 'name'.");

        if (!Enum.TryParse<OperationParameterType>(p.Type, ignoreCase: true, out var type))
        {
            throw new OperationYamlException(file,
                $"parameter '{p.Name}': 'type' must be one of sysname, string, int, bool, password, choice, database, login — got '{p.Type}'.");
        }

        return new OperationParameter
        {
            Name = p.Name,
            Type = type,
            Required = p.Required,
            Default = p.Default,
            Choices = p.Choices,
        };
    }
}
