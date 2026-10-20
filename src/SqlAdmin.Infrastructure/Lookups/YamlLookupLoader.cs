using SqlAdmin.Core.Lookups;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

namespace SqlAdmin.Infrastructure.Lookups;

// Shape of lookups/*.yaml: a list under "lookups:", same style as operations/*.yaml.
public sealed class LookupFileDto
{
    public List<LookupYamlDto> Lookups { get; set; } = [];
}

public sealed class LookupYamlDto
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Scope { get; set; } = "";
    public List<string> Engines { get; set; } = [];
    public List<string> Args { get; set; } = [];
    public string? ConnectTo { get; set; }
    public string Sql { get; set; } = "";
}

public sealed class LookupYamlException(string file, string message)
    : Exception($"Invalid lookup file '{file}': {message}");

/// <summary>Scans a folder for <c>*.yaml</c> files and parses each entry into a <see cref="LookupDefinition"/>.</summary>
public static class YamlLookupLoader
{
    private static readonly IDeserializer Deserializer = new DeserializerBuilder()
        .WithNamingConvention(UnderscoredNamingConvention.Instance)
        .Build();

    public static IReadOnlyList<LookupDefinition> LoadFromDirectory(string path)
    {
        if (!Directory.Exists(path)) return [];

        return Directory.EnumerateFiles(path, "*.yaml", SearchOption.AllDirectories)
            .OrderBy(f => f, StringComparer.Ordinal)
            .SelectMany(LoadFile)
            .ToList();
    }

    private static IReadOnlyList<LookupDefinition> LoadFile(string file)
    {
        LookupFileDto dto;
        try
        {
            dto = Deserializer.Deserialize<LookupFileDto>(File.ReadAllText(file));
        }
        catch (Exception ex)
        {
            throw new LookupYamlException(file, $"could not parse YAML: {ex.Message}");
        }

        return dto.Lookups.Select(l => Map(l, file)).ToList();
    }

    private static LookupDefinition Map(LookupYamlDto dto, string file)
    {
        if (string.IsNullOrWhiteSpace(dto.Id)) throw new LookupYamlException(file, "'id' is required.");
        if (string.IsNullOrWhiteSpace(dto.Name)) throw new LookupYamlException(file, $"lookup '{dto.Id}': 'name' is required.");
        if (string.IsNullOrWhiteSpace(dto.Sql)) throw new LookupYamlException(file, $"lookup '{dto.Id}': 'sql' is required.");
        if (dto.Engines.Count == 0) throw new LookupYamlException(file, $"lookup '{dto.Id}': 'engines' must list at least one engine id.");

        if (!Enum.TryParse<LookupScope>(dto.Scope, ignoreCase: true, out var scope))
            throw new LookupYamlException(file, $"lookup '{dto.Id}': 'scope' must be server or database — got '{dto.Scope}'.");

        return new LookupDefinition
        {
            Id = dto.Id,
            Name = dto.Name,
            Scope = scope,
            Engines = dto.Engines,
            Args = dto.Args,
            ConnectTo = dto.ConnectTo,
            Sql = dto.Sql,
        };
    }
}
