using Microsoft.Extensions.DependencyInjection;
using SqlAdmin.Core.Engines;

namespace SqlAdmin.Engines.SqlServer;

public static class DependencyInjection
{
    /// <summary>
    /// Registers both SqlClient-based engines. Note they are registered against the SAME
    /// interface: DI keeps every registration, and <c>EngineRegistry</c> receives them all
    /// through <c>IEnumerable&lt;IDatabaseEngine&gt;</c>. A future engine project adds its own
    /// AddXxxEngine() and one line in Program.cs.
    /// </summary>
    public static IServiceCollection AddSqlServerEngines(this IServiceCollection services)
    {
        services.AddSingleton<IDatabaseEngine, SqlServerEngine>();
        services.AddSingleton<IDatabaseEngine, AzureSqlEngine>();
        return services;
    }
}
