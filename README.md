# SQL Admin Console

Internal tool for day-to-day SQL Server user and database administration: parameterized operations with SQL preview, a free-form query box, and a full audit trail. See [sql-admin-tool-plan.md](sql-admin-tool-plan.md) for the design and roadmap.

## Stack

- **Backend:** ASP.NET Core Minimal APIs (.NET 9, moving to .NET 10 LTS), Microsoft.Data.SqlClient, EF Core + SQLite for the audit log
- **Frontend:** React 19, Vite, Tailwind CSS v4, TanStack Query, react-router
- **Contract:** the API publishes an OpenAPI document; the frontend's TypeScript types are generated from it

## Repository layout

```
src/SqlAdmin.Core/                 contracts + pure logic (no framework dependencies)
src/SqlAdmin.Engines.SqlServer/    IDatabaseEngine for SQL Server and Azure SQL
src/SqlAdmin.Infrastructure/       config loading, YAML operation registry, EF Core audit store
src/SqlAdmin.Api/                  the executable: HTTP endpoints, DI wiring, serves the UI
tests/                             xUnit unit tests and Testcontainers integration tests
frontend/                          React app
build/publish.ps1                  produces the single-file release
```

Dependency rule: `Api → Infrastructure → Core` and `Api → Engines.SqlServer → Core`. Core references nothing else.

## Prerequisites (development)

- .NET SDK 9 or later
- Node.js 22+ and **pnpm**
- A SQL Server to test against (Developer Edition, LocalDB, or Docker)

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

Open http://localhost:5173. Interactive API docs are at http://127.0.0.1:5000/scalar/v1 while the API runs in Development.

### Regenerate frontend types after changing the API

```bash
cd frontend
pnpm gen:api      # reads http://127.0.0.1:5000/openapi/v1.json → src/api/schema.d.ts
```

## Tests

```bash
dotnet test tests/SqlAdmin.Core.Tests          # fast, no database
dotnet test tests/SqlAdmin.Integration.Tests   # needs Docker (Testcontainers), from Phase 4
```

## Publish a release

```powershell
./build/publish.ps1                     # Windows x64 → publish/win-x64/
./build/publish.ps1 -Runtime osx-arm64  # local macOS build
```

The result is one self-contained `SqlAdmin` executable plus `appsettings.json`, `servers.json` and the `operations/` folder. DBAs need nothing installed. The API binds to `127.0.0.1:5000` only and must never be exposed on the network.
