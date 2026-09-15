namespace SqlAdmin.Core.Execution;

/// <summary>
/// Splits a SQL script into batches on a client-side separator line (T-SQL "GO"), the way
/// SSMS does it. The separator is never sent to the server — it isn't real T-SQL, it's a
/// convention every client-side tool agrees on.
/// </summary>
public static class BatchSplitter
{
    /// <summary>
    /// Splits <paramref name="script"/> on lines that contain only <paramref name="separator"/>
    /// (case-insensitive, surrounding whitespace allowed), ignoring occurrences inside
    /// single-quoted strings, bracketed identifiers, line comments and block comments.
    /// Empty batches are dropped. Returns the whole script as one batch when
    /// <paramref name="separator"/> is null (engines with no batch separator, e.g. none configured).
    /// </summary>
    public static IReadOnlyList<string> Split(string script, string? separator)
    {
        if (string.IsNullOrEmpty(separator))
        {
            return string.IsNullOrWhiteSpace(script) ? [] : [script];
        }

        var batches = new List<string>();
        var current = new System.Text.StringBuilder();
        var i = 0;
        var n = script.Length;

        while (i < n)
        {
            var c = script[i];

            // Single-quoted string: '' is an escaped quote, copy through untouched.
            if (c == '\'')
            {
                var start = i;
                i++;
                while (i < n)
                {
                    if (script[i] == '\'')
                    {
                        if (i + 1 < n && script[i + 1] == '\'') { i += 2; continue; }
                        i++;
                        break;
                    }
                    i++;
                }
                current.Append(script, start, i - start);
                continue;
            }

            // Bracketed identifier: ]] is an escaped bracket.
            if (c == '[')
            {
                var start = i;
                i++;
                while (i < n)
                {
                    if (script[i] == ']')
                    {
                        if (i + 1 < n && script[i + 1] == ']') { i += 2; continue; }
                        i++;
                        break;
                    }
                    i++;
                }
                current.Append(script, start, i - start);
                continue;
            }

            // Line comment.
            if (c == '-' && i + 1 < n && script[i + 1] == '-')
            {
                var start = i;
                while (i < n && script[i] != '\n') i++;
                current.Append(script, start, i - start);
                continue;
            }

            // Block comment (does not nest in T-SQL... actually it does, but that's an edge
            // case not worth the complexity here).
            if (c == '/' && i + 1 < n && script[i + 1] == '*')
            {
                var start = i;
                i += 2;
                while (i + 1 < n && !(script[i] == '*' && script[i + 1] == '/')) i++;
                i = Math.Min(i + 2, n);
                current.Append(script, start, i - start);
                continue;
            }

            // Start of a line: check whether it is (whitespace)* separator (whitespace)* (EOL|EOF).
            if (i == 0 || script[i - 1] == '\n')
            {
                var lineStart = i;
                var j = i;
                while (j < n && (script[j] == ' ' || script[j] == '\t')) j++;
                if (n - j >= separator.Length &&
                    string.Compare(script, j, separator, 0, separator.Length, StringComparison.OrdinalIgnoreCase) == 0)
                {
                    var k = j + separator.Length;
                    while (k < n && (script[k] == ' ' || script[k] == '\t' || script[k] == '\r')) k++;
                    if (k == n || script[k] == '\n')
                    {
                        batches.Add(current.ToString());
                        current.Clear();
                        i = k < n ? k + 1 : k; // skip the trailing '\n' too
                        continue;
                    }
                }
                i = lineStart;
            }

            current.Append(c);
            i++;
        }

        batches.Add(current.ToString());

        return batches
            .Select(b => b.Trim())
            .Where(b => b.Length > 0)
            .ToList();
    }
}
