# Fix all EJS pages - ensure proper sidebar and main-content structure
$roles = @("Admin", "TransactionManager", "InventoryManager", "UserManager", "OrderSupport")

foreach ($role in $roles) {
    $rolePath = "backend/views/Employee/$role"
    
    if (Test-Path $rolePath) {
        $files = Get-ChildItem -Path $rolePath -Filter "*.ejs"
        
        Write-Host "Fixing $role pages..."
        
        foreach ($file in $files) {
            $content = Get-Content $file.FullName -Raw
            $originalContent = $content
            $fixed = $false
            
            # Fix pattern 1: </div> (logout-section) </div> (sidebar) followed by header without main-content
            if ($content -match '</div>\s*</div>\s*<div class="header">' -and $content -notmatch '</div>\s*</div>\s*<div class="main-content">') {
                $content = $content -replace '(</div>\s*</div>\s*)(<div class="header">)', '$1<div class="main-content">`n            $2'
                $fixed = $true
            }
            
            # Fix pattern 2: </div> (logout-section) followed by header (missing sidebar close and main-content)
            if ($content -match '</div>\s*<div class="header">' -and $content -notmatch '</div>\s*</div>\s*<div class="main-content">') {
                # Check if sidebar is properly closed
                $logoutSectionCount = ([regex]::Matches($content, '<div class="logout-section">')).Count
                $sidebarCloseCount = ([regex]::Matches($content, '</div>\s*</div>\s*<div class="main-content">')).Count
                
                if ($logoutSectionCount -gt 0 -and $sidebarCloseCount -eq 0) {
                    $content = $content -replace '(</div>\s*)(<div class="header">)', '$1</div>`n        <div class="main-content">`n            $2'
                    $fixed = $true
                }
            }
            
            # Fix sidebar-header indentation
            if ($content -match '<div class="sidebar">\s*<div class="sidebar-header">' -and $content -notmatch '<div class="sidebar">\s*            <div class="sidebar-header">') {
                $content = $content -replace '(<div class="sidebar">\s*)<div class="sidebar-header">', '$1            <div class="sidebar-header">'
                $fixed = $true
            }
            
            if ($fixed) {
                Set-Content -Path $file.FullName -Value $content -NoNewline
                Write-Host "  Fixed: $($file.Name)"
            }
        }
    }
}

Write-Host "All pages checked and fixed!"

