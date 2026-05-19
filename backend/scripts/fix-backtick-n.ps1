# Fix literal backtick-n strings in files
$roles = @("Admin", "TransactionManager", "InventoryManager", "UserManager", "OrderSupport")

foreach ($role in $roles) {
    $rolePath = "backend/views/Employee/$role"
    
    if (Test-Path $rolePath) {
        $files = Get-ChildItem -Path $rolePath -Filter "*.ejs"
        
        foreach ($file in $files) {
            $content = Get-Content $file.FullName -Raw
            $originalContent = $content
            
            # Replace literal backtick-n with actual newlines and proper indentation
            $content = $content -replace '</div>`n\s*</div>`n\s*<div class="main-content">', "            </div>`n        </div>`n        <div class=`"main-content`">"
            $content = $content -replace '</div>`n\s*<div class="main-content">', "            </div>`n        </div>`n        <div class=`"main-content`">"
            
            if ($content -ne $originalContent) {
                Set-Content -Path $file.FullName -Value $content -NoNewline
                Write-Host "Fixed backtick-n in: $($file.Name)"
            }
        }
    }
}

Write-Host "Backtick-n fixes complete!"

