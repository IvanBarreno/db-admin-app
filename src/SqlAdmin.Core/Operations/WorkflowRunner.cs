using System.Diagnostics;
using SqlAdmin.Core.Engines;

namespace SqlAdmin.Core.Operations;

/// <summary>A step ready to run: its operation, the exact parameter values, and the rendered SQL.</summary>
public sealed record PlannedStep(
    WorkflowStep Step,
    OperationDefinition Operation,
    IReadOnlyDictionary<string, string?> Values,
    IReadOnlyList<string> Batches)
{
    public bool Destructive => Operation.RequiresConfirmation(Values);
}

public sealed record WorkflowPlan(WorkflowDefinition Workflow, IReadOnlyList<PlannedStep> Steps)
{
    public bool Destructive => Steps.Any(s => s.Destructive);

    /// <summary>
    /// What a confirm token must be bound to: the workflow values PLUS the selected steps, so ticking or
    /// unticking a step after the preview invalidates the token.
    /// </summary>
    public IReadOnlyDictionary<string, string?> TokenValues(IReadOnlyDictionary<string, string?> values)
    {
        var bound = new Dictionary<string, string?>(values)
        {
            ["__steps"] = string.Join(",", Steps.Select(s => s.Step.Key)),
        };
        return bound;
    }
}

/// <summary>Outcome of one step. Status: <c>OK</c>, <c>FAILED</c> or <c>NOT_RUN</c> (an earlier step failed).</summary>
public sealed record StepOutcome(
    PlannedStep Planned,
    string Status,
    long ElapsedMs,
    OperationRun? Run,
    string? Error);

public sealed record WorkflowRunResult(IReadOnlyList<StepOutcome> Steps, IReadOnlyList<string> Warnings)
{
    public bool Success => Steps.All(s => s.Status == "OK");
}

/// <summary>Plans and executes a <see cref="WorkflowDefinition"/> on top of <see cref="OperationRunner"/>.</summary>
public static class WorkflowRunner
{
    /// <exception cref="TemplateRenderException">Unknown step, missing parameter, or an operation the server's engine can't run (→ HTTP 400).</exception>
    public static WorkflowPlan Plan(
        WorkflowDefinition workflow,
        IOperationRegistry registry,
        string engineId,
        ISqlDialect dialect,
        IReadOnlyDictionary<string, string?> values,
        IReadOnlyCollection<string> selectedKeys)
    {
        var unknown = selectedKeys.FirstOrDefault(k => workflow.Steps.All(s => s.Key != k));
        if (unknown is not null)
            throw new TemplateRenderException($"Unknown step '{unknown}' in workflow '{workflow.Id}'.");

        foreach (var p in workflow.Params.Where(p => p.Required))
        {
            if (string.IsNullOrWhiteSpace(values.GetValueOrDefault(p.Name)))
                throw new TemplateRenderException($"Parameter '{p.Name}' is required.");
        }

        // Workflow order wins over the order the client sent; required steps are always in.
        var chosen = workflow.Steps.Where(s => s.Required || selectedKeys.Contains(s.Key)).ToList();

        var planned = new List<PlannedStep>();
        foreach (var step in chosen)
        {
            if (step.NeedsNewOwner && string.IsNullOrWhiteSpace(values.GetValueOrDefault("new_owner")))
                throw new TemplateRenderException($"Step '{step.Title}' needs 'new_owner'.");

            var operation = registry.Find(step.OperationId)
                ?? throw new TemplateRenderException($"Step '{step.Key}': operation '{step.OperationId}' is not registered.");
            if (!operation.Engines.Contains(engineId, StringComparer.OrdinalIgnoreCase))
                throw new TemplateRenderException(
                    $"Step '{step.Title}' is not available on engine '{engineId}'.");

            // The step takes the workflow values that its operation declares, then its own fixed ones.
            var stepValues = new Dictionary<string, string?>();
            foreach (var p in operation.Params)
            {
                if (values.TryGetValue(p.Name, out var v)) stepValues[p.Name] = v;
            }
            foreach (var (name, fixedValue) in step.FixedValues ?? new Dictionary<string, string>())
                stepValues[name] = fixedValue;

            var batches = OperationExecutor.Plan(operation, stepValues, dialect).Batches;
            planned.Add(new PlannedStep(step, operation, stepValues, batches));
        }

        return new WorkflowPlan(workflow, planned);
    }

    /// <summary>
    /// Runs the steps in order and stops at the first failure; later steps are reported as NOT_RUN.
    /// <paramref name="onStepFinished"/> is called after each step that ran (the API uses it to write the audit row).
    /// </summary>
    public static async Task<WorkflowRunResult> ExecuteAsync(
        WorkflowPlan plan,
        string serverName,
        IServerConnectionFactory connections,
        string snapshotDirectory,
        Func<StepOutcome, Task> onStepFinished,
        CancellationToken ct)
    {
        var warnings = await FindWarningsAsync(plan, serverName, connections, ct);

        var outcomes = new List<StepOutcome>();
        var stopped = false;
        foreach (var planned in plan.Steps)
        {
            if (stopped)
            {
                outcomes.Add(new StepOutcome(planned, "NOT_RUN", 0, null, null));
                continue;
            }

            ct.ThrowIfCancellationRequested();
            var stopwatch = Stopwatch.StartNew();
            StepOutcome outcome;
            try
            {
                var run = await OperationRunner.RunAsync(
                    planned.Operation, planned.Values, serverName, database: null,
                    connections, snapshotDirectory, ct);
                // A server-level failure sets Script.Failed; an all_databases run sets it when any database errored.
                outcome = run.Script.Failed
                    ? new StepOutcome(planned, "FAILED", stopwatch.ElapsedMilliseconds, run, run.Script.Error)
                    : new StepOutcome(planned, "OK", stopwatch.ElapsedMilliseconds, run, null);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // Connection/driver problems: report on the step instead of losing the earlier results.
                outcome = new StepOutcome(planned, "FAILED", stopwatch.ElapsedMilliseconds, null, ex.Message);
            }

            outcomes.Add(outcome);
            await onStepFinished(outcome);
            if (outcome.Status != "OK") stopped = true;
        }

        return new WorkflowRunResult(outcomes, warnings);
    }

    // Databases that are not ONLINE are invisible to all_databases steps: tell the DBA which ones.
    private static async Task<IReadOnlyList<string>> FindWarningsAsync(
        WorkflowPlan plan, string serverName, IServerConnectionFactory connections, CancellationToken ct)
    {
        if (plan.Steps.All(s => s.Operation.Scope != OperationScope.AllDatabases)) return [];

        await using var conn = await connections.OpenAsync(serverName, database: null, ct);
        var databases = await conn.Engine.ListDatabasesAsync(conn.Connection, ct);
        return databases
            .Where(d => !d.IsOnline)
            .Select(d => $"Database '{d.Name}' is {d.State}: steps over all databases skipped it, so anything this login owns there is untouched.")
            .ToList();
    }
}
