/**
 * Simple Loading Spinner Component
 * Matches design schema with consistent styling
 */

import React from 'react';

const LoadingSpinner = ({ 
    message = 'Loading...', 
    size = 'medium',
    className = '',
    showMessage = true 
}) => {
    return (
        <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
            {showMessage && (
                <p className="mt-4 text-gray-600 text-sm font-inter">{message}</p>
            )}
        </div>
    );
};

export default LoadingSpinner;
