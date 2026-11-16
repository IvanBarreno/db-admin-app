# SQL Admin Console

Internal web tool for day-to-day SQL Server and Azure SQL administration. It connects to servers that **already exist** and are listed in a configuration file; it does not install or create servers.

- **Operations catalog:** parameterized tasks (create logins, reset passwords, change roles and permissions, clone access, fix orphaned users, offboarding…) with the **exact SQL previewed** before anything runs.
- **Guided offboarding:** one checklist, one confirmation, a permission snapshot saved first.
- **Explorer:** browse databases, logins, roles, jobs, sessions, users and objects without writing a query; compare two logins, even across servers.
- **Custom SQL:** a free-form query box with multiple result sets.
- **Audit log:** every run is recorded (who, where, SQL, parameters with passwords masked, per-database steps).
- **Safe by default:** destructive runs need a confirmation, Production servers need the server name typed, the login the app connects with is protected from changes.

The API listens on `127.0.0.1` only and has no sign-in of its own: it runs SQL with the credentials of whoever starts it, so it must never be exposed on a network.

## Requirements

**To run a published release:** nothing to install (the executable is self-contained) and a browser.

**To develop:**

- .NET SDK 9 or later
- Node.js 22+ and **pnpm**
- At least one reachable SQL Server or Azure SQL to try it against

**On the servers:** the account the app connects with needs rights for what you want to do. Read-only audits and the Explorer need little (`VIEW ANY DEFINITION`, `VIEW SERVER STATE`, read access to `msdb` for Agent jobs); creating logins, roles and offboarding need `securityadmin`/`sysadmin`-level rights. Give each DBA their own account so the server's own logs show the real person.

## Configure the servers

The app only **uses** servers; you list them in [src/SqlAdmin.Api/servers.json](src/SqlAdmin.Api/servers.json) (shared, committed, no secrets):

```json
{
  "Servers": {
    "Defaults": { "Engine": "sqlserver", "Encrypt": true, "TrustServerCertificate": false, "CommandTimeoutSeconds": 30 },
    "Items": [
      {
        "Name": "PROD-SQL1",
        "Host": "10.0.0.5",
        "Port": 1433,
        "Auth": "Sql",
        "UsernameSecret": "PROD_SQL1_USER",
        "PasswordSecret": "PROD_SQL1_PASS",
        "Environment": "Production",
        "ProtectedLogins": [ "sa" ],
        "Tags": [ "prod" ]
      },
      {
        "Name": "DEV-LOCAL",
        "Host": "localhost\\SQLEXPRESS",
        "Auth": "Windows",
        "Environment": "Development",
        "TrustServerCertificate": true
      },
      {
        "Name": "AZ-REPORTING",
        "Engine": "azuresql",
        "Host": "myserver.database.windows.net",
        "Auth": "Sql",
        "UsernameSecret": "AZ_REPORTING_USER",
        "PasswordSecret": "AZ_REPORTING_PASS",
        "DefaultDatabase": "ReportingDb",
        "Environment": "Test"
      }
    ]
  }
}
```

| Field | Meaning |
|---|---|
| `Name` | Unique name shown in the app and the audit log |
| `Host`, `Port` | Address; `Port` optional (default 1433). Named instances: `host\\INSTANCE` |
| `Engine` | `sqlserver` (default) or `azuresql` (Azure SQL Database: one database per connection, no Agent, no server-level logins outside `master`) |
| `Auth` | `Sql` (login + password from secrets) or `Windows` (the Windows account running the app; Windows only) |
| `UsernameSecret`, `PasswordSecret` | The **names** of the secrets that hold the SQL login and password, never the values |
| `DefaultDatabase` | Database to connect to; set it for Azure SQL logins that cannot reach `master` |
| `Environment` | `Development`, `Test` or `Production`: sets the colour of the target bar and the confirmations (Production: red, server name must be typed) |
| `ProtectedLogins` | Logins the app refuses to change on this server (view only), besides the login it connects with, which is always protected |
| `Encrypt`, `TrustServerCertificate`, `CommandTimeoutSeconds` | Connection options; `TrustServerCertificate` only for internal servers without a proper certificate |

A mistake in the file stops the API at startup with a list of the problems.

### Secrets

Passwords never go in a file. Set the secret **values** once per machine, with the names used above:

```bash
# Development machine (stored outside the repo by the .NET SDK; read only when running in Development)
cd src/SqlAdmin.Api
dotnet user-secrets set PROD_SQL1_USER "your-sql-login"
dotnet user-secrets set PROD_SQL1_PASS "your-password"
dotnet user-secrets list
```

On a machine running the **published** executable, use environment variables with the same names (`PROD_SQL1_USER`, `PROD_SQL1_PASS`). `Windows` servers need no secrets.

### Personal overrides

A DBA can change settings for themselves in `servers.local.json` next to `servers.json` (git-ignored). Entries are matched by server name and only the fields you set change:

```json
{ "Servers": { "Overrides": { "PROD-SQL1": { "Auth": "Windows" } } } }
```

Overridable: `Host`, `Port`, `Auth`, `UsernameSecret`, `PasswordSecret`, `DefaultDatabase`, `TrustServerCertificate`, `CommandTimeoutSeconds`.

## Local data: audit log and snapshots

The app keeps two kinds of local files. **Neither is committed** (both are in `.gitignore`), and you do not have to create them.

| What | Where | Created by |
|---|---|---|
| Audit log (SQLite): every run, its SQL, parameters (passwords as `***`) and per-database steps | `audit.db` in the folder the app is started from (`src/SqlAdmin.Api/` with `dotnet run`; next to the exe when published) | the app, at startup |
| Permission snapshots of offboarding (JSON, one file per run) | `snapshots/<server>/` in the same folder | the app, the first time a snapshot is taken |

