# Add active states to current page menu items
$rolePages = @{
    "Admin" = @{
        "AdminManager" = "/Employee/AdminManager"
        "AdminProducts" = "/Employee/Admin/ProductsListing"
        "AdminMaterials" = "/Employee/Admin/RawMaterials"
        "AdminAlerts" = "/Employee/Admin/Alerts"
        "AdminArchived" = "/Employee/Admin/Archived"
        "AdminOrdersPending" = "/Employee/Admin/OrdersPending"
        "AdminOrdersProcessing" = "/Employee/Admin/OrdersProcessing"
        "AdminOrdersShipping" = "/Employee/Admin/OrdersShipping"
        "AdminOrdersDelivery" = "/Employee/Admin/OrdersDelivery"
        "AdminOrdersReceive" = "/Employee/Admin/OrdersReceive"
        "AdminCancelledOrders" = "/Employee/Admin/CancelledOrders"
        "AdminCompletedOrders" = "/Employee/Admin/CompletedOrders"
        "AdminManageUsers" = "/Employee/Admin/ManageUsers"
        "AdminReviews" = "/Employee/Admin/Reviews"
        "AdminChatSupport" = "/Employee/Admin/ChatSupport"
        "AdminCMS" = "/Employee/Admin/CMS"
        "AdminLogs" = "/Employee/Admin/Logs"
    }
}

foreach ($role in $rolePages.Keys) {
    $rolePath = "backend/views/Employee/$role"
    $pages = $rolePages[$role]
    
    foreach ($pageName in $pages.Keys) {
        $filePath = "$rolePath/$pageName.ejs"
        $targetUrl = $pages[$pageName]
        
        if (Test-Path $filePath) {
            $content = Get-Content $filePath -Raw
            
            # Add active class to the matching menu item
            $pattern = "href=`"$targetUrl`""
            $replacement = "href=`"$targetUrl`" class=`"active`""
            
            if ($content -match $pattern -and $content -notmatch "href=`"$targetUrl`" class=`"active`"") {
                $content = $content -replace $pattern, $replacement
                Set-Content -Path $filePath -Value $content -NoNewline
                Write-Host "Added active state to: $pageName"
            }
        }
    }
}

Write-Host "Active states added!"

