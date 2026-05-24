const { BlobServiceClient } = require('@azure/storage-blob');

const AZURE_ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const AZURE_ACCOUNT_KEY = process.env.AZURE_STORAGE_ACCOUNT_KEY;
const AZURE_CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME;
const AZURE_PUBLIC_BASE_URL = process.env.AZURE_BLOB_PUBLIC_BASE_URL;

let containerClient = null;

const isAzureBlobConfigured = () => {
    return Boolean(AZURE_ACCOUNT_NAME && AZURE_ACCOUNT_KEY && AZURE_CONTAINER_NAME);
};

const getContainerClient = () => {
    if (!isAzureBlobConfigured()) {
        return null;
    }

    if (!containerClient) {
        const connectionString = `DefaultEndpointsProtocol=https;AccountName=${AZURE_ACCOUNT_NAME};AccountKey=${AZURE_ACCOUNT_KEY};EndpointSuffix=core.windows.net`;
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        containerClient = blobServiceClient.getContainerClient(AZURE_CONTAINER_NAME);
    }

    return containerClient;
};

const getBlobPublicUrl = (blobPath) => {
    if (!blobPath) return '';

    if (AZURE_PUBLIC_BASE_URL) {
        const trimmedBase = AZURE_PUBLIC_BASE_URL.replace(/\/+$/, '');
        return `${trimmedBase}/${blobPath}`;
    }

    if (!AZURE_ACCOUNT_NAME || !AZURE_CONTAINER_NAME) {
        return '';
    }

    return `https://${AZURE_ACCOUNT_NAME}.blob.core.windows.net/${AZURE_CONTAINER_NAME}/${blobPath}`;
};

const blobPathFromAssetUrl = (url) => {
    if (!url || typeof url !== 'string') return null;
    const s = url.trim();
    if (s.startsWith('/uploads/')) {
        return s.replace(/^\/uploads\//, '');
    }
    if (AZURE_PUBLIC_BASE_URL) {
        const base = AZURE_PUBLIC_BASE_URL.replace(/\/+$/, '');
        if (s.startsWith(`${base}/`)) {
            return s.slice(base.length + 1);
        }
    }
    const marker = '.blob.core.windows.net/';
    const idx = s.indexOf(marker);
    if (idx !== -1 && AZURE_CONTAINER_NAME) {
        const afterHost = s.slice(idx + marker.length);
        const prefix = `${AZURE_CONTAINER_NAME}/`;
        if (afterHost.startsWith(prefix)) {
            return afterHost.slice(prefix.length);
        }
    }
    return null;
};

const deleteBlobFromAzure = async (blobPath) => {
    const client = getContainerClient();
    if (!client || !blobPath) return false;
    try {
        const blockBlobClient = client.getBlockBlobClient(blobPath);
        const result = await blockBlobClient.deleteIfExists();
        return result.succeeded;
    } catch (err) {
        console.error(`Failed to delete blob ${blobPath}:`, err.message);
        return false;
    }
};

const uploadBufferToAzureBlob = async (blobPath, buffer, mimetype) => {
    const client = getContainerClient();
    if (!client) {
        throw new Error('Azure Blob Storage is not configured');
    }

    await client.createIfNotExists({ access: 'blob' });

    const blockBlobClient = client.getBlockBlobClient(blobPath);
    await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: {
            blobContentType: mimetype || 'application/octet-stream'
        }
    });

    return getBlobPublicUrl(blobPath) || blockBlobClient.url;
};

module.exports = {
    isAzureBlobConfigured,
    uploadBufferToAzureBlob,
    getBlobPublicUrl,
    blobPathFromAssetUrl,
    deleteBlobFromAzure
};
