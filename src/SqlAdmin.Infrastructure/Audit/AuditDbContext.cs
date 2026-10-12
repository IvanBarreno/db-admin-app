using Microsoft.EntityFrameworkCore;
using SqlAdmin.Core.Audit;

namespace SqlAdmin.Infrastructure.Audit;

public sealed class AuditDbContext(DbContextOptions<AuditDbContext> options) : DbContext(options)
{
    public DbSet<AuditEntry> AuditLog => Set<AuditEntry>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AuditEntry>(entity =>
        {
            entity.ToTable("audit_log");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.ExecutedBy).IsRequired();
            entity.Property(e => e.ServerName).IsRequired();
            entity.Property(e => e.Sql).IsRequired();
            entity.Property(e => e.Status).IsRequired();
            entity.HasIndex(e => e.ExecutedAtUtc);
            entity.HasMany(e => e.Steps).WithOne().HasForeignKey(s => s.AuditEntryId);
        });

        modelBuilder.Entity<AuditStep>(entity =>
        {
            entity.ToTable("audit_log_steps");
            entity.HasKey(s => s.Id);
            entity.Property(s => s.Action).IsRequired();
            entity.Property(s => s.Status).IsRequired();
            entity.HasIndex(s => s.AuditEntryId);
        });
    }
}
