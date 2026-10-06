using System.Diagnostics;
using Microsoft.AspNetCore.Http.HttpResults;
using SqlAdmin.Api.Contracts;
using SqlAdmin.Core.Audit;
using SqlAdmin.Core.Config;
using SqlAdmin.Core.Engines;
using SqlAdmin.Core.Execution;
using SqlAdmin.Core.Operations;

namespace SqlAdmin.Api.Endpoints;

/// <summary>/api/operations — the registered operation catalog: list, preview, execute.</summary>
public static class OperationsEndpoints
{
    public static IEndpointRouteBuilder MapOperationsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/operations").WithTags("Operations");

        // GET /api/operations?server={name}
        // Filtered to the server's engine, so the UI never offers an operation the server can't run.
        group.MapGet("/", Results<Ok<List<OperationSummary>>, NotFound> (
                string server,
                IOperationRegistry registry,
                IServerCatalog catalog,
                IEngineRegistry engines) =>
            {
                var serverDef = catalog.Find(server);
                if (serverDef is null) return TypedResults.NotFound();

                var engineId = engines.Get(serverDef.Engine).Id;
                var list = registry.ForEngine(engineId).Select(OperationSummary.From).ToList();
                return TypedResults.Ok(list);
            })
            .WithName("ListOperations")
            .WithSummary("Operations available for a server, filtered by its engine");

        // POST /api/operations/{id}/preview
        group.MapPost("/{id}/preview", Results<Ok<OperationPreviewResult>, NotFound, BadRequest<string>> (
                string id,
                OperationRequest request,
                IOperationRegistry registry,
                IServerCatalog catalog,
                IEngineRegistry engines) =>
            {
                var operation = registry.Find(id);
                if (operation is null) return TypedResults.NotFound();

                var serverDef = catalog.Find(request.ServerName);
                if (serverDef is null) return TypedResults.NotFound();

                try
                {
                    var dialect = engines.Get(serverDef.Engine).Dialect;
                    var plan = OperationExecutor.Plan(operation, request.Params, dialect);
                    return TypedResults.Ok(new OperationPreviewResult(plan.OperationId, plan.Batches));
                }
                catch (TemplateRenderException ex)
                {
                    return TypedResults.BadRequest(ex.Message);
                }
            })
            .WithName("PreviewOperation")
            .WithSummary("Render the operation's template; nothing executes");

        // POST /api/operations/{id}/execute
        group.MapPost("/{id}/execute", async Task<Results<Ok<OperationExecuteResult>, NotFound, BadRequest<string>>> (
                string id,
                OperationRequest request,
                IOperationRegistry registry,
                IServerConnectionFactory connections,
                IAuditStore auditStore,
                CancellationToken ct) =>
            {
                var operation = registry.Find(id);
                if (operation is null) return TypedResults.NotFound();

                var stopwatch = Stopwatch.StartNew();
                await using var conn = await connections.OpenAsync(request.ServerName, request.Database, ct);

                var messages = new List<string>();
                using var subscription = conn.Engine.SubscribeToMessages(conn.Connection, messages);

                OperationPlan plan;
                ScriptResult scriptResult;
                try
                {
                    plan = OperationExecutor.Plan(operation, request.Params, conn.Engine.Dialect);
                    scriptResult = await OperationExecutor.ExecuteAsync(
                        operation, request.Params, conn.Connection, conn.Engine.Dialect,
                        conn.Server.CommandTimeoutSeconds, messages, ct);
                }
                catch (TemplateRenderException ex)
                {
                    return TypedResults.BadRequest(ex.Message);
                }

                var response = new OperationExecuteResult(
                    Success: !scriptResult.Failed,
                    ElapsedMs: stopwatch.ElapsedMilliseconds,
                    ResultSets: scriptResult.ResultSets
                        .Select(rs => new CustomSqlResultSet(rs.BatchIndex, rs.Columns, rs.Rows))
                        .ToList(),
                    Messages: scriptResult.Messages,
                    FailedBatchIndex: scriptResult.FailedBatchIndex,
                    Error: scriptResult.Error);

                await auditStore.RecordAsync(new AuditEntry
                {
                    ExecutedAtUtc = DateTimeOffset.UtcNow,
                    ExecutedBy = Environment.UserName,
                    ServerName = request.ServerName,
                    Database = request.Database,
                    Sql = $"[{operation.Id}]\n" + string.Join("\nGO\n", plan.Batches),
                    Status = response.Success ? "Success" : "Failed",
                    Detail = response.Error,
                }, ct);

                return TypedResults.Ok(response);
            })
            .WithName("ExecuteOperation")
            .WithSummary("Run the operation against a server (and optional database)");

        return app;
    }
}
