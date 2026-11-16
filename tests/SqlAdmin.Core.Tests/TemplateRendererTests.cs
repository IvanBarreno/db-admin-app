using SqlAdmin.Core.Engines;
using SqlAdmin.Core.Operations;

namespace SqlAdmin.Core.Tests;

public class TemplateRendererTests
{
    /// <summary>Tiny T-SQL-like dialect so Core.Tests needs no reference to the SqlServer engine project.</summary>
    private sealed class FakeDialect : ISqlDialect
    {
        public string QuoteIdentifier(string identifier) => $"[{identifier.Replace("]", "]]")}]";
        public string ParameterPrefix => "@";
        public string? BatchSeparator => "GO";
    }

    private static OperationDefinition Op(string sql, params OperationParameter[] ps) => new()
    {
        Id = "test.op",
        Name = "Test",
        Category = "test",
        Scope = OperationScope.Server,
        Engines = ["sqlserver"],
        Params = ps,
        Sql = sql,
    };

    private static OperationParameter P(string name, OperationParameterType type, bool required = true) =>
        new() { Name = name, Type = type, Required = required };

    private static Dictionary<string, string?> V(params (string, string?)[] pairs) =>
        pairs.ToDictionary(p => p.Item1, p => p.Item2);

    [Fact]
    public void Value_placeholder_becomes_bound_parameter_and_sql_is_unchanged()
    {
        var op = Op("SELECT * FROM t WHERE n = @login_name;", P("login_name", OperationParameterType.Login));

        var result = TemplateRenderer.Render(op, V(("login_name", "bob'; DROP TABLE t;--")), new FakeDialect());

        Assert.Equal(op.Sql, result.Sql);
        var bound = Assert.Single(result.Parameters);
        Assert.Equal("@login_name", bound.Name);
        Assert.Equal("bob'; DROP TABLE t;--", bound.Value); // injection text stays a VALUE, never SQL
    }

    [Fact]
    public void Ident_placeholder_is_quoted_and_not_bound()
    {
        var op = Op("USE {{ident:db}};", P("db", OperationParameterType.Database));

        var result = TemplateRenderer.Render(op, V(("db", "Sales")), new FakeDialect());

        Assert.Equal("USE [Sales];", result.Sql);
        Assert.Empty(result.Parameters);
    }

    [Theory]
    [InlineData("a]; DROP DATABASE x;--")]
    [InlineData("has space")]
    [InlineData("1starts_with_digit")]
    public void Ident_placeholder_rejects_values_outside_allow_list(string value)
    {
        var op = Op("USE {{ident:db}};", P("db", OperationParameterType.Database));

        Assert.Throws<TemplateRenderException>(() => TemplateRenderer.Render(op, V(("db", value)), new FakeDialect()));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Missing_required_parameter_throws(string? value)
    {
        var op = Op("SELECT @x;", P("x", OperationParameterType.String));

        var ex = Assert.Throws<TemplateRenderException>(() => TemplateRenderer.Render(op, V(("x", value)), new FakeDialect()));
        Assert.Contains("'x'", ex.Message);
    }

    [Fact]
    public void Optional_parameter_may_be_omitted()
    {
        var op = Op("SELECT @x;", P("x", OperationParameterType.String, required: false));

        var result = TemplateRenderer.Render(op, V(), new FakeDialect());

        Assert.Empty(result.Parameters);
    }

    [Theory]
    [InlineData("n", "abc", "whole number")]
    [InlineData("n", "1.5", "whole number")]
    [InlineData("b", "maybe", "true or false")]
    public void Value_that_is_not_a_number_or_a_bool_is_rejected_naming_the_parameter(string name, string value, string expected)
    {
        var op = Op("SELECT @n, @b;", P("n", OperationParameterType.Int, required: false), P("b", OperationParameterType.Bool, required: false));

        var ex = Assert.Throws<TemplateRenderException>(() => TemplateRenderer.Render(op, V((name, value)), new FakeDialect()));

        Assert.Contains($"'{name}'", ex.Message);
        Assert.Contains(expected, ex.Message);
    }

    [Fact]
    public void Int_and_bool_values_are_converted()
    {
        var op = Op("SELECT @n, @b;", P("n", OperationParameterType.Int), P("b", OperationParameterType.Bool));

        var result = TemplateRenderer.Render(op, V(("n", "42"), ("b", "true")), new FakeDialect());

        Assert.Equal(42, result.Parameters.Single(p => p.Name == "@n").Value);
        Assert.Equal(true, result.Parameters.Single(p => p.Name == "@b").Value);
    }

    [Fact]
    public void Blank_optional_parameter_falls_back_to_its_default_and_is_bound()
    {
        var op = Op("SELECT @flag, @schema;",
            new OperationParameter { Name = "flag", Type = OperationParameterType.Bool, Required = false, Default = "true" },
            new OperationParameter { Name = "schema", Type = OperationParameterType.String, Required = false, Default = "dbo" });

        var result = TemplateRenderer.Render(op, V(("flag", "")), new FakeDialect());

        Assert.Equal(true, result.Parameters.Single(p => p.Name == "@flag").Value);
        Assert.Equal("dbo", result.Parameters.Single(p => p.Name == "@schema").Value);
    }

    [Fact]
    public void Supplied_value_wins_over_default()
    {
        var op = Op("SELECT @schema;",
            new OperationParameter { Name = "schema", Type = OperationParameterType.String, Required = false, Default = "dbo" });

        var result = TemplateRenderer.Render(op, V(("schema", "sales")), new FakeDialect());

        Assert.Equal("sales", result.Parameters.Single().Value);
    }

    [Fact]
    public void Choice_value_must_be_one_of_the_declared_choices()
    {
        var op = Op("SELECT @action;",
            new OperationParameter { Name = "action", Type = OperationParameterType.Choice, Choices = ["GRANT", "REVOKE"] });

        Assert.Equal("GRANT", TemplateRenderer.Render(op, V(("action", "GRANT")), new FakeDialect()).Parameters.Single().Value);

        var ex = Assert.Throws<TemplateRenderException>(() =>
            TemplateRenderer.Render(op, V(("action", "GRANT; DROP LOGIN x")), new FakeDialect()));
        Assert.Contains("GRANT, REVOKE", ex.Message);
    }
}
