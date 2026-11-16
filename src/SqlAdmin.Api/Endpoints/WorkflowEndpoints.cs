using System.Data.Common;
using System.Diagnostics;
using Microsoft.AspNetCore.Http.HttpResults;
using SqlAdmin.Api.Contracts;
using SqlAdmin.Core.Audit;
using SqlAdmin.Core.Config;
using SqlAdmin.Core.Engines;
using SqlAdmin.Core.Lookups;
using SqlAdmin.Core.Operations;

namespace SqlAdmin.Api.Endpoints;

/// <summary>/api/workflows — guided checklists (today: offboarding) made of registered operations.</summary>
public static class WorkflowEndpoints
{
    public static IEndpointRouteBuilder MapWorkflowEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/workflows").WithTags("Workflows");

        group.MapGet("/", (IOperationRegistry registry) =>
                TypedResults.Ok(Workflows.All.Select(w => WorkflowSummary.From(w, registry)).ToList()))
            .WithName("ListWorkflows")
            .WithSummary("Guided checklists and their steps");

        // POST /api/workflows/{id}/preview — SQL of every selected step; one token for the whole plan.
        group.MapPost("/{id}/preview", async Task<Results<Ok<WorkflowPreviewResult>, ProblemHttpResult>> (
                string id,
                WorkflowRequest request,
                IOperationRegistry registry,
                IServerCatalog catalog,
                IEngineRegistry engines,
                ILookupRegistry lookups,
                IServerConnectionFactory connections,
                DestructiveGuard guard,
                CancellationToken ct) =>
            {
                var workflow = Workflows.Find(id);
                if (workflow is null) return UnknownWorkflow(id);
                var serverDef = catalog.Find(request.ServerName);
                if (serverDef is null) return UnknownServer(request.ServerName);

                var engine = engines.Get(serverDef.Engine);
                request = request with { Params = MultiValues.Normalize(workflow.Params, request.Params) };
                var plan = WorkflowRunner.Plan(workflow, registry, engine.Id, engine.Dialect, request.Params, request.Steps);

                // Everything a step needs must exist on the server (e.g. new_owner), then the YAML checks.
                foreach (var step in plan.Steps)
                {
                    await MustExistValidator.ValidateAsync(
                        step.Operation, step.Values, request.ServerName, null, lookups, connections, ct);
                }

                var checks = (await WorkflowRunner.PreflightAsync(plan, request.ServerName, connections, ct)).ToList();

                // Dry run every step; a step whose script fails here would fail for real, so it blocks.
                var dryRuns = await WorkflowRunner.DryRunAsync(plan, request.ServerName, connections, ct);
                foreach (var step in plan.Steps)
                {
                    if (dryRuns.GetValueOrDefault(step.Step.Key)?.Error is { } error)
                        checks.Add(new WorkflowCheckResult(step.Step.Key, step.Step.Title,
                            new CheckResult("dry_run", CheckSeverity.Error, false, error)));
                }

                var impact = await RunImpactAsync(workflow, request, serverDef, lookups, connections, ct);

                // No token while a blocking check fails: nothing destructive can start from this preview.
                var token = plan.Destructive && !checks.Any(c => c.Result.Blocking)
                    ? guard.IssueToken(workflow.Id, request.ServerName, null, plan.TokenValues(request.Params))
                    : null;
                return TypedResults.Ok(new WorkflowPreviewResult(
                    workflow.Id,
                    plan.Steps.Select(s => new WorkflowPlannedStep(
                        s.Step.Key, s.Step.Title, s.Operation.Id, s.Destructive, s.Batches,
                        dryRuns.GetValueOrDefault(s.Step.Key)?.Statements)).ToList(),
                    plan.Destructive,
                    token,
                    plan.Destructive && serverDef.IsProduction,
                    checks,
                    impact));
            })
            .WithName("PreviewWorkflow")
            .WithSummary("Render every selected step; nothing executes");

