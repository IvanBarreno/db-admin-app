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
        var baseName = $"{SafeFileName(subject)}-{takenAtUtc:yyyyMMdd-HHmmss}";

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

        var json = JsonSerializer.Serialize(document, Json);

        // A snapshot is rollback insurance, so an existing file is NEVER overwritten. Two runs for the same
        // login in the same second get "name.json" and "name-2.json". FileMode.CreateNew makes the "does it
        // exist?" test and the creation one atomic step: it throws IOException if the file is already there,
        // which is safe even when two runs race (a File.Exists check followed by a write would not be).
        for (var attempt = 1; ; attempt++)
        {
            var path = Path.Combine(dir, attempt == 1 ? $"{baseName}.json" : $"{baseName}-{attempt}.json");
            try
            {
                // "await using" disposes (flushes + closes) the stream asynchronously at the end of the block.
                await using var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None);
                await using var writer = new StreamWriter(stream, new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
                await writer.WriteAsync(json.AsMemory(), ct);
                return path;
            }
            catch (IOException) when (File.Exists(path) && attempt < 100)
            {
                // Name taken by an earlier snapshot: try the next suffix. Any other I/O error (disk full,
                // no permission) does not match this filter and reaches the caller.
            }
        }
    }

    // Server/login names can hold characters that are invalid in file names (e.g. DOMAIN\user).
    internal static string SafeFileName(string name)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var cleaned = new string(name.Select(c => invalid.Contains(c) || c == '\\' ? '_' : c).ToArray());
        return string.IsNullOrWhiteSpace(cleaned) ? "unnamed" : cleaned;
    }
}
