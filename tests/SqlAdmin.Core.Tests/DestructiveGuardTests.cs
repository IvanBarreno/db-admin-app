using Microsoft.Extensions.Time.Testing;
using SqlAdmin.Core.Config;
using SqlAdmin.Core.Operations;

namespace SqlAdmin.Core.Tests;

public class DestructiveGuardTests
{
    private static readonly OperationDefinition Op = new()
    {
        Id = "offboarding.drop_login", Name = "Drop", Category = "offboarding",
        Scope = OperationScope.Server, Engines = ["sqlserver"], Destructive = true, Sql = "SELECT 1;",
    };

    private static ServerDefinition Server(ServerEnvironment env = ServerEnvironment.Development) => new()
    {
        Name = "SRV", Host = "h", Engine = "sqlserver", Auth = AuthMode.Windows, Environment = env,
    };

    private static Dictionary<string, string?> Values(string login = "bob") => new() { ["login_name"] = login };

    [Fact]
    public void Token_issued_for_a_request_validates_for_the_same_request()
    {
        var guard = new DestructiveGuard();
        var token = guard.IssueToken(Op, "SRV", "master", Values());

        guard.Validate(Op, Server(), "master", Values(), token, typedServerName: null); // no exception
    }

    [Fact]
    public void Missing_token_is_rejected()
    {
        var guard = new DestructiveGuard();
        Assert.Throws<ConfirmationRequiredException>(
            () => guard.Validate(Op, Server(), "master", Values(), confirmToken: null, typedServerName: null));
    }

    [Theory]
    [InlineData("alice", "master", "SRV")]   // different parameter value
    [InlineData("bob", "other", "SRV")]      // different database
    [InlineData("bob", "master", "OTHER")]   // different server
    public void Token_does_not_fit_a_changed_request(string login, string database, string server)
    {
        var guard = new DestructiveGuard();
        var token = guard.IssueToken(Op, "SRV", "master", Values());
        var serverDef = Server() with { Name = server };

        Assert.Throws<ConfirmationRequiredException>(
            () => guard.Validate(Op, serverDef, database, Values(login), token, typedServerName: null));
    }

    [Fact]
    public void Token_expires_after_lifetime()
    {
        var clock = new FakeTimeProvider(DateTimeOffset.UtcNow);
        var guard = new DestructiveGuard(clock);
        var token = guard.IssueToken(Op, "SRV", "master", Values());

        clock.Advance(DestructiveGuard.Lifetime + TimeSpan.FromSeconds(1));

        var ex = Assert.Throws<ConfirmationRequiredException>(
            () => guard.Validate(Op, Server(), "master", Values(), token, typedServerName: null));
        Assert.Contains("expired", ex.Message);
    }

    [Fact]
    public void Tampered_token_is_rejected()
    {
        var guard = new DestructiveGuard();
        var token = guard.IssueToken(Op, "SRV", "master", Values());
        // Push the expiry forward but keep the old signature.
        var forged = (long.Parse(token.Split('.')[0]) + 3600) + "." + token.Split('.', 2)[1];

        Assert.Throws<ConfirmationRequiredException>(
            () => guard.Validate(Op, Server(), "master", Values(), forged, typedServerName: null));
    }

    [Fact]
    public void Token_from_another_guard_instance_is_rejected()
    {
        // Each guard has its own random key, i.e. tokens die on restart.
        var token = new DestructiveGuard().IssueToken(Op, "SRV", "master", Values());

        Assert.Throws<ConfirmationRequiredException>(
            () => new DestructiveGuard().Validate(Op, Server(), "master", Values(), token, typedServerName: null));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("srv")]      // case matters
    [InlineData("WRONG")]
    public void Production_requires_the_exact_server_name_typed(string? typed)
    {
        var guard = new DestructiveGuard();
        var token = guard.IssueToken(Op, "SRV", "master", Values());

        Assert.Throws<ConfirmationRequiredException>(
            () => guard.Validate(Op, Server(ServerEnvironment.Production), "master", Values(), token, typed));
    }

    [Fact]
    public void Production_accepts_token_plus_typed_server_name()
    {
        var guard = new DestructiveGuard();
        var token = guard.IssueToken(Op, "SRV", "master", Values());

        guard.Validate(Op, Server(ServerEnvironment.Production), "master", Values(), token, "SRV");
    }

    [Fact]
    public void DestructiveWhen_only_requires_confirmation_for_listed_values()
    {
        var op = Op with
        {
            Destructive = false,
            DestructiveWhen = new DestructiveCondition("action", ["DROP"]),
        };

        Assert.True(op.RequiresConfirmation(new Dictionary<string, string?> { ["action"] = "drop" })); // case-insensitive
        Assert.False(op.RequiresConfirmation(new Dictionary<string, string?> { ["action"] = "ADD" }));
        Assert.False(op.RequiresConfirmation(new Dictionary<string, string?>()));
    }
}
