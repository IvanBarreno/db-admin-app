using System.Data.Common;
using Microsoft.Data.SqlClient;
using SqlAdmin.Core.Config;
using SqlAdmin.Core.Engines;

namespace SqlAdmin.Engines.SqlServer;

/// <summary>
/// Everything SQL Server and Azure SQL have in common: the driver, the dialect, the
/// metadata queries. The two concrete engines only differ in id, display name and
/// capabilities — see <see cref="SqlServerEngine"/> and <see cref="AzureSqlEngine"/>.
/// </summary>
/// <remarks>
/// This is the "template method" shape: the base class implements the interface and leaves
/// a few abstract properties for subclasses to fill in.
/// </remarks>
public abstract class SqlClientEngineBase : IDatabaseEngine
{
    public abstract string Id { get; }
    public abstract string DisplayName { get; }
    public abstract EngineCapabilities Capabilities { get; }

    public ISqlDialect Dialect => TSqlDialect.Instance;

    public DbConnection CreateConnection(ServerDefinition server, ResolvedCredentials credentials, string? database)
    {
        var connectionString = SqlConnectionStringFactory.Build(server, credentials, database);
        return new SqlConnection(connectionString);
    }

    public async Task<ServerInfo> TestAsync(DbConnection connection, CancellationToken ct)
    {
        // SERVERPROPERTY works on both products. ORIGINAL_LOGIN() = the login that authenticated
        // (unaffected by EXECUTE AS). IS_SRVROLEMEMBER returns NULL on Azure SQL, hence the ISNULL.
        const string sql = """
            SELECT
                CAST(SERVERPROPERTY('ServerName')      AS nvarchar(256)) AS server_name,
                CAST(SERVERPROPERTY('ProductVersion')  AS nvarchar(128)) AS product_version,
                CAST(SERVERPROPERTY('Edition')         AS nvarchar(128)) AS edition,
                ORIGINAL_LOGIN()                                          AS login_name,
                DB_NAME()                                                 AS current_database,
                ISNULL(IS_SRVROLEMEMBER('sysadmin'), 0)                  AS is_sysadmin;
            """;

        await using var cmd = connection.CreateCommand();
        cmd.CommandText = sql;

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
        {
            throw new InvalidOperationException("Connection test query returned no rows.");
        }

        return new ServerInfo(
            ServerName: reader.GetString(0),
            Version: reader.GetString(1),
            Edition: reader.GetString(2),
            LoginName: reader.GetString(3),
            CurrentDatabase: reader.GetString(4),
            IsSysAdmin: reader.GetInt32(5) == 1);
    }

    public async Task<IReadOnlyList<DatabaseInfo>> ListDatabasesAsync(DbConnection connection, CancellationToken ct)
    {
        // database_id 1-4 are master, tempdb, model, msdb. SUSER_SNAME(owner_sid) maps the
        // owner SID to a login name (NULL when the SID is unknown, e.g. after a restore).
        const string sql = """
            SELECT name, state_desc, SUSER_SNAME(owner_sid) AS owner_name, state
            FROM sys.databases
            WHERE database_id > 4
            ORDER BY name;
            """;

        await using var cmd = connection.CreateCommand();
        cmd.CommandText = sql;

        var result = new List<DatabaseInfo>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            result.Add(new DatabaseInfo(
                Name: reader.GetString(0),
                State: reader.GetString(1),
                Owner: reader.IsDBNull(2) ? null : reader.GetString(2),
                IsOnline: reader.GetByte(3) == 0)); // sys.databases.state: 0 = ONLINE
        }

        return result;
    }

    public IDisposable SubscribeToMessages(DbConnection connection, List<string> messages)
    {
        var sqlConnection = (SqlConnection)connection;
        void Handler(object? sender, SqlInfoMessageEventArgs e) => messages.Add(e.Message);
        sqlConnection.InfoMessage += Handler;
        return new Unsubscriber(() => sqlConnection.InfoMessage -= Handler);
    }

    private sealed class Unsubscriber(Action unsubscribe) : IDisposable
    {
        public void Dispose() => unsubscribe();
    }
}
