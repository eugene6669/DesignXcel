/**
 * Script to identify the current Railway IP address
 * This helps when you need to add it to Azure SQL Database firewall rules
 * 
 * Usage: node scripts/get-railway-ip.js
 */

const https = require('https');
const http = require('http');

console.log('🔍 Detecting Railway IP address...\n');

// List of IP detection services
const ipServices = [
    {
        name: 'ipify.org',
        url: 'https://api.ipify.org?format=json',
        parser: (data) => JSON.parse(data).ip
    },
    {
        name: 'ifconfig.me',
        url: 'https://ifconfig.me/ip',
        parser: (data) => data.trim()
    },
    {
        name: 'icanhazip.com',
        url: 'https://icanhazip.com',
        parser: (data) => data.trim()
    }
];

function getIP(service) {
    return new Promise((resolve, reject) => {
        const url = new URL(service.url);
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'GET',
            timeout: 5000
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const ip = service.parser(data);
                    resolve({ service: service.name, ip });
                } catch (error) {
                    reject(new Error(`Failed to parse response from ${service.name}: ${error.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`Request to ${service.name} failed: ${error.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`Request to ${service.name} timed out`));
        });

        req.end();
    });
}

async function detectIP() {
    console.log('Trying multiple IP detection services...\n');

    const results = [];
    
    for (const service of ipServices) {
        try {
            const result = await getIP(service);
            results.push(result);
            console.log(`✅ ${service.name}: ${result.ip}`);
        } catch (error) {
            console.log(`❌ ${service.name}: ${error.message}`);
        }
    }

    console.log('\n' + '='.repeat(60));
    
    if (results.length > 0) {
        // Get the most common IP (in case services return different results)
        const ipCounts = {};
        results.forEach(r => {
            ipCounts[r.ip] = (ipCounts[r.ip] || 0) + 1;
        });
        
        const mostCommonIP = Object.keys(ipCounts).reduce((a, b) => 
            ipCounts[a] > ipCounts[b] ? a : b
        );
        
        console.log('\n📌 Detected IP Address:', mostCommonIP);
        console.log('\n📋 Azure SQL Database Firewall Rule:');
        console.log('   Rule Name: Railway-Production');
        console.log(`   Start IP:  ${mostCommonIP}`);
        console.log(`   End IP:    ${mostCommonIP}`);
        console.log('\n💡 Add this IP to your Azure SQL Database firewall rules');
        console.log('   See: docs/fixes/AZURE_SQL_FIREWALL_FIX.md for instructions');
        
        if (results.length > 1 && new Set(results.map(r => r.ip)).size > 1) {
            console.log('\n⚠️  Warning: Different services returned different IPs');
            console.log('   This might indicate a proxy or load balancer');
            console.log('   You may need to add multiple IP addresses');
        }
    } else {
        console.log('\n❌ Failed to detect IP address from all services');
        console.log('   Please check your network connection');
        console.log('   Or manually check the error message from Azure SQL Database');
    }
    
    console.log('\n' + '='.repeat(60));
}

// Run the detection
detectIP().catch(error => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
});

