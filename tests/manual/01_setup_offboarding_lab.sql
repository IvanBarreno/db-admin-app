/*
  01_setup_offboarding_lab.sql — builds a throwaway lab to exercise the destructive operations
  (offboarding.*, changes.*, provisioning.*) with REAL objects. Run as a sysadmin on a
  DEVELOPMENT server only. Walkthrough: tests/manual/offboarding-lab.md. Undo: 02_cleanup_lab.sql.

  PREREQUISITE (done in the app first, see the walkthrough step 1): logins zz_leaver and zz_heir
  must already exist. The script fails fast with a clear message if they do not.

  What it builds (everything is prefixed zz_ so it cannot be confused with real data):

    login zz_leaver  the person being offboarded. After this script he:
                       - owns database zz_lab_hr                       -> offboarding.reassign_databases
                       - owns 2 SQL Agent jobs                         -> offboarding.reassign_jobs
                       - owns schema [leaver] in zz_lab_sales          -> drop_users must hand it to dbo first
                       - has a user in zz_lab_sales, zz_lab_logs, zz_lab_archive
                         (in zz_lab_logs the user is RENAMED: found by SID, not by name)
                       - is in server roles dbcreator + processadmin   -> offboarding.revoke_server_access
                       - has GRANT/DENY server permissions             -> same step (states G and D)
                     (the active session is opened by hand, see the walkthrough)
    login zz_heir    receives the jobs/databases; gets users through the app (user_all_databases)
    user zz_orphan   a database user whose login was dropped            -> audit.orphaned_users / changes.fix_orphaned_user
    zz_lab_archive   is taken OFFLINE at the end: all_databases operations must skip it

  Safe to re-run: it drops and rebuilds the zz_lab_* databases and jobs first.
*/

SET NOCOUNT ON;
GO

-- ---------------------------------------------------------------------------------------------
-- 0. Guards: right server, prerequisites present.
-- ---------------------------------------------------------------------------------------------
IF IS_SRVROLEMEMBER(N'sysadmin') <> 1
    THROW 50001, N'Run this script as a sysadmin.', 1;
-- Change the name below if you point the lab at another DEV server. It stops you from running
-- the lab on a server you did not mean to touch.
IF @@SERVERNAME <> N'ivand'
    THROW 50001, N'Wrong server: edit the @@SERVERNAME guard at the top of this script if this is the intended DEV server.', 1;
IF SUSER_ID(N'zz_leaver') IS NULL OR SUSER_ID(N'zz_heir') IS NULL
    THROW 50001, N'Create logins zz_leaver and zz_heir first (app: provisioning.create_sql_login, walkthrough step 1).', 1;
GO

