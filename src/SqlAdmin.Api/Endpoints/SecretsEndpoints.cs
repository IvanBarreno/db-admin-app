using Microsoft.AspNetCore.Http.HttpResults;
using SqlAdmin.Core.Operations;

namespace SqlAdmin.Api.Endpoints;

/// <summary>Request body of POST /api/secrets/password; every field is optional and falls back to the default.</summary>
public sealed record GeneratePasswordRequest(
    int Length = 20,
    bool Upper = true,
    bool Lower = true,
    bool Digits = true,
    bool Symbols = true,
    bool ExcludeLookalikes = true);

/// <summary>The generated password (shown to the DBA, never stored or logged) and an optional policy heads-up.</summary>
public sealed record GeneratedPasswordResponse(string Password, string? Warning);

/// <summary>/api/secrets — generates random secrets on request, so the DBA can see and copy one BEFORE running an operation.</summary>
public static class SecretsEndpoints
{
    public static IEndpointRouteBuilder MapSecretsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/secrets").WithTags("Secrets");

        // POST because each call returns a new value; the response is never cached or written to a log.
        group.MapPost("/password", Results<Ok<GeneratedPasswordResponse>, ProblemHttpResult> (GeneratePasswordRequest request) =>
            {
                var options = new PasswordOptions(
                    request.Length, request.Upper, request.Lower, request.Digits, request.Symbols, request.ExcludeLookalikes);

                if (options.Problem is { } problem)
                {
                    return TypedResults.Problem(statusCode: StatusCodes.Status400BadRequest,
                        title: "Invalid password options", detail: problem);
                }

                return TypedResults.Ok(new GeneratedPasswordResponse(SecretGenerator.GeneratePassword(options), options.PolicyWarning));
            })
            .WithName("GeneratePassword")
            .WithSummary("Generate a random password with the chosen length and character classes");

        return app;
    }
}
