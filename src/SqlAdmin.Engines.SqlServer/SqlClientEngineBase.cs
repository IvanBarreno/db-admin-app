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

    /// <summary>
    /// T-SQL expression that yields a database's owner name. SUSER_SNAME(owner_sid) maps the SID to a
    /// login name (NULL when unknown, e.g. after a restore). Azure SQL rejects SUSER_SNAME with an
    /// argument ("cannot be invoked with parameters in this version of SQL Server"), so it overrides this.
    /// </summary>
    protected virtual string DatabaseOwnerExpression => "SUSER_SNAME(owner_sid)";

    public async Task<IReadOnlyList<DatabaseInfo>> ListDatabasesAsync(DbConnection connection, CancellationToken ct)
    {
        // database_id 1-4 are master, tempdb, model, msdb.
        var sql = $"""
            SELECT name, state_desc, {DatabaseOwnerExpression} AS owner_name, state
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

    public async Task<string?> GetConnectedLoginAsync(DbConnection connection, CancellationToken ct)
    {
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT ORIGINAL_LOGIN();";
        return await cmd.ExecuteScalarAsync(ct) as string;
    }

    public async Task<string?> GetUserLoginAsync(DbConnection connection, string userName, CancellationToken ct)
    {
        // Azure SQL rejects SUSER_SNAME(sid) inside a user database, so look the SID up in master-level views only where they exist.
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = UserLoginSql;
        var p = cmd.CreateParameter();
        p.ParameterName = "@u";
        p.Value = userName;
        cmd.Parameters.Add(p);
        try
        {
            return await cmd.ExecuteScalarAsync(ct) as string;
        }
        catch (SqlException)
        {
            return null; // e.g. Azure: no server catalog in a user database; the name itself is still compared
        }
    }

    /// <summary>T-SQL that maps a database user (by SID) to its server login name.</summary>
    protected virtual string UserLoginSql =>
        "SELECT SUSER_SNAME(sid) FROM sys.database_principals WHERE name = @u AND type IN ('S', 'U', 'G');";

    // 229/230 = permission denied on object/column, 262 = on database, 297/300 = on server, 371/15151 = cannot
    // see the object, 916 = login cannot use the database.
    public bool IsPermissionError(DbException error) =>
        error is SqlException { Number: 229 or 230 or 262 or 297 or 300 or 371 or 916 or 15151 };

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
