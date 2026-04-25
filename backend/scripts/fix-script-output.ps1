# Fix the script output formatting issues
$roles = @("Admin", "TransactionManager", "InventoryManager", "UserManager", "OrderSupport")

foreach ($role in $roles) {
    $rolePath = "backend/views/Employee/$role"
    
    if (Test-Path $rolePath) {
        $files = Get-ChildItem -Path $rolePath -Filter "*.ejs"
        
        foreach ($file in $files) {
            $content = Get-Content $file.FullName -Raw
            $originalContent = $content
            
            # Fix backtick and newline characters in the output
            $content = $content -replace '`n', "`n"
            $content = $content -replace '</div>`n\s*<div class="main-content">`n\s*<div class="header">', '</div>`n        </div>`n        <div class="main-content">`n            <div class="header">'
            
            # Fix the literal backtick-n strings
            $content = $content -replace '</div>`n\s*</div>`n\s*<div class="main-content">`n\s*<div class="header">', '</div>`n            </div>`n        </div>`n        <div class="main-content">`n            <div class="header">'
            
            # Fix escaped newlines
            $content = $content -replace '\\n', "`n"
            
            if ($content -ne $originalContent) {
                Set-Content -Path $file.FullName -Value $content -NoNewline
                Write-Host "Fixed formatting in: $($file.Name)"
            }
        }
    }
}

Write-Host "Formatting fixes complete!"

