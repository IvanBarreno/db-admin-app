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

    [Theory]
    [InlineData(12)]
    [InlineData(64)]
    [InlineData(128)]
    public void Requested_length_is_honoured_across_the_allowed_range(int length)
    {
        Assert.Equal(length, SecretGenerator.GeneratePassword(new PasswordOptions(Length: length)).Length);
    }

    [Fact]
    public void Too_long_length_is_rejected()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => SecretGenerator.GeneratePassword(new PasswordOptions(Length: 129)));
    }

    [Fact]
    public void Only_the_chosen_classes_appear_and_each_chosen_class_is_present()
    {
        for (var i = 0; i < 200; i++)
        {
            var pw = SecretGenerator.GeneratePassword(new PasswordOptions(Length: 16, Upper: true, Lower: false, Digits: true, Symbols: false));

            Assert.All(pw, c => Assert.True(char.IsUpper(c) || char.IsDigit(c)));
            Assert.Contains(pw, char.IsUpper);
            Assert.Contains(pw, char.IsDigit);
        }
    }

    [Fact]
    public void Lookalikes_can_be_allowed_but_quotes_and_backslash_never_are()
    {
        var seen = new HashSet<char>();
        for (var i = 0; i < 400; i++)
        {
            foreach (var c in SecretGenerator.GeneratePassword(new PasswordOptions(Length: 32, ExcludeLookalikes: false)))
                seen.Add(c);
        }

        Assert.Contains(seen, c => "0O1lI".Contains(c)); // allowed now
        Assert.DoesNotContain(seen, c => "'\"\\".Contains(c)); // never
    }

    [Fact]
    public void No_character_class_is_a_problem_and_fewer_than_three_classes_is_a_policy_warning()
    {
        Assert.NotNull(new PasswordOptions(Upper: false, Lower: false, Digits: false, Symbols: false).Problem);
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            SecretGenerator.GeneratePassword(new PasswordOptions(Upper: false, Lower: false, Digits: false, Symbols: false)));

        Assert.Null(new PasswordOptions().PolicyWarning);
        Assert.NotNull(new PasswordOptions(Symbols: false, Digits: false).PolicyWarning);
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

    // ---- generate_for_each: one password per item of a list parameter (bulk reset) -------------

    private static OperationDefinition BulkOp() => new()
    {
        Id = "changes.reset_passwords", Name = "x", Category = "changes",
        Scope = OperationScope.Server, Engines = ["sqlserver"], Sql = "SELECT 1;",
        Params =
        [
            new OperationParameter { Name = "logins", Type = OperationParameterType.String, Source = "logins", Multi = true },
            new OperationParameter { Name = "passwords", Type = OperationParameterType.Password, Required = false, GenerateForEach = "logins" },
        ],
    };

    /// <summary>What the script receives per login: {"p": password, "g": generated?}.</summary>
    private sealed record Sent(
        [property: System.Text.Json.Serialization.JsonPropertyName("p")] string Password,
        [property: System.Text.Json.Serialization.JsonPropertyName("g")] bool Generated);

    private static Dictionary<string, Sent> SentPasswords(IReadOnlyDictionary<string, string?> values) =>
        JsonSerializer.Deserialize<Dictionary<string, Sent>>(values["passwords"]!)!;

    [Fact]
    public void Each_item_of_the_list_gets_its_own_generated_password_when_none_is_typed()
    {
        var (values, generated) = OperationExecutor.ApplyGeneratedSecrets(
            BulkOp(), new Dictionary<string, string?> { ["logins"] = """["alice","bob"]""" });

        var perLogin = SentPasswords(values);
        Assert.Equal(["alice", "bob"], perLogin.Keys.Order());
        Assert.All(perLogin.Values, s => Assert.True(s.Generated && s.Password.Length >= 12));
        Assert.NotEqual(perLogin["alice"].Password, perLogin["bob"].Password);

        // Not in the "generated" dictionary: the script reports each password next to the login it was set for.
        Assert.Empty(generated);
    }

    [Fact]
    public void A_typed_password_is_kept_and_a_blank_one_is_generated()
    {
        var (values, _) = OperationExecutor.ApplyGeneratedSecrets(BulkOp(), new Dictionary<string, string?>
        {
            ["logins"] = """["alice","bob","carol"]""",
            ["passwords"] = """{"alice":"Chosen#By-DBA1","bob":""}""",
        });

        var perLogin = SentPasswords(values);
        Assert.Equal(new Sent("Chosen#By-DBA1", Generated: false), perLogin["alice"]);
        Assert.True(perLogin["bob"].Generated);   // blank = generate
        Assert.True(perLogin["carol"].Generated); // not mentioned = generate
    }

    [Fact]
    public void A_password_typed_for_a_login_that_is_no_longer_in_the_list_is_dropped()
    {
        var (values, _) = OperationExecutor.ApplyGeneratedSecrets(BulkOp(), new Dictionary<string, string?>
        {
            ["logins"] = """["alice"]""", ["passwords"] = """{"alice":"Chosen#By-DBA1","ghost":"Other#Pass1"}""",
        });

        Assert.Equal(["alice"], SentPasswords(values).Keys);
        Assert.DoesNotContain("Other#Pass1", values["passwords"]);
    }

    [Theory]
    [InlineData("""["not","an","object"]""")]
    [InlineData("not json at all")]
    public void A_per_item_password_value_that_is_not_a_json_object_is_rejected_without_echoing_it(string raw)
    {
        var values = new Dictionary<string, string?> { ["logins"] = """["alice"]""", ["passwords"] = raw };

        var ex = Assert.Throws<TemplateRenderException>(() => OperationExecutor.ValidatePerItemSecrets(BulkOp(), values));

        Assert.Contains("passwords", ex.Message);
        Assert.DoesNotContain(raw, ex.Message);
    }

    [Fact]
    public void A_typed_password_longer_than_sql_server_allows_is_rejected_naming_the_login_only()
    {
        var tooLong = new string('x', 129);
        var values = new Dictionary<string, string?>
        {
            ["logins"] = """["alice"]""", ["passwords"] = JsonSerializer.Serialize(new Dictionary<string, string> { ["alice"] = tooLong }),
        };

        var ex = Assert.Throws<TemplateRenderException>(() => OperationExecutor.ValidatePerItemSecrets(BulkOp(), values));

        Assert.Contains("'alice'", ex.Message);
        Assert.DoesNotContain(tooLong, ex.Message);
    }

    [Fact]
    public void Per_item_passwords_never_reach_the_audit_json()
    {
        var (values, _) = OperationExecutor.ApplyGeneratedSecrets(
            BulkOp(), new Dictionary<string, string?> { ["logins"] = """["alice"]""" });
        var secret = SentPasswords(values)["alice"].Password;

        var json = OperationExecutor.RedactedParametersJson(BulkOp(), values);

        Assert.DoesNotContain(secret, json);
        Assert.Contains("alice", json); // the list of logins IS recorded
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

    [Fact]
    public async Task Second_snapshot_in_the_same_second_gets_a_suffix_and_the_first_is_kept()
    {
        var op = new OperationDefinition
        {
            Id = "offboarding.snapshot", Name = "s", Category = "offboarding",
            Scope = OperationScope.Server, Engines = ["sqlserver"], Sql = "SELECT 1;", SaveSnapshot = true,
        };
        var values = new Dictionary<string, string?> { ["login_name"] = "bob" };
        var sameSecond = new DateTimeOffset(2026, 10, 19, 12, 30, 5, TimeSpan.Zero);

        // Same server, login and second; only the content differs (before / after a change).
        async Task<string> Write(string role) => await SnapshotWriter.WriteAsync(
            dir, "srv", op, values, [new ResultSet(0, ["server_role"], [new object?[] { role }])], sameSecond, CancellationToken.None);

        var first = await Write("sysadmin");
        var second = await Write("dbcreator");
        var third = await Write("public");

        Assert.EndsWith("bob-20261019-123005.json", first);
        Assert.EndsWith("bob-20261019-123005-2.json", second);
        Assert.EndsWith("bob-20261019-123005-3.json", third);
        Assert.Contains("sysadmin", await File.ReadAllTextAsync(first)); // the rollback reference was not overwritten
        Assert.Contains("dbcreator", await File.ReadAllTextAsync(second));
    }
}
