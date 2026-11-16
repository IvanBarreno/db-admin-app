using System.Text.RegularExpressions;
using SqlAdmin.Core.Execution;
using SqlAdmin.Core.Operations;
using SqlAdmin.Infrastructure.Operations;

namespace SqlAdmin.Core.Tests;

/// <summary>Dry run: the <c>{{exec:@sql}}</c> macro, password masking, statement extraction, and a safety lint over the shipped catalog.</summary>
public sealed class DryRunTests
{
    private static OperationDefinition Op(string sql, params OperationParameter[] parameters) => new()
    {
        Id = "t.op", Name = "t", Category = "t", Scope = OperationScope.Server, Engines = ["sqlserver"],
        Sql = sql, Params = parameters,
    };

    private static IReadOnlyDictionary<string, string?> V(params (string, string?)[] pairs) =>
        pairs.ToDictionary(p => p.Item1, p => p.Item2);

    private static readonly TestDialect Dialect = new();

    // ---- macro -------------------------------------------------------------------------

    [Fact]
    public void Exec_macro_expands_to_a_branch_on_dry_run()
    {
        var op = Op("DECLARE @sql nvarchar(max) = N'X';\n{{exec:@sql}};");

        var rendered = TemplateRenderer.Render(op, V(), Dialect);

        Assert.Contains("IF @dry_run = 1 SELECT", rendered.Sql);
        Assert.Contains("AS statement ELSE EXEC (@sql);", rendered.Sql);
        Assert.DoesNotContain("{{exec", rendered.Sql);
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(true, true)]
    public void Dry_run_flag_is_bound_as_a_parameter(bool dryRun, bool expected)
    {
        var rendered = TemplateRenderer.Render(Op("{{exec:@sql}};"), V(), Dialect, dryRun);

        Assert.Equal(expected, rendered.Parameters.Single(p => p.Name == "@dry_run").Value);
    }

    [Fact]
    public void Scripts_without_the_macro_or_dry_run_reference_get_no_extra_parameter()
    {
        var rendered = TemplateRenderer.Render(Op("SELECT 1;"), V(), Dialect, dryRun: true);

        Assert.DoesNotContain(rendered.Parameters, p => p.Name == "@dry_run");
    }

    [Fact]
    public void Scripts_can_branch_on_dry_run_directly()
    {
        var rendered = TemplateRenderer.Render(Op("IF @dry_run = 0 SELECT 1;"), V(), Dialect);

        Assert.Equal(false, rendered.Parameters.Single(p => p.Name == "@dry_run").Value);
    }

    [Fact]
    public void SupportsDryRun_follows_the_macro()
    {
        Assert.True(Op("{{exec:@sql}};").SupportsDryRun);
        Assert.False(Op("SELECT 1;").SupportsDryRun);
    }

    [Fact]
    public void Dry_run_masks_every_password_value_so_it_cannot_reach_the_preview()
    {
        var op = Op("{{exec:@sql}};", new OperationParameter { Name = "pw", Type = OperationParameterType.Password });

        var dry = TemplateRenderer.Render(op, V(("pw", "S3cret!")), Dialect, dryRun: true);
        var real = TemplateRenderer.Render(op, V(("pw", "S3cret!")), Dialect, dryRun: false);

        Assert.Equal(TemplateRenderer.DryRunPasswordMask, dry.Parameters.Single(p => p.Name == "@pw").Value);
        Assert.Equal("S3cret!", real.Parameters.Single(p => p.Name == "@pw").Value);
    }

    [Fact]
    public void Blank_password_is_masked_too_so_the_statement_is_not_empty_in_the_preview()
    {
        var op = Op("{{exec:@sql}};", new OperationParameter { Name = "pw", Type = OperationParameterType.Password, Required = false });

        var dry = TemplateRenderer.Render(op, V(("pw", "")), Dialect, dryRun: true);

        Assert.Equal(TemplateRenderer.DryRunPasswordMask, dry.Parameters.Single(p => p.Name == "@pw").Value);
    }

    // ---- extraction --------------------------------------------------------------------

    private static ScriptResult Script(params ResultSet[] sets) => new(sets, [], false, null, null);

    [Fact]
    public void Only_result_sets_with_a_statement_column_are_statements_and_trailing_newlines_are_trimmed()
    {
        var script = Script(
            new ResultSet(0, ["statement"], [["KILL 5;\nKILL 6;\n"]]),
            new ResultSet(1, ["sessions_remaining"], [[2]]));

        var result = DryRunRunner.Extract(script, null);

        Assert.Equal("KILL 5;\nKILL 6;", Assert.Single(result.Statements).Text);
        Assert.Null(result.Error);
    }

