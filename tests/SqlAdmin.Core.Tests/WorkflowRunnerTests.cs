using SqlAdmin.Core.Engines;
using SqlAdmin.Core.Operations;
using SqlAdmin.Infrastructure.Operations;

namespace SqlAdmin.Core.Tests;

/// <summary>Planning of the offboarding checklist against the SHIPPED operation catalog (no server needed).</summary>
public class WorkflowRunnerTests
{
    private sealed class FakeDialect : ISqlDialect
    {
        public string QuoteIdentifier(string identifier) => $"[{identifier.Replace("]", "]]")}]";
        public string ParameterPrefix => "@";
        public string? BatchSeparator => "GO";
    }

    private static readonly OperationRegistry Registry = new(OperationRegistryTests.ShippedOperationsDir());

    private static Dictionary<string, string?> Values(string? newOwner = "heir") => new()
    {
        ["login_name"] = "leaver",
        ["new_owner"] = newOwner,
    };

    private static WorkflowPlan Plan(IReadOnlyCollection<string> steps, Dictionary<string, string?>? values = null, string engine = "sqlserver") =>
        WorkflowRunner.Plan(Workflows.Offboarding, Registry, engine, new FakeDialect(), values ?? Values(), steps);

    [Fact]
    public void Every_step_of_the_shipped_workflow_points_at_a_registered_operation()
    {
        foreach (var step in Workflows.Offboarding.Steps)
            Assert.NotNull(Registry.Find(step.OperationId));
    }

    [Fact]
    public void Snapshot_is_always_first_even_when_not_selected()
    {
        var plan = Plan(["drop_login"]);

        Assert.Equal(["snapshot", "drop_login"], plan.Steps.Select(s => s.Step.Key));
    }

    [Fact]
    public void Steps_run_in_workflow_order_regardless_of_the_order_sent()
    {
        var plan = Plan(["drop_login", "kill_sessions", "disable"]);

        Assert.Equal(["snapshot", "disable", "kill_sessions", "drop_login"], plan.Steps.Select(s => s.Step.Key));
    }

    [Fact]
    public void Disable_step_uses_its_fixed_value_and_is_destructive()
    {
        var plan = Plan(["disable"]);

        var disable = plan.Steps.Single(s => s.Step.Key == "disable");
        Assert.Equal("DISABLE", disable.Values["action"]);
        Assert.True(disable.Destructive);
    }

    [Fact]
    public void Snapshot_only_plan_is_not_destructive()
    {
        Assert.False(Plan([]).Destructive);
    }

    [Fact]
    public void Each_step_gets_only_the_parameters_its_operation_declares()
    {
        var plan = Plan(["kill_sessions", "reassign_jobs"]);

        Assert.DoesNotContain("new_owner", plan.Steps.Single(s => s.Step.Key == "kill_sessions").Values.Keys);
        Assert.Equal("heir", plan.Steps.Single(s => s.Step.Key == "reassign_jobs").Values["new_owner"]);
    }

    [Theory]
    [InlineData("reassign_jobs")]
    [InlineData("reassign_databases")]
    public void Steps_that_need_a_new_owner_fail_without_one(string step)
    {
        var ex = Assert.Throws<TemplateRenderException>(() => Plan([step], Values(newOwner: " ")));
        Assert.Contains("new_owner", ex.Message);
    }

    [Fact]
    public void Missing_login_name_is_rejected()
    {
        var values = Values();
        values["login_name"] = null;

        Assert.Throws<TemplateRenderException>(() => Plan([], values));
    }

    [Fact]
    public void Unknown_step_is_rejected()
    {
        var ex = Assert.Throws<TemplateRenderException>(() => Plan(["format_c"]));
        Assert.Contains("format_c", ex.Message);
    }

    [Fact]
    public void Engine_without_the_operations_is_rejected()
    {
        // The offboarding operations are sqlserver-only (Agent jobs, server logins).
        var ex = Assert.Throws<TemplateRenderException>(() => Plan([], engine: "azuresql"));
        Assert.Contains("azuresql", ex.Message);
    }

    [Fact]
    public void Token_values_change_when_the_selected_steps_change()
    {
        var values = Values();
        var a = Plan(["disable"]).TokenValues(values);
        var b = Plan(["disable", "drop_login"]).TokenValues(values);

        Assert.NotEqual(a["__steps"], b["__steps"]);
    }
}
