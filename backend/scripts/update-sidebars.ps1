# PowerShell script to update all EJS sidebars with modern SVG icons
# This script replaces width/height attributes with sidebar-icon class

$adminPath = "backend/views/Employee/Admin"
$files = Get-ChildItem -Path $adminPath -Filter "*.ejs"

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    
    # Replace width="20" height="20" with class="sidebar-icon"
    $content = $content -replace 'width="20" height="20"', 'class="sidebar-icon"'
    
    # Add fonts if not present
    if ($content -notmatch 'fonts.googleapis.com') {
        $content = $content -replace '(<link rel="stylesheet" href="/css/Employee/Admin/AdminIndexStyles.css">)', "`$1`n    <link rel=`"preconnect`" href=`"https://fonts.googleapis.com`">`n    <link rel=`"preconnect`" href=`"https://fonts.gstatic.com`" crossorigin>`n    <link href=`"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@600;700&display=swap`" rel=`"stylesheet`">"
    }
    
    # Remove inline styles from submenus and labels
    $content = $content -replace 'style="display:block;"', ''
    $content = $content -replace 'style="font-weight:normal;"', ''
    
    Set-Content -Path $file.FullName -Value $content -NoNewline
    Write-Host "Updated: $($file.Name)"
}

Write-Host "`nAll Admin sidebars updated!"

