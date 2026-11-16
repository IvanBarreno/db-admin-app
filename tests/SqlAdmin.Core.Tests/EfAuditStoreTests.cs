using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SqlAdmin.Core.Audit;
using SqlAdmin.Infrastructure.Audit;

namespace SqlAdmin.Core.Tests;

/// <summary>
/// <see cref="EfAuditStore"/> against in-memory SQLite, created from the real migrations
/// (<c>Migrate()</c>), so these tests also prove the migration chain produces a usable schema.
/// </summary>
public sealed class EfAuditStoreTests : IDisposable
{
    // An in-memory SQLite database lives only as long as its connection, so keep one open.
    private readonly SqliteConnection _connection = new("Data Source=:memory:");
    private readonly AuditDbContext _db;
    private readonly EfAuditStore _store;

    public EfAuditStoreTests()
    {
        _connection.Open();
        _db = new AuditDbContext(new DbContextOptionsBuilder<AuditDbContext>().UseSqlite(_connection).Options);
        _db.Database.Migrate();
        _store = new EfAuditStore(_db);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    private static AuditEntry Entry(string user = "ana", string server = "S1", string status = "Success", params AuditStep[] steps) => new()
    {
        ExecutedAtUtc = DateTimeOffset.UtcNow,
        ExecutedBy = user,
        ServerName = server,
        Sql = "SELECT 1",
        Status = status,
        Steps = [.. steps],
    };

    private static AuditStep Step(int no, string db, string status = "OK") => new()
    {
        StepNo = no,
        Database = db,
        Action = "audit.test",
        Status = status,
        RowsAffected = no,
        ExecutedAtUtc = DateTimeOffset.UtcNow,
    };

    [Fact]
    public async Task Entry_and_steps_are_saved_together()
    {
        var entry = Entry(steps: [Step(1, "a"), Step(2, "b", "ERROR")]);

        await _store.RecordAsync(entry, CancellationToken.None);

        Assert.True(entry.Id > 0);
        var steps = await _store.GetStepsAsync(entry.Id, CancellationToken.None);
        Assert.Equal(2, steps.Count);
        Assert.All(steps, s => Assert.Equal(entry.Id, s.AuditEntryId));
    }

    [Fact]
    public async Task Steps_come_back_ordered_by_step_number_whatever_the_insert_order()
    {
        var entry = Entry(steps: [Step(3, "c"), Step(1, "a"), Step(2, "b")]);
        await _store.RecordAsync(entry, CancellationToken.None);

        var steps = await _store.GetStepsAsync(entry.Id, CancellationToken.None);

        Assert.Equal(["a", "b", "c"], steps.Select(s => s.Database));
    }

    [Fact]
    public async Task Steps_of_one_entry_do_not_leak_into_another()
    {
        var first = Entry(steps: [Step(1, "a")]);
        var second = Entry(steps: [Step(1, "x"), Step(2, "y")]);
        await _store.RecordAsync(first, CancellationToken.None);
        await _store.RecordAsync(second, CancellationToken.None);

        Assert.Single(await _store.GetStepsAsync(first.Id, CancellationToken.None));
        Assert.Equal(2, (await _store.GetStepsAsync(second.Id, CancellationToken.None)).Count);
    }

    [Fact]
    public async Task Unknown_entry_id_returns_empty()
    {
        Assert.Empty(await _store.GetStepsAsync(9999, CancellationToken.None));
    }

    [Fact]
    public async Task Entry_without_steps_has_none()
    {
        var entry = Entry();
        await _store.RecordAsync(entry, CancellationToken.None);

        Assert.Empty(await _store.GetStepsAsync(entry.Id, CancellationToken.None));
    }

    [Fact]
    public async Task Query_returns_newest_first_and_filters()
    {
        await _store.RecordAsync(Entry("ana", "S1", "Success"), CancellationToken.None);
        await _store.RecordAsync(Entry("bob", "S2", "Failed"), CancellationToken.None);
        await _store.RecordAsync(Entry("ana", "S2", "Success"), CancellationToken.None);

        var all = await _store.QueryAsync(new AuditQuery(), CancellationToken.None);
        Assert.Equal(["S2", "S2", "S1"], all.Select(e => e.ServerName));

        var anaOnS2 = await _store.QueryAsync(new AuditQuery(ExecutedBy: "ana", ServerName: "S2"), CancellationToken.None);
        Assert.Single(anaOnS2);

        var failed = await _store.QueryAsync(new AuditQuery(Status: "Failed"), CancellationToken.None);
        Assert.Equal("bob", Assert.Single(failed).ExecutedBy);
    }

    [Fact]
    public async Task Query_does_not_load_steps()
    {
        await _store.RecordAsync(Entry(steps: [Step(1, "a")]), CancellationToken.None);

        var loaded = Assert.Single(await _store.QueryAsync(new AuditQuery(), CancellationToken.None));

        Assert.Empty(loaded.Steps);
    }
}
