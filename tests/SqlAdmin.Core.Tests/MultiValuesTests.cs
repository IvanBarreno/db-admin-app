using Microsoft.Data.Sqlite;
using SqlAdmin.Core.Lookups;
using SqlAdmin.Core.Operations;
using SqlAdmin.Infrastructure.Lookups;
using SqlAdmin.Infrastructure.Operations;

namespace SqlAdmin.Core.Tests;

/// <summary>List ("multi") parameters: parsing, canonical form, binding, destructive-on-non-empty, must_exist, YAML rules, catalog lint.</summary>
public sealed class MultiValuesTests : IDisposable
{
    private readonly string _dir = Directory.CreateTempSubdirectory("sqladmin-multi-").FullName;
    private readonly SqliteConnection _db = new("Data Source=:memory:");

    public MultiValuesTests()
    {
        _db.Open();
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "CREATE TABLE roles (name TEXT); INSERT INTO roles VALUES ('db_datareader'), ('db_datawriter'), ('db_owner');";
        cmd.ExecuteNonQuery();
    }

    public void Dispose()
    {
        _db.Dispose();
        Directory.Delete(_dir, recursive: true);
    }

    private static OperationParameter List(string name = "roles", bool required = true, bool mustExist = false, string source = "roles") => new()
    {
        Name = name, Type = OperationParameterType.String, Multi = true, Required = required, MustExist = mustExist, Source = source,
    };

    private static OperationDefinition Op(params OperationParameter[] parameters) => new()
    {
        Id = "t.op", Name = "t", Category = "t", Scope = OperationScope.Server, Engines = ["sqlserver"],
        Sql = "SELECT value FROM OPENJSON(@roles);", Params = parameters,
    };

    private static IReadOnlyDictionary<string, string?> V(params (string, string?)[] pairs) => pairs.ToDictionary(p => p.Item1, p => p.Item2);

