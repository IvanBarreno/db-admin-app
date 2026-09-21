using System.Data.Common;
using Microsoft.AspNetCore.Diagnostics;
using SqlAdmin.Core.Engines;

namespace SqlAdmin.Api.Errors;

/// <summary>
/// Maps exceptions we EXPECT to meaningful HTTP status codes. Anything it doesn't recognise
/// is left to the default handler, which produces a generic 500 ProblemDetails.
/// </summary>
/// <remarks>
/// <see cref="IExceptionHandler"/> is the ASP.NET Core 8+ hook used by UseExceptionHandler().
/// Return true = "handled, response written"; false = "not mine, try the next handler".
/// Keeping this mapping in one place means endpoints don't need try/catch for the common cases.
/// </remarks>
public sealed class DomainExceptionHandler(IProblemDetailsService problemDetails, ILogger<DomainExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken ct)
    {
        // C# 9 "pattern matching switch": each arm tests the runtime type of the exception.
        var (status, title) = exception switch
        {
            ServerNotFoundException => (StatusCodes.Status404NotFound, "Server not found"),
            MissingSecretException  => (StatusCodes.Status400BadRequest, "Missing credentials"),
            UnknownEngineException  => (StatusCodes.Status500InternalServerError, "Engine not available"),
            // DbException is the ADO.NET base class of SqlException, NpgsqlException, etc. —
            // handling the base keeps this project free of driver-specific references.
            DbException             => (StatusCodes.Status502BadGateway, "Database error"),
            OperationCanceledException => (StatusCodes.Status499ClientClosedRequest, "Request cancelled"),
            _ => (0, string.Empty), // not ours
        };

        if (status == 0)
        {
            return false;
        }

        logger.LogWarning(exception, "{Title} ({Status}) on {Method} {Path}", title, status, httpContext.Request.Method, httpContext.Request.Path);

        httpContext.Response.StatusCode = status;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            Exception = exception,
            ProblemDetails =
            {
                Status = status,
                Title = title,
                Detail = exception.Message, // safe: our messages never include secrets (see ResolvedCredentials.ToString)
            },
        });
    }
}
