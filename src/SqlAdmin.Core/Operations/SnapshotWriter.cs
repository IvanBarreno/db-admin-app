using System.Text;
using System.Text.Json;
using SqlAdmin.Core.Execution;

namespace SqlAdmin.Core.Operations;

/// <summary>
/// Saves the result sets of a read-only "snapshot" operation (<c>save_snapshot: true</c> in YAML)
/// to <c>{baseDir}/{server}/{subject}-{yyyyMMdd-HHmmss}.json</c> — the rollback reference taken
/// before offboarding someone. Plain files on purpose: they survive even if the audit DB is lost.
/// </summary>
public static class SnapshotWriter
{
    private static readonly JsonSerializerOptions Json = new() { WriteIndented = true };

    /// <summary>Writes the file and returns its full path.</summary>
    public static async Task<string> WriteAsync(
        string baseDir,
        string serverName,
        OperationDefinition operation,
        IReadOnlyDictionary<string, string?> values,
        IReadOnlyList<ResultSet> resultSets,
        DateTimeOffset takenAtUtc,
        CancellationToken ct)
    {
        // The subject of the snapshot is the login (or user) it was taken for; fall back to the op id.
        var subject = values.GetValueOrDefault("login_name")
                      ?? values.GetValueOrDefault("user_name")
                      ?? operation.Id;

        var dir = Path.Combine(baseDir, SafeFileName(serverName));
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, $"{SafeFileName(subject)}-{takenAtUtc:yyyyMMdd-HHmmss}.json");

        var document = new
        {
            operation = operation.Id,
            server = serverName,
            takenAtUtc,
            parameters = values,
            resultSets = resultSets.Select(rs => new
            {
                columns = rs.Columns,
                // Each row as { column: value } so the file is readable without the column list.
                rows = rs.Rows.Select(row => rs.Columns
                    .Select((col, i) => (col, value: row[i]))
                    .ToDictionary(x => x.col, x => x.value)),
            }),
        };

        await File.WriteAllTextAsync(path, JsonSerializer.Serialize(document, Json), Encoding.UTF8, ct);
        return path;
    }

    // Server/login names can hold characters that are invalid in file names (e.g. DOMAIN\user).
    internal static string SafeFileName(string name)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var cleaned = new string(name.Select(c => invalid.Contains(c) || c == '\\' ? '_' : c).ToArray());
        return string.IsNullOrWhiteSpace(cleaned) ? "unnamed" : cleaned;
    }
}
