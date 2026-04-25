#!/bin/bash

# Script to add Railway IP range to Azure SQL Database firewall
# Usage: ./add-railway-firewall-rule.sh <resource-group>

set -e

RESOURCE_GROUP=${1:-""}
SERVER_NAME="designxcell-server"
RULE_NAME="Railway-Production-Range"
START_IP="162.220.232.0"
END_IP="162.220.232.255"

if [ -z "$RESOURCE_GROUP" ]; then
    echo "❌ Error: Resource group not provided"
    echo ""
    echo "Usage: $0 <resource-group>"
    echo ""
    echo "To find your resource group, run:"
    echo "  az sql server show --name $SERVER_NAME --query resourceGroup -o tsv"
    exit 1
fi

echo "🔧 Adding Railway IP range to Azure SQL Database firewall..."
echo "   Server: $SERVER_NAME"
echo "   Resource Group: $RESOURCE_GROUP"
echo "   Rule Name: $RULE_NAME"
echo "   IP Range: $START_IP - $END_IP"
echo ""

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo "❌ Error: Azure CLI is not installed"
    echo "   Install it from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Check if logged in
if ! az account show &> /dev/null; then
    echo "❌ Error: Not logged in to Azure CLI"
    echo "   Run: az login"
    exit 1
fi

# Add firewall rule
echo "📝 Creating firewall rule..."
az sql server firewall-rule create \
  --resource-group "$RESOURCE_GROUP" \
  --server "$SERVER_NAME" \
  --name "$RULE_NAME" \
  --start-ip-address "$START_IP" \
  --end-ip-address "$END_IP"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Firewall rule created successfully!"
    echo ""
    echo "⏳ Wait 2-5 minutes for the change to propagate"
    echo "🔄 Then restart your Railway service"
    echo ""
    echo "💡 To verify, check your Railway logs for:"
    echo "   ✅ Connected to MSSQL database successfully"
else
    echo ""
    echo "❌ Failed to create firewall rule"
    echo "   Check the error message above"
    exit 1
fi

