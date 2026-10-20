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
        group.MapGet("/", Results<Ok<List<OperationSummary>>, ProblemHttpResult> (
                string server,
                IOperationRegistry registry,
                IServerCatalog catalog,
                IEngineRegistry engines) =>
            {
                var serverDef = catalog.Find(server);
                if (serverDef is null) return UnknownServer(server);

                var engineId = engines.Get(serverDef.Engine).Id;
                var list = registry.ForEngine(engineId).Select(OperationSummary.From).ToList();
                return TypedResults.Ok(list);
            })
            .WithName("ListOperations")
            .WithSummary("Operations available for a server, filtered by its engine");

        // POST /api/operations/{id}/preview
        group.MapPost("/{id}/preview", Results<Ok<OperationPreviewResult>, ProblemHttpResult> (
                string id,
                OperationRequest request,
                IOperationRegistry registry,
                IServerCatalog catalog,
                IEngineRegistry engines,
                DestructiveGuard guard) =>
            {
                var operation = registry.Find(id);
                if (operation is null) return UnknownOperation(id);

                var serverDef = catalog.Find(request.ServerName);
                if (serverDef is null) return UnknownServer(request.ServerName);

                // A TemplateRenderException (missing/invalid parameter) becomes a 400 ProblemDetails
                // in DomainExceptionHandler, so no try/catch is needed here.
                var plan = OperationExecutor.Plan(operation, request.Params, engines.Get(serverDef.Engine).Dialect);

                // Destructive for these values: hand back the token that /execute will demand.
                var destructive = operation.RequiresConfirmation(request.Params);
                var token = destructive
                    ? guard.IssueToken(operation, request.ServerName, request.Database, request.Params)
                    : null;
                return TypedResults.Ok(new OperationPreviewResult(
                    plan.OperationId, plan.Batches, destructive, token, destructive && serverDef.IsProduction));
            })
            .WithName("PreviewOperation")
            .WithSummary("Render the operation's template; nothing executes");

        // POST /api/operations/{id}/execute
        group.MapPost("/{id}/execute", async Task<Results<Ok<OperationExecuteResult>, ProblemHttpResult>> (
                string id,
                OperationRequest request,
                IOperationRegistry registry,
                IServerConnectionFactory connections,
                IServerCatalog catalog,
                IEngineRegistry engines,
                IAuditStore auditStore,
                DestructiveGuard guard,
                CancellationToken ct) =>
            {
                var operation = registry.Find(id);
                if (operation is null) return UnknownOperation(id);

                var serverDef = catalog.Find(request.ServerName);
                if (serverDef is null) return UnknownServer(request.ServerName);

                var stopwatch = Stopwatch.StartNew();

                // Destructive for these values? Then the previewed token (and, on Production, the typed
                // server name) must match this exact request. 428 via DomainExceptionHandler otherwise.
                // Checked against the values as the DBA sent them — generated passwords come after.
                if (operation.RequiresConfirmation(request.Params))
                {
                    guard.Validate(operation, serverDef, request.Database, request.Params,
                        request.ConfirmToken, request.ConfirmServerName);
                }

                // Blank "generate" password fields get a random password; it is returned once below.
                var (values, generated) = OperationExecutor.ApplyGeneratedSecrets(operation, request.Params);

                // Render first: bad parameters fail fast (400 via DomainExceptionHandler) without
                // opening a connection or writing an audit row.
                var plan = OperationExecutor.Plan(operation, values, engines.Get(serverDef.Engine).Dialect);

                ScriptResult scriptResult;
                IReadOnlyList<ExecutionStepDto>? steps = null;
                if (operation.Scope == OperationScope.AllDatabases)
                {
                    // The executor opens its own connections (one per database).
                    var all = await AllDatabasesExecutor.ExecuteAsync(
                        operation, values, request.ServerName, connections, ct);
                    scriptResult = all.Combined;
                    steps = all.Steps.Select(s => new ExecutionStepDto(s.Database, s.Status, s.RowCount, s.Message)).ToList();
                }
                else
                {
                    await using var conn = await connections.OpenAsync(request.ServerName, request.Database, ct);
                    var messages = new List<string>();
                    using var subscription = conn.Engine.SubscribeToMessages(conn.Connection, messages);

                    scriptResult = await OperationExecutor.ExecuteAsync(
                        operation, values, conn.Connection, conn.Engine.Dialect,
                        conn.Server.CommandTimeoutSeconds, messages, ct);
                }

                var response = new OperationExecuteResult(
                    Success: !scriptResult.Failed,
                    ElapsedMs: stopwatch.ElapsedMilliseconds,
                    ResultSets: scriptResult.ResultSets
                        .Select(rs => new CustomSqlResultSet(rs.BatchIndex, rs.Columns, rs.Rows))
                        .ToList(),
                    Messages: scriptResult.Messages,
                    FailedBatchIndex: scriptResult.FailedBatchIndex,
                    Error: scriptResult.Error,
                    Steps: steps,
                    GeneratedPasswords: generated.Count > 0 ? generated : null);

                await auditStore.RecordAsync(new AuditEntry
                {
                    ExecutedAtUtc = DateTimeOffset.UtcNow,
                    ExecutedBy = Environment.UserName,
                    ServerName = request.ServerName,
                    Database = request.Database,
                    Sql = $"[{operation.Id}]\n" + string.Join("\nGO\n", plan.Batches),
                    Status = response.Success ? "Success" : "Failed",
                    Detail = response.Error,
                    // Password-typed values (including generated ones) are stored as "***".
                    ParametersJson = OperationExecutor.RedactedParametersJson(operation, values),
                    Steps = (steps ?? []).Select((s, i) => new AuditStep
                    {
                        StepNo = i + 1,
                        Database = s.Database,
                        Action = operation.Id,
                        Status = s.Status,
                        RowsAffected = s.RowCount,
                        Message = s.Message,
                        ExecutedAtUtc = DateTimeOffset.UtcNow,
                    }).ToList(),
                }, ct);

                return TypedResults.Ok(response);
            })
            .WithName("ExecuteOperation")
            .WithSummary("Run the operation against a server (and optional database)");

        return app;
    }

    // 404s as RFC 7807 bodies with a detail the UI can show ("Operation 'x' does not exist"),
    // instead of the empty body TypedResults.NotFound() would produce.
    private static ProblemHttpResult UnknownOperation(string id) =>
        TypedResults.Problem(title: "Operation not found", detail: $"Operation '{id}' does not exist.", statusCode: StatusCodes.Status404NotFound);

    private static ProblemHttpResult UnknownServer(string name) =>
        TypedResults.Problem(title: "Server not found", detail: $"Server '{name}' is not configured.", statusCode: StatusCodes.Status404NotFound);
}
