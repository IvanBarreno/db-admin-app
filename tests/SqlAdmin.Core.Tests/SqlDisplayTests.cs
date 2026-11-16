using SqlAdmin.Core.Operations;

namespace SqlAdmin.Core.Tests;

/// <summary>The display-only SQL of a plain operation: values written in place of the @placeholders.</summary>
public sealed class SqlDisplayTests
{
    private static readonly TestDialect Dialect = new();

    private static OperationDefinition Op(string sql, params OperationParameter[] parameters) => new()
    {
        Id = "t.op", Name = "t", Category = "audit", Scope = OperationScope.Server, Engines = ["sqlserver"],
        Sql = sql, Params = parameters,
    };

    private static OperationParameter P(string name, OperationParameterType type = OperationParameterType.String) =>
        new() { Name = name, Type = type, Required = false, Default = "" };

    private static IReadOnlyDictionary<string, string?> V(params (string, string?)[] pairs) =>
        pairs.ToDictionary(p => p.Item1, p => p.Item2);

    [Fact]
    public void Text_values_become_quoted_unicode_literals()
    {
        var op = Op("SELECT * FROM sys.server_principals WHERE name = @login_name;", P("login_name", OperationParameterType.Login));

        var sql = Assert.Single(SqlDisplay.Batches(op, V(("login_name", "alice")), Dialect));

        Assert.Equal("SELECT * FROM sys.server_principals WHERE name = N'alice';", sql);
    }

    [Fact]
    public void Quotes_inside_a_value_are_doubled_so_the_text_stays_one_literal()
    {
        var op = Op("SELECT @login_name;", P("login_name"));

        var sql = Assert.Single(SqlDisplay.Batches(op, V(("login_name", "o'brien'; DROP LOGIN sa;--")), Dialect));

        Assert.Equal("SELECT N'o''brien''; DROP LOGIN sa;--';", sql);
    }

    [Fact]
    public void Numbers_and_booleans_are_written_bare()
    {
        var op = Op("SELECT TOP (@max_rows) 1 WHERE @unlock = 1;",
            new OperationParameter { Name = "max_rows", Type = OperationParameterType.Int },
            new OperationParameter { Name = "unlock", Type = OperationParameterType.Bool });

        var sql = Assert.Single(SqlDisplay.Batches(op, V(("max_rows", "25"), ("unlock", "true")), Dialect));

        Assert.Equal("SELECT TOP (25) 1 WHERE 1 = 1;", sql);
    }

    [Fact]
    public void A_parameter_name_is_not_replaced_inside_a_longer_name_or_a_global()
    {
        var op = Op("SELECT @login, @login_name, @@SPID, @login2;", P("login"), P("login_name"));

        var sql = Assert.Single(SqlDisplay.Batches(op, V(("login", "A"), ("login_name", "B")), Dialect));

        Assert.Equal("SELECT N'A', N'B', @@SPID, @login2;", sql);
    }

    [Fact]
    public void Passwords_are_always_masked()
    {
        var op = Op("SELECT @password;", P("password", OperationParameterType.Password));

        var sql = Assert.Single(SqlDisplay.Batches(op, V(("password", "S3cret!")), Dialect));

        Assert.Equal("SELECT N'***';", sql);
        Assert.DoesNotContain("S3cret!", sql);
    }

    [Fact]
    public void Dollar_signs_in_a_value_are_kept_literally()
    {
        // "$1" would be a group reference if the value were used as a regex replacement pattern.
        var op = Op("SELECT @search_text;", P("search_text"));

        var sql = Assert.Single(SqlDisplay.Batches(op, V(("search_text", "cost $1 $&")), Dialect));

        Assert.Equal("SELECT N'cost $1 $&';", sql);
    }

    [Fact]
    public void Blank_optional_values_show_their_default_and_batches_are_split_on_go()
    {
        var op = Op("SELECT @a;\nGO\nSELECT @b;", P("a"), new OperationParameter { Name = "b", Type = OperationParameterType.String, Required = false, Default = "fallback" });

        var batches = SqlDisplay.Batches(op, V(("a", "")), Dialect);

        Assert.Equal(["SELECT N'';", "SELECT N'fallback';"], batches);
    }
}
