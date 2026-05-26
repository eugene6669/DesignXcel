-- Role-based permission templates (Role Manager tab on Manage Users)
IF NOT EXISTS (
    SELECT 1 FROM sys.tables WHERE name = 'RolePermissions' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
    CREATE TABLE dbo.RolePermissions (
        RolePermissionID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        RoleID INT NOT NULL,
        PermissionName NVARCHAR(120) NOT NULL,
        CanAccess BIT NOT NULL CONSTRAINT DF_RolePermissions_CanAccess DEFAULT (0),
        UpdatedAt DATETIME2 NULL CONSTRAINT DF_RolePermissions_UpdatedAt DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_RolePermissions_Role_Permission UNIQUE (RoleID, PermissionName),
        CONSTRAINT FK_RolePermissions_Roles FOREIGN KEY (RoleID) REFERENCES dbo.Roles(RoleID)
    );
    CREATE INDEX IX_RolePermissions_RoleID ON dbo.RolePermissions(RoleID);
END
GO
