using Microsoft.Data.Sqlite;
using SqlAdmin.Core.Lookups;
using SqlAdmin.Core.Operations;
using SqlAdmin.Infrastructure.Lookups;
using SqlAdmin.Infrastructure.Operations;

namespace SqlAdmin.Core.Tests;

/// <summary>Lookups: YAML loading, running (args, extra columns, degrade), must_exist validation, shipped-catalog lint.</summary>
public sealed class LookupTests : IDisposable
{
    private readonly string _dir = Directory.CreateTempSubdirectory("sqladmin-lookups-").FullName;
    private readonly SqliteConnection _db = new("Data Source=:memory:");

    public LookupTests()
    {
        _db.Open();
        using var cmd = _db.CreateCommand();
        cmd.CommandText = """
            CREATE TABLE logins (name TEXT, disabled INTEGER);
            INSERT INTO logins VALUES ('alice', 0), ('bob', 1);
            """;
        cmd.ExecuteNonQuery();
    }

    public void Dispose()
    {
        _db.Dispose();
        Directory.Delete(_dir, recursive: true);
    }

    private void Write(string yaml) => File.WriteAllText(Path.Combine(_dir, "l.yaml"), yaml);

    private const string LoginsYaml = """
        lookups:
          - id: logins
            name: "Logins"
            scope: server
            engines: [sqlserver]
            args: [only]
            sql: |
              SELECT name AS value, name || '!' AS label, disabled AS is_disabled
              FROM logins
              WHERE @only IS NULL OR name = @only
              ORDER BY name;
        """;

    // ---- loader / registry -------------------------------------------------------------

    [Fact]
    public void Loads_lookup_and_finds_it_per_engine()
    {
        Write(LoginsYaml);
        var registry = new LookupRegistry(_dir);

        Assert.NotNull(registry.Find("logins", "sqlserver"));
        Assert.Null(registry.Find("logins", "azuresql"));
        Assert.Null(registry.Find("nope", "sqlserver"));
    }

    [Fact]
    public void Same_id_for_two_engines_is_allowed_but_not_twice_for_one_engine()
    {
        // The raw string has no trailing newline, so add one between the two copies.
        Write(LoginsYaml + "\n" + LoginsYaml.Replace("lookups:\n", "").Replace("[sqlserver]", "[azuresql]"));
        var registry = new LookupRegistry(_dir);
        Assert.NotNull(registry.Find("logins", "azuresql"));
        Assert.NotNull(registry.Find("logins", "sqlserver"));

        Write(LoginsYaml + "\n" + LoginsYaml.Replace("lookups:\n", ""));
        Assert.Throws<InvalidOperationException>(() => new LookupRegistry(_dir));
    }

    [Fact]
    public void Bad_scope_is_reported_with_the_lookup_id()
    {
        Write(LoginsYaml.Replace("scope: server", "scope: galaxy"));
        var ex = Assert.Throws<LookupYamlException>(() => new LookupRegistry(_dir));
        Assert.Contains("logins", ex.Message);
        Assert.Contains("scope", ex.Message);
    }

    // ---- runner ------------------------------------------------------------------------

    private async Task<LookupResult> RunAsync(string? only = null, string? sqlOverride = null)
    {
        Write(sqlOverride ?? LoginsYaml);
        var lookup = new LookupRegistry(_dir).Find("logins", "sqlserver")!;
        var args = new Dictionary<string, string?> { ["only"] = only };
        return await LookupRunner.RunAsync(lookup, _db, new TestEngine(), args, 30, CancellationToken.None);
    }

    [Fact]
    public async Task Value_label_and_extra_columns_are_split()
    {
        var result = await RunAsync();

        Assert.Equal(["alice", "bob"], result.Items.Select(i => i.Value));
        Assert.Equal("alice!", result.Items[0].Label);
        Assert.Equal(1L, result.Items[1].Extra["is_disabled"]);
        Assert.DoesNotContain("value", result.Items[0].Extra.Keys);
        Assert.Null(result.Warning);
    }

    [Fact]
    public async Task Missing_arg_is_bound_as_null_and_given_arg_filters()
    {
        Assert.Equal(2, (await RunAsync(only: null)).Items.Count);
        Assert.Equal(["bob"], (await RunAsync(only: "bob")).Items.Select(i => i.Value));
    }

    [Fact]
    public async Task Failing_query_degrades_to_a_warning_instead_of_throwing()
    {
        var result = await RunAsync(sqlOverride: LoginsYaml.Replace("FROM logins", "FROM no_such_table"));

        Assert.Empty(result.Items);
        Assert.Contains("Logins", result.Warning);
    }