**First start with no `audit.db`:** nothing to do. On startup the app creates an empty `audit.db` and builds its tables (it applies the EF Core migrations). The Audit Log page is simply empty until the first run. A newer version of the app upgrades an existing `audit.db` the same way, with its history kept.

- **It is per machine.** Each DBA has their own history. To merge another machine's history into yours, copy their `audit.db` (with the app closed on their side) and run `SqlAdmin import-audit <path-to-their-audit.db>` (development: `cd src/SqlAdmin.Api && dotnet run -- import-audit <path>`). It prints how many entries were imported, skips the ones already present, never modifies the source file, and exits without starting the web server.
- **The folder must be writable.** From a read-only location the app stops at startup with a SQLite error.
- **Another location:** set `AuditDb:Path` (for example the environment variable `AuditDb__Path=D:\sqladmin\audit.db`, or in `appsettings.json`). The folder must already exist; the file is created.
- **Starting over:** stop the app and delete `audit.db` (and `audit.db-wal` / `audit.db-shm` if present). A new empty one is created on the next start. The history is gone, so copy the file first if you may need it.
- **Backup:** copy `audit.db` while the app is stopped (SQLite keeps recent rows in the `-wal` side file until the app closes).

## Run in development

Two terminals:

```bash
# 1. API with hot reload on http://127.0.0.1:5000
cd src/SqlAdmin.Api
dotnet watch run

# 2. UI on http://localhost:5173 (proxies /api to :5000)
cd frontend
pnpm install
pnpm dev
```

Open http://localhost:5173. Interactive API docs: http://127.0.0.1:5000/scalar/v1 (Development only).

If the API stops at startup with `address already in use`, an older instance is still running on port 5000: stop it. On macOS, AirPlay Receiver also listens on port 5000 for `localhost`; use `127.0.0.1`. To run a second copy on another port without touching the settings file:

```bash
Kestrel__Endpoints__Http__Url=http://127.0.0.1:5055 dotnet run --no-launch-profile
```

After changing the API's contract, regenerate the frontend's TypeScript types (the API must be running):

```bash
cd frontend && pnpm gen:api      # reads http://127.0.0.1:5000/openapi/v1.json → src/api/schema.d.ts
```

## Extend the catalog

Operations are YAML files in [src/SqlAdmin.Api/operations/](src/SqlAdmin.Api/operations/) and the lists that feed the pickers are in [src/SqlAdmin.Api/lookups/](src/SqlAdmin.Api/lookups/). Adding an operation is adding an entry there; no C# or React change. Help text for operations and parameters lives in `operations/glossary.yaml`. Lint tests in `SqlAdmin.Core.Tests` check every entry (description and help present, optional parameters have a default, destructive scripts support a dry run).

## Tests

```bash
dotnet test tests/SqlAdmin.Core.Tests          # fast, no database
dotnet test tests/SqlAdmin.Integration.Tests   # starts the real API in memory; server tests are skipped
cd frontend && pnpm test                       # components and helpers (Vitest)
```

The integration tests that talk to a real server are **opt-in**: name a non-production server from `servers.json`. They create logins and objects named `zz_it_*` and remove them again, and refuse to run against a `Production` server.

```bash
SQLADMIN_TEST_SERVER=DEV-LOCAL dotnet test tests/SqlAdmin.Integration.Tests
```

A step-by-step browser walk-through with a throwaway lab on a development server is in [tests/manual/offboarding-lab.md](tests/manual/offboarding-lab.md).

## Publish a release

```powershell
./build/publish.ps1                     # Windows x64 → publish/win-x64/
./build/publish.ps1 -Runtime osx-arm64  # local macOS build
```

The result is one self-contained `SqlAdmin` executable plus `appsettings.json`, `servers.json` and the `operations/` and `lookups/` folders. Put the secrets in environment variables, start the executable, and open http://127.0.0.1:5000.

### Run as a Windows Service (optional)

The same executable can be registered as a service so it starts with the machine. From an elevated prompt:

```powershell
sc.exe create SqlAdminConsole binPath= "C:\Tools\SqlAdmin\SqlAdmin.exe" start= auto
sc.exe start SqlAdminConsole
# remove:  sc.exe stop SqlAdminConsole ; sc.exe delete SqlAdminConsole
```

- A service runs under the **service account**, not under the DBA who opens the browser. `Windows`-auth servers are then reached as that account and the audit log records it. Use it with SQL-auth servers, or set the service to log on as your own account.
- Secrets must be visible to the service: **machine-level** environment variables (user-level ones and `dotnet user-secrets` are not).
- It still listens on `127.0.0.1` only. Sharing one instance with a team needs a sign-in layer on the API first; that is not built.
- Not yet tried on Windows.

## Repository layout

```
src/SqlAdmin.Core/                 contracts + pure logic (no framework dependencies)
src/SqlAdmin.Engines.SqlServer/    SQL Server and Azure SQL engines
src/SqlAdmin.Infrastructure/       config loading, YAML catalog, audit store (EF Core + SQLite)
src/SqlAdmin.Api/                  the executable: HTTP endpoints, serves the UI; operations/ and lookups/ live here
frontend/                          React app (Mantine, TanStack Query)
tests/                             unit tests, integration tests, manual lab
build/publish.ps1                  produces the single-file release
```

Stack: ASP.NET Core Minimal APIs (.NET 9), Microsoft.Data.SqlClient, EF Core + SQLite (audit only), React 19, Vite, Mantine 9. The API publishes an OpenAPI document and the frontend's TypeScript types are generated from it.
