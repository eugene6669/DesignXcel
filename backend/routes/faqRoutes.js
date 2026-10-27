const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

// Authentication middleware
const { isAuthenticated } = require('../middleware/employeeAuth');

// Path to the FAQ/auto-messages data JSON file
const FAQ_FILE = path.join(__dirname, '../data/faq-data.json');

// Helper functions
async function readFAQData() {
    try {
        const data = await fs.readFile(FAQ_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.log('[FAQ] Data file not found, using defaults');
        return {
            faqs: [],
            updatedAt: new Date().toISOString()
        };
    }
}

async function writeFAQData(data) {
    try {
        const dataDir = path.dirname(FAQ_FILE);
        await fs.mkdir(dataDir, { recursive: true });
        data.updatedAt = new Date().toISOString();
        await fs.writeFile(FAQ_FILE, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('[FAQ] Error writing data:', error);
        throw error;
    }
}

// PUBLIC ENDPOINT: Get all active FAQs
router.get('/api/faqs', async (req, res) => {
    try {
        const data = await readFAQData();
        const activeFAQs = data.faqs.filter(f => f.isActive !== false);
        
        res.json({
            success: true,
            faqs: activeFAQs
        });
    } catch (error) {
        console.error('[FAQ] Error fetching FAQs:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching FAQs',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Get all FAQs (including inactive)
router.get('/api/cms/auto-messages', isAuthenticated, async (req, res) => {
    try {
        const data = await readFAQData();
        
        res.json({
            success: true,
            faqs: data.faqs
        });
    } catch (error) {
        console.error('[FAQ] Error fetching admin FAQs:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching FAQs',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Get single FAQ by ID
router.get('/api/cms/auto-messages/:id', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const data = await readFAQData();
        const faq = data.faqs.find(f => f.id === parseInt(id));
        
        if (!faq) {
            return res.status(404).json({
                success: false,
                message: 'FAQ not found'
            });
        }
        
        res.json({
            success: true,
            faq: faq
        });
    } catch (error) {
        console.error('[FAQ] Error fetching FAQ:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching FAQ',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Create new FAQ
router.post('/api/cms/auto-messages', isAuthenticated, express.json(), async (req, res) => {
    try {
        const {
            question,
            answer,
            keywords,
            isActive
        } = req.body;
        
        if (!question || !answer) {
            return res.status(400).json({
                success: false,
                message: 'Question and answer are required'
            });
        }
        
        const data = await readFAQData();
        
        // Generate new ID
        const newId = data.faqs.length > 0 
            ? Math.max(...data.faqs.map(f => f.id)) + 1 
            : 1;
        
        const newFAQ = {
            id: newId,
            question: question,
            answer: answer,
            keywords: keywords || '',
            isActive: isActive !== undefined ? isActive : true,
            createdAt: new Date().toISOString()
        };
        
        data.faqs.push(newFAQ);
        await writeFAQData(data);
        
        res.json({
            success: true,
            message: 'FAQ created successfully',
            faq: newFAQ
        });
    } catch (error) {
        console.error('[FAQ] Error creating FAQ:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating FAQ',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Update FAQ
router.put('/api/cms/auto-messages/:id', isAuthenticated, express.json(), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            question,
            answer,
            keywords,
            isActive
        } = req.body;
        
        const data = await readFAQData();
        const faqIndex = data.faqs.findIndex(f => f.id === parseInt(id));
        
        if (faqIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'FAQ not found'
            });
        }
        
        // Update FAQ
        const updatedFAQ = {
            ...data.faqs[faqIndex],
            question: question !== undefined ? question : data.faqs[faqIndex].question,
            answer: answer !== undefined ? answer : data.faqs[faqIndex].answer,
            keywords: keywords !== undefined ? keywords : data.faqs[faqIndex].keywords,
            isActive: isActive !== undefined ? isActive : data.faqs[faqIndex].isActive,
            updatedAt: new Date().toISOString()
        };
        
        data.faqs[faqIndex] = updatedFAQ;
        await writeFAQData(data);
        
        res.json({
            success: true,
            message: 'FAQ updated successfully',
            faq: updatedFAQ
        });
    } catch (error) {
        console.error('[FAQ] Error updating FAQ:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating FAQ',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Delete FAQ
router.delete('/api/cms/auto-messages/:id', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const data = await readFAQData();
        const faqIndex = data.faqs.findIndex(f => f.id === parseInt(id));
        
        if (faqIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'FAQ not found'
            });
        }
        
        data.faqs.splice(faqIndex, 1);
        await writeFAQData(data);
        
        res.json({
            success: true,
            message: 'FAQ deleted successfully'
        });
    } catch (error) {
        console.error('[FAQ] Error deleting FAQ:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting FAQ',
            error: error.message
        });
    }
});

module.exports = router;
