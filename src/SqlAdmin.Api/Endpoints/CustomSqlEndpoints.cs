using System.Diagnostics;
using SqlAdmin.Api.Contracts;
using SqlAdmin.Core.Audit;
using SqlAdmin.Core.Engines;
using SqlAdmin.Core.Execution;

namespace SqlAdmin.Api.Endpoints;

/// <summary>/api/custom-sql — the free-form SQL box. No restriction on statements: the team are all admins.</summary>
public static class CustomSqlEndpoints
{
    public static IEndpointRouteBuilder MapCustomSqlEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/custom-sql", async (
                CustomSqlRequest request,
                IServerConnectionFactory connections,
                IAuditStore auditStore,
                CancellationToken ct) =>
            {
                var stopwatch = Stopwatch.StartNew();

                await using var conn = await connections.OpenAsync(request.ServerName, request.Database, ct);

                var batches = BatchSplitter.Split(request.Sql, conn.Engine.Dialect.BatchSeparator);
                var messages = new List<string>();
                using var subscription = conn.Engine.SubscribeToMessages(conn.Connection, messages);

                var result = await SqlScriptExecutor.ExecuteAsync(
                    conn.Connection, batches, conn.Server.CommandTimeoutSeconds, messages, ct);

                var response = new CustomSqlResult(
                    Success: !result.Failed,
                    ElapsedMs: stopwatch.ElapsedMilliseconds,
                    ResultSets: result.ResultSets
                        .Select(rs => new CustomSqlResultSet(rs.BatchIndex, rs.Columns, rs.Rows))
                        .ToList(),
                    Messages: result.Messages,
                    FailedBatchIndex: result.FailedBatchIndex,
                    Error: result.Error);

                // Audited regardless of outcome: a failed run is still a run against a real server.
                await auditStore.RecordAsync(new AuditEntry
                {
                    ExecutedAtUtc = DateTimeOffset.UtcNow,
                    ExecutedBy = Environment.UserName,
                    ServerName = request.ServerName,
                    Database = request.Database,
                    Sql = request.Sql,
                    Status = response.Success ? "Success" : "Failed",
                    Detail = response.Error,
                }, ct);

                return TypedResults.Ok(response);
            })
            .WithName("ExecuteCustomSql")
            .WithSummary("Run free-form SQL against a server (and optional database), batch by batch");

        return app;
    }
}
