using Microsoft.Data.SqlClient;
using SqlAdmin.Core.Config;

namespace SqlAdmin.Engines.SqlServer;

/// <summary>
/// Translates a <see cref="ServerDefinition"/> + credentials into a SqlClient connection string.
/// Uses <see cref="SqlConnectionStringBuilder"/> rather than string concatenation so every
/// value is escaped correctly (a password containing ';' would otherwise break the string).
/// </summary>
public static class SqlConnectionStringFactory
{
    public const string ApplicationName = "SqlAdmin Console";

    public static string Build(ServerDefinition server, ResolvedCredentials credentials, string? database)
    {
        var b = new SqlConnectionStringBuilder
        {
            // "host,port" is SqlClient's syntax for an explicit port; without it the driver uses
            // 1433 or asks SQL Browser to resolve a named instance ("host\INSTANCE").
            DataSource = server.Port is { } port ? $"{server.Host},{port}" : server.Host,

            // Encrypt is an enum in SqlClient 5+: Mandatory / Optional / Strict (TDS 8).
            Encrypt = server.Encrypt ? SqlConnectionEncryptOption.Mandatory : SqlConnectionEncryptOption.Optional,
            TrustServerCertificate = server.TrustServerCertificate,

            // Shows up in sys.dm_exec_sessions.program_name — lets DBAs recognise the tool's sessions.
            ApplicationName = ApplicationName,

            // How long to wait for the TCP/TLS/login handshake (NOT for queries — that's CommandTimeout).
            ConnectTimeout = 15,

            // Connection pooling is on by default: closing a SqlConnection returns it to a pool keyed
            // by the exact connection string, so repeated requests to the same server are cheap.
        };

        // Explicit database wins, then the server's configured default, else the login's default.
        var initialCatalog = database ?? server.DefaultDatabase;
        if (!string.IsNullOrWhiteSpace(initialCatalog))
        {
            b.InitialCatalog = initialCatalog;
        }

        switch (server.Auth)
        {
            case AuthMode.Sql:
                b.UserID = credentials.Username ?? throw new InvalidOperationException("SQL auth requires a username.");
                b.Password = credentials.Password ?? throw new InvalidOperationException("SQL auth requires a password.");
                break;

            case AuthMode.Windows:
                // The OS identity of the process. Works on Windows (Kerberos/NTLM); on macOS/Linux
                // it needs a Kerberos ticket, which is out of scope for this tool.
                b.IntegratedSecurity = true;
                break;

            case AuthMode.EntraId:
                // "Default" walks a chain of credential sources: environment variables, managed
                // identity, Visual Studio, Azure CLI (`az login`), then an interactive browser
                // sign-in as the last resort. Good fit for a DBA workstation.
                b.Authentication = SqlAuthenticationMethod.ActiveDirectoryDefault;
                break;

            default:
                throw new ArgumentOutOfRangeException(nameof(server), server.Auth, "Unsupported auth mode.");
        }

        return b.ConnectionString;
    }
}