-- ---------------------------------------------------------------------------------------------
-- 1. Reset: drop previous lab databases, jobs and the orphan-test login.
-- ---------------------------------------------------------------------------------------------
DECLARE @sql nvarchar(max) = N'';
SELECT @sql += N'IF DATABASEPROPERTYEX(N''' + name + N''', ''Status'') = N''OFFLINE'' ALTER DATABASE ' + QUOTENAME(name) + N' SET ONLINE; '
             + N'ALTER DATABASE ' + QUOTENAME(name) + N' SET SINGLE_USER WITH ROLLBACK IMMEDIATE; '
             + N'DROP DATABASE ' + QUOTENAME(name) + N'; '
FROM sys.databases WHERE name LIKE N'zz[_]lab[_]%';
EXEC (@sql);

DECLARE @job sysname;
DECLARE jobs CURSOR LOCAL FAST_FORWARD FOR SELECT name FROM msdb.dbo.sysjobs WHERE name LIKE N'zz[_]lab[_]%';
OPEN jobs; FETCH NEXT FROM jobs INTO @job;
WHILE @@FETCH_STATUS = 0
BEGIN
    EXEC msdb.dbo.sp_delete_job @job_name = @job;
    FETCH NEXT FROM jobs INTO @job;
END
CLOSE jobs; DEALLOCATE jobs;

IF SUSER_ID(N'zz_orphan') IS NOT NULL DROP LOGIN zz_orphan;
-- Server roles / permissions of a previous run are re-applied below; clear them so the state is exact.
IF IS_SRVROLEMEMBER(N'dbcreator', N'zz_leaver') = 1 ALTER SERVER ROLE dbcreator DROP MEMBER zz_leaver;
IF IS_SRVROLEMEMBER(N'processadmin', N'zz_leaver') = 1 ALTER SERVER ROLE processadmin DROP MEMBER zz_leaver;
GO

-- ---------------------------------------------------------------------------------------------
-- 2. zz_lab_sales — business data, a view, procedures, and a schema owned by the leaver.
-- ---------------------------------------------------------------------------------------------
CREATE DATABASE zz_lab_sales;
GO
USE zz_lab_sales;
GO
CREATE TABLE dbo.Customers (
    CustomerId int IDENTITY(1,1) PRIMARY KEY,
    Name       nvarchar(100) NOT NULL,
    Email      nvarchar(200) NULL
);
CREATE TABLE dbo.Orders (
    OrderId    int IDENTITY(1,1) PRIMARY KEY,
    CustomerId int NOT NULL REFERENCES dbo.Customers (CustomerId),
    OrderDate  date NOT NULL DEFAULT (CONVERT(date, SYSDATETIME())),
    Total      decimal(10,2) NOT NULL
);
INSERT dbo.Customers (Name, Email) VALUES
    (N'Acme Corp', N'ops@acme.test'), (N'Globex', N'it@globex.test'), (N'Initech', NULL);
INSERT dbo.Orders (CustomerId, Total) VALUES (1, 120.50), (1, 75.00), (2, 310.99), (3, 42.00);
GO
CREATE VIEW dbo.vw_OrderTotals AS
    SELECT c.Name, COUNT(*) AS Orders, SUM(o.Total) AS Total
    FROM dbo.Customers c JOIN dbo.Orders o ON o.CustomerId = c.CustomerId
    GROUP BY c.Name;
GO
CREATE PROCEDURE dbo.usp_GetOrders @CustomerId int AS
    SELECT OrderId, OrderDate, Total FROM dbo.Orders WHERE CustomerId = @CustomerId ORDER BY OrderDate;
GO
CREATE PROCEDURE dbo.usp_AddOrder @CustomerId int, @Total decimal(10,2) AS
    INSERT dbo.Orders (CustomerId, Total) VALUES (@CustomerId, @Total);
GO
-- The leaver's user and the schema he owns: DROP USER fails until the schema is handed to dbo.
CREATE USER zz_leaver FOR LOGIN zz_leaver;
GO
CREATE SCHEMA leaver AUTHORIZATION zz_leaver;
GO
CREATE TABLE leaver.Notes (NoteId int IDENTITY PRIMARY KEY, Body nvarchar(400) NOT NULL);
INSERT leaver.Notes (Body) VALUES (N'Quarterly report draft'), (N'Handover: call Globex on Monday');
GO
CREATE PROCEDURE leaver.usp_Report AS SELECT COUNT(*) AS Notes FROM leaver.Notes;
GO
ALTER ROLE db_datareader ADD MEMBER zz_leaver;
ALTER ROLE db_datawriter ADD MEMBER zz_leaver;
GRANT EXECUTE ON SCHEMA::dbo TO zz_leaver;
GRANT VIEW DEFINITION TO zz_leaver;
GO
-- Orphan: a user whose login no longer exists (the login's SID is gone after DROP LOGIN).
DECLARE @pw nvarchar(60) = CONVERT(nvarchar(36), NEWID()) + N'aA1!';
EXEC (N'CREATE LOGIN zz_orphan WITH PASSWORD = ''' + @pw + N''', CHECK_POLICY = OFF;');
GO
CREATE USER zz_orphan FOR LOGIN zz_orphan;
ALTER ROLE db_datareader ADD MEMBER zz_orphan;
GO
USE master;
DROP LOGIN zz_orphan;
GO

-- ---------------------------------------------------------------------------------------------
-- 3. zz_lab_hr — OWNED BY THE LEAVER (reassign_databases). He is dbo here, so he has no user.
-- ---------------------------------------------------------------------------------------------
CREATE DATABASE zz_lab_hr;
GO
USE zz_lab_hr;
GO
CREATE TABLE dbo.Employees (
    EmployeeId int IDENTITY(1,1) PRIMARY KEY,
    FullName   nvarchar(120) NOT NULL,
    Department nvarchar(60)  NOT NULL
);
CREATE TABLE dbo.Salaries (
    EmployeeId int PRIMARY KEY REFERENCES dbo.Employees (EmployeeId),
    Amount     decimal(10,2) NOT NULL
);
INSERT dbo.Employees (FullName, Department) VALUES (N'Ana Lopez', N'Finance'), (N'Luis Perez', N'IT');
INSERT dbo.Salaries VALUES (1, 4200.00), (2, 3900.00);
GO
CREATE PROCEDURE dbo.usp_Headcount AS SELECT Department, COUNT(*) AS People FROM dbo.Employees GROUP BY Department;
GO
USE master;
ALTER AUTHORIZATION ON DATABASE::zz_lab_hr TO zz_leaver;
GO

-- ---------------------------------------------------------------------------------------------
-- 4. zz_lab_logs — the leaver's user has a DIFFERENT NAME than his login (renamed user).
--    drop_users finds users by SID, so this one must still be dropped.
-- ---------------------------------------------------------------------------------------------
CREATE DATABASE zz_lab_logs;
GO
USE zz_lab_logs;
GO
CREATE TABLE dbo.AppLog (LogId bigint IDENTITY PRIMARY KEY, LoggedAt datetime2 DEFAULT SYSUTCDATETIME(), Message nvarchar(400));
INSERT dbo.AppLog (Message) VALUES (N'app started'), (N'job finished');
GO
CREATE USER leaver_renamed FOR LOGIN zz_leaver;
ALTER ROLE db_datareader ADD MEMBER leaver_renamed;
GRANT INSERT ON dbo.AppLog TO leaver_renamed;
GO

-- ---------------------------------------------------------------------------------------------
-- 5. zz_lab_archive — has a user for the leaver, then goes OFFLINE. all_databases operations
--    only visit ONLINE databases, so this user survives drop_users (expected; see walkthrough).
-- ---------------------------------------------------------------------------------------------
USE master;
GO
CREATE DATABASE zz_lab_archive;
GO
USE zz_lab_archive;
GO
CREATE TABLE dbo.OldOrders (OrderId int PRIMARY KEY, Total decimal(10,2));
INSERT dbo.OldOrders VALUES (1, 10.00), (2, 20.00);
CREATE USER zz_leaver FOR LOGIN zz_leaver;
ALTER ROLE db_datareader ADD MEMBER zz_leaver;
GO
USE master;
ALTER DATABASE zz_lab_archive SET OFFLINE WITH ROLLBACK IMMEDIATE;
GO

-- ---------------------------------------------------------------------------------------------
-- 6. Server level: roles and explicit permissions of the leaver (G = grant, D = deny).
-- ---------------------------------------------------------------------------------------------
ALTER SERVER ROLE dbcreator    ADD MEMBER zz_leaver;
ALTER SERVER ROLE processadmin ADD MEMBER zz_leaver;
GRANT VIEW SERVER STATE      TO zz_leaver;
GRANT VIEW ANY DEFINITION    TO zz_leaver;
DENY  ALTER ANY DATABASE     TO zz_leaver;
GO

-- ---------------------------------------------------------------------------------------------
-- 7. SQL Agent jobs: two owned by the leaver, one control job owned by the current login
--    (the control job must NOT move when reassign_jobs runs). Jobs are disabled, never run.
--    Needs the msdb job procedures; the Agent service itself does not have to be running.
-- ---------------------------------------------------------------------------------------------
EXEC msdb.dbo.sp_add_job @job_name = N'zz_lab_nightly_check', @enabled = 0, @owner_login_name = N'zz_leaver',
     @description = N'Lab job owned by the leaver.';
EXEC msdb.dbo.sp_add_jobstep @job_name = N'zz_lab_nightly_check', @step_name = N'noop',
     @subsystem = N'TSQL', @command = N'SELECT 1;', @database_name = N'master';
EXEC msdb.dbo.sp_add_jobserver @job_name = N'zz_lab_nightly_check', @server_name = N'(local)';

EXEC msdb.dbo.sp_add_job @job_name = N'zz_lab_purge_logs', @enabled = 0, @owner_login_name = N'zz_leaver',
     @description = N'Lab job owned by the leaver.';
EXEC msdb.dbo.sp_add_jobstep @job_name = N'zz_lab_purge_logs', @step_name = N'noop',
     @subsystem = N'TSQL', @command = N'SELECT 1;', @database_name = N'master';
EXEC msdb.dbo.sp_add_jobserver @job_name = N'zz_lab_purge_logs', @server_name = N'(local)';

DECLARE @me sysname = SUSER_SNAME();
EXEC msdb.dbo.sp_add_job @job_name = N'zz_lab_control_job', @enabled = 0, @owner_login_name = @me,
     @description = N'Control job: must keep its owner.';
EXEC msdb.dbo.sp_add_jobstep @job_name = N'zz_lab_control_job', @step_name = N'noop',
     @subsystem = N'TSQL', @command = N'SELECT 1;', @database_name = N'master';
EXEC msdb.dbo.sp_add_jobserver @job_name = N'zz_lab_control_job', @server_name = N'(local)';
GO

-- ---------------------------------------------------------------------------------------------
-- 8. Inventory: what the lab looks like now. Compare with the app's offboarding.snapshot.
-- ---------------------------------------------------------------------------------------------
SELECT name AS lab_database, state_desc, SUSER_SNAME(owner_sid) AS owner FROM sys.databases WHERE name LIKE N'zz[_]lab[_]%' ORDER BY name;
SELECT name AS lab_job, SUSER_SNAME(owner_sid) AS owner FROM msdb.dbo.sysjobs WHERE name LIKE N'zz[_]lab[_]%' ORDER BY name;
SELECT r.name AS server_role FROM sys.server_role_members m
  JOIN sys.server_principals r ON r.principal_id = m.role_principal_id
  WHERE m.member_principal_id = SUSER_ID(N'zz_leaver');
SELECT permission_name, state_desc FROM sys.server_permissions WHERE grantee_principal_id = SUSER_ID(N'zz_leaver') ORDER BY permission_name;
GO
