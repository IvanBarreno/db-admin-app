using System.Text.Json;
using SqlAdmin.Core.Execution;
using SqlAdmin.Core.Operations;

namespace SqlAdmin.Core.Tests;

public class SecretGeneratorTests
{
    [Fact]
    public void Password_has_requested_length_and_all_character_classes()
    {
        for (var i = 0; i < 200; i++)
        {
            var pw = SecretGenerator.GeneratePassword(20);

            Assert.Equal(20, pw.Length);
            Assert.Contains(pw, char.IsUpper);
            Assert.Contains(pw, char.IsLower);
            Assert.Contains(pw, char.IsDigit);
            Assert.Contains(pw, c => !char.IsLetterOrDigit(c));
        }
    }

    [Fact]
    public void Password_never_contains_quotes_backslash_or_lookalikes()
    {
        for (var i = 0; i < 200; i++)
            Assert.DoesNotContain(SecretGenerator.GeneratePassword(), c => "'\"\\0O1lI".Contains(c));
    }

    [Fact]
    public void Passwords_differ_between_calls()
    {
        Assert.NotEqual(SecretGenerator.GeneratePassword(), SecretGenerator.GeneratePassword());
    }

    [Fact]
    public void Too_short_length_is_rejected()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => SecretGenerator.GeneratePassword(8));
    }
}

public class GeneratedSecretsAndRedactionTests
{
    private static OperationDefinition Op() => new()
    {
        Id = "provisioning.create_sql_login", Name = "x", Category = "provisioning",
        Scope = OperationScope.Server, Engines = ["sqlserver"], Sql = "SELECT 1;",
        Params =
        [
            new OperationParameter { Name = "login_name", Type = OperationParameterType.Login },
            new OperationParameter { Name = "password", Type = OperationParameterType.Password, Required = false, Generate = true },
        ],
    };

    [Fact]
    public void Blank_generate_password_is_filled_and_reported()
    {
        var (values, generated) = OperationExecutor.ApplyGeneratedSecrets(
            Op(), new Dictionary<string, string?> { ["login_name"] = "bob", ["password"] = "" });

        Assert.Equal(generated["password"], values["password"]);
        Assert.True(generated["password"].Length >= 12);
    }

    [Fact]
    public void Typed_password_is_kept_and_not_reported_as_generated()
    {
        var (values, generated) = OperationExecutor.ApplyGeneratedSecrets(
            Op(), new Dictionary<string, string?> { ["login_name"] = "bob", ["password"] = "MyOwn#Pass1" });

        Assert.Equal("MyOwn#Pass1", values["password"]);
        Assert.Empty(generated);
    }

    [Fact]
    public void Audit_json_redacts_password_values_and_omits_blanks()
    {
        var json = OperationExecutor.RedactedParametersJson(Op(), new Dictionary<string, string?>
        {
            ["login_name"] = "bob", ["password"] = "Sup3r#Secret", ["other"] = "",
        });

        Assert.DoesNotContain("Sup3r#Secret", json);
        var parsed = JsonSerializer.Deserialize<Dictionary<string, string>>(json)!;
        Assert.Equal("***", parsed["password"]);
        Assert.Equal("bob", parsed["login_name"]);
        Assert.False(parsed.ContainsKey("other"));
    }
}

public class SnapshotWriterTests : IDisposable
{
    private readonly string dir = Path.Combine(Path.GetTempPath(), "snap-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true);
    }

    [Fact]
    public async Task Writes_one_json_file_per_server_and_login_with_rows_keyed_by_column()
    {
        var op = new OperationDefinition
        {
            Id = "offboarding.snapshot", Name = "s", Category = "offboarding",
            Scope = OperationScope.Server, Engines = ["sqlserver"], Sql = "SELECT 1;", SaveSnapshot = true,
        };
        var rs = new ResultSet(0, ["server_role"], [new object?[] { "dbcreator" }]);

        var path = await SnapshotWriter.WriteAsync(
            dir, "DOM\\srv", op, new Dictionary<string, string?> { ["login_name"] = "DOM\\bob" },
            [rs], new DateTimeOffset(2026, 10, 19, 12, 30, 5, TimeSpan.Zero), CancellationToken.None);

        Assert.StartsWith(dir, path);
        Assert.EndsWith("DOM_bob-20261019-123005.json", path);
        Assert.Contains("DOM_srv", path); // backslash can't leak into the path

        using var doc = JsonDocument.Parse(await File.ReadAllTextAsync(path));
        var row = doc.RootElement.GetProperty("resultSets")[0].GetProperty("rows")[0];
        Assert.Equal("dbcreator", row.GetProperty("server_role").GetString());
        Assert.Equal("offboarding.snapshot", doc.RootElement.GetProperty("operation").GetString());
    }
}
