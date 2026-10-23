using Microsoft.Data.Sqlite;
using SqlAdmin.Core.Config;
using SqlAdmin.Core.Engines;
using SqlAdmin.Core.Operations;
using SqlAdmin.Infrastructure.Operations;

namespace SqlAdmin.Core.Tests;

/// <summary>
/// Protected principals: the app's own login (ORIGINAL_LOGIN()) plus the server's ProtectedLogins are view-only
/// for every operation that is not read-only. The test engine reports the connected login as "app_login".
/// </summary>
public sealed class ProtectedPrincipalsTests : IDisposable
{
    private readonly string _dir = Directory.CreateTempSubdirectory("sqladmin-protect-").FullName;
    private readonly SqliteConnection _db = new("Data Source=:memory:");

    public ProtectedPrincipalsTests() => _db.Open();

    public void Dispose()
    {
        _db.Dispose();
        Directory.Delete(_dir, recursive: true);
    }

    private OperationDefinition Load(string category, string paramsYaml, string extra = "")
    {
        File.WriteAllText(Path.Combine(_dir, "o.yaml"), $"""
            operations:
              - id: t.op
                name: "t"
                category: {category}
                scope: server
                engines: [sqlserver]
                {extra}
                params:
            {paramsYaml}
                sql: |
                  SELECT 1;
            """);
        return YamlOperationLoader.LoadFromDirectory(_dir).Single();
    }

    private const string LoginParam = """
              - name: login_name
                type: login
        """;

    private ServerConnection Connection(IEnumerable<string>? configured = null, Dictionary<string, string>? userLogins = null) =>
        new(new ServerDefinition
            {
                Name = "SRV", Host = "fake", Engine = "sqlserver", Auth = AuthMode.Windows,
                ProtectedLogins = configured?.ToList() ?? [],
            },
            new TestEngine(userLogins), new NonDisposingConnection(_db));

    private static Dictionary<string, string?> Values(params (string Key, string? Value)[] pairs) =>
        pairs.ToDictionary(p => p.Key, p => p.Value);

    // ---- ProtectedSet ------------------------------------------------------------------

    [Fact]
    public void Set_is_case_insensitive_and_explains_why()
    {
        var set = new ProtectedSet("app_login", ["Boss"]);

        Assert.True(set.Contains("APP_LOGIN"));
        Assert.True(set.Contains("boss"));
        Assert.False(set.Contains("alice"));
        Assert.False(set.Contains(null));
        Assert.Contains("connects with", set.Reason("app_login"));
        Assert.Contains("ProtectedLogins", set.Reason("Boss"));
    }

    // ---- TargetsOf (pure) --------------------------------------------------------------

    [Fact]
    public void Login_and_user_parameters_are_targets_but_blank_ones_are_not()
    {
        var op = Load("changes", LoginParam + "\n" + """
              - name: user_name
                type: user
                required: false
        """);

        var targets = ProtectedPrincipals.TargetsOf(op, Values(("login_name", " bob "), ("user_name", "")));

        var target = Assert.Single(targets);
        Assert.Equal(new ProtectedPrincipals.Target("login_name", "bob", IsUser: false), target);
    }

    [Fact]
    public void Items_of_a_login_list_are_targets()
    {
        var op = Load("changes", """
              - name: login_names
                type: sysname
                source: logins
                multi: true
        """);

        var targets = ProtectedPrincipals.TargetsOf(op, Values(("login_names", "[\"alice\",\"bob\"]")));

        Assert.Equal(["alice", "bob"], targets.Select(t => t.Name).Order());
    }

    [Fact]
    public void Parameter_with_protect_false_is_not_a_target()
    {
        var op = Load("changes", """
              - name: new_owner
                type: login
                protect: false
        """);

        Assert.Empty(ProtectedPrincipals.TargetsOf(op, Values(("new_owner", "app_login"))));
    }

    // ---- CheckAsync --------------------------------------------------------------------

