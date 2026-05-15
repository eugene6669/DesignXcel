import React, { Suspense, lazy, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const QueryDevtools =
    process.env.NODE_ENV === 'development'
        ? lazy(() =>
              import('@tanstack/react-query-devtools').then((mod) => ({
                  default: mod.ReactQueryDevtools,
              }))
          )
        : null;

function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 60 * 1000,
                retry: 1,
                refetchOnWindowFocus: false,
            },
        },
    });
}

/**
 * Wraps the app with TanStack Query. Devtools load only in development.
 */
export function QueryProvider({ children }) {
    const [queryClient] = useState(createQueryClient);

    return (
        <QueryClientProvider client={queryClient}>
            {children}
            {QueryDevtools ? (
                <Suspense fallback={null}>
                    <QueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
                </Suspense>
            ) : null}
        </QueryClientProvider>
    );
}