    // ---- parsing / canonical form --------------------------------------------------------

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("[]")]
    public void Blank_or_empty_array_is_an_empty_list(string? value)
    {
        Assert.Empty(MultiValues.Parse(value));
        Assert.True(MultiValues.IsEmpty(value));
    }

    [Fact]
    public void Items_are_trimmed_and_blank_ones_dropped()
    {
        Assert.Equal(["a", "b"], MultiValues.Parse("""[" a ","","b","  "]"""));
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("""{"a":1}""")]
    [InlineData("[1,2]")]
    public void Anything_but_an_array_of_strings_is_rejected(string value)
    {
        Assert.Throws<TemplateRenderException>(() => MultiValues.Parse(value));
    }

    [Fact]
    public void Too_many_or_too_long_items_are_rejected()
    {
        var many = System.Text.Json.JsonSerializer.Serialize(Enumerable.Range(0, MultiValues.MaxItems + 1).Select(i => $"i{i}"));
        Assert.Throws<TemplateRenderException>(() => MultiValues.Parse(many));
        Assert.Throws<TemplateRenderException>(() => MultiValues.Parse($"[\"{new string('x', MultiValues.MaxItemLength + 1)}\"]"));
    }

    [Fact]
    public void Canonical_form_is_distinct_and_sorted_so_equal_selections_give_equal_text()
    {
        Assert.Equal("""["a","b","c"]""", MultiValues.Canonical(["c", "a", "b", "a"]));
        Assert.Equal(MultiValues.Canonical(MultiValues.Parse("""["b","a"]""")), MultiValues.Canonical(MultiValues.Parse("""["a","b"]""")));
    }

    [Fact]
    public void Normalize_canonicalises_list_parameters_only_and_turns_blank_into_an_empty_array()
    {
        var op = Op(List("roles"), new OperationParameter { Name = "other", Type = OperationParameterType.String });

        var result = MultiValues.Normalize(op.Params, V(("roles", """["b","a"]"""), ("other", "keep  me")));
        var blank = MultiValues.Normalize(op.Params, V(("other", "x")));

        Assert.Equal("""["a","b"]""", result["roles"]);
        Assert.Equal("keep  me", result["other"]);
        Assert.Equal("[]", blank["roles"]);
    }

    // ---- renderer ------------------------------------------------------------------------

    [Fact]
    public void A_list_is_bound_as_one_canonical_json_parameter()
    {
        var rendered = TemplateRenderer.Render(Op(List()), V(("roles", """["b","a"]""")), new TestDialect());

        Assert.Equal("""["a","b"]""", rendered.Parameters.Single(p => p.Name == "@roles").Value);
    }

    [Fact]
    public void A_required_list_must_have_an_item()
    {
        var ex = Assert.Throws<TemplateRenderException>(() => TemplateRenderer.Render(Op(List()), V(("roles", "[]")), new TestDialect()));
        Assert.Contains("at least one", ex.Message);
    }

    [Fact]
    public void An_optional_list_may_be_empty_and_is_still_bound()
    {
        var rendered = TemplateRenderer.Render(Op(List(required: false)), V(), new TestDialect());

        Assert.Equal("[]", rendered.Parameters.Single(p => p.Name == "@roles").Value);
    }

    // ---- destructive when not empty -------------------------------------------------------

    [Theory]
    [InlineData("""["db_owner"]""", true)]
    [InlineData("[]", false)]
    [InlineData("", false)]
    public void Destructive_when_not_empty_only_triggers_with_items(string drops, bool expected)
    {
        var op = Op(List("roles_to_drop", required: false)) with
        {
            DestructiveWhen = new DestructiveCondition("roles_to_drop", [], NotEmpty: true),
        };

        Assert.Equal(expected, op.RequiresConfirmation(V(("roles_to_drop", drops))));
    }

    // ---- must_exist ----------------------------------------------------------------------

    private Task Validate(string rolesJson)
    {
        File.WriteAllText(Path.Combine(_dir, "l.yaml"), """
            lookups:
              - id: roles
                name: "Roles"
                scope: server
                engines: [sqlserver]
                sql: |
                  SELECT name AS value FROM roles ORDER BY name;
            """);
        return MustExistValidator.ValidateAsync(
            Op(List(mustExist: true)), V(("roles", rolesJson)), "SRV", null,
            new LookupRegistry(_dir), new SharedSqliteFactory(_db), CancellationToken.None);
    }

    [Fact]
    public async Task Every_listed_item_must_exist_ignoring_case()
    {
        await Validate("""["DB_DATAREADER","db_owner"]""");
    }

    [Fact]
    public async Task Missing_items_are_all_named_in_the_message()
    {
        var ex = await Assert.ThrowsAsync<TemplateRenderException>(() => Validate("""["db_owner","nope1","nope2"]"""));

        Assert.Contains("'nope1'", ex.Message);
        Assert.Contains("'nope2'", ex.Message);
        Assert.DoesNotContain("db_owner", ex.Message);
    }

    [Fact]
    public async Task The_none_sentinel_means_nothing_is_selected_and_is_rejected_clearly()
    {
        var ex = await Assert.ThrowsAsync<TemplateRenderException>(() => Validate($"[\"{MultiValues.NoneSentinel}\"]"));

        Assert.Contains("Nothing is selected", ex.Message);
    }

    // ---- YAML rules ----------------------------------------------------------------------

    private OperationYamlException LoadError(string paramYaml, string extraOperationYaml = "")
    {
        File.WriteAllText(Path.Combine(_dir, "o.yaml"), $"""
            operations:
              - id: t.bad
                name: "t"
                category: t
                scope: server
                engines: [sqlserver]
            {extraOperationYaml}
                params:
                  - name: roles
                    type: string
            {paramYaml}
                sql: |
                  SELECT 1;
            """);
        return Assert.Throws<OperationYamlException>(() => YamlOperationLoader.LoadFromDirectory(_dir));
    }

    [Fact]
    public void Multi_needs_a_source()
    {
        Assert.Contains("source", LoadError("        multi: true").Message);
    }

    [Fact]
    public void Typed_list_is_a_multi_parameter_without_a_source()
    {
        // The one list that needs no lookup: names the DBA types (logins to create).
        File.WriteAllText(Path.Combine(_dir, "o.yaml"), """
            operations:
              - id: t.typed
                name: "t"
                category: t
                scope: server
                engines: [sqlserver]
                params:
                  - name: names
                    type: string
                    multi: true
                    typed_list: true
                sql: |
                  SELECT value FROM OPENJSON(@names);
            """);

        var param = YamlOperationLoader.LoadFromDirectory(_dir).Single().Params.Single();

        Assert.True(param.Multi);
        Assert.Null(param.EffectiveSource);
    }

    [Theory]
    [InlineData("        typed_list: true")]                                  // not a list
    [InlineData("        multi: true\n        typed_list: true\n        source: logins")] // a lookup list is ticked, not typed
    public void Typed_list_only_applies_to_a_multi_parameter_without_a_source(string paramYaml)
    {
        Assert.Contains("typed_list", LoadError(paramYaml).Message);
    }

    [Fact]
    public void Default_all_only_applies_to_multi()
    {
        Assert.Contains("multi", LoadError("        source: x\n        default_all: true").Message);
    }

    [Fact]
    public void Checklist_group_and_action_go_together_and_action_is_add_or_drop()
    {
        Assert.Contains("go together", LoadError("        source: x\n        multi: true\n        checklist_group: roles").Message);
        Assert.Contains("add or drop", LoadError("        source: x\n        multi: true\n        checklist_group: roles\n        checklist_action: remove").Message);
    }

    [Fact]
    public void Not_empty_destructive_condition_needs_a_multi_parameter()
    {
        var ex = LoadError("        source: x", "    destructive_when: { param: roles, not_empty: true }");

        Assert.Contains("destructive_when", ex.Message);
    }

    // ---- executor: "databases" list -------------------------------------------------------

    [Fact]
    public void Selected_databases_parameter_name_is_the_documented_one()
    {
        Assert.Equal("databases", AllDatabasesExecutor.SelectedDatabasesParameter);
    }

    // ---- shipped catalog lint --------------------------------------------------------------

    private static IReadOnlyList<OperationDefinition> Shipped() => new OperationRegistry(OperationRegistryTests.ShippedOperationsDir()).All;

    [Fact]
    public void Every_checklist_group_has_exactly_one_add_and_one_drop_on_the_same_source()
    {
        foreach (var op in Shipped())
        {
            foreach (var group in op.Params.Where(p => p.ChecklistGroup is not null).GroupBy(p => p.ChecklistGroup))
            {
                var add = Assert.Single(group, p => p.ChecklistAction == "add");
                var drop = Assert.Single(group, p => p.ChecklistAction == "drop");
                Assert.True(add.EffectiveSource == drop.EffectiveSource, $"{op.Id}: group '{group.Key}' reads two different lookups.");
                Assert.Equal(add.DependsOn ?? [], drop.DependsOn ?? []);
            }
        }
    }

    [Fact]
    public void Every_not_empty_destructive_condition_points_at_a_list_parameter()
    {
        foreach (var op in Shipped().Where(o => o.DestructiveWhen is { NotEmpty: true }))
            Assert.Contains(op.Params, p => p.Name == op.DestructiveWhen!.Param && p.Multi);
    }

    [Fact]
    public void Every_suggestion_names_an_existing_lookup_for_the_engines_of_its_operation()
    {
        var lookups = new LookupRegistry(Path.Combine(Path.GetDirectoryName(OperationRegistryTests.ShippedOperationsDir())!, "lookups"));

        foreach (var op in Shipped())
        foreach (var p in op.Params.Where(p => p.Suggest is not null))
        foreach (var engine in op.Engines)
            Assert.True(lookups.Find(p.Suggest!.Lookup, engine) is not null, $"{op.Id}.{p.Name}: no lookup '{p.Suggest!.Lookup}' for '{engine}'.");
    }

    [Fact]
    public void The_databases_list_of_an_all_databases_operation_always_uses_the_databases_lookup()
    {
        foreach (var op in Shipped().Where(o => o.Scope == OperationScope.AllDatabases))
        {
            var list = op.Params.SingleOrDefault(p => p.Name == AllDatabasesExecutor.SelectedDatabasesParameter);
            if (list is null) continue;
            Assert.True(list.Multi && list.EffectiveSource == "databases", $"{op.Id}: 'databases' must be a list fed by the databases lookup.");
        }
    }

    [Fact]
    public void Role_and_permission_operations_no_longer_use_hard_coded_choices()
    {
        var ops = Shipped().ToDictionary(o => o.Id);

        Assert.DoesNotContain(ops.Values, o => o.Params.Any(p => p.Type == OperationParameterType.Choice
            && p.Choices!.Contains("sysadmin")));
        Assert.DoesNotContain("changes.server_role_member", ops.Keys);
        Assert.DoesNotContain("changes.database_role_member", ops.Keys);
        Assert.Contains(ops["changes.server_roles"].Params, p => p.ChecklistGroup == "roles");
        Assert.Contains(ops["changes.database_roles"].Params, p => p.ChecklistGroup == "roles");
        Assert.True(ops["changes.server_permission"].Params.Single(p => p.Name == "permissions").Multi);
    }
}