    [Fact]
    public async Task App_login_is_refused_by_a_changing_operation()
    {
        var op = Load("changes", LoginParam);

        var result = Assert.Single(await ProtectedPrincipals.CheckAsync(
            op, Values(("login_name", "app_login")), Connection(), CancellationToken.None));

        Assert.False(result.Ok);
        Assert.True(result.Blocking);
        Assert.Equal("protected_principal", result.Id);
        Assert.Contains("[app_login]", result.Message);
    }

    [Fact]
    public async Task Configured_protected_login_is_refused()
    {
        var op = Load("changes", LoginParam);

        var result = Assert.Single(await ProtectedPrincipals.CheckAsync(
            op, Values(("login_name", "Boss")), Connection(configured: ["boss"]), CancellationToken.None));

        Assert.True(result.Blocking);
        Assert.Contains("ProtectedLogins", result.Message);
    }

    [Fact]
    public async Task Ordinary_login_passes()
    {
        var op = Load("changes", LoginParam);

        Assert.Empty(await ProtectedPrincipals.CheckAsync(
            op, Values(("login_name", "alice")), Connection(), CancellationToken.None));
    }

    [Fact]
    public async Task Audit_operations_may_look_at_a_protected_login()
    {
        var op = Load("audit", LoginParam);

        Assert.Empty(await ProtectedPrincipals.CheckAsync(
            op, Values(("login_name", "app_login")), Connection(), CancellationToken.None));
    }

    [Fact]
    public async Task Read_only_flag_exempts_a_non_audit_operation()
    {
        var op = Load("offboarding", LoginParam, extra: "read_only: true");

        Assert.Empty(await ProtectedPrincipals.CheckAsync(
            op, Values(("login_name", "app_login")), Connection(), CancellationToken.None));
    }

    [Fact]
    public async Task Protected_login_can_still_receive_ownership()
    {
        var op = Load("offboarding", """
              - name: new_owner
                type: login
                protect: false
        """);

        Assert.Empty(await ProtectedPrincipals.CheckAsync(
            op, Values(("new_owner", "app_login")), Connection(), CancellationToken.None));
    }

    [Fact]
    public async Task Protected_item_inside_a_list_is_refused_and_others_are_not()
    {
        var op = Load("changes", """
              - name: login_names
                type: sysname
                source: logins
                multi: true
        """);

        var result = Assert.Single(await ProtectedPrincipals.CheckAsync(
            op, Values(("login_names", "[\"alice\",\"app_login\"]")), Connection(), CancellationToken.None));

        Assert.Contains("[app_login]", result.Message);
    }

    [Fact]
    public async Task User_mapped_to_a_protected_login_is_refused()
    {
        var op = Load("changes", """
              - name: user_name
                type: user
        """);
        var conn = Connection(userLogins: new() { ["svc_user"] = "app_login" });

        var result = Assert.Single(await ProtectedPrincipals.CheckAsync(
            op, Values(("user_name", "svc_user")), conn, CancellationToken.None));

        Assert.Contains("User [svc_user] is mapped to [app_login]", result.Message);
    }

    [Fact]
    public async Task Unmapped_user_passes()
    {
        var op = Load("changes", """
              - name: user_name
                type: user
        """);

        Assert.Empty(await ProtectedPrincipals.CheckAsync(
            op, Values(("user_name", "svc_user")), Connection(), CancellationToken.None));
    }

    // ---- shipped catalog ---------------------------------------------------------------

    [Fact]
    public void Owner_receiving_parameters_in_the_shipped_catalog_are_not_protected()
    {
        var ops = YamlOperationLoader.LoadFromDirectory(OperationRegistryTests.ShippedOperationsDir());
        var owners = ops.SelectMany(o => o.Params.Select(p => (Op: o.Id, Param: p)))
            .Where(x => x.Param.Name is "new_owner" or "jobs_new_owner")
            .ToList();

        Assert.NotEmpty(owners);
        Assert.All(owners, x => Assert.False(x.Param.Protect, $"{x.Op}.{x.Param.Name} must allow a protected login to receive ownership"));
    }
}
