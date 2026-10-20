using SqlAdmin.Core.Operations;
using SqlAdmin.Infrastructure.Operations;

namespace SqlAdmin.Core.Tests;

/// <summary>YAML loader + registry: error messages for bad files, and sanity checks on the shipped catalog.</summary>
public sealed class OperationRegistryTests : IDisposable
{
    private readonly string _dir = Directory.CreateTempSubdirectory("sqladmin-ops-").FullName;

    public void Dispose() => Directory.Delete(_dir, recursive: true);

    private void Write(string fileName, string yaml) => File.WriteAllText(Path.Combine(_dir, fileName), yaml);

    private static string OpYaml(string id = "t.one", string scope = "server", string engines = "[sqlserver]", string extra = "") => $"""
        operations:
          - id: {id}
            name: "Test {id}"
            category: test
            scope: {scope}
            engines: {engines}
            {extra}
            sql: |
              SELECT 1;
        """;

    // ---- loader ------------------------------------------------------------------------

    [Fact]
    public void Missing_directory_loads_nothing()
    {
        Assert.Empty(YamlOperationLoader.LoadFromDirectory(Path.Combine(_dir, "nope")));
    }

    [Theory]
    [InlineData("server", OperationScope.Server)]
    [InlineData("database", OperationScope.Database)]
    [InlineData("all_databases", OperationScope.AllDatabases)]
    public void Scope_maps_to_enum(string yamlScope, OperationScope expected)
    {
        Write("a.yaml", OpYaml(scope: yamlScope));

        var op = Assert.Single(YamlOperationLoader.LoadFromDirectory(_dir));

        Assert.Equal(expected, op.Scope);
    }

    [Fact]
    public void Unknown_scope_is_rejected_with_the_operation_id()
    {
        Write("a.yaml", OpYaml(scope: "galaxy"));

        var ex = Assert.Throws<OperationYamlException>(() => YamlOperationLoader.LoadFromDirectory(_dir));

        Assert.Contains("t.one", ex.Message);
        Assert.Contains("galaxy", ex.Message);
    }

    [Fact]
    public void Unknown_parameter_type_is_rejected()
    {
        Write("a.yaml", OpYaml(extra: "params:\n      - name: x\n        type: banana"));

        var ex = Assert.Throws<OperationYamlException>(() => YamlOperationLoader.LoadFromDirectory(_dir));

        Assert.Contains("banana", ex.Message);
    }

    [Fact]
    public void Empty_engine_list_is_rejected()
    {
        Write("a.yaml", OpYaml(engines: "[]"));

        Assert.Throws<OperationYamlException>(() => YamlOperationLoader.LoadFromDirectory(_dir));
    }

    [Fact]
    public void Malformed_yaml_names_the_file()
    {
        Write("broken.yaml", "operations: [unclosed");

        var ex = Assert.Throws<OperationYamlException>(() => YamlOperationLoader.LoadFromDirectory(_dir));

        Assert.Contains("broken.yaml", ex.Message);
    }

    [Fact]
    public void Operations_load_from_subfolders_in_deterministic_order()
    {
        Directory.CreateDirectory(Path.Combine(_dir, "sub"));
        Write("b.yaml", OpYaml(id: "t.b"));
        File.WriteAllText(Path.Combine(_dir, "sub", "a.yaml"), OpYaml(id: "t.a"));

        var ids = YamlOperationLoader.LoadFromDirectory(_dir).Select(o => o.Id);

        // Ordinal path order: ".../b.yaml" sorts before ".../sub/a.yaml".
        Assert.Equal(["t.b", "t.a"], ids);
    }

    // ---- registry ----------------------------------------------------------------------

    [Fact]
    public void Duplicate_ids_across_files_fail_fast()
    {
        Write("a.yaml", OpYaml(id: "t.dup"));
        Write("b.yaml", OpYaml(id: "t.dup"));

        var ex = Assert.Throws<InvalidOperationException>(() => new OperationRegistry(_dir));

        Assert.Contains("t.dup", ex.Message);
    }

