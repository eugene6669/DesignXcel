/**
 * Authentication Hook
 * Provides authentication state management and operations
 * Supports both customer and employee authentication
 */

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import apiClient from '../services/api/apiClient';

// Create Auth Context
const AuthContext = createContext();

// Custom hook to use auth context
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

/**
 * Authentication Provider Component
 */
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [token, setToken] = useState(null);
    const [sessionId, setSessionId] = useState(null);

    /**
     * Clear authentication data
     */
    const clearAuthData = useCallback(() => {
        setUser(null);
        setToken(null);
        setSessionId(null);
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
    }, []);

    /**
     * Check authentication status with server
     */
    const checkAuthStatus = useCallback(async () => {
        try {
            const response = await apiClient.get('/api/auth/status');
            
            if (response.success && response.authenticated) {
                const { user: userData, sessionId: userSessionId } = response;
                
                setUser(userData);
                setSessionId(userSessionId);
                
                // Update localStorage if we have user data
                if (userData) {
                    localStorage.setItem('userData', JSON.stringify(userData));
                }
                
                return true;
            } else {
                // Only clear auth data if server explicitly says not authenticated
                // Don't clear on network errors or other failures
                clearAuthData();
                return false;
            }
        } catch (error) {
            console.error('Auth status check error:', error);
            
            // Only clear auth data on 401 (unauthorized) - not on network errors
            if (error.response?.status === 401) {
                clearAuthData();
                return false;
            }
            
            // For network errors or other errors, preserve existing auth state
            // Return true if we have user data in localStorage as fallback
            const savedUser = localStorage.getItem('userData');
            if (savedUser) {
                try {
                    const userData = JSON.parse(savedUser);
                    // Only use fallback if user data is valid
                    if (userData && userData.email) {
                        setUser(userData);
                        return true; // Return true to maintain auth state
                    }
                } catch (e) {
                    // Invalid JSON in localStorage, clear it
                    clearAuthData();
                    return false;
                }
            }
            
            return false;
        }
    }, [clearAuthData]);

    /**
     * After Google OAuth redirect, session cookie is set; load JWTs into SPA state.
     */
    const syncSessionTokens = useCallback(async () => {
        try {
            const response = await apiClient.post('/api/auth/customer/sync-tokens', {});

            if (response.success) {
                const { user: userData, tokens, sessionId: userSessionId } = response;

                if (userData) {
                    setUser(userData);
                    localStorage.setItem('userData', JSON.stringify(userData));
                }
                if (userSessionId) {
                    setSessionId(userSessionId);
                }
                if (tokens) {
                    if (tokens.accessToken) {
                        setToken(tokens.accessToken);
                        localStorage.setItem('accessToken', tokens.accessToken);
                    }
                    if (tokens.refreshToken) {
                        localStorage.setItem('refreshToken', tokens.refreshToken);
                    }
                }

                return { success: true, user: userData };
            }

            return { success: false, error: response.message || 'Sync failed' };
        } catch (error) {
            console.error('syncSessionTokens error:', error);
            return { success: false, error: error.message || 'Sync failed' };
        }
    }, []);

    /**
     * Initialize authentication state
     */
    const initializeAuth = useCallback(async () => {
        try {
            setLoading(true);
            
            // Check for stored token and user data
            const savedToken = localStorage.getItem('authToken') || localStorage.getItem('accessToken');
            const savedUser = localStorage.getItem('userData');
            
            // If we have user data in localStorage, set it immediately for better UX
            // This prevents the "flash" of logged out state while checking with server
            if (savedUser) {
                try {
                    const userData = JSON.parse(savedUser);
                    if (userData && userData.email) {
                        setUser(userData);
                        if (savedToken) {
                            setToken(savedToken);
                        }
                    }
                } catch (e) {
                    console.error('Error parsing saved user data:', e);
                }
            }
            
            // Now verify with server (but don't clear on network errors)
            if (savedToken && savedUser) {
                await checkAuthStatus();
            } else {
                // Check session-based auth
                await checkAuthStatus();
            }
        } catch (error) {
            console.error('Auth initialization error:', error);
            // Don't clear auth data on initialization errors
            // Let checkAuthStatus handle it based on error type
        } finally {
            setLoading(false);
        }
    }, [checkAuthStatus]);

    /**
     * Customer login
     */
    const loginCustomer = useCallback(async (email, password, rememberMe = false) => {
        try {
            setLoading(true);
            
            const response = await apiClient.post('/api/auth/customer/login', {
                email,
                password,
                rememberMe
            });

            if (response.success) {
                const { user: userData, tokens, sessionId: userSessionId } = response;
                
                setUser(userData);
                setSessionId(userSessionId);
                
                // Store JWT tokens if available
                if (tokens) {
                    if (tokens.accessToken) {
                        setToken(tokens.accessToken);
                        localStorage.setItem('accessToken', tokens.accessToken);
                    }
                    if (tokens.refreshToken) {
                        localStorage.setItem('refreshToken', tokens.refreshToken);
                    }
                }
                
                localStorage.setItem('userData', JSON.stringify(userData));
                
                return {
                    success: true,
                    user: userData
                };
            }
            
            return {
                success: false,
                error: response.message || 'Login failed',
                code: response.code || 'LOGIN_FAILED'
            };
            
        } catch (error) {
            console.error('Customer login error:', error);
            
            const errorMessage = error.message || 'Login failed';
            const errorCode = error.code;
            
            return {
                success: false,
                error: errorMessage,
                code: errorCode,
                isAccountInactive: errorCode === 'ACCOUNT_INACTIVE'
            };
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Customer registration
     */
    const registerCustomer = useCallback(async (userData) => {
        try {
            setLoading(true);
            
            const response = await apiClient.post('/api/auth/customer/register', userData);
            
            if (response.success) {
                const { user: newUser, tokens } = response;
                
                setUser(newUser);
                
                // Store JWT tokens if available
                if (tokens) {
                    if (tokens.accessToken) {
                        setToken(tokens.accessToken);
                        localStorage.setItem('accessToken', tokens.accessToken);
                    }
                    if (tokens.refreshToken) {
                        localStorage.setItem('refreshToken', tokens.refreshToken);
                    }
                }
                
                localStorage.setItem('userData', JSON.stringify(newUser));
                
                return {
                    success: true,
                    user: newUser
                };
            }
            
            return {
                success: false,
                error: response.message || 'Registration failed'
            };
            
        } catch (error) {
            console.error('Customer registration error:', error);
            
            return {
                success: false,
                error: error.message || 'Registration failed',
                code: error.code
            };
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Logout user
     */
    const logout = useCallback(async () => {
        try {
            // Call logout endpoint
            await apiClient.post('/auth/logout');
        } catch (error) {
            console.error('Logout error:', error);
            // Continue with local logout even if server call fails
        } finally {
            clearAuthData();
        }
    }, [clearAuthData]);

    /**
     * Update user profile
     */
    const updateProfile = useCallback(async (profileData) => {
        try {
            const response = await apiClient.put('/api/auth/profile', profileData);
            
            if (response.data.success) {
                const updatedUser = { ...user, ...response.data.user };
                setUser(updatedUser);
                localStorage.setItem('userData', JSON.stringify(updatedUser));
                
                return {
                    success: true,
                    user: updatedUser
                };
            }
            
            return {
                success: false,
                error: response.data.message || 'Profile update failed'
            };
            
        } catch (error) {
            console.error('Profile update error:', error);
            
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Profile update failed'
            };
        }
    }, [user]);

    /**
     * Change password
     */
    const changePassword = useCallback(async (currentPassword, newPassword, confirmPassword) => {
        try {
            const response = await apiClient.post('/api/auth/change-password', {
                currentPassword,
                newPassword,
                confirmPassword
            });
            
            if (response.data.success) {
                return {
                    success: true,
                    message: response.data.message
                };
            }
            
            return {
                success: false,
                error: response.data.message || 'Password change failed'
            };
            
        } catch (error) {
            console.error('Password change error:', error);
            
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Password change failed'
            };
        }
    }, []);

    /**
     * Refresh authentication token
     */
    const refreshToken = useCallback(async () => {
        try {
            const storedRefreshToken = localStorage.getItem('refreshToken');
            
            if (!storedRefreshToken) {
                throw new Error('Refresh token is required');
            }
            
            const response = await apiClient.post('/api/auth/refresh-token', {
                refreshToken: storedRefreshToken
            });
            
            if (response.success) {
                const newToken = response.accessToken;
                setToken(newToken);
                localStorage.setItem('accessToken', newToken);
                
                return {
                    success: true,
                    token: newToken
                };
            }
            
            return {
                success: false,
                error: response.message || 'Token refresh failed'
            };
            
        } catch (error) {
            console.error('Token refresh error:', error);
            
            // If refresh fails, logout user
            if (error.response?.status === 401) {
                clearAuthData();
            }
            
            return {
                success: false,
                error: error.response?.data?.message || error.message || 'Token refresh failed'
            };
        }
    }, [clearAuthData]);

    /**
     * Check if user is authenticated
     */
    const isAuthenticated = Boolean(user);

    /**
     * Check if user is a customer
     */
    const isCustomer = user?.role === 'Customer' || user?.type === 'customer';

    /**
     * Check if user is an employee
     */
    const isEmployee = user?.type === 'employee' || (user?.role && user.role !== 'Customer');

    /**
     * Check if user is admin
     */
    const isAdmin = user?.role === 'Admin';

    /**
     * Get user's role
     */
    const getUserRole = () => user?.role || null;


    // Initialize auth on mount
    useEffect(() => {
        initializeAuth();
    }, [initializeAuth]);

    // Setup axios interceptors for token management
    useEffect(() => {
        const requestInterceptor = apiClient.client.interceptors.request.use(
            (config) => {
                if (token) {
                    config.headers.Authorization = `Bearer ${token}`;
                }
                return config;
            },
            (error) => Promise.reject(error)
        );

        const responseInterceptor = apiClient.client.interceptors.response.use(
            (response) => response,
            async (error) => {
                if (error.response?.status === 401 && !error.config._retry) {
                    error.config._retry = true;
                    
                    // Try to refresh token
                    const refreshResult = await refreshToken();
                    
                    if (refreshResult.success) {
                        // Retry the original request with new token
                        error.config.headers.Authorization = `Bearer ${refreshResult.token}`;
                        return apiClient.client.request(error.config);
                    } else {
                        // Refresh failed, logout user
                        clearAuthData();
                    }
                }
                
                return Promise.reject(error);
            }
        );

        // Cleanup interceptors
        return () => {
            apiClient.client.interceptors.request.eject(requestInterceptor);
            apiClient.client.interceptors.response.eject(responseInterceptor);
        };
    }, [token, refreshToken, clearAuthData]);


    // Context value
    const value = {
        // State
        user,
        token,
        loading,
        sessionId,
        
        // Actions
        loginCustomer,
        registerCustomer,
        syncSessionTokens,
        logout,
        updateProfile,
        changePassword,
        refreshToken,
        checkAuthStatus,
        
        // Utilities
        isAuthenticated,
        isCustomer,
        isEmployee,
        isAdmin,
        getUserRole
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export default useAuth;