    [Fact]
    public void All_databases_rows_keep_their_database_name()
    {
        var script = Script(new ResultSet(0, ["database_name", "statement"], [["a", "DROP USER [x];"], ["b", "-- no matching user"]]));

        var result = DryRunRunner.Extract(script, null);

        Assert.Equal([("a", "DROP USER [x];"), ("b", "-- no matching user")], result.Statements.Select(s => (s.Database, s.Text)));
    }

    [Fact]
    public void A_failed_script_reports_its_error()
    {
        var script = new ScriptResult([], [], true, 0, "A login with this name already exists.");

        Assert.Equal("A login with this name already exists.", DryRunRunner.Extract(script, null).Error);
    }

    [Fact]
    public void A_per_database_failure_is_reported_even_without_a_script_level_error()
    {
        var script = new ScriptResult([], [], true, null, null);

        var result = DryRunRunner.Extract(script, [new DatabaseStep("a", "ERROR", 0, "denied")]);

        Assert.Equal("denied", result.Error);
    }

    // ---- safety lint over the shipped catalog -------------------------------------------

    private static string OperationsDir()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, "src", "SqlAdmin.Api", "operations");
            if (Directory.Exists(candidate)) return candidate;
        }

        throw new DirectoryNotFoundException("src/SqlAdmin.Api/operations not found above the test binary.");
    }

    private static IReadOnlyList<OperationDefinition> Shipped() => YamlOperationLoader.LoadFromDirectory(OperationsDir());

    [Fact]
    public void Every_destructive_operation_supports_dry_run_so_the_confirm_panel_can_show_real_statements()
    {
        var missing = Shipped()
            .Where(o => o.Destructive || o.DestructiveWhen is not null)
            .Where(o => !o.SupportsDryRun)
            .Select(o => o.Id)
            .ToList();

        Assert.Empty(missing);
    }

    [Fact]
    public void No_statement_can_run_outside_the_macro_in_a_dry_runnable_script()
    {
        // A dry run must change nothing. After expansion, the only EXEC allowed is the ELSE branch of the macro,
        // and no line may START with a statement that modifies the server (strings that build SQL start with "+ N'").
        // INSERT / UPDATE / DELETE aimed at a table VARIABLE (@items, @results: the loop bookkeeping of list operations)
        // change nothing on the server, so only a target that is not an @variable counts.
        var modifying = new Regex(@"^\s*(ALTER|DROP|CREATE|GRANT|REVOKE|DENY|KILL|TRUNCATE|MERGE|EXEC|EXECUTE|(INSERT|UPDATE|DELETE)(?!\s+(INTO\s+)?@))\b",
            RegexOptions.IgnoreCase | RegexOptions.Multiline);

        foreach (var op in Shipped().Where(o => o.SupportsDryRun))
        {
            var sql = TemplateRenderer.Render(op, FakeValues(op), Dialect, dryRun: true).Sql;

            var execs = Regex.Matches(sql, @"\bEXEC\s*\(").Count;
            var guardedExecs = Regex.Matches(sql, @"ELSE EXEC \(").Count;
            Assert.True(execs == guardedExecs, $"{op.Id}: an EXEC runs outside the dry-run branch.");

            // The remaining lines that start with a modifying keyword would be unguarded side effects.
            var offenders = modifying.Matches(Regex.Replace(sql, @"ELSE EXEC \([^)]*\)", "")).Select(m => m.Value.Trim()).ToList();
            Assert.True(offenders.Count == 0, $"{op.Id}: unguarded statement(s) in a dry-runnable script: {string.Join(", ", offenders)}");
        }
    }

    [Fact]
    public void Every_operation_that_executes_dynamic_sql_uses_the_macro()
    {
        var raw = Shipped().Where(o => Regex.IsMatch(o.Sql, @"\bEXEC\s*\(") && !o.SupportsDryRun).Select(o => o.Id).ToList();

        Assert.Empty(raw);
    }

    /// <summary>Plausible values for every declared parameter, so the template renders.</summary>
    private static Dictionary<string, string?> FakeValues(OperationDefinition op) =>
        op.Params.ToDictionary(p => p.Name, p => (string?)(
            p.Multi ? """["x"]""" : p.Type switch
            {
                OperationParameterType.Choice => p.Choices![0],
                OperationParameterType.Bool => "true",
                OperationParameterType.Int => "1",
                _ => "x",
            }));
}
