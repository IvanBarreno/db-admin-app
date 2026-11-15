using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using SqlAdmin.Core.Config;

namespace SqlAdmin.Integration.Tests;

/// <summary>
/// Starts the real API (Program.cs, every service and endpoint) inside the test process.
/// <see cref="WebApplicationFactory{TEntryPoint}"/> swaps Kestrel for an in-memory server, so no port is
/// opened and <c>CreateClient()</c> returns an HttpClient wired
/// straight to the request pipeline. The content root is the API project folder, so the app reads the real
/// servers.json; the environment is "Development", so user-secrets (the SQL credentials) are loaded too.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    private readonly string _tempDir = Directory.CreateTempSubdirectory("sqladmin-it-").FullName;

    public ApiFactory()
    {
        // Program.cs reads these settings while it is still CONFIGURING services (before Build()), which is
        // earlier than the factory's own ConfigureWebHost hooks run for a minimal-API app. Environment
        // variables are read by the configuration system from the very start, so they are the reliable way
        // in. ("__" in an environment variable name is the ":" of a configuration key.)
        var api = ApiProjectDir();
        Environment.SetEnvironmentVariable("AuditDb__Path", Path.Combine(_tempDir, "audit.db")); // never the real audit log
        Environment.SetEnvironmentVariable("Operations__Directory", Path.Combine(api, "operations"));
        Environment.SetEnvironmentVariable("Lookups__Directory", Path.Combine(api, "lookups"));
    }

    /// <summary>Same JSON rules as the API: camelCase names, enums as their names.</summary>
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    public IServerCatalog Servers => Services.GetRequiredService<IServerCatalog>();

    /// <summary>POST a JSON body and return the raw response (status, headers, body) for the test to inspect.</summary>
    public static Task<HttpResponseMessage> PostAsync(HttpClient client, string url, object body) =>
        client.PostAsJsonAsync(url, body, Json);

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (!disposing) return;

        // SQLite keeps pooled connections open (and the file locked on Windows) until the pools are cleared.
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        try { Directory.Delete(_tempDir, recursive: true); }
        catch (IOException) { /* a leftover temp folder is not worth failing a test run */ }
    }

    // Walk up from the test binary to the repo root, then into the API project.
    private static string ApiProjectDir()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, "src", "SqlAdmin.Api");
            if (Directory.Exists(Path.Combine(candidate, "operations"))) return candidate;
        }
        throw new DirectoryNotFoundException("src/SqlAdmin.Api not found above the test binary.");
    }
}

/// <summary>
/// xUnit creates ONE <see cref="ApiFactory"/> for every test class marked <c>[Collection("api")]</c> and runs
/// those classes one after another: a single host, a single audit database, no parallel runs against the server.
/// </summary>
[CollectionDefinition("api")]
public sealed class ApiCollection : ICollectionFixture<ApiFactory>;

/// <summary>
/// A test that needs a real SQL Server. It is SKIPPED (not failed) unless the environment variable
/// <c>SQLADMIN_TEST_SERVER</c> names a server from servers.json — an explicit opt-in, because these tests
/// create and drop logins. xUnit reads <see cref="FactAttribute.Skip"/> when it discovers the test.
/// </summary>
public sealed class ServerFactAttribute : FactAttribute
{
    public const string Variable = "SQLADMIN_TEST_SERVER";

    public static string? ServerName =>
        Environment.GetEnvironmentVariable(Variable) is { Length: > 0 } name ? name : null;

    public ServerFactAttribute()
    {
        if (ServerName is null)
            Skip = $"Needs a real SQL Server: set {Variable} to a non-production server name from servers.json.";
    }
}
