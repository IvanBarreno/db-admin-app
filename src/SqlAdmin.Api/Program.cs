// Program.cs — the application's entry point.
//
// This file uses "top-level statements": there is no visible `class Program { static void Main() }`,
// the compiler generates it for us. Everything below runs in order when the exe starts.
//
// The shape is always the same for an ASP.NET Core app:
//   1. builder  = configure SERVICES (dependency injection) and configuration sources
//   2. app      = configure the HTTP PIPELINE (middleware) and the ROUTES (endpoints)
//   3. app.Run() = start Kestrel and block until Ctrl+C / shutdown

using Scalar.AspNetCore;
using SqlAdmin.Api.Endpoints;

var builder = WebApplication.CreateBuilder(args);
// CreateBuilder already did a lot for us:
//   - loaded appsettings.json, appsettings.{Environment}.json, env vars and command-line args
//   - configured console logging
//   - read the "Kestrel" section, so we're bound to http://127.0.0.1:5000 (see appsettings.json)

// ---------------------------------------------------------------------------
// 1. Services — anything registered here can be requested later by endpoints
//    through constructor/parameter injection. Nothing is created yet; the
//    container just learns *how* to create things.
// ---------------------------------------------------------------------------

// Generates an OpenAPI (Swagger) document at /openapi/v1.json from our endpoints.
// The React app will generate its TypeScript types from that document, so the
// frontend and backend can never silently drift apart.
builder.Services.AddOpenApi();

// Converts unhandled exceptions and error results into RFC 7807 "problem+json"
// responses — one consistent error shape for the frontend to handle.
builder.Services.AddProblemDetails();

// ---------------------------------------------------------------------------
// 2. Pipeline — the order matters: each middleware sees the request on the way
//    in and the response on the way out, like layers of an onion.
// ---------------------------------------------------------------------------
var app = builder.Build();

// Turns exceptions into ProblemDetails responses instead of a blank 500 or a stack-trace page.
app.UseExceptionHandler();
// Also turns "empty" 4xx/5xx responses (e.g. an unmatched route) into ProblemDetails bodies.
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    // Publish the OpenAPI document and a browsable UI for it, development only.
    //   http://127.0.0.1:5000/openapi/v1.json   → raw document (what the frontend consumes)
    //   http://127.0.0.1:5000/scalar/v1         → interactive docs
    app.MapOpenApi();
    app.MapScalarApiReference();
}

// ---------------------------------------------------------------------------
// 3. Endpoints — each resource gets its own file under Endpoints/ exposing a
//    Map*Endpoints extension method, so Program.cs stays a table of contents.
// ---------------------------------------------------------------------------
app.MapPingEndpoints();

// ---------------------------------------------------------------------------
// 4. Frontend — in production the built React app lives in wwwroot/ and is
//    served from the same origin as the API, so no CORS is needed.
//    - UseDefaultFiles rewrites a request for "/" to "/index.html" (it only
//      changes the path; the next middleware does the serving).
//    - UseStaticFiles serves /index.html, /assets/*.js, etc. if the file exists.
//    - MapFallbackToFile sends every *other* path to index.html so React Router
//      can handle client-side routes such as /audit or /operations.
//      The catch-all route has two constraints (chained with ':'):
//        nonfile → skip paths that look like files (/assets/app.js), otherwise routing
//                  would claim them first and the static file middleware would step aside.
//        regex   → skip anything under /api, so an unknown API route returns a clean
//                  404 ProblemDetails instead of the HTML page.
//    In development wwwroot/ is empty; the UI runs on Vite (port 5173) instead.
// ---------------------------------------------------------------------------
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapFallbackToFile("{*path:nonfile:regex(^(?!api(/|$)).*$)}", "index.html");

app.Run();