    // ---- must_exist --------------------------------------------------------------------

    private static OperationDefinition Op(bool mustExist = true) => new()
    {
        Id = "t.op", Name = "t", Category = "t", Scope = OperationScope.Server, Engines = ["sqlserver"],
        Sql = "SELECT 1",
        Params = [new OperationParameter { Name = "login_name", Type = OperationParameterType.Login, MustExist = mustExist }],
    };

    private Task ValidateAsync(OperationDefinition op, string? value)
    {
        Write(LoginsYaml);
        return MustExistValidator.ValidateAsync(
            op, new Dictionary<string, string?> { ["login_name"] = value }, "SRV", database: null,
            new LookupRegistry(_dir), new SharedSqliteFactory(_db), CancellationToken.None);
    }

    [Fact]
    public async Task MustExist_accepts_a_listed_value_ignoring_case()
    {
        await ValidateAsync(Op(), "ALICE");
    }

    [Fact]
    public async Task MustExist_rejects_an_unknown_value_with_a_clear_message()
    {
        var ex = await Assert.ThrowsAsync<TemplateRenderException>(() => ValidateAsync(Op(), "mallory"));
        Assert.Contains("mallory", ex.Message);
        Assert.Contains("login_name", ex.Message);
    }

    [Fact]
    public async Task MustExist_skips_blank_values_and_params_without_the_flag()
    {
        await ValidateAsync(Op(), "");
        await ValidateAsync(Op(mustExist: false), "mallory");
    }

    // ---- shipped catalog lint ----------------------------------------------------------

    private static string RepoFolder(string name)
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, "src", "SqlAdmin.Api", name);
            if (Directory.Exists(candidate)) return candidate;
        }

        throw new DirectoryNotFoundException($"src/SqlAdmin.Api/{name} not found above the test binary.");
    }

    [Fact]
    public void Every_param_source_exists_for_every_engine_of_its_operation()
    {
        var lookups = new LookupRegistry(RepoFolder("lookups"));
        var operations = YamlOperationLoader.LoadFromDirectory(RepoFolder("operations"));

        foreach (var op in operations)
        foreach (var param in op.Params.Where(p => p.EffectiveSource is not null))
        foreach (var engine in op.Engines)
        {
            Assert.True(lookups.Find(param.EffectiveSource!, engine) is not null,
                $"{op.Id}.{param.Name}: no lookup '{param.EffectiveSource}' for engine '{engine}'.");
        }
    }

    [Fact]
    public void Every_depends_on_names_a_real_param_and_a_lookup_arg()
    {
        var lookups = new LookupRegistry(RepoFolder("lookups"));
        var operations = YamlOperationLoader.LoadFromDirectory(RepoFolder("operations"));

        foreach (var op in operations)
        foreach (var param in op.Params.Where(p => p.DependsOn is { Count: > 0 }))
        foreach (var dep in param.DependsOn!)
        {
            Assert.Contains(op.Params, p => p.Name == dep);
            foreach (var engine in op.Engines)
                Assert.Contains(dep, lookups.Find(param.EffectiveSource!, engine)!.Args);
        }
    }

    [Fact]
    public void Every_lookup_the_explorer_page_lists_exists_for_sql_server()
    {
        // Keep in sync with the tabs in frontend/src/pages/ExplorerPage.tsx (and the Login 360° tables).
        var registry = new LookupRegistry(RepoFolder("lookups"));
        string[] used =
        [
            "databases_detail", "logins", "sysadmins", "server_roles", "jobs", "sessions", "linked_servers",
            "users", "orphaned_users", "database_roles", "schemas", "tables", "views", "procedures", "functions",
            "login_status", "login_impact", "databases_owned",
        ];

        foreach (var id in used)
            Assert.True(registry.Find(id, "sqlserver") is not null, $"Explorer needs lookup '{id}'.");
    }

    [Fact]
    public void Shipped_lookups_load_and_cover_the_core_pickers()
    {
        var registry = new LookupRegistry(RepoFolder("lookups"));
        foreach (var id in new[] { "databases", "logins", "users", "server_roles", "database_roles", "schemas", "jobs", "sessions", "orphaned_users" })
            Assert.NotNull(registry.Find(id, "sqlserver"));

        // Azure has no Agent, DMV sessions or server roles to list.
        Assert.Null(registry.Find("jobs", "azuresql"));
        Assert.NotNull(registry.Find("users", "azuresql"));
    }

}
