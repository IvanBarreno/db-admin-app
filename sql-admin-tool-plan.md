# SQL Server User & DB Admin Console — Project Plan (.NET edition)

A small internal application to run your day-to-day SQL Server administration tasks (the operations in `Users-admin-commands.sql` and more) against a configured list of servers, with parameterized execution, SQL preview, and a free-form query box.

This project has two goals: **solve a real management need** and **learn modern .NET**. The plan is written so each phase teaches one or two .NET concepts while shipping something you can use the same week.

Design priorities, in order:
1. Safe by default (preview before execute, audit everything, guard destructive operations).
2. Easy to extend with new operations without touching the core.
3. Ready for Azure SQL and, later, other engines, without a rewrite.

---

## 1. What the app does (core concept)

Every task becomes a registered **operation**: a parameterized T-SQL template (or a small C# class for complex flows) plus metadata (name, scope, parameters, supported engines, whether it's destructive). The flow for any operation is always the same:

1. Pick a **server** (from config) and, for database-level operations, a **database** (fetched live from the server).
2. Fill in **parameters** (e.g., login name, target role, new owner).
3. **Preview** the exact SQL that will run — nothing executes blind.
4. **Execute** and see results in a grid, with everything written to an audit log.
5. Destructive operations require an extra typed confirmation and automatically snapshot the current permissions first, so you always have a rollback reference.

Adding an operation = adding one YAML file (or one C# class for multi-step logic). No core changes.

---

## 2. Operation catalog (v1)

Derived directly from your SQL file, grouped by scope and risk.

### Audit / read-only (server level)
- Login exists + status (enabled/disabled, type, create date)
- Explicit server permissions for a login
- Server role memberships for a login
- Sysadmin role members report
- Active sessions for a login
- Jobs owned by a login
- Databases owned by a login
- Error log search (e.g., failed logins for a user)

### Audit / read-only (database level)
- User exists in a DB / user mapped to a login
- Explicit database permissions for a user
- Database role memberships (single DB or **all online DBs** — your cursor script)
- Effective permissions test via `EXECUTE AS` + `fn_my_permissions` + `REVERT`
- Schema and object ownership report
- Orphaned users report (users with no matching login SID)

### Provisioning
- Create SQL login (with generated strong password option)
- Create Windows/AD login (`FROM WINDOWS`)
- Create or remap user in a single DB
- **Create/remap user in all online DBs + add to selected roles** (your big script, with role selection: datareader/datawriter/execute/custom)
- Grant common permission bundles: read-only, read-write, execute, developer (VIEW DEFINITION + EXECUTE + CREATE PROCEDURE + ALTER ON SCHEMA)

### Changes
- Reset login password
- Rename database user
- Enable / disable login
- Grant/revoke a specific permission (CONNECT SQL, VIEW ANY DATABASE, etc.)
- Add/remove server or database role membership
- Fix orphaned user (remap by SID)

### Offboarding (destructive — guarded)
Ordered as a guided checklist, each step optional:
1. Snapshot full permission report (auto, saved to file — your rollback insurance)
2. Disable login
3. Kill active sessions
4. Reassign owned SQL Agent jobs to another login
5. Reassign owned databases to another login
6. Revoke explicit server permissions + remove server roles
7. Drop users in all DBs (with schema-ownership fix first — as in your script)
8. Drop login

### Suggested additions (v1.5+)
- **Clone permissions**: copy one login/user's full permission set to a new one
- **Permission diff**: same login across two servers, or two logins on one server
- Password expiry / policy report
- DB inventory: size, state, recovery model, owner, compatibility level
- AD group members that have access (via `xp_logininfo`)
- Export any report to CSV/Excel
- **Azure SQL**: contained users, Entra ID logins, elastic-pool inventory (see §4c)

---

## 3. Configuration design

.NET has a strong built-in configuration system (the *Options pattern*), so the plan uses it instead of a hand-rolled YAML loader. Three layers, merged in order:

1. `servers.json` — committed, shared with the team, **no secrets**.
2. `servers.local.json` — git-ignored, personal overrides (auth mode, tags, extra dev servers).
3. Secrets — from environment variables, `dotnet user-secrets` (dev), or Windows Credential Manager. Never in JSON files.

```jsonc
// servers.json  (committed)
{
  "Servers": {
    "Defaults": {
      "Engine": "sqlserver",          // sqlserver | azuresql  (later: postgres, ...)
      "Encrypt": true,
      "TrustServerCertificate": true, // internal servers without proper certs
      "CommandTimeoutSeconds": 30
    },
    "Items": [
      {
        "Name": "PROD-IVR",
        "Host": "10.50.28.94",
        "Port": 1433,
        "Auth": "Sql",                     // Sql | Windows | EntraId
        "UsernameSecret": "PROD_IVR_USER", // secret *names*, never values
        "PasswordSecret": "PROD_IVR_PASS",
        "Environment": "Production",       // drives red banner + stricter confirmations
        "Tags": [ "ivr", "eegsa" ]
      },
      {
        "Name": "DEV-LOCAL",
        "Host": "localhost\\SQLEXPRESS",
        "Auth": "Windows",                 // Integrated Security — no credentials needed
        "Environment": "Development"
      },
      {
        "Name": "AZ-REPORTING",
        "Engine": "azuresql",
        "Host": "myserver.database.windows.net",
        "Auth": "EntraId",                 // Authentication=Active Directory Default/Interactive
        "Environment": "Production"
      }
    ]
  }
}
```

```jsonc
// servers.local.json  (git-ignored; only overrides, matched by Name)
{
  "Servers": {
    "Items": [
      { "Name": "PROD-IVR", "Auth": "Windows" }   // I use my AD account here; shared default is Sql
    ]
  }
}
```

Rules:
- **No passwords in any JSON file, ever.** Only secret names. The `ISecretResolver` looks them up in environment variables first, then user-secrets (dev), then Windows Credential Manager if enabled.
- **Mixed auth across the team:** the shared file defines each server's *default* auth mode; the local file lets each DBA override per server. The server list itself stays centrally managed.
- Config classes are validated at startup (`ValidateDataAnnotations().ValidateOnStart()`), so a typo in `servers.json` fails fast with a clear message instead of a runtime surprise.
- The `Environment` field controls UI safety: production servers get a visible banner and destructive ops require typing the server name to confirm.
- Each DBA connects with **personal credentials** (own Windows/Entra account or own SQL login), so SQL Server's own audit shows the real person — see §3b.

Why JSON and not YAML here: `appsettings`-style JSON plugs straight into `IConfiguration`, `IOptions<T>`, validation, and environment overrides. Operations (§5) stay in YAML because multi-line SQL is unreadable in JSON.

---

## 3b. Team deployment & accountability (2–5 DBAs)

### Deployment model: local-per-DBA first, central later

**A. Local-per-DBA (recommended start)** — the tool ships as a **single self-contained `.exe`** (`dotnet publish` with `PublishSingleFile`). Each DBA unzips a release folder (exe + `servers.json` + `operations/`), double-clicks it, and the browser opens on `http://127.0.0.1:5000`.
- No runtime, no Python, no Node, no ODBC driver on the DBA's machine. `Microsoft.Data.SqlClient` is bundled.
- `servers.json` is shared via the repo/release, so the server list stays consistent.
- Windows authentication "just works" per person, because each instance runs under that DBA's Windows session.
- Updates = drop in a new release zip (or `git pull` + `dotnet run` for those who have the SDK).

**B. Central server** — one instance on a VM (or as a Windows Service), everyone uses a browser. Cleaner UX, but: Windows auth per user needs Kerberos delegation, the API needs its own authentication layer (Windows auth via Negotiate, or Entra ID), and it becomes infrastructure to patch. Worth doing only if the team grows or non-DBAs need read-only access — revisit in Phase 6.

### Accountability: personal credentials, not a shared service account
Each DBA connects with their own SQL login or Windows/Entra account, **not** a shared `admin_tool` login. SQL Server's logs and the app's audit trail then both show the real person behind every change.

### Audit log: SQLite first, portable by design
Start with a local SQLite file per DBA (`audit.db` next to the exe) — zero setup. The audit store is written against **EF Core**, so migrating to SQL Server later is a provider swap (`UseSqlite` → `UseSqlServer`) plus a one-time copy command, not a rewrite.

```csharp
// Program.cs — provider chosen by config
var auditProvider = builder.Configuration["Audit:Provider"] ?? "sqlite";
builder.Services.AddDbContext<AuditDbContext>(o => auditProvider switch
{
    "sqlserver" => o.UseSqlServer(builder.Configuration.GetConnectionString("Audit")),
    _           => o.UseSqlite(builder.Configuration.GetConnectionString("Audit") ?? "Data Source=audit.db")
});
```

Schema (identical in SQLite and SQL Server; keep types portable):

```sql
CREATE TABLE audit_log (
    id            INTEGER PRIMARY KEY,          -- IDENTITY on SQL Server
    executed_at   TEXT    NOT NULL,             -- UTC ISO-8601
    executed_by   TEXT    NOT NULL,             -- Windows user / SQL login used
    machine       TEXT    NOT NULL,
    target_server TEXT    NOT NULL,
    target_engine TEXT    NOT NULL,             -- sqlserver | azuresql | ...
    target_db     TEXT,
    operation     TEXT    NOT NULL,             -- registry id or 'custom_sql'
    parameters    TEXT,                         -- JSON, secrets redacted
    generated_sql TEXT    NOT NULL,
    status        TEXT    NOT NULL,             -- OK | ERROR | CANCELLED
    detail        TEXT                          -- row counts / error message
);

CREATE TABLE audit_log_steps (
    id            INTEGER PRIMARY KEY,
    audit_log_id  INTEGER NOT NULL REFERENCES audit_log(id),
    step_no       INTEGER NOT NULL,
    target_db     TEXT,                         -- which DB this step ran in
    action        TEXT    NOT NULL,             -- e.g. 'CREATE USER', 'ADD db_datareader'
    status        TEXT    NOT NULL,             -- OK | SKIPPED | ERROR
    rows_affected INTEGER,
    message       TEXT,                         -- error text or notes
    executed_at   TEXT    NOT NULL
);
```

The UI shows steps as an expandable log under each run ("47 databases: 45 OK, 1 skipped, 1 error — click to see which"), and the Audit Log page filters history by login name, server, operation, or status.

Known trade-off while on SQLite: history is per-machine. When a team-wide feed matters, point the audit connection at a small shared DB and run the `import-audit` command to merge the old files.

### Concurrency
For a 5-person team, full locking is overkill. Destructive operations re-check preconditions immediately before executing (e.g., "login still exists and has N sessions") rather than trusting a stale screen.

---

## 4. Technology choices

Target: runs on a Windows machine, connects to multiple SQL Servers (and Azure SQL), supports Windows/Entra auth, easy to extend, good learning vehicle.

### Stack: ASP.NET Core Minimal APIs + React frontend

| Layer | Choice | Why |
|---|---|---|
| Runtime | **.NET 10 (LTS)** | Supported until Nov 2028. .NET 8 works too if your company pins it; nothing here needs 10-only features. |
| API style | **Minimal APIs** with endpoint groups | The modern default; less ceremony than controllers, still fully typed. One file per resource. |
| DB access (operations) | **Microsoft.Data.SqlClient** via raw ADO.NET (`DbConnection`/`DbDataReader`) | Official driver. Integrated auth, Entra ID auth, multiple result sets, `PRINT` messages (`InfoMessage`), per-statement row counts. No ODBC install. ADO.NET abstractions (`DbProviderFactory`) are what make other engines pluggable later. |
| DB access (audit log) | **EF Core** + SQLite provider | Learn the ORM on a small, well-bounded schema; swap provider later. |
| Operation definitions | **YAML** via `YamlDotNet` (+ C# classes for complex flows) | Multi-line SQL stays readable; discovered at startup. |
| Config | `IConfiguration` + **Options pattern** with validation | Built in; layered JSON + env vars + user-secrets. |
| API docs | Built-in **OpenAPI** (`AddOpenApi`) + **Scalar** UI at `/scalar` | Free typed docs. The frontend generates TypeScript types from the OpenAPI JSON (`openapi-typescript`), so API and UI never drift. |
| Errors | **ProblemDetails** (RFC 7807) | One error shape for the frontend to handle. |
| Logging | Built-in `ILogger` + **Serilog** to rolling file | Structured logs next to the exe; audit log is separate and append-only. |
| Frontend | **React 18 + Vite + Tailwind CSS** | Unchanged from the original plan. |
| FE data layer | **TanStack Query** + `react-router` | Caching/refetching of API calls, clean loading/error states. |
| Tests | **xUnit** + `Testcontainers.MsSql` (integration) | Unit tests for template rendering, batch splitting, registry; integration tests against a throwaway SQL Server in Docker on the dev machine only. |
| Packaging | `dotnet publish` single-file self-contained; Vite build copied to `wwwroot/` at publish | One exe; DBAs need nothing installed. |

### Prerequisites (dev machine)
- **.NET 10 SDK**
- **Node.js 22 LTS** + npm (frontend build tooling only)
- **VS Code + C# Dev Kit** (or Visual Studio 2022/2026 Community)
- **Git**
- A SQL Server to develop against: SQL Server Developer Edition, LocalDB, or Docker (`mcr.microsoft.com/mssql/server:2022-latest`)
- Optional: Docker Desktop for integration tests

### Dev workflow (two terminals)
```
# terminal 1 — backend on http://127.0.0.1:5000 with hot reload
cd src/SqlAdmin.Api && dotnet watch run

# terminal 2 — frontend on :5173, proxying /api to :5000
cd frontend && npm run dev
```
Vite's dev proxy forwards `/api/*` and `/openapi/*` to `localhost:5000`, so no CORS in development; in production the API serves the built frontend from `wwwroot/` (same origin, no CORS either).

### Why not the alternatives
- **Controllers (MVC-style)**: fine, but more boilerplate for the same result. Minimal APIs teach the same DI/routing/filters concepts with less noise. Easy to switch later.
- **Dapper for operations**: Dapper maps rows to classes, but operation results are *dynamic* grids with unknown columns and multiple result sets. Raw `DbDataReader` is the right tool; Dapper adds nothing here.
- **EF Core for operations**: an ORM is the wrong shape for "run arbitrary T-SQL and show whatever comes back." It's used only for the audit log, where the schema is ours.
- **Blazor for the frontend**: a legitimate all-C# option, but you already want React/Vite/Tailwind, and keeping the UI framework-agnostic behind a REST API is the better long-term shape.
- **Docker for the app itself**: no, for now. Linux containers can't use your logged-in Windows identity. Revisit only with a central deployment where all servers use SQL/Entra auth.

### 4c. Multi-engine strategy (Azure SQL now, others later)

The core never talks to `SqlConnection` directly. It talks to an `IDatabaseEngine` resolved by the server's `Engine` field:

```csharp
public interface IDatabaseEngine
{
    string Id { get; }                              // "sqlserver", "azuresql", later "postgres"
    EngineCapabilities Capabilities { get; }        // what this engine can do
    ISqlDialect Dialect { get; }                    // identifier quoting, batch separator, parameter syntax
    DbConnection CreateConnection(ServerDefinition server, ResolvedCredentials creds, string? database);
    Task<IReadOnlyList<DatabaseInfo>> ListDatabasesAsync(DbConnection conn, CancellationToken ct);
    Task<ConnectionInfo> TestAsync(DbConnection conn, CancellationToken ct);   // version, identity, edition
}

public sealed record EngineCapabilities(
    bool SupportsUseDatabase,      // SQL Server: yes. Azure SQL: no (one connection per DB)
    bool SupportsServerLogins,     // Azure SQL: partial (master-level only, contained users preferred)
    bool SupportsAgentJobs,        // Azure SQL: no
    bool SupportsWindowsAuth,      // Azure SQL: no (Entra ID instead)
    bool SupportsBatchSeparator);  // "GO" splitting
```

- **`sqlserver`** and **`azuresql`** are both implemented in the same `SqlAdmin.Engines.SqlServer` project (same driver, same dialect, different capabilities and connection-string builder). This makes Azure SQL nearly free.
- Each operation YAML declares `engines: [sqlserver, azuresql]`. The registry only offers an operation for servers whose engine is listed, and the UI greys out the rest. Agent-job operations simply never show for Azure SQL.
- `scope: all_databases` runs per database. On SQL Server the engine can use `USE [db]`; on Azure SQL it opens one connection per database. The **core loop is the same** — the engine decides how to switch.
- A future `postgres` engine = a new project implementing `IDatabaseEngine` + `ISqlDialect`, registered in DI, plus its own operation YAMLs. Core untouched.

Honest scope note: T-SQL templates are not portable to Postgres/MySQL. Multi-engine support means *the framework* (config, registry, preview, execute, audit, UI) is shared; *operation content* is per engine. Design for that now; write only the SQL Server/Azure SQL content.

---

## 5. Architecture

### Solution layout

A light "clean architecture" with a strict dependency rule: **Core knows nothing about ASP.NET, drivers, or EF Core.** Four projects is the sweet spot — enough to learn the layering, not enough to drown in ceremony.

```
SqlAdminConsole.sln
├── src/
│   ├── SqlAdmin.Core/                    # pure C#: contracts + domain logic (no NuGet deps except YamlDotNet)
│   │   ├── Config/
│   │   │   ├── ServerDefinition.cs       # Name, Host, Engine, Auth, secret names, Environment, Tags
│   │   │   └── ISecretResolver.cs
│   │   ├── Engines/
│   │   │   ├── IDatabaseEngine.cs        # §4c
│   │   │   ├── ISqlDialect.cs            # QuoteIdentifier, BatchSeparator, ParameterPrefix
│   │   │   └── EngineCapabilities.cs
│   │   ├── Operations/
│   │   │   ├── OperationDefinition.cs    # id, name, scope, engines, params, destructive, sql
│   │   │   ├── OperationParameter.cs     # name, type, required, choices, default, secret
│   │   │   ├── IOperation.cs             # code-based operations (multi-step flows)
│   │   │   ├── IOperationRegistry.cs
│   │   │   ├── TemplateRenderer.cs       # placeholders -> parameters/quoted identifiers
│   │   │   └── BatchSplitter.cs          # splits on GO (respecting strings/comments)
│   │   ├── Execution/
│   │   │   ├── ExecutionPlan.cs          # server + db(s) + rendered batches (what preview returns)
│   │   │   ├── ExecutionEngine.cs        # plan -> run -> results + steps; the heart of the app
│   │   │   ├── ExecutionResult.cs        # result sets, messages, row counts, steps
│   │   │   └── DestructiveGuard.cs       # confirm token + precondition re-check + snapshot
│   │   └── Audit/
│   │       ├── AuditEntry.cs / AuditStep.cs
│   │       └── IAuditStore.cs
│   │
│   ├── SqlAdmin.Engines.SqlServer/       # Microsoft.Data.SqlClient
│   │   ├── SqlServerEngine.cs            # Id = "sqlserver"
│   │   ├── AzureSqlEngine.cs             # Id = "azuresql" (inherits, different capabilities/conn string)
│   │   ├── TSqlDialect.cs
│   │   └── SqlConnectionStringFactory.cs # Integrated Security / SQL / Entra ID
│   │
│   ├── SqlAdmin.Infrastructure/          # implementations of Core contracts
│   │   ├── Config/
│   │   │   ├── ServersOptions.cs         # bound from servers.json + servers.local.json
│   │   │   └── SecretResolver.cs         # env vars -> user-secrets -> Credential Manager
│   │   ├── Operations/
│   │   │   ├── YamlOperationLoader.cs    # scans operations/**/*.yaml
│   │   │   └── OperationRegistry.cs      # YAML + IOperation classes, indexed by id
│   │   └── Audit/
│   │       ├── AuditDbContext.cs         # EF Core; Migrations/
│   │       └── EfAuditStore.cs
│   │
│   └── SqlAdmin.Api/                     # ASP.NET Core host (the exe)
│       ├── Program.cs                    # DI wiring, Kestrel on 127.0.0.1, static files, OpenAPI
│       ├── Endpoints/
│       │   ├── ServersEndpoints.cs       # MapGroup("/api/servers")
│       │   ├── DatabasesEndpoints.cs
│       │   ├── OperationsEndpoints.cs    # list / preview / execute
│       │   ├── CustomSqlEndpoints.cs
│       │   └── AuditEndpoints.cs
│       ├── Contracts/                    # request/response DTOs (records)
│       ├── operations/                   # YAML files, copied to output  <-- extensibility point
│       │   ├── audit/
│       │   ├── provisioning/
│       │   ├── changes/
│       │   └── offboarding/
│       ├── servers.json
│       ├── servers.local.json            # git-ignored
│       ├── appsettings.json              # Kestrel, logging, Audit:Provider, ConnectionStrings:Audit
│       └── wwwroot/                      # built frontend (populated at publish)
│
├── tests/
│   ├── SqlAdmin.Core.Tests/              # xUnit: renderer, batch splitter, registry, guard
│   └── SqlAdmin.Integration.Tests/       # xUnit + Testcontainers.MsSql: real T-SQL round trips
│
├── frontend/
│   ├── src/
│   │   ├── pages/                        # Operations, CustomSql, AuditLog, Servers
│   │   ├── components/                   # ServerPicker, ParamForm, SqlPreview,
│   │   │                                 #   ResultsGrid, StepLog, ConfirmDestructive, EnvBanner
│   │   ├── api/                          # generated types (openapi-typescript) + TanStack Query hooks
│   │   └── App.tsx
│   ├── vite.config.ts                    # dev proxy /api -> :5000
│   └── package.json
│
├── Directory.Build.props                 # shared: nullable, implicit usings, warnings as errors
├── .editorconfig
└── build/publish.ps1                     # npm run build -> copy to wwwroot -> dotnet publish single-file
```

Dependency direction: `Api → Infrastructure → Core` and `Api → Engines.SqlServer → Core`. Core depends on nothing. If an engine or the audit provider changes, Core and the frontend don't notice.

### API surface (v1)

| Method & path | Purpose |
|---|---|
| `GET /api/servers` | Configured servers (name, engine, env, auth mode, capabilities — never credentials) |
| `POST /api/servers/{name}/test` | Test connection, return version/edition/identity |
| `GET /api/servers/{name}/databases` | Online user databases for pickers |
| `GET /api/operations?server={name}` | Registry filtered to the server's engine, with param metadata → frontend renders forms dynamically |
| `POST /api/operations/{id}/preview` | Returns the `ExecutionPlan` (exact SQL per batch/db), runs nothing |
| `POST /api/operations/{id}/execute` | Runs it; returns results + per-step log; requires `confirmToken` for destructive ops |
| `POST /api/custom-sql` | Free-form execution (server, optional db, sql) |
| `GET /api/audit`, `GET /api/audit/{id}/steps` | History with filters (user, server, operation, status) |
| `GET /openapi/v1.json`, `/scalar` | Generated docs; the frontend's TS types come from this |

**Security note:** Kestrel binds to `127.0.0.1` only (set in `appsettings.json`, not overridable from the UI). The API executes SQL with the DBA's own credentials and has no auth layer of its own, so it must never listen on the network. A central deployment (Phase 6) is when the API gets its own authentication.

### Operation definitions

Declarative operations (the vast majority):

```yaml
# operations/audit/server_roles.yaml
id: audit.server_roles
name: "Server role memberships"
category: audit
scope: server                 # server | database | all_databases
engines: [sqlserver, azuresql]
destructive: false
params:
  - name: login_name
    type: sysname             # sysname | string | int | bool | password | choice | database | login
    required: true
sql: |
  SELECT r.name AS server_role, m.name AS login_name
  FROM sys.server_role_members srm
  JOIN sys.server_principals r ON r.principal_id = srm.role_principal_id
  JOIN sys.server_principals m ON m.principal_id = srm.member_principal_id
  WHERE m.name = @login_name
  ORDER BY r.name;
```

Code-based operations (multi-step flows with branching, e.g. offboarding or "create user in all DBs + roles"):

```csharp
[Operation("offboarding.full", Destructive = true, Engines = ["sqlserver"])]
public sealed class OffboardLoginOperation : IOperation
{
    public OperationDefinition Definition { get; }                     // same metadata as YAML
    public Task<ExecutionPlan>   PlanAsync(OperationContext ctx, CancellationToken ct);
    public Task<ExecutionResult> ExecuteAsync(ExecutionPlan plan, IStepReporter steps, CancellationToken ct);
}
```

Both kinds show up identically in `GET /api/operations` and in the UI. The registry discovers YAML from the `operations/` folder and `IOperation` classes via DI. **Custom functions in the future = drop a YAML file, or add a class.**

### Execution engine rules
- **Values** (names, passwords) are passed as real `DbParameter`s — never string-concatenated. `TemplateRenderer` turns `@login_name` into a parameter.
- **Identifiers** that must be inlined (DB names in `USE`, role names in `ALTER ROLE`) use `{{ident:param}}` placeholders and go through `ISqlDialect.QuoteIdentifier` (QUOTENAME semantics), plus a strict allow-list regex.
- Multi-batch scripts are split on `GO` by `BatchSplitter` (string/comment aware) and run in order on one connection, so `#temp` tables and `SET` options carry across.
- `scope: all_databases` runs per online DB (`database_id > 4`, state ONLINE) and unions results, one `AuditStep` per DB. The engine decides between `USE` and reconnect (§4c).
- `PRINT` output and row counts are captured via `SqlConnection.InfoMessage` and `RecordsAffected` and shown alongside result grids.
- Generated passwords use `RandomNumberGenerator` and are **displayed once, never logged** (parameters typed `password` are redacted in the audit JSON).
- Destructive ops: preview returns a short-lived `confirmToken` bound to the exact plan; execute rejects any other token. `Environment: Production` ⇒ type-the-server-name confirmation + automatic permission snapshot to `snapshots/{server}/{login}-{timestamp}.json` before step 1.
- Every execute call has a `CancellationToken` wired from the HTTP request, so closing the browser tab cancels the running command.

### Custom SQL box
A page with: server picker, optional DB picker, a text area, and **Execute**. Unrestricted (the team are all admins) — every execution is audited with the full SQL text, `GO` batches are split and run in order, multiple result sets render as tabs, and the production banner stays visible so you always know which server you're pointed at.

---

## 6. Roadmap (with what each phase teaches)

**Phase 0 — Skeleton (one evening)**
Create the solution, the four projects, `Directory.Build.props`, `.editorconfig`, the Vite app, and the publish script. Confirm `dotnet watch run` + `npm run dev` + proxy work end to end with one `GET /api/ping`.
*Learn:* solution/project structure, `Program.cs`, Minimal API basics, Kestrel config, static files.

**Phase 1 — Foundation (a weekend or two)**
`servers.json` + local overrides + secret resolution; `IDatabaseEngine` with the SQL Server implementation; connection test page; custom SQL box with results grid; EF Core audit log with migrations.
*Learn:* Options pattern + validation, DI lifetimes, ADO.NET (`DbConnection`, `DbDataReader`, multiple result sets), EF Core basics, OpenAPI + generated TS types. This alone replaces SSMS window-juggling for quick checks.

**Phase 2 — Read-only operations**
`YamlDotNet` loader, registry, `TemplateRenderer`, `BatchSplitter`, preview/execute endpoints, generic `ParamForm` in React. All audit operations from the catalog.
*Learn:* records/immutability, interfaces + reflection-free plugin discovery, unit testing with xUnit, ProblemDetails.

**Phase 3 — Provisioning & changes**
Create login/user flows, role management, password reset, permission bundles. `all_databases` scope. Per-step audit log + `StepLog` UI.
*Learn:* async streams / `IAsyncEnumerable` for streaming step progress, cancellation, transactions.

**Phase 4 — Offboarding wizard**
First `IOperation` class. `DestructiveGuard`, confirm tokens, permission snapshots, typed confirmation UI.
*Learn:* code-based plugins, attributes + source discovery, integration tests with Testcontainers.

**Phase 5 — Azure SQL**
`AzureSqlEngine` (Entra ID auth, no `USE`, no Agent), capability-aware registry filtering, contained-user operations.
*Learn:* inheritance vs composition for engine variants, connection-string builders, feature flags by capability.

**Phase 6 — Nice-to-haves**
Clone permissions, permission diffs, CSV export, `import-audit` command, packaging as a Windows Service, optional central deployment with Windows/Entra authentication on the API, and the first non-SQL-Server engine if a need appears.

---

## 7. Security checklist

- Rotate the two passwords that appear in `Users-admin-commands.sql` — they're plaintext in a shared file.
- `servers.local.json`, `audit.db`, `snapshots/`, and `logs/` in `.gitignore` from commit #1. Secrets via env vars / `dotnet user-secrets` / Credential Manager only.
- Personal credentials per DBA (own Windows/Entra account or own SQL login), never a shared service account and never `sa`.
- Grant DBAs the least role that covers the catalog: `securityadmin` + `db_owner`/`db_securityadmin` where possible; reserve `sysadmin` for the offboarding steps that truly need it (job ownership, DB ownership changes).
- Kestrel bound to `127.0.0.1`; no network listening until Phase 6 adds API authentication.
- Audit log is append-only; never log passwords or generated secrets; `password`-typed parameters are redacted before serialization.
- `TrustServerCertificate=true` only for internal servers; prefer proper certificates on production and Azure SQL (which always enforces encryption).
- Keep `Microsoft.Data.SqlClient` and the SDK patched; Dependabot on the repo covers both NuGet and npm.
