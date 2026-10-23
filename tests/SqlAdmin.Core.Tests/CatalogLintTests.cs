using SqlAdmin.Core.Operations;
using SqlAdmin.Infrastructure.Operations;

namespace SqlAdmin.Core.Tests;

/// <summary>Lint over the shipped catalog for round 3: help text lives in the YAML (and glossary), and safe defaults.</summary>
public sealed class CatalogLintTests
{
    private static IReadOnlyList<OperationDefinition> Shipped() =>
        YamlOperationLoader.LoadFromDirectory(OperationRegistryTests.ShippedOperationsDir());

    [Fact]
    public void Every_operation_has_a_description()
    {
        var missing = Shipped().Where(o => string.IsNullOrWhiteSpace(o.Description)).Select(o => o.Id).ToList();

        Assert.True(missing.Count == 0, "No description (add to operations/glossary.yaml): " + string.Join(", ", missing));
    }

    [Fact]
    public void Every_visible_parameter_has_help()
    {
        var missing = Shipped()
            .SelectMany(o => o.Params.Select(p => (Op: o.Id, Param: p)))
            .Where(x => string.IsNullOrWhiteSpace(x.Param.Help))
            .Select(x => $"{x.Op}.{x.Param.Name}")
            .ToList();

        Assert.True(missing.Count == 0, "No help (add to glossary parameters): " + string.Join(", ", missing));
    }

    [Fact]
    public void Every_choice_has_help()
    {
        var missing = Shipped()
            .SelectMany(o => o.Params.Where(p => p.Choices is { Count: > 0 }).Select(p => (Op: o.Id, Param: p)))
            .SelectMany(x => x.Param.Choices!
                .Where(c => string.IsNullOrWhiteSpace(x.Param.ChoiceHelp?.GetValueOrDefault(c)))
                .Select(c => $"{x.Op}.{x.Param.Name}={c}"))
            .ToList();

        Assert.True(missing.Count == 0, "No choice help (add to glossary choices): " + string.Join(", ", missing));
    }

    [Fact]
    public void Stop_on_error_defaults_to_true_everywhere()
    {
        var wrong = Shipped()
            .SelectMany(o => o.Params.Where(p => p.Name == "stop_on_error").Select(p => (Op: o.Id, Param: p)))
            .Where(x => x.Param.Default != "true")
            .Select(x => x.Op)
            .ToList();

        Assert.True(wrong.Count == 0, "stop_on_error default is not \"true\": " + string.Join(", ", wrong));
    }

    [Fact]
    public void Prefix_lookups_point_at_an_existing_lookup()
    {
        var lookupsDir = Path.Combine(Path.GetDirectoryName(OperationRegistryTests.ShippedOperationsDir())!, "lookups");
        var text = string.Concat(Directory.GetFiles(lookupsDir, "*.yaml").Select(File.ReadAllText));

        foreach (var p in Shipped().SelectMany(o => o.Params).Where(p => p.PrefixLookup is not null))
            Assert.Contains($"id: {p.PrefixLookup}", text);
    }
}
