'use strict';

const https = require('https');

const DEFAULT_HOST = 'api.paymongo.com';
const DEFAULT_API_BASE = 'https://api.paymongo.com/v1';

function getPayMongoSecretKey() {
    return process.env.PAYMONGO_SECRET_KEY || '';
}

function getPayMongoAuthHeader() {
    const key = getPayMongoSecretKey();
    if (!key) return null;
    return `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
}

function getPayMongoApiBase() {
    const raw = String(process.env.PAYMONGO_API_BASE_URL || DEFAULT_API_BASE).trim();
    return raw.replace(/\/$/, '');
}

function getPayMongoHost() {
    try {
        return new URL(getPayMongoApiBase()).hostname || DEFAULT_HOST;
    } catch {
        return DEFAULT_HOST;
    }
}

function getPayMongoBasePath() {
    try {
        const path = new URL(getPayMongoApiBase()).pathname || '/v1';
        return path.replace(/\/$/, '') || '/v1';
    } catch {
        return '/v1';
    }
}

function joinPayMongoPath(path) {
    const p = String(path || '').trim();
    const basePath = getPayMongoBasePath();
    if (!p) return basePath;
    return `${basePath}${p.startsWith('/') ? p : `/${p}`}`;
}

function paymongoHttpsJson(method, path, headers, body) {
    return new Promise((resolve, reject) => {
        const host = getPayMongoHost();
        const fullPath = joinPayMongoPath(path);
        const payload = body != null ? JSON.stringify(body) : null;
        const reqHeaders = {
            Accept: 'application/json',
            ...headers
        };
        if (payload) {
            reqHeaders['Content-Type'] = 'application/json';
            reqHeaders['Content-Length'] = Buffer.byteLength(payload);
        }

        const req = https.request(
            {
                hostname: host,
                port: 443,
                path: fullPath,
                method: method || 'GET',
                headers: reqHeaders,
                family: 4,
                servername: host,
                timeout: 30000
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    let json = {};
                    try {
                        json = data ? JSON.parse(data) : {};
                    } catch {
                        json = { raw: data };
                    }
                    resolve({
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        status: res.statusCode,
                        json
                    });
                });
            }
        );

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('PayMongo request timed out'));
        });

        if (payload) req.write(payload);
        req.end();
    });
}

function isPayMongoNetworkError(err) {
    const code = err?.cause?.code || err?.code;
    return (
        code === 'ENOTFOUND' ||
        code === 'EAI_AGAIN' ||
        code === 'ETIMEDOUT' ||
        code === 'ECONNREFUSED' ||
        code === 'ECONNRESET' ||
        (err?.message && /fetch failed/i.test(err.message))
    );
}

function paymongoNetworkHint(err) {
    const code = err?.cause?.code || err?.code;
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
        return 'Cannot reach PayMongo (DNS/network). Check your internet connection, DNS settings, firewall, or VPN, then try again.';
    }
    if (code === 'ETIMEDOUT') {
        return 'PayMongo request timed out. Please try again.';
    }
    return err?.message || 'PayMongo request failed';
}

/**
 * PayMongo API request with IPv4 HTTPS fallback when global fetch cannot resolve the host.
 */
async function paymongoFetch(method, path, options = {}) {
    const auth = getPayMongoAuthHeader();
    if (!auth) {
        const err = new Error('PayMongo is not configured');
        err.code = 'PAYMONGO_NOT_CONFIGURED';
        throw err;
    }

    const url = `${getPayMongoApiBase()}${String(path || '').startsWith('/') ? path : `/${path}`}`;
    const headers = {
        Authorization: auth,
        Accept: 'application/json',
        'Content-Type': 'application/json'
    };
    const body = options.body;

    try {
        const res = await fetch(url, {
            method: method || 'GET',
            headers,
            body: body != null ? JSON.stringify(body) : undefined
        });
        const json = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, json };
    } catch (err) {
        if (!isPayMongoNetworkError(err)) throw err;
        console.warn(
            '[PAYMONGO] fetch failed (%s), retrying via IPv4 HTTPS to %s',
            err?.cause?.code || err?.code || err.message,
            getPayMongoHost()
        );
        try {
            return await paymongoHttpsJson(method, path, headers, body);
        } catch (retryErr) {
            const wrapped = new Error(paymongoNetworkHint(retryErr));
            wrapped.cause = retryErr;
            wrapped.code = retryErr?.code || err?.cause?.code || err?.code;
            throw wrapped;
        }
    }
}

async function fetchPayMongoCheckoutSession(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid || !getPayMongoAuthHeader()) return null;

    const { ok, json } = await paymongoFetch(
        'GET',
        `/checkout_sessions/${encodeURIComponent(sid)}`
    );
    if (!ok) return null;
    return json?.data || null;
}

async function createPayMongoCheckoutSession(attributes) {
    return paymongoFetch('POST', '/checkout_sessions', {
        body: { data: { attributes } }
    });
}

module.exports = {
    getPayMongoAuthHeader,
    getPayMongoSecretKey,
    paymongoFetch,
    fetchPayMongoCheckoutSession,
    createPayMongoCheckoutSession,
    paymongoNetworkHint,
    isPayMongoNetworkError
};
