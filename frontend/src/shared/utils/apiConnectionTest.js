// API Connection Test Utility
// This utility helps test the connection between frontend and backend

class ApiConnectionTest {
    constructor() {
        this.apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
        this._apiClient = null;
        this._initialized = false;
    }

    _initialize() {
        if (!this._initialized) {
            console.log('🔗 API Connection Test initialized with URL:', this.apiUrl);
            this._initialized = true;
        }
    }

    // Lazy load apiClient to avoid circular dependency issues
    async getApiClient() {
        if (!this._apiClient) {
            // Dynamic import to avoid circular dependency
            const apiClientModule = await import('../services/api/apiClient');
            this._apiClient = apiClientModule.default || apiClientModule;
        }
        return this._apiClient;
    }

    /**
     * Test basic API connectivity
     */
    async testConnection() {
        this._initialize();
        try {
            console.log('🧪 Testing API connection to:', this.apiUrl);
            
            // Test 1: Direct fetch to health endpoint
            const healthResponse = await fetch(`${this.apiUrl}/api/health`, {
                method: 'GET'
                // Keep this as a simple request to minimize preflight/CORS edge cases.
            });
            
            if (!healthResponse.ok) {
                throw new Error(`Health check failed with status: ${healthResponse.status}`);
            }
            
            const healthData = await healthResponse.json();
            console.log('✅ Health check response:', healthData);
            
            // Test 2: Using apiClient (lazy loaded)
            try {
                const apiClient = await this.getApiClient();
                const clientResponse = await apiClient.get('/api/health');
                console.log('✅ API Client response:', clientResponse);
            } catch (clientError) {
                console.warn('⚠️ API Client test failed (this is OK if backend is running):', clientError.message);
            }
            
            return {
                success: true,
                healthCheck: healthData,
                apiUrl: this.apiUrl
            };
            
        } catch (error) {
            console.error('❌ API Connection test failed:', error);
            console.error('   Make sure the backend is running on', this.apiUrl);
            console.error('   Error details:', error.message);
            return {
                success: false,
                error: error.message,
                apiUrl: this.apiUrl,
                suggestion: 'Make sure the backend server is running on ' + this.apiUrl
            };
        }
    }

    /**
     * Test specific API endpoints
     */
    async testEndpoints() {
        const endpoints = [
            '/api/health',
            '/api/products',
            '/api/theme/public'
        ];

        const results = {};

        for (const endpoint of endpoints) {
            try {
                const response = await fetch(`${this.apiUrl}${endpoint}`);
                results[endpoint] = {
                    status: response.status,
                    ok: response.ok,
                    statusText: response.statusText
                };
                console.log(`✅ ${endpoint}: ${response.status} ${response.statusText}`);
            } catch (error) {
                results[endpoint] = {
                    error: error.message
                };
                console.error(`❌ ${endpoint}: ${error.message}`);
            }
        }

        return results;
    }

    /**
     * Get current configuration
     */
    getConfig() {
        this._initialize();
        return {
            apiUrl: this.apiUrl,
            environment: process.env.REACT_APP_ENVIRONMENT || 'development',
            nodeEnv: process.env.NODE_ENV || 'development',
            allEnvVars: {
                REACT_APP_API_URL: process.env.REACT_APP_API_URL,
                REACT_APP_ENVIRONMENT: process.env.REACT_APP_ENVIRONMENT,
                NODE_ENV: process.env.NODE_ENV
            }
        };
    }
}

// Export a function that returns a singleton instance
// This prevents initialization at module load time
let apiConnectionTestInstance = null;

const getApiConnectionTest = () => {
    if (!apiConnectionTestInstance) {
        apiConnectionTestInstance = new ApiConnectionTest();
    }
    return apiConnectionTestInstance;
};

// Export the getter function, not the instance
// This ensures the instance is only created when first accessed
const apiConnectionTest = {
    get instance() {
        return getApiConnectionTest();
    },
    // Proxy methods for convenience
    async testConnection() {
        return getApiConnectionTest().testConnection();
    },
    async testEndpoints() {
        return getApiConnectionTest().testEndpoints();
    },
    getConfig() {
        return getApiConnectionTest().getConfig();
    }
};

export default apiConnectionTest;
