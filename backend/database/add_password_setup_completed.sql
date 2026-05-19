-- Adds flag for Google-first customers who must set a local password.
-- Safe to run once. Runtime also ensures this column via ensureCustomerGoogleAuthColumns in routes.js.

IF NOT EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'[dbo].[Customers]')
      AND name = N'PasswordSetupCompleted'
)
BEGIN
    PRINT 'Adding PasswordSetupCompleted column...';
    ALTER TABLE [dbo].[Customers]
    ADD [PasswordSetupCompleted] BIT NOT NULL
        CONSTRAINT [DF_Customers_PasswordSetupCompleted] DEFAULT (1);

    -- Use dynamic SQL for the update to prevent compilation errors 
    -- when the column is newly added in the same script.
    EXEC('UPDATE [dbo].[Customers] SET [PasswordSetupCompleted] = 0 WHERE [GoogleSub] IS NOT NULL');

    PRINT 'PasswordSetupCompleted column added and Google accounts flagged for setup.';
END
ELSE
BEGIN
    PRINT 'PasswordSetupCompleted column already exists.';
END
GO

