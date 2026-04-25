# Fix sidebar structure - ensure main-content is properly wrapped
$roles = @("Admin", "TransactionManager", "InventoryManager", "UserManager", "OrderSupport")

foreach ($role in $roles) {
    $rolePath = "backend/views/Employee/$role"
    
    if (Test-Path $rolePath) {
        $files = Get-ChildItem -Path $rolePath -Filter "*.ejs"
        
        Write-Host "Checking $role pages..."
        
        foreach ($file in $files) {
            $content = Get-Content $file.FullName -Raw
            $needsFix = $false
            
            # Check if logout-section closes but main-content is not properly opened
            # Pattern: </div> (closing logout-section) followed by header/content-area without main-content wrapper
            if ($content -match '</div>\s*</div>\s*<div class="header">' -or 
                ($content -match '</div>\s*<div class="header">' -and $content -notmatch '</div>\s*</div>\s*<div class="main-content">')) {
                
                # Check if main-content wrapper exists
                if ($content -notmatch '<div class="main-content">') {
                    $needsFix = $true
                } else {
                    # Check if header is outside main-content
                    $headerPos = $content.IndexOf('<div class="header">')
                    $mainContentPos = $content.IndexOf('<div class="main-content">')
                    if ($headerPos -lt $mainContentPos -or $mainContentPos -eq -1) {
                        $needsFix = $true
                    }
                }
            }
            
            if ($needsFix) {
                Write-Host "  Fixing: $($file.Name)"
                
                # Fix pattern: </div> (logout-section) </div> (sidebar) followed by header
                # Should be: </div> (logout-section) </div> (sidebar) <div class="main-content"> header
                $content = $content -replace '(</div>\s*</div>\s*)(<div class="header">)', '$1<div class="main-content">`n            $2'
                
                Set-Content -Path $file.FullName -Value $content -NoNewline
            }
        }
    }
}

Write-Host "Structure check complete!"

