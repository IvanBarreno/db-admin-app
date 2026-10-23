using System.Data.Common;
using Microsoft.Data.Sqlite;
using SqlAdmin.Core.Config;
using SqlAdmin.Core.Engines;
using SqlAdmin.Core.Operations;

namespace SqlAdmin.Core.Tests;

/// <summary>
/// Exercises <see cref="AllDatabasesExecutor"/> without a SQL Server: each "database" is a
/// named shared-cache in-memory SQLite database, and a fake engine/factory hands out
/// connections to them. The executor only sees the ADO.NET base classes, so this is a faithful
/// stand-in for the control flow (skip offline, continue after errors, union grids).
/// </summary>
public sealed class AllDatabasesExecutorTests : IDisposable
{
    private const string Query = "SELECT role, user_name FROM role_members WHERE user_name = @user_name;";

    // Shared-cache in-memory DBs vanish when the last connection closes; these keep them alive.
    private readonly List<SqliteConnection> _keepAlive = [];
    private readonly FakeFactory _factory;

    public AllDatabasesExecutorTests()
    {
        _factory = new FakeFactory(this);
    }

    public void Dispose() => _keepAlive.ForEach(c => c.Dispose());

    private static string ConnectionString(string db) => $"Data Source=file:{db}_{Guid.NewGuid():N}?mode=memory&cache=shared";

    // ---- helpers -----------------------------------------------------------------------

    private readonly Dictionary<string, string> _connectionStrings = [];

    /// <summary>Creates database <paramref name="name"/>; seeds <c>role_members</c> unless rows is null (=> query fails there).</summary>
    private void AddDatabase(string name, bool online = true, params (string Role, string User)[]? rows)
    {
        var cs = ConnectionString(name);
        _connectionStrings[name] = cs;
        _factory.Databases.Add(new DatabaseInfo(name, online ? "ONLINE" : "OFFLINE", null, online));

        var keep = new SqliteConnection(cs);
        keep.Open();
        _keepAlive.Add(keep);

        if (rows is null) return;
        using var create = keep.CreateCommand();
        create.CommandText = "CREATE TABLE role_members (role TEXT, user_name TEXT);";
        create.ExecuteNonQuery();
        foreach (var (role, user) in rows)
        {
            using var insert = keep.CreateCommand();
            insert.CommandText = "INSERT INTO role_members VALUES ($r, $u);";
            insert.Parameters.AddWithValue("$r", role);
            insert.Parameters.AddWithValue("$u", user);
            insert.ExecuteNonQuery();
        }
    }

    private static OperationDefinition Op() => new()
    {
        Id = "test.all",
        Name = "Test",
        Category = "test",
        Scope = OperationScope.AllDatabases,
        Engines = ["sqlserver"],
        Params = [new OperationParameter { Name = "user_name", Type = OperationParameterType.String, Required = true }],
        Sql = Query,
    };

    private static Dictionary<string, string?> Values(string user) => new() { ["user_name"] = user };

    private Task<AllDatabasesResult> Run(string user = "bob") =>
        AllDatabasesExecutor.ExecuteAsync(Op(), Values(user), "SRV", _factory, CancellationToken.None);

    // ---- tests -------------------------------------------------------------------------

    [Fact]
    public async Task Skips_databases_that_are_not_online()
    {
        AddDatabase("a", rows: [("db_owner", "bob")]);
        AddDatabase("b", online: false, rows: [("db_owner", "bob")]);

        var result = await Run();

        var step = Assert.Single(result.Steps);
        Assert.Equal("a", step.Database);
    }

    [Fact]
    public async Task Unions_rows_with_database_name_as_first_column()
    {
        AddDatabase("a", rows: [("db_datareader", "bob")]);
        AddDatabase("b", rows: [("db_owner", "bob"), ("db_datawriter", "bob")]);

        var result = await Run();

        var grid = Assert.Single(result.Combined.ResultSets);
        Assert.Equal(["database_name", "role", "user_name"], grid.Columns);
        Assert.Equal(3, grid.Rows.Count);
        Assert.Contains(grid.Rows, r => (string?)r[0] == "a" && (string?)r[1] == "db_datareader");
        Assert.Equal(2, grid.Rows.Count(r => (string?)r[0] == "b"));
        Assert.False(result.Combined.Failed);
    }

    [Fact]
    public async Task Parameter_value_filters_rows_in_every_database()
    {
        AddDatabase("a", rows: [("db_owner", "bob"), ("db_owner", "alice")]);

        var result = await Run("alice");

        var row = Assert.Single(Assert.Single(result.Combined.ResultSets).Rows);
        Assert.Equal("alice", row[2]);
    }

    [Fact]
    public async Task Failing_script_in_one_database_is_an_error_step_and_the_run_continues()
    {
        AddDatabase("good1", rows: [("db_owner", "bob")]);
        AddDatabase("broken", rows: null);            // no role_members table => "no such table"
        AddDatabase("good2", rows: [("db_owner", "bob")]);

        var result = await Run();

        Assert.Equal(["OK", "ERROR", "OK"], result.Steps.Select(s => s.Status));
        Assert.Contains("role_members", result.Steps[1].Message);
        Assert.Equal(2, result.Combined.ResultSets.Single().Rows.Count);
        Assert.True(result.Combined.Failed);
        Assert.Equal("1 of 3 databases failed.", result.Combined.Error);
    }

