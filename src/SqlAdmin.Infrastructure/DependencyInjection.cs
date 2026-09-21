using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using SqlAdmin.Core.Audit;
using SqlAdmin.Core.Config;
using SqlAdmin.Core.Engines;
using SqlAdmin.Infrastructure.Audit;
using SqlAdmin.Infrastructure.Config;
using SqlAdmin.Infrastructure.Engines;

namespace SqlAdmin.Infrastructure;

/// <summary>
/// One extension method that registers everything this project provides, so Program.cs
/// says <c>builder.Services.AddSqlAdminInfrastructure(builder.Configuration)</c> and never
/// needs to know the concrete class names.
/// </summary>
public static class DependencyInjection
{
    public static IServiceCollection AddSqlAdminInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        // --- Configuration: bind "Servers" section → ServersOptions, validate at startup ---
        services.AddOptions<ServersOptions>()
            .Bind(configuration.GetSection(ServersOptions.SectionName))
            .ValidateOnStart(); // run every IValidateOptions<ServersOptions> before the app starts serving
        services.AddSingleton<IValidateOptions<ServersOptions>, ServersOptionsValidator>();

        // --- Core contracts → Infrastructure implementations ---
        // Singleton: created once, shared for the life of the process. Correct for stateless
        // services and for caches built at startup (the catalog, the engine registry).
        services.AddSingleton<IServerCatalog, ServerCatalog>();
        services.AddSingleton<ISecretResolver, ConfigurationSecretResolver>();
        services.AddSingleton<IEngineRegistry, EngineRegistry>();
        services.AddSingleton<IServerConnectionFactory, ServerConnectionFactory>();

        // --- Audit log: SQLite next to the exe, one file, append-only ---
        var auditDbPath = configuration["AuditDb:Path"] ?? "audit.db";
        services.AddDbContext<AuditDbContext>(options => options.UseSqlite($"Data Source={auditDbPath}"));
        services.AddScoped<IAuditStore, EfAuditStore>();

        return services;
    }
}
