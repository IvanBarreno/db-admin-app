using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;

namespace SqlAdmin.Integration.Tests;

/// <summary>
/// Every error the API returns must have ONE shape: RFC 7807 "problem details"
/// (<c>application/problem+json</c> with status / title / detail), because the frontend's ApiError reads
/// exactly those fields. These requests are all rejected BEFORE a connection is opened, so no SQL Server
/// is needed: they run everywhere.
/// </summary>
[Collection("api")]
public sealed class ProblemDetailsTests(ApiFactory factory)
{
    private readonly HttpClient _client = factory.CreateClient();

    // Any configured server will do: the request never reaches it.
    private string AnyServer => factory.Servers.All[0].Name;

    /// <summary>Asserts the status code AND the problem+json shape, and hands back the parsed body.</summary>
    private static async Task<ProblemDetails> AssertProblem(HttpResponseMessage response, HttpStatusCode expected)
    {
        Assert.Equal(expected, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>(ApiFactory.Json);
        Assert.NotNull(problem);
        Assert.Equal((int)expected, problem.Status);
        Assert.False(string.IsNullOrWhiteSpace(problem.Title));
        return problem;
    }

    [Fact]
    public async Task Ping_answers_so_the_host_really_started()
    {
        var response = await _client.GetAsync("/api/ping");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Unknown_api_route_is_a_404_problem_not_the_html_page()
    {
        var problem = await AssertProblem(await _client.GetAsync("/api/does-not-exist"), HttpStatusCode.NotFound);

        Assert.Equal(404, problem.Status);
    }

    [Fact]
    public async Task Listing_operations_for_an_unknown_server_is_a_404_with_the_name()
    {
        var problem = await AssertProblem(await _client.GetAsync("/api/operations?server=NOPE"), HttpStatusCode.NotFound);

        Assert.Equal("Server not found", problem.Title);
        Assert.Contains("NOPE", problem.Detail);
    }

    [Fact]
    public async Task Preview_of_an_unknown_operation_is_a_404_with_the_id()
    {
        var response = await ApiFactory.PostAsync(_client, "/api/operations/no.such_operation/preview",
            new { serverName = AnyServer, @params = new { } });

        var problem = await AssertProblem(response, HttpStatusCode.NotFound);
        Assert.Equal("Operation not found", problem.Title);
        Assert.Contains("no.such_operation", problem.Detail);
    }

    [Theory]
    [InlineData("preview")]
    [InlineData("execute")]
    public async Task Unknown_server_in_the_body_is_a_404(string action)
    {
        var response = await ApiFactory.PostAsync(_client, $"/api/operations/audit.login_status/{action}",
            new { serverName = "NOPE", @params = new { login_name = "sa" } });

        var problem = await AssertProblem(response, HttpStatusCode.NotFound);
        Assert.Equal("Server not found", problem.Title);
    }

    [Fact]
    public async Task Missing_required_parameter_is_a_400_naming_the_parameter()
    {
        var response = await ApiFactory.PostAsync(_client, "/api/operations/audit.login_status/preview",
            new { serverName = AnyServer, @params = new { } });

        var problem = await AssertProblem(response, HttpStatusCode.BadRequest);
        Assert.Equal("Invalid parameters", problem.Title);
        Assert.Contains("login_name", problem.Detail);
    }

    [Fact]
    public async Task Value_outside_the_declared_choices_is_a_400()
    {
        // Choices are concatenated into dynamic SQL, so anything not in the YAML list must be refused.
        var response = await ApiFactory.PostAsync(_client, "/api/operations/changes.set_login_enabled/preview",
            new { serverName = AnyServer, @params = new { login_name = "someone", action = "EXPLODE" } });

        var problem = await AssertProblem(response, HttpStatusCode.BadRequest);
        Assert.Equal("Invalid parameters", problem.Title);
        Assert.Contains("action", problem.Detail);
    }

    [Fact]
    public async Task Destructive_execute_without_a_confirm_token_is_a_428()
    {
        // The token check comes first, so nothing is sent to the server.
        var response = await ApiFactory.PostAsync(_client, "/api/operations/offboarding.drop_login/execute",
            new { serverName = AnyServer, @params = new { login_name = "zz_it_nobody" } });

        var problem = await AssertProblem(response, HttpStatusCode.PreconditionRequired);
        Assert.Equal("Confirmation required", problem.Title);
    }

    [Fact]
    public async Task Destructive_execute_with_a_made_up_token_is_a_428()
    {
        var response = await ApiFactory.PostAsync(_client, "/api/operations/offboarding.drop_login/execute",
            new { serverName = AnyServer, @params = new { login_name = "zz_it_nobody" }, confirmToken = "not-a-real-token" });

        await AssertProblem(response, HttpStatusCode.PreconditionRequired);
    }

    [Fact]
    public async Task Custom_sql_against_an_unknown_server_is_a_404()
    {
        var response = await ApiFactory.PostAsync(_client, "/api/custom-sql", new { serverName = "NOPE", sql = "SELECT 1;" });

        var problem = await AssertProblem(response, HttpStatusCode.NotFound);
        Assert.Equal("Server not found", problem.Title);
    }

    [Fact]
    public async Task Unknown_workflow_step_is_a_400()
    {
        var response = await ApiFactory.PostAsync(_client, "/api/workflows/offboarding.full/preview", new
        {
            serverName = AnyServer,
            @params = new { login_name = "zz_it_nobody", new_owner = "sa" },
            steps = new[] { "format_c" },
        });

        var problem = await AssertProblem(response, HttpStatusCode.BadRequest);
        Assert.Contains("format_c", problem.Detail);
    }
}