        // POST /api/workflows/{id}/execute — run the steps in order, stop at the first failure.
        group.MapPost("/{id}/execute", async Task<Results<Ok<WorkflowExecuteResult>, ProblemHttpResult>> (
                string id,
                WorkflowRequest request,
                IOperationRegistry registry,
                IServerConnectionFactory connections,
                ILookupRegistry lookups,
                IServerCatalog catalog,
                IEngineRegistry engines,
                IAuditStore auditStore,
                DestructiveGuard guard,
                IWebHostEnvironment env,
                CancellationToken ct) =>
            {
                var workflow = Workflows.Find(id);
                if (workflow is null) return UnknownWorkflow(id);
                var serverDef = catalog.Find(request.ServerName);
                if (serverDef is null) return UnknownServer(request.ServerName);

                var stopwatch = Stopwatch.StartNew();
                var engine = engines.Get(serverDef.Engine);
                request = request with { Params = MultiValues.Normalize(workflow.Params, request.Params) };
                var plan = WorkflowRunner.Plan(workflow, registry, engine.Id, engine.Dialect, request.Params, request.Steps);

                // The token covers the workflow values AND the ticked steps; 428 via DomainExceptionHandler otherwise.
                if (plan.Destructive)
                {
                    guard.Validate(workflow.Id, serverDef, null, plan.TokenValues(request.Params),
                        request.ConfirmToken, request.ConfirmServerName);
                }

                // Nothing runs, not even the snapshot, unless every check of every selected step passes.
                foreach (var step in plan.Steps)
                {
                    await MustExistValidator.ValidateAsync(
                        step.Operation, step.Values, request.ServerName, null, lookups, connections, ct);
                }

                var failed = (await WorkflowRunner.PreflightAsync(plan, request.ServerName, connections, ct))
                    .Where(c => c.Result.Blocking).Select(c => c.Result).ToList();
                if (failed.Count > 0) throw new PreflightFailedException(failed);

                // One audit row per step that ran, written as soon as it finishes, so a later failure
                // (or a closed browser tab) never loses the record of what already happened.
                async Task Audit(StepOutcome o)
                {
                    var script = o.Run?.Script;
                    await auditStore.RecordAsync(new AuditEntry
                    {
                        ExecutedAtUtc = DateTimeOffset.UtcNow,
                        ExecutedBy = Environment.UserName,
                        ServerName = request.ServerName,
                        Database = null,
                        Sql = $"[{o.Planned.Operation.Id}] (workflow {workflow.Id}, step {o.Planned.Step.Key})\n"
                              + string.Join("\nGO\n", o.Planned.Batches),
                        Status = o.Status == "OK" ? "Success" : "Failed",
                        Detail = o.Error,
                        ParametersJson = OperationExecutor.RedactedParametersJson(o.Planned.Operation, o.Planned.Values),
                        Steps = (o.Run?.DatabaseSteps ?? []).Select((s, i) => new AuditStep
                        {
                            StepNo = i + 1,
                            Database = s.Database,
                            Action = o.Planned.Operation.Id,
                            Status = s.Status,
                            RowsAffected = s.RowCount,
                            Message = s.Message,
                            ExecutedAtUtc = DateTimeOffset.UtcNow,
                        }).ToList(),
                    }, ct);
                }

                var result = await WorkflowRunner.ExecuteAsync(
                    plan, request.ServerName, connections,
                    Path.Combine(env.ContentRootPath, "snapshots"), Audit, ct);

                return TypedResults.Ok(new WorkflowExecuteResult(
                    result.Success,
                    stopwatch.ElapsedMilliseconds,
                    result.Steps.Select(ToDto).ToList(),
                    result.Warnings));
            })
            .WithName("ExecuteWorkflow")
            .WithSummary("Run the selected steps in order against a server");

        return app;
    }

    /// <summary>The workflow's dry-run report (counts of what will be touched); null if it has none or cannot be read.</summary>
    private static async Task<LookupResult?> RunImpactAsync(
        WorkflowDefinition workflow, WorkflowRequest request, ServerDefinition server,
        ILookupRegistry lookups, IServerConnectionFactory connections, CancellationToken ct)
    {
        if (workflow.ImpactLookup is null) return null;
        var lookup = lookups.Find(workflow.ImpactLookup, server.Engine);
        if (lookup is null) return null;

        try
        {
            await using var conn = await connections.OpenAsync(request.ServerName, lookup.DatabaseToOpen(null), ct);
            return await LookupRunner.RunAsync(
                lookup, conn.Connection, conn.Engine, request.Params, conn.Server.CommandTimeoutSeconds, ct);
        }
        catch (DbException ex)
        {
            return new LookupResult([], $"Could not build the impact report: {ex.Message}");
        }
    }

    private static WorkflowStepResult ToDto(StepOutcome o) => new(
        o.Planned.Step.Key,
        o.Planned.Step.Title,
        o.Planned.Operation.Id,
        o.Status,
        o.ElapsedMs,
        o.Run?.Script.ResultSets.Select(rs => new CustomSqlResultSet(rs.BatchIndex, rs.Columns, rs.Rows)).ToList() ?? [],
        o.Run?.Script.Messages ?? [],
        o.Error,
        o.Run?.DatabaseSteps?.Select(s => new ExecutionStepDto(s.Database, s.Status, s.RowCount, s.Message)).ToList(),
        o.Run?.SnapshotPath);

    private static ProblemHttpResult UnknownWorkflow(string id) =>
        TypedResults.Problem(title: "Workflow not found", detail: $"Workflow '{id}' does not exist.", statusCode: StatusCodes.Status404NotFound);

    private static ProblemHttpResult UnknownServer(string name) =>
        TypedResults.Problem(title: "Server not found", detail: $"Server '{name}' is not configured.", statusCode: StatusCodes.Status404NotFound);
}
