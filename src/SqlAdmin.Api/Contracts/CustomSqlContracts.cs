namespace SqlAdmin.Api.Contracts;

/// <summary>POST /api/custom-sql — free-form execution against a configured server.</summary>
public sealed record CustomSqlRequest(
    string ServerName,
    string? Database,
    string Sql);

/// <summary>
/// One result set per SELECT across the script's batches, plus provider messages
/// (PRINT / RAISERROR) and where execution stopped, if it did. A failed batch is a NORMAL
/// outcome of running arbitrary SQL, so this is returned with 200, not as an error —
/// same reasoning as <see cref="ConnectionTestResult"/>.
/// </summary>
public sealed record CustomSqlResult(
    bool Success,
    long ElapsedMs,
    IReadOnlyList<CustomSqlResultSet> ResultSets,
    IReadOnlyList<string> Messages,
    int? FailedBatchIndex,
    string? Error);

public sealed record CustomSqlResultSet(
    int BatchIndex,
    IReadOnlyList<string> Columns,
    IReadOnlyList<IReadOnlyList<object?>> Rows);
