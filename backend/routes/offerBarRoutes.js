const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

// Authentication middleware
const { isAuthenticated } = require('../middleware/employeeAuth');

// Path to the offer bar settings JSON file
const OFFER_BAR_FILE = path.join(__dirname, '../data/offer-bar-settings.json');

// Helper functions
async function readOfferBarSettings() {
    try {
        const data = await fs.readFile(OFFER_BAR_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.log('[OFFER_BAR] Settings file not found, using defaults');
        return {
            isActive: true,
            offerText: '🎉 Special Offer: Get 20% OFF on all office furniture! Limited time only!',
            buttonText: 'Shop Now',
            offerLink: '/products',
            backgroundColor: '#ffc107',
            textColor: '#333333',
            showContent: true,
            showInactive: false
        };
    }
}

async function writeOfferBarSettings(settings) {
    try {
        const dataDir = path.dirname(OFFER_BAR_FILE);
        await fs.mkdir(dataDir, { recursive: true });
        settings.updatedAt = new Date().toISOString();
        await fs.writeFile(OFFER_BAR_FILE, JSON.stringify(settings, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('[OFFER_BAR] Error writing settings:', error);
        throw error;
    }
}

// PUBLIC ENDPOINT: Get offer bar data
router.get('/api/header-offer-bar', async (req, res) => {
    try {
        const settings = await readOfferBarSettings();
        res.json({
            success: true,
            ...settings
        });
    } catch (error) {
        console.error('[OFFER_BAR] Error fetching offer bar:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching offer bar data',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Get offer bar data for CMS
router.get('/api/admin/offer-bar', isAuthenticated, async (req, res) => {
    try {
        const settings = await readOfferBarSettings();
        res.json({
            success: true,
            settings: settings
        });
    } catch (error) {
        console.error('[OFFER_BAR] Error fetching admin offer bar:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching offer bar data',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Update offer bar settings
router.post('/api/admin/offer-bar', isAuthenticated, express.json(), async (req, res) => {
    try {
        const {
            isActive,
            offerText,
            buttonText,
            offerLink,
            backgroundColor,
            textColor,
            showContent,
            showInactive
        } = req.body;
        
        // Validate required fields
        if (offerText === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Offer text is required'
            });
        }
        
        const updatedSettings = {
            isActive: isActive !== undefined ? isActive : true,
            offerText: offerText || '',
            buttonText: buttonText || 'Shop Now',
            offerLink: offerLink || '/products',
            backgroundColor: backgroundColor || '#ffc107',
            textColor: textColor || '#333333',
            showContent: showContent !== undefined ? showContent : true,
            showInactive: showInactive !== undefined ? showInactive : false
        };
        
        await writeOfferBarSettings(updatedSettings);
        
        res.json({
            success: true,
            message: 'Offer bar settings updated successfully',
            settings: updatedSettings
        });
    } catch (error) {
        console.error('[OFFER_BAR] Error updating settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating offer bar settings',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Update offer bar settings (Alternative endpoint for CMS form)
router.post('/api/cms/header-offer', isAuthenticated, express.json(), async (req, res) => {
    try {
        const {
            isActive,
            offerText,
            buttonText,
            offerLink,
            backgroundColor,
            textColor,
            showContent,
            showInactive
        } = req.body;
        
        // Validate required fields
        if (offerText === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Offer text is required'
            });
        }
        
        const updatedSettings = {
            isActive: isActive !== undefined ? isActive : true,
            offerText: offerText || '',
            buttonText: buttonText || 'Shop Now',
            offerLink: offerLink || '/products',
            backgroundColor: backgroundColor || '#ffc107',
            textColor: textColor || '#333333',
            showContent: showContent !== undefined ? showContent : true,
            showInactive: showInactive !== undefined ? showInactive : false
        };
        
        await writeOfferBarSettings(updatedSettings);
        
        res.json({
            success: true,
            message: 'Offer bar settings updated successfully',
            settings: updatedSettings
        });
    } catch (error) {
        console.error('[OFFER_BAR] Error updating settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating offer bar settings',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Toggle offer bar activation
router.post('/api/admin/offer-bar/toggle', isAuthenticated, express.json(), async (req, res) => {
    try {
        const settings = await readOfferBarSettings();
        settings.isActive = !settings.isActive;
        await writeOfferBarSettings(settings);
        
        res.json({
            success: true,
            message: `Offer bar ${settings.isActive ? 'activated' : 'deactivated'} successfully`,
            isActive: settings.isActive
        });
    } catch (error) {
        console.error('[OFFER_BAR] Error toggling offer bar:', error);
        res.status(500).json({
            success: false,
            message: 'Error toggling offer bar',
            error: error.message
        });
    }
});

module.exports = router;
