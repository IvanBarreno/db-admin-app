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

        // Pass 1: parse every file and merge the shared help text; pass 2: build the operations with it.
        var files = Directory.EnumerateFiles(path, "*.yaml", SearchOption.AllDirectories)
            .OrderBy(f => f, StringComparer.Ordinal) // deterministic order across machines/OSes
            .Select(f => (File: f, Dto: ParseFile(f)))
            .ToList();

        var glossary = MergeGlossary(files);
        return files.SelectMany(f => f.Dto.Operations.Select(dto => MapOperation(dto, f.File, glossary))).ToList();
    }

    private static OperationFileDto ParseFile(string file)
    {
        try
        {
            return Deserializer.Deserialize<OperationFileDto>(File.ReadAllText(file)) ?? new OperationFileDto();
        }
        catch (Exception ex)
        {
            throw new OperationYamlException(file, $"could not parse YAML: {ex.Message}");
        }
    }

    private static GlossaryYamlDto MergeGlossary(IEnumerable<(string File, OperationFileDto Dto)> files)
    {
        var merged = new GlossaryYamlDto();
        foreach (var (file, dto) in files.Where(f => f.Dto.Glossary is not null))
        {
            foreach (var (id, text) in dto.Glossary!.Operations) Add(merged.Operations, id, text, file);
            foreach (var (name, entry) in dto.Glossary.Parameters) Add(merged.Parameters, name, entry, file);
            foreach (var (value, text) in dto.Glossary.Choices) Add(merged.Choices, value, text, file);
        }

        return merged;

        static void Add<T>(Dictionary<string, T> target, string key, T value, string file)
        {
            if (!target.TryAdd(key, value))
                throw new OperationYamlException(file, $"glossary entry '{key}' is defined twice.");
        }
    }

    private static OperationDefinition MapOperation(OperationYamlDto dto, string file, GlossaryYamlDto glossary)
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
            Description = dto.Description ?? glossary.Operations.GetValueOrDefault(dto.Id),
            // Audits only read; anything else says so with `read_only: true` (e.g. the offboarding snapshot).
            ReadOnly = dto.ReadOnly || string.Equals(dto.Category, "audit", StringComparison.OrdinalIgnoreCase),
            SaveSnapshot = dto.SaveSnapshot,
            DestructiveWhen = destructiveWhen,
            Sql = dto.Sql,
            Params = dto.Params.Select(p => MapParameter(p, file, glossary)).ToList(),
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

    private static OperationParameter MapParameter(OperationParameterYamlDto p, string file, GlossaryYamlDto glossary)
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
        if (p.GenerateForEach is not null && type != OperationParameterType.Password)
            throw new OperationYamlException(file, $"parameter '{p.Name}': 'generate_for_each' only applies to type password.");

        var hasSource = p.Source is not null || type is OperationParameterType.Login or OperationParameterType.User or OperationParameterType.Database;
        if (p.MustExist && !hasSource)
            throw new OperationYamlException(file, $"parameter '{p.Name}': 'must_exist' needs a 'source' (or a login/user/database type).");
        if (p.DependsOn is { Count: > 0 } && !hasSource)
            throw new OperationYamlException(file, $"parameter '{p.Name}': 'depends_on' needs a 'source'.");

        if (p.Multi && !hasSource && !p.TypedList)
            throw new OperationYamlException(file, $"parameter '{p.Name}': 'multi' needs a 'source' (the lookup that lists the items), or 'typed_list: true' for a list the DBA types.");
        if (p.TypedList && (!p.Multi || hasSource))
            throw new OperationYamlException(file, $"parameter '{p.Name}': 'typed_list' is for a 'multi' parameter without a 'source'.");
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

        List<LockRule>? lockWhen = null;
        if (p.LockWhen is { Count: > 0 })
        {
            if (!hasSource)
                throw new OperationYamlException(file, $"parameter '{p.Name}': 'lock_when' needs a 'source' (it locks items of that lookup).");
            lockWhen = [];
            foreach (var r in p.LockWhen)
            {
                if (r.Column.Length == 0 || r.Reason.Length == 0 || (r.In is null) == (r.NotIn is null))
                    throw new OperationYamlException(file, $"parameter '{p.Name}': each 'lock_when' rule needs 'column', 'reason' and exactly one of 'in' / 'not_in'.");
                if ((r.IfParam is null) != (r.IfValue is null))
                    throw new OperationYamlException(file, $"parameter '{p.Name}': 'if_param' and 'if_value' go together.");
                lockWhen.Add(new LockRule(r.Column, r.In ?? r.NotIn!, r.NotIn is not null, r.Reason, r.IfParam, r.IfValue));
            }
        }

        // Help text: the parameter's own, else the shared glossary entry for its name / its choice values.
        var shared = glossary.Parameters.GetValueOrDefault(p.Name);
        Dictionary<string, string>? choiceHelp = null;
        if (type == OperationParameterType.Choice && p.Choices is { Count: > 0 })
        {
            choiceHelp = [];
            foreach (var choice in p.Choices)
            {
                var text = p.ChoiceHelp?.GetValueOrDefault(choice) ?? glossary.Choices.GetValueOrDefault(choice);
                if (text is not null) choiceHelp[choice] = text;
            }
        }

        return new OperationParameter
        {
            Label = p.Label ?? shared?.Label,
            Help = p.Help ?? shared?.Help,
            ChoiceHelp = choiceHelp,
            Protect = p.Protect,
            Advanced = p.Advanced,
            PrefixLookup = p.PrefixLookup,
            GenerateForEach = p.GenerateForEach,
            LockWhen = lockWhen,
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
