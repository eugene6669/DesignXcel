# Add fonts to all EJS pages that don't have them
$roles = @("Admin", "TransactionManager", "InventoryManager", "UserManager", "OrderSupport")
$fontLinks = "`n    <link rel=`"preconnect`" href=`"https://fonts.googleapis.com`">`n    <link rel=`"preconnect`" href=`"https://fonts.gstatic.com`" crossorigin>`n    <link href=`"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@600;700&display=swap`" rel=`"stylesheet`">"

foreach ($role in $roles) {
    $rolePath = "backend/views/Employee/$role"
    
    if (Test-Path $rolePath) {
        $files = Get-ChildItem -Path $rolePath -Filter "*.ejs"
        
        foreach ($file in $files) {
            $content = Get-Content $file.FullName -Raw
            
            if ($content -notmatch 'fonts.googleapis.com' -and $content -match 'AdminIndexStyles.css') {
                $content = $content -replace '(</head>)', "$fontLinks`n`$1"
                Set-Content -Path $file.FullName -Value $content -NoNewline
                Write-Host "Added fonts to: $($file.Name)"
            }
        }
    }
}

Write-Host "Font addition complete!"