    [Fact]
    public async Task Connection_failure_is_an_error_step_and_the_run_continues()
    {
        AddDatabase("good", rows: [("db_owner", "bob")]);
        _factory.Databases.Add(new DatabaseInfo("unreachable", "ONLINE", null, true));

        var result = await Run();

        Assert.Equal("OK", result.Steps.Single(s => s.Database == "good").Status);
        var bad = result.Steps.Single(s => s.Database == "unreachable");
        Assert.Equal("ERROR", bad.Status);
        Assert.Equal("denied", bad.Message);
    }

    [Fact]
    public async Task Step_records_row_count_per_database()
    {
        AddDatabase("a", rows: [("r1", "bob"), ("r2", "bob")]);
        AddDatabase("b", rows: []);

        var result = await Run();

        Assert.Equal([2, 0], result.Steps.Select(s => s.RowCount));
    }

    private Task<AllDatabasesResult> RunLimitedTo(string? databasesJson)
    {
        var op = Op() with
        {
            Params =
            [
                .. Op().Params,
                new OperationParameter { Name = "databases", Type = OperationParameterType.String, Multi = true, Required = false },
            ],
        };
        var values = Values("bob");
        if (databasesJson is not null) values["databases"] = databasesJson;
        return AllDatabasesExecutor.ExecuteAsync(op, values, "SRV", _factory, CancellationToken.None);
    }

    [Fact]
    public async Task A_databases_list_limits_the_run_to_those_databases()
    {
        AddDatabase("a", rows: [("r1", "bob")]);
        AddDatabase("b", rows: [("r2", "bob")]);
        AddDatabase("c", rows: [("r3", "bob")]);

        var result = await RunLimitedTo("""["c","A"]""");

        Assert.Equal(["a", "c"], result.Steps.Select(s => s.Database).Order()); // case-insensitive match
    }

    [Theory]
    [InlineData(null)]
    [InlineData("[]")]
    public async Task No_databases_list_means_every_online_database(string? list)
    {
        AddDatabase("a", rows: []);
        AddDatabase("b", rows: []);

        Assert.Equal(2, (await RunLimitedTo(list)).Steps.Count);
    }

    [Fact]
    public async Task The_none_sentinel_visits_no_database()
    {
        AddDatabase("a", rows: []);

        Assert.Empty((await RunLimitedTo($"[\"{MultiValues.NoneSentinel}\"]")).Steps);
    }

    [Fact]
    public async Task Provider_messages_are_prefixed_with_the_database_name()
    {
        AddDatabase("a", rows: []);

        var result = await Run();

        Assert.Equal(["[a] hello"], result.Combined.Messages);
    }

    [Fact]
    public async Task Cancellation_propagates_instead_of_becoming_an_error_step()
    {
        AddDatabase("a", rows: []);
        using var cts = new CancellationTokenSource();
        await cts.CancelAsync();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            AllDatabasesExecutor.ExecuteAsync(Op(), Values("bob"), "SRV", _factory, cts.Token));
    }

    // ---- fakes -------------------------------------------------------------------------

    private sealed class FakeDialect : ISqlDialect
    {
        public string QuoteIdentifier(string identifier) => $"[{identifier}]";
        public string ParameterPrefix => "@";
        public string? BatchSeparator => "GO";
    }

    private sealed class FakeEngine : IDatabaseEngine
    {
        public string Id => "sqlserver";
        public string DisplayName => "Fake";
        public EngineCapabilities Capabilities => new(true, true, true, true, true, true);
        public ISqlDialect Dialect { get; } = new FakeDialect();
        public List<DatabaseInfo> Databases { get; } = [];

        public DbConnection CreateConnection(ServerDefinition server, ResolvedCredentials credentials, string? database) =>
            throw new NotSupportedException("The fake factory creates connections itself.");

        public Task<ServerInfo> TestAsync(DbConnection connection, CancellationToken ct) => throw new NotSupportedException();
        public Task<IReadOnlyList<DatabaseInfo>> ListDatabasesAsync(DbConnection connection, CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<DatabaseInfo>>(Databases.ToList());

        public Task<string?> GetConnectedLoginAsync(DbConnection connection, CancellationToken ct) => Task.FromResult<string?>("app_login");
        public Task<string?> GetUserLoginAsync(DbConnection connection, string userName, CancellationToken ct) => Task.FromResult<string?>(null);
        public bool IsPermissionError(DbException error) => false;

        // A real engine hooks SqlConnection.InfoMessage; the fake just emits one message up front.
        public IDisposable SubscribeToMessages(DbConnection connection, List<string> messages)
        {
            messages.Add("hello");
            return new NoopDisposable();
        }

        private sealed class NoopDisposable : IDisposable { public void Dispose() { } }
    }

    private sealed class FakeFactory(AllDatabasesExecutorTests owner) : IServerConnectionFactory
    {
        private readonly FakeEngine _engine = new();
        private readonly ServerDefinition _server = new()
        {
            Name = "SRV", Host = "fake", Engine = "sqlserver", Auth = AuthMode.Windows,
        };

        public List<DatabaseInfo> Databases => _engine.Databases;

        public async Task<ServerConnection> OpenAsync(string serverName, string? database, CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();

            // database == null is the executor's server-level connection used to list databases.
            var connectionString = database is null ? "Data Source=:memory:" : database == "unreachable"
                ? throw new InvalidOperationException("denied")
                : owner._connectionStrings[database];

            var connection = new SqliteConnection(connectionString);
            await connection.OpenAsync(ct);
            return new ServerConnection(_server, _engine, connection);
        }
    }
}
