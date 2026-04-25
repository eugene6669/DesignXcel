# Fix sidebar closing structure - ensure proper closing tags
$roles = @("Admin", "TransactionManager", "InventoryManager", "UserManager", "OrderSupport")

foreach ($role in $roles) {
    $rolePath = "backend/views/Employee/$role"
    
    if (Test-Path $rolePath) {
        $files = Get-ChildItem -Path $rolePath -Filter "*.ejs"
        
        foreach ($file in $files) {
            $content = Get-Content $file.FullName -Raw
            $originalContent = $content
            
            # Fix pattern: </div> (logout-section) followed by blank line and </div> (sidebar) then main-content
            # Should be: </div> (logout-section) </div> (sidebar) <div class="main-content">
            $content = $content -replace '(</a>\s*)</div>\s*\n\s*</div>\s*<div class="main-content">', '$1            </div>`n        </div>`n        <div class="main-content">'
            
            # Fix pattern: </div> (logout-section) blank line </div> (sidebar) main-content
            $content = $content -replace '(Logout\s*</a>\s*)</div>\s*\n\s*</div>\s*<div class="main-content">', '$1            </div>`n        </div>`n        <div class="main-content">'
            
            # Fix pattern: </div> (logout-section) blank line </div> (sidebar) main-content (no newline)
            $content = $content -replace '(</a>\s*)</div>\s*\n\s*</div>\s*<div class="main-content">', '$1            </div>`n        </div>`n        <div class="main-content">'
            
            if ($content -ne $originalContent) {
                Set-Content -Path $file.FullName -Value $content -NoNewline
                Write-Host "Fixed: $($file.Name)"
            }
        }
    }
}

Write-Host "Sidebar closing structure fixed!"