    [Fact]
    public void ForEngine_hides_operations_that_do_not_list_the_engine()
    {
        Write("a.yaml", OpYaml(id: "t.both", engines: "[sqlserver, azuresql]") + "\n" +
                        OpYaml(id: "t.onprem", engines: "[sqlserver]").Replace("operations:\n", ""));

        var registry = new OperationRegistry(_dir);

        Assert.Equal(["t.both", "t.onprem"], registry.ForEngine("sqlserver").Select(o => o.Id).Order());
        Assert.Equal(["t.both"], registry.ForEngine("azuresql").Select(o => o.Id));
    }

    [Fact]
    public void Find_returns_null_for_unknown_id()
    {
        Write("a.yaml", OpYaml());

        var registry = new OperationRegistry(_dir);

        Assert.NotNull(registry.Find("t.one"));
        Assert.Null(registry.Find("nope"));
    }

    // ---- the real catalog --------------------------------------------------------------

    internal static string ShippedOperationsDir()
    {
        // Walk up from the test binary to the repo root, then into the API's operations folder.
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, "src", "SqlAdmin.Api", "operations");
            if (Directory.Exists(candidate)) return candidate;
        }
        throw new DirectoryNotFoundException("src/SqlAdmin.Api/operations not found above the test binary.");
    }

    [Fact]
    public void Every_shipped_parameter_is_used_in_its_sql_and_choices_are_declared()
    {
        // Catches YAML typos: a param renamed in one place only, or a Choice with no choices.
        foreach (var op in new OperationRegistry(ShippedOperationsDir()).All)
        {
            foreach (var p in op.Params)
            {
                // The "databases" list of an all_databases operation is read by the executor, not by the SQL.
                var consumedByExecutor = op.Scope == OperationScope.AllDatabases
                                         && p.Name == AllDatabasesExecutor.SelectedDatabasesParameter && p.Multi;
                var used = consumedByExecutor
                           || op.Sql.Contains($"@{p.Name}", StringComparison.Ordinal)
                           || op.Sql.Contains($"{{{{ident:{p.Name}}}}}", StringComparison.Ordinal);
                Assert.True(used, $"{op.Id}: parameter '{p.Name}' is never used in the SQL.");

                if (p.Type == OperationParameterType.Choice)
                    Assert.True(p.Choices is { Count: > 0 }, $"{op.Id}: choice parameter '{p.Name}' has no choices.");
            }
        }
    }

    [Fact]
    public void Shipped_catalog_has_provisioning_and_changes_operations()
    {
        var registry = new OperationRegistry(ShippedOperationsDir());

        Assert.Equal(OperationScope.AllDatabases, registry.Find("provisioning.user_all_databases")!.Scope);
        Assert.Contains(registry.All, o => o.Category == "provisioning");
        Assert.Contains(registry.All, o => o.Category == "changes");
        // Login-level operations must never be offered for Azure SQL.
        Assert.DoesNotContain(registry.ForEngine("azuresql"), o => o.Category is "provisioning" or "changes");
    }

    [Fact]
    public void Shipped_catalog_loads_with_unique_ids_and_no_agent_ops_for_azuresql()
    {
        var registry = new OperationRegistry(ShippedOperationsDir());

        Assert.NotEmpty(registry.All);
        Assert.Equal(registry.All.Count, registry.All.Select(o => o.Id).Distinct().Count());

        // Spot-check the all_databases pipeline op and an engine-restricted one.
        Assert.Equal(OperationScope.AllDatabases, registry.Find("audit.database_roles_all")!.Scope);
        Assert.DoesNotContain(registry.ForEngine("azuresql"), o => o.Id == "audit.orphaned_users");
        Assert.Contains(registry.ForEngine("sqlserver"), o => o.Id == "audit.orphaned_users");
    }
}
