using SqlAdmin.Core.Engines;

namespace SqlAdmin.Engines.SqlServer;

/// <summary>
/// Azure SQL Database (the PaaS offering). Same driver and T-SQL as SQL Server, but:
/// no <c>USE</c> (one connection per database), no SQL Agent, no Windows auth,
/// and logins live only in master — contained database users are the norm.
/// </summary>
public sealed class AzureSqlEngine : SqlClientEngineBase
{
    public const string EngineId = "azuresql";

    public override string Id => EngineId;
    public override string DisplayName => "Azure SQL Database";

    // No SUSER_SNAME(sid) on Azure SQL: owner is simply unknown in the database picker.
    protected override string DatabaseOwnerExpression => "CAST(NULL AS nvarchar(128))";

    // No SID → login mapping inside an Azure SQL database (SUSER_SNAME(sid) is rejected): users are compared by name only.
    protected override string UserLoginSql => "SELECT CAST(NULL AS nvarchar(128)) WHERE @u IS NOT NULL;";

    public override EngineCapabilities Capabilities { get; } = new(
        SupportsUseDatabase: false,
        SupportsServerLogins: false,   // possible in master, but not the recommended model — revisit if needed
        SupportsWindowsAuth: false,
        SupportsAgentJobs: false,
        SupportsContainedUsers: true,
        SupportsBatchSeparator: true);
}
