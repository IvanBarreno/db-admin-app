using Microsoft.Data.Sqlite;
using SqlAdmin.Core.Operations;
using SqlAdmin.Infrastructure.Operations;

namespace SqlAdmin.Core.Tests;

/// <summary>Preflight checks: YAML loading, violated/passed/unrunnable checks, blocking rules, shipped-catalog lint.</summary>
public sealed class PreflightTests : IDisposable
{
    private readonly string _dir = Directory.CreateTempSubdirectory("sqladmin-checks-").FullName;
    private readonly SqliteConnection _db = new("Data Source=:memory:");

    public PreflightTests()
    {
        _db.Open();
        using var cmd = _db.CreateCommand();
        cmd.CommandText = "CREATE TABLE logins (name TEXT, disabled INTEGER); INSERT INTO logins VALUES ('alice', 0), ('bob', 1);";
        cmd.ExecuteNonQuery();
    }

    public void Dispose()
    {
        _db.Dispose();
        Directory.Delete(_dir, recursive: true);
    }

    private OperationDefinition Load(string checksYaml)
    {
        File.WriteAllText(Path.Combine(_dir, "o.yaml"), $"""
            operations:
              - id: t.op
                name: "t"
                category: t
                scope: server
                engines: [sqlserver]
                params:
                  - name: login_name
                    type: string
                    required: true
            {checksYaml}
                sql: |
                  SELECT 1;
            """);
        return YamlOperationLoader.LoadFromDirectory(_dir).Single();
    }

    private Task<IReadOnlyList<CheckResult>> RunAsync(OperationDefinition op, string login) =>
        PreflightRunner.RunAsync(op, new Dictionary<string, string?> { ["login_name"] = login }, "SRV", null,
            new SharedSqliteFactory(_db), CancellationToken.None);

    private const string ExistsCheck = """
            checks:
              - id: exists
                message: "Login already exists."
                sql: |
                  SELECT 1 WHERE EXISTS (SELECT 1 FROM logins WHERE name = @login_name);
        """;

    [Fact]
    public async Task Check_that_returns_a_row_is_violated_and_blocks_by_default()
    {
        var result = Assert.Single(await RunAsync(Load(ExistsCheck), "alice"));

        Assert.False(result.Ok);
        Assert.True(result.Blocking);
        Assert.Equal("Login already exists.", result.Message);
    }

    [Fact]
    public async Task Check_that_returns_no_rows_passes()
    {
        var result = Assert.Single(await RunAsync(Load(ExistsCheck), "carol"));

        Assert.True(result.Ok);
        Assert.False(result.Blocking);
    }

    [Fact]
    public async Task Warning_severity_is_reported_but_never_blocks()
    {
        var op = Load(ExistsCheck.Replace("- id: exists", "- id: exists\n        severity: warning"));

        var result = Assert.Single(await RunAsync(op, "alice"));

        Assert.False(result.Ok);
        Assert.False(result.Blocking);
        PreflightRunner.ThrowIfBlocking([result]); // must not throw
    }

    [Fact]
    public async Task A_message_column_in_the_row_replaces_the_static_message()
    {
        var op = Load("""
                checks:
                  - id: which
                    message: "static"
                    sql: |
                      SELECT 'Login ' || name || ' is disabled.' AS message FROM logins WHERE name = @login_name AND disabled = 1;
            """);

        Assert.Equal("Login bob is disabled.", Assert.Single(await RunAsync(op, "bob")).Message);
    }

    [Fact]
    public async Task Check_that_cannot_run_becomes_a_non_blocking_warning_that_says_so()
    {
        var op = Load(ExistsCheck.Replace("FROM logins", "FROM missing_table"));

        var result = Assert.Single(await RunAsync(op, "alice"));

        Assert.False(result.Ok);
        Assert.False(result.Blocking);
        Assert.Contains("Could not run check 'exists'", result.Message);
    }

    [Fact]
    public async Task Operation_without_checks_runs_nothing()
    {
        Assert.Empty(await RunAsync(Load(""), "alice"));
    }

    [Fact]
    public void ThrowIfBlocking_reports_every_blocking_message()
    {
        var failures = new[]
        {
            new CheckResult("a", CheckSeverity.Error, false, "First problem."),
            new CheckResult("b", CheckSeverity.Error, false, "Second problem."),
            new CheckResult("c", CheckSeverity.Error, true, "fine"),
        };

        var ex = Assert.Throws<PreflightFailedException>(() => PreflightRunner.ThrowIfBlocking(failures));

        Assert.Equal(2, ex.Failures.Count);
        Assert.Contains("First problem.", ex.Message);
        Assert.Contains("Second problem.", ex.Message);
    }

    [Fact]
    public void Bad_severity_or_missing_sql_is_rejected_when_loading()
    {
        Assert.Throws<OperationYamlException>(() => Load(ExistsCheck.Replace("- id: exists", "- id: exists\n        severity: panic")));
        Assert.Throws<OperationYamlException>(() => Load("""
                checks:
                  - id: x
                    message: "m"
            """));
    }

    [Fact]
    public void Shipped_checks_are_well_formed_and_only_use_declared_params()
    {
        var dir = RepoOperations();
        foreach (var op in YamlOperationLoader.LoadFromDirectory(dir).Where(o => o.Checks.Count > 0))
        {
            Assert.Equal(op.Checks.Count, op.Checks.Select(c => c.Id).Distinct().Count());
            foreach (var check in op.Checks)
            {
                // Every @name used by a check must be a parameter of the operation (@@SPID-style globals excluded).
                foreach (System.Text.RegularExpressions.Match m in System.Text.RegularExpressions.Regex.Matches(check.Sql, @"(?<!@)@([A-Za-z_]\w*)"))
                    Assert.Contains(op.Params, p => p.Name == m.Groups[1].Value);
            }
        }
    }

    [Fact]
    public void Destructive_offboarding_steps_that_reassign_ownership_carry_owner_checks()
    {
        var ops = YamlOperationLoader.LoadFromDirectory(RepoOperations()).ToDictionary(o => o.Id);

        foreach (var id in new[] { "offboarding.reassign_jobs", "offboarding.reassign_databases" })
            Assert.Contains(ops[id].Checks, c => c.Id == "owner_differs" && c.Severity == CheckSeverity.Error);
        Assert.Contains(ops["offboarding.drop_login"].Checks, c => c.Id == "not_self");
        Assert.Contains(ops["provisioning.create_sql_login"].Checks, c => c.Id == "login_exists");
    }

    private static string RepoOperations()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, "src", "SqlAdmin.Api", "operations");
            if (Directory.Exists(candidate)) return candidate;
        }

        throw new DirectoryNotFoundException("src/SqlAdmin.Api/operations not found above the test binary.");
    }
}
