const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');

// Authentication middleware
const { isAuthenticated } = require('../middleware/employeeAuth');

// Path to the hero banner settings JSON file
const HERO_BANNER_FILE = path.join(__dirname, '../data/hero-banner-settings.json');
const UPLOAD_DIR = path.join(__dirname, '../public/uploads/hero-banners');

// Multer configuration for hero banner image uploads
const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
        try {
            // Ensure the upload directory exists
            await fs.mkdir(UPLOAD_DIR, { recursive: true });
            cb(null, UPLOAD_DIR);
        } catch (error) {
            cb(error);
        }
    },
    filename: function (req, file, cb) {
        // Generate unique filename with timestamp
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const basename = path.basename(file.originalname, ext)
            .replace(/[^a-zA-Z0-9]/g, '-')
            .toLowerCase();
        cb(null, `hero-${basename}-${uniqueSuffix}${ext}`);
    }
});

// File filter for images only
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed!'));
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB max file size
    },
    fileFilter: fileFilter
});

// Helper function to read hero banner settings
async function readHeroBannerSettings() {
    try {
        const data = await fs.readFile(HERO_BANNER_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // If file doesn't exist, return defaults
        console.log('[HERO_BANNER] Settings file not found, using defaults');
        return {
            mainHeading: 'Premium Office Furniture Solutions',
            descriptionLine1: 'Transform your workspace with our premium collection of office furniture',
            descriptionLine2: 'Discover our premium collection of office furniture designed for modern professionals',
            buttonText: 'SHOP NOW',
            buttonLink: '/products',
            textColor: '#ffffff',
            buttonBgColor: '#ffc107',
            buttonTextColor: '#333333',
            button2Text: '',
            button2Link: '',
            button2BgColor: '#007bff',
            button2TextColor: '#ffffff',
            heroBannerImages: []
        };
    }
}

// Helper function to write hero banner settings
async function writeHeroBannerSettings(settings) {
    try {
        // Ensure data directory exists
        const dataDir = path.dirname(HERO_BANNER_FILE);
        await fs.mkdir(dataDir, { recursive: true });
        
        // Add timestamp
        settings.updatedAt = new Date().toISOString();
        
        // Write to file
        await fs.writeFile(HERO_BANNER_FILE, JSON.stringify(settings, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('[HERO_BANNER] Error writing settings:', error);
        throw error;
    }
}

// PUBLIC ENDPOINT: Get hero banner data (for frontend display)
router.get('/api/hero-banner', async (req, res) => {
    try {
        const heroBanner = await readHeroBannerSettings();
        res.json({
            success: true,
            heroBanner: heroBanner
        });
    } catch (error) {
        console.error('[HERO_BANNER] Error fetching hero banner:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching hero banner data',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Get hero banner data (for CMS editor)
router.get('/api/admin/hero-banner', isAuthenticated, async (req, res) => {
    try {
        const heroBanner = await readHeroBannerSettings();
        
        // Get list of available hero banner images from uploads directory
        let availableImages = [];
        try {
            await fs.mkdir(UPLOAD_DIR, { recursive: true });
            const files = await fs.readdir(UPLOAD_DIR);
            availableImages = files.filter(file => {
                const ext = path.extname(file).toLowerCase();
                return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
            }).map(filename => ({
                filename: filename,
                url: `/uploads/hero-banners/${filename}`
            }));
        } catch (error) {
            console.log('[HERO_BANNER] Error reading upload directory:', error.message);
        }
        
        res.json({
            success: true,
            heroBanner: heroBanner,
            availableImages: availableImages
        });
    } catch (error) {
        console.error('[HERO_BANNER] Error fetching admin hero banner:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching hero banner data',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Update hero banner settings
router.post('/api/admin/hero-banner', isAuthenticated, express.json(), async (req, res) => {
    try {
        const {
            mainHeading,
            descriptionLine1,
            descriptionLine2,
            buttonText,
            buttonLink,
            textColor,
            buttonBgColor,
            buttonTextColor,
            button2Text,
            button2Link,
            button2BgColor,
            button2TextColor,
            heroBannerImages
        } = req.body;
        
        // Validate required fields
        if (!mainHeading || !buttonText || !buttonLink) {
            return res.status(400).json({
                success: false,
                message: 'Main heading, button text, and button link are required'
            });
        }
        
        // Prepare updated settings
        const updatedSettings = {
            mainHeading: mainHeading || '',
            descriptionLine1: descriptionLine1 || '',
            descriptionLine2: descriptionLine2 || '',
            buttonText: buttonText || 'SHOP NOW',
            buttonLink: buttonLink || '/products',
            textColor: textColor || '#ffffff',
            buttonBgColor: buttonBgColor || '#ffc107',
            buttonTextColor: buttonTextColor || '#333333',
            button2Text: button2Text || '',
            button2Link: button2Link || '',
            button2BgColor: button2BgColor || '#007bff',
            button2TextColor: button2TextColor || '#ffffff',
            heroBannerImages: Array.isArray(heroBannerImages) ? heroBannerImages : []
        };
        
        // Save settings
        await writeHeroBannerSettings(updatedSettings);
        
        res.json({
            success: true,
            message: 'Hero banner settings updated successfully',
            heroBanner: updatedSettings
        });
    } catch (error) {
        console.error('[HERO_BANNER] Error updating hero banner:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating hero banner settings',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Upload hero banner images
router.post('/api/admin/hero-banner/upload', isAuthenticated, upload.array('images', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No files uploaded'
            });
        }
        
        // Return uploaded file information
        const uploadedFiles = req.files.map(file => ({
            filename: file.filename,
            originalName: file.originalname,
            size: file.size,
            url: `/uploads/hero-banners/${file.filename}`
        }));
        
        res.json({
            success: true,
            message: `${uploadedFiles.length} image(s) uploaded successfully`,
            files: uploadedFiles
        });
    } catch (error) {
        console.error('[HERO_BANNER] Error uploading images:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading images',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Delete a hero banner image
router.delete('/api/admin/hero-banner/image/:filename', isAuthenticated, async (req, res) => {
    try {
        const { filename } = req.params;
        
        // Security: Prevent directory traversal
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).json({
                success: false,
                message: 'Invalid filename'
            });
        }
        
        const filePath = path.join(UPLOAD_DIR, filename);
        
        // Check if file exists
        try {
            await fs.access(filePath);
        } catch (error) {
            return res.status(404).json({
                success: false,
                message: 'Image not found'
            });
        }
        
        // Delete the file
        await fs.unlink(filePath);
        
        // Remove from hero banner settings if it's there
        const settings = await readHeroBannerSettings();
        settings.heroBannerImages = settings.heroBannerImages.filter(img => {
            const imgFilename = typeof img === 'string' ? img : img.filename;
            return imgFilename !== filename;
        });
        await writeHeroBannerSettings(settings);
        
        res.json({
            success: true,
            message: 'Image deleted successfully'
        });
    } catch (error) {
        console.error('[HERO_BANNER] Error deleting image:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting image',
            error: error.message
        });
    }
});

module.exports = router;
