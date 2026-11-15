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

    [Fact]
    public void Lock_rules_that_depend_on_another_parameter_name_a_parameter_of_the_same_operation()
    {
        foreach (var op in Shipped())
            foreach (var rule in op.Params.SelectMany(p => p.LockWhen ?? []).Where(r => r.IfParam is not null))
                Assert.Contains(op.Params, p => p.Name == rule.IfParam);
    }

    [Fact]
    public void Password_reset_locks_logins_that_are_not_SQL_logins()
    {
        var login = Shipped().Single(o => o.Id == "changes.reset_password").Params.Single(p => p.Name == "login_name");

        var rule = Assert.Single(login.LockWhen!);
        Assert.Equal("type", rule.Column);
        Assert.True(rule.Not);
        Assert.Equal(["SQL_LOGIN"], rule.Values);
    }

    [Fact]
    public void Offline_databases_are_locked_in_every_database_checklist()
    {
        var lists = Shipped().SelectMany(o => o.Params.Select(p => (Op: o.Id, Param: p))).Where(x => x.Param.Source == "databases" && x.Param.Multi);

        foreach (var (op, param) in lists)
            Assert.True(param.LockWhen?.Any(r => r.Column == "state" && r.Not && r.Values.Contains("ONLINE")) == true, $"{op}.{param.Name} does not lock offline databases");
    }

    [Fact]
    public void Bulk_enable_disable_asks_for_the_action_first_and_locks_by_it()
    {
        var op = Shipped().Single(o => o.Id == "changes.set_logins_enabled");

        Assert.True(op.Params.ToList().FindIndex(p => p.Name == "action") < op.Params.ToList().FindIndex(p => p.Name == "logins"));
        var rules = op.Params.Single(p => p.Name == "logins").LockWhen!;
        Assert.Contains(rules, r => r.IfParam == "action" && r.IfValue == "ENABLE" && r.Values.Contains("false"));
        Assert.Contains(rules, r => r.IfParam == "action" && r.IfValue == "DISABLE" && r.Values.Contains("true"));
    }

    [Fact]
    public void Permission_bundles_live_in_the_database_roles_checklist_only()
    {
        var ops = Shipped();

        Assert.DoesNotContain(ops, o => o.Id == "provisioning.grant_bundle");
        Assert.Equal(["execute", "developer"], ops.Single(o => o.Id == "changes.database_roles").Params.Single(p => p.Name == "permission_bundle").Choices);
    }
}
