const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');

// Authentication middleware
const { isAuthenticated } = require('../middleware/employeeAuth');

// Path to the header banner settings JSON file
const HEADER_BANNER_FILE = path.join(__dirname, '../data/header-banner-settings.json');
const LOGO_UPLOAD_DIR = path.join(__dirname, '../public/uploads/logos');

// Multer configuration for logo uploads
const logoStorage = multer.diskStorage({
    destination: async function (req, file, cb) {
        try {
            await fs.mkdir(LOGO_UPLOAD_DIR, { recursive: true });
            cb(null, LOGO_UPLOAD_DIR);
        } catch (error) {
            cb(error);
        }
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `logo-${uniqueSuffix}${ext}`);
    }
});

const logoFileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed for logo!'));
    }
};

const logoUpload = multer({
    storage: logoStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: logoFileFilter
});

// Helper functions
async function readHeaderBannerSettings() {
    try {
        const data = await fs.readFile(HEADER_BANNER_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.log('[HEADER_BANNER] Settings file not found, using defaults');
        return {
            logoUrl: '/uploads/logos/default-logo.png',
            logoText: 'DESIGN EXCELLENCE',
            contactEmail: 'info@designxcel.com',
            contactPhone: '+1 (555) 123-4567',
            contactAddress: '123 Business St, City, State 12345',
            navBgColor: '#ffffff',
            navTextColor: '#333333',
            navHoverColor: '#ffc107',
            showContactInfo: true
        };
    }
}

async function writeHeaderBannerSettings(settings) {
    try {
        const dataDir = path.dirname(HEADER_BANNER_FILE);
        await fs.mkdir(dataDir, { recursive: true });
        settings.updatedAt = new Date().toISOString();
        await fs.writeFile(HEADER_BANNER_FILE, JSON.stringify(settings, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('[HEADER_BANNER] Error writing settings:', error);
        throw error;
    }
}

// PUBLIC ENDPOINT: Get header banner data
router.get('/api/header-banner', async (req, res) => {
    try {
        const settings = await readHeaderBannerSettings();
        res.json({
            success: true,
            banner: settings
        });
    } catch (error) {
        console.error('[HEADER_BANNER] Error fetching header banner:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching header banner data',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Get header banner data for CMS
router.get('/api/admin/header-banner', isAuthenticated, async (req, res) => {
    try {
        const settings = await readHeaderBannerSettings();
        
        // Get list of available logos
        let availableLogos = [];
        try {
            await fs.mkdir(LOGO_UPLOAD_DIR, { recursive: true });
            const files = await fs.readdir(LOGO_UPLOAD_DIR);
            availableLogos = files.filter(file => {
                const ext = path.extname(file).toLowerCase();
                return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext);
            }).map(filename => ({
                filename: filename,
                url: `/uploads/logos/${filename}`
            }));
        } catch (error) {
            console.log('[HEADER_BANNER] Error reading logos directory:', error.message);
        }
        
        res.json({
            success: true,
            settings: settings,
            availableLogos: availableLogos
        });
    } catch (error) {
        console.error('[HEADER_BANNER] Error fetching admin header banner:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching header banner data',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Update header banner settings
router.post('/api/admin/header-banner', isAuthenticated, express.json(), async (req, res) => {
    try {
        const {
            logoUrl,
            logoText,
            contactEmail,
            contactPhone,
            contactAddress,
            navBgColor,
            navTextColor,
            navHoverColor,
            showContactInfo,
            mainBgColor,
            searchPlaceholder,
            searchBorderColor,
            iconColor
        } = req.body;
        
        const currentSettings = await readHeaderBannerSettings();
        
        const updatedSettings = {
            ...currentSettings,
            logoUrl: logoUrl !== undefined ? logoUrl : (currentSettings.logoUrl || '/uploads/logos/default-logo.png'),
            logoText: logoText !== undefined ? logoText : (currentSettings.logoText || 'DESIGN EXCELLENCE'),
            contactEmail: contactEmail !== undefined ? contactEmail : (currentSettings.contactEmail || ''),
            contactPhone: contactPhone !== undefined ? contactPhone : (currentSettings.contactPhone || ''),
            contactAddress: contactAddress !== undefined ? contactAddress : (currentSettings.contactAddress || ''),
            navBgColor: navBgColor !== undefined ? navBgColor : (currentSettings.navBgColor || '#ffffff'),
            navTextColor: navTextColor !== undefined ? navTextColor : (currentSettings.navTextColor || '#333333'),
            navHoverColor: navHoverColor !== undefined ? navHoverColor : (currentSettings.navHoverColor || '#ffc107'),
            showContactInfo: showContactInfo !== undefined ? showContactInfo : (currentSettings.showContactInfo !== undefined ? currentSettings.showContactInfo : true),
            mainBgColor: mainBgColor !== undefined ? mainBgColor : (currentSettings.mainBgColor || '#ffffff'),
            searchPlaceholder: searchPlaceholder !== undefined ? searchPlaceholder : (currentSettings.searchPlaceholder || 'Search products...'),
            searchBorderColor: searchBorderColor !== undefined ? searchBorderColor : (currentSettings.searchBorderColor || '#cccccc'),
            iconColor: iconColor !== undefined ? iconColor : (currentSettings.iconColor || '#333333')
        };
        
        await writeHeaderBannerSettings(updatedSettings);
        
        res.json({
            success: true,
            message: 'Header banner settings updated successfully',
            settings: updatedSettings
        });
    } catch (error) {
        console.error('[HEADER_BANNER] Error updating settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating header banner settings',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Upload logo
router.post('/api/admin/header-banner/upload-logo', isAuthenticated, logoUpload.single('logoUpload'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }
        
        const logoUrl = `/uploads/logos/${req.file.filename}`;
        
        // Update settings with new logo
        const settings = await readHeaderBannerSettings();
        settings.logoUrl = logoUrl;
        await writeHeaderBannerSettings(settings);
        
        res.json({
            success: true,
            message: 'Logo uploaded successfully',
            logoUrl: logoUrl,
            file: {
                filename: req.file.filename,
                originalName: req.file.originalname,
                size: req.file.size,
                url: logoUrl
            }
        });
    } catch (error) {
        console.error('[HEADER_BANNER] Error uploading logo:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading logo',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Upload logo (alias for compatibility)
router.post('/api/admin/logo-upload', isAuthenticated, logoUpload.single('logoUpload'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }
        
        const logoUrl = `/uploads/logos/${req.file.filename}`;
        
        // Update settings with new logo
        const settings = await readHeaderBannerSettings();
        settings.logoUrl = logoUrl;
        await writeHeaderBannerSettings(settings);
        
        res.json({
            success: true,
            message: 'Logo uploaded successfully',
            logoUrl: logoUrl,
            file: {
                filename: req.file.filename,
                originalName: req.file.originalname,
                size: req.file.size,
                url: logoUrl
            }
        });
    } catch (error) {
        console.error('[LOGO_UPLOAD] Error uploading logo:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading logo',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Delete logo
router.delete('/api/admin/header-banner/logo/:filename', isAuthenticated, async (req, res) => {
    try {
        const { filename } = req.params;
        
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).json({
                success: false,
                message: 'Invalid filename'
            });
        }
        
        const filePath = path.join(LOGO_UPLOAD_DIR, filename);
        
        try {
            await fs.access(filePath);
        } catch (error) {
            return res.status(404).json({
                success: false,
                message: 'Logo not found'
            });
        }
        
        await fs.unlink(filePath);
        
        res.json({
            success: true,
            message: 'Logo deleted successfully'
        });
    } catch (error) {
        console.error('[HEADER_BANNER] Error deleting logo:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting logo',
            error: error.message
        });
    }
});

module.exports = router;
