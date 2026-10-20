using System.Diagnostics;
using Microsoft.AspNetCore.Http.HttpResults;
using SqlAdmin.Api.Contracts;
using SqlAdmin.Core.Audit;
using SqlAdmin.Core.Config;
using SqlAdmin.Core.Engines;
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
        group.MapPost("/{id}/preview", Results<Ok<WorkflowPreviewResult>, ProblemHttpResult> (
                string id,
                WorkflowRequest request,
                IOperationRegistry registry,
                IServerCatalog catalog,
                IEngineRegistry engines,
                DestructiveGuard guard) =>
            {
                var workflow = Workflows.Find(id);
                if (workflow is null) return UnknownWorkflow(id);
                var serverDef = catalog.Find(request.ServerName);
                if (serverDef is null) return UnknownServer(request.ServerName);

                var engine = engines.Get(serverDef.Engine);
                var plan = WorkflowRunner.Plan(workflow, registry, engine.Id, engine.Dialect, request.Params, request.Steps);

                var token = plan.Destructive
                    ? guard.IssueToken(workflow.Id, request.ServerName, null, plan.TokenValues(request.Params))
                    : null;
                return TypedResults.Ok(new WorkflowPreviewResult(
                    workflow.Id,
                    plan.Steps.Select(s => new WorkflowPlannedStep(
                        s.Step.Key, s.Step.Title, s.Operation.Id, s.Destructive, s.Batches)).ToList(),
                    plan.Destructive,
                    token,
                    plan.Destructive && serverDef.IsProduction));
            })
            .WithName("PreviewWorkflow")
            .WithSummary("Render every selected step; nothing executes");

        // POST /api/workflows/{id}/execute — run the steps in order, stop at the first failure.
        group.MapPost("/{id}/execute", async Task<Results<Ok<WorkflowExecuteResult>, ProblemHttpResult>> (
                string id,
                WorkflowRequest request,
                IOperationRegistry registry,
                IServerConnectionFactory connections,
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
                var plan = WorkflowRunner.Plan(workflow, registry, engine.Id, engine.Dialect, request.Params, request.Steps);

                // The token covers the workflow values AND the ticked steps; 428 via DomainExceptionHandler otherwise.
                if (plan.Destructive)
                {
                    guard.Validate(workflow.Id, serverDef, null, plan.TokenValues(request.Params),
                        request.ConfirmToken, request.ConfirmServerName);
                }

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
