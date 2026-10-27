const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');

// Authentication middleware
const { isAuthenticated } = require('../middleware/employeeAuth');

// Path to the projects data JSON file
const PROJECTS_FILE = path.join(__dirname, '../data/projects-data.json');
const PROJECTS_UPLOAD_DIR = path.join(__dirname, '../public/uploads/projects');

// Multer configuration for project images
const projectStorage = multer.diskStorage({
    destination: async function (req, file, cb) {
        try {
            await fs.mkdir(PROJECTS_UPLOAD_DIR, { recursive: true });
            cb(null, PROJECTS_UPLOAD_DIR);
        } catch (error) {
            cb(error);
        }
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const basename = path.basename(file.originalname, ext)
            .replace(/[^a-zA-Z0-9]/g, '-')
            .toLowerCase();
        cb(null, `project-${basename}-${uniqueSuffix}${ext}`);
    }
});

const projectFileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed for projects!'));
    }
};

const projectUpload = multer({
    storage: projectStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: projectFileFilter
});

// Helper functions
async function readProjectsData() {
    try {
        const data = await fs.readFile(PROJECTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.log('[PROJECTS] Data file not found, using defaults');
        return {
            projects: [],
            updatedAt: new Date().toISOString()
        };
    }
}

async function writeProjectsData(data) {
    try {
        const dataDir = path.dirname(PROJECTS_FILE);
        await fs.mkdir(dataDir, { recursive: true });
        data.updatedAt = new Date().toISOString();
        await fs.writeFile(PROJECTS_FILE, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('[PROJECTS] Error writing data:', error);
        throw error;
    }
}

// PUBLIC ENDPOINT: Get all active projects
router.get('/api/projects', async (req, res) => {
    try {
        const data = await readProjectsData();
        const activeProjects = data.projects.filter(p => p.isActive !== false);
        
        res.json({
            success: true,
            projects: activeProjects
        });
    } catch (error) {
        console.error('[PROJECTS] Error fetching projects:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching projects',
            error: error.message
        });
    }
});

// PUBLIC ENDPOINT: Get single project by ID
router.get('/api/projects/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = await readProjectsData();
        const project = data.projects.find(p => p.id === parseInt(id));
        
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }
        
        res.json({
            success: true,
            project: project
        });
    } catch (error) {
        console.error('[PROJECTS] Error fetching project:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching project',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Get all projects (including inactive)
router.get('/api/admin/projects', isAuthenticated, async (req, res) => {
    try {
        const data = await readProjectsData();
        
        // Get list of available project images
        let availableImages = [];
        try {
            await fs.mkdir(PROJECTS_UPLOAD_DIR, { recursive: true });
            const files = await fs.readdir(PROJECTS_UPLOAD_DIR);
            availableImages = files.filter(file => {
                const ext = path.extname(file).toLowerCase();
                return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
            }).map(filename => ({
                filename: filename,
                url: `/uploads/projects/${filename}`
            }));
        } catch (error) {
            console.log('[PROJECTS] Error reading projects directory:', error.message);
        }
        
        res.json({
            success: true,
            projects: data.projects,
            availableImages: availableImages
        });
    } catch (error) {
        console.error('[PROJECTS] Error fetching admin projects:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching projects',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Get all projects (CMS alias)
router.get('/api/cms/projects', isAuthenticated, async (req, res) => {
    try {
        const data = await readProjectsData();
        
        // Get list of available project images
        let availableImages = [];
        try {
            await fs.mkdir(PROJECTS_UPLOAD_DIR, { recursive: true });
            const files = await fs.readdir(PROJECTS_UPLOAD_DIR);
            availableImages = files.filter(file => {
                const ext = path.extname(file).toLowerCase();
                return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
            }).map(filename => ({
                filename: filename,
                url: `/uploads/projects/${filename}`
            }));
        } catch (error) {
            console.log('[PROJECTS] Error reading projects directory:', error.message);
        }
        
        res.json({
            success: true,
            projects: data.projects,
            availableImages: availableImages
        });
    } catch (error) {
        console.error('[PROJECTS] Error fetching CMS projects:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching projects',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Create new project (CMS alias)
router.post('/api/cms/projects', isAuthenticated, projectUpload.fields([
    { name: 'mainImage', maxCount: 1 },
    { name: 'thumbnails', maxCount: 10 }
]), async (req, res) => {
    try {
        const {
            title,
            description,
            category,
            tags,
            isActive
        } = req.body;
        
        if (!title || !description) {
            return res.status(400).json({
                success: false,
                message: 'Title and description are required'
            });
        }
        
        const data = await readProjectsData();
        
        // Generate new ID
        const newId = data.projects.length > 0 
            ? Math.max(...data.projects.map(p => p.id)) + 1 
            : 1;
        
        // Handle uploaded images
        let mainImageUrl = '/uploads/projects/default.jpg';
        if (req.files && req.files.mainImage && req.files.mainImage.length > 0) {
            mainImageUrl = `/uploads/projects/${req.files.mainImage[0].filename}`;
        }
        
        let thumbnailUrls = [];
        if (req.files && req.files.thumbnails) {
            thumbnailUrls = req.files.thumbnails.map(file => `/uploads/projects/${file.filename}`);
        }
        
        const newProject = {
            id: newId,
            title: title,
            description: description,
            category: category || 'General',
            mainImageUrl: mainImageUrl,
            thumbnailUrls: thumbnailUrls,
            tags: tags ? (Array.isArray(tags) ? tags : [tags]) : [],
            isActive: isActive !== undefined ? isActive : true,
            createdAt: new Date().toISOString()
        };
        
        data.projects.push(newProject);
        await writeProjectsData(data);
        
        res.json({
            success: true,
            message: 'Project created successfully',
            project: newProject
        });
    } catch (error) {
        console.error('[PROJECTS] Error creating project:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating project',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Create new project
router.post('/api/admin/projects', isAuthenticated, express.json(), async (req, res) => {
    try {
        const {
            title,
            description,
            category,
            mainImageUrl,
            thumbnailUrls,
            tags,
            isActive
        } = req.body;
        
        if (!title || !description) {
            return res.status(400).json({
                success: false,
                message: 'Title and description are required'
            });
        }
        
        const data = await readProjectsData();
        
        // Generate new ID
        const newId = data.projects.length > 0 
            ? Math.max(...data.projects.map(p => p.id)) + 1 
            : 1;
        
        const newProject = {
            id: newId,
            title: title,
            description: description,
            category: category || 'General',
            mainImageUrl: mainImageUrl || '/uploads/projects/default.jpg',
            thumbnailUrls: Array.isArray(thumbnailUrls) ? thumbnailUrls : [],
            tags: Array.isArray(tags) ? tags : [],
            isActive: isActive !== undefined ? isActive : true,
            createdAt: new Date().toISOString()
        };
        
        data.projects.push(newProject);
        await writeProjectsData(data);
        
        res.json({
            success: true,
            message: 'Project created successfully',
            project: newProject
        });
    } catch (error) {
        console.error('[PROJECTS] Error creating project:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating project',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Update project (CMS alias)
router.put('/api/cms/projects/:id', isAuthenticated, projectUpload.fields([
    { name: 'mainImage', maxCount: 1 },
    { name: 'thumbnails', maxCount: 10 }
]), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            description,
            category,
            tags,
            isActive
        } = req.body;
        
        const data = await readProjectsData();
        const projectIndex = data.projects.findIndex(p => p.id === parseInt(id));
        
        if (projectIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }
        
        // Handle uploaded images
        let mainImageUrl = data.projects[projectIndex].mainImageUrl;
        if (req.files && req.files.mainImage && req.files.mainImage.length > 0) {
            mainImageUrl = `/uploads/projects/${req.files.mainImage[0].filename}`;
        }
        
        let thumbnailUrls = data.projects[projectIndex].thumbnailUrls;
        if (req.files && req.files.thumbnails) {
            const newThumbnails = req.files.thumbnails.map(file => `/uploads/projects/${file.filename}`);
            thumbnailUrls = [...thumbnailUrls, ...newThumbnails];
        }
        
        // Update project
        const updatedProject = {
            ...data.projects[projectIndex],
            title: title !== undefined ? title : data.projects[projectIndex].title,
            description: description !== undefined ? description : data.projects[projectIndex].description,
            category: category !== undefined ? category : data.projects[projectIndex].category,
            mainImageUrl: mainImageUrl,
            thumbnailUrls: thumbnailUrls,
            tags: tags !== undefined ? (Array.isArray(tags) ? tags : [tags]) : data.projects[projectIndex].tags,
            isActive: isActive !== undefined ? isActive : data.projects[projectIndex].isActive,
            updatedAt: new Date().toISOString()
        };
        
        data.projects[projectIndex] = updatedProject;
        await writeProjectsData(data);
        
        res.json({
            success: true,
            message: 'Project updated successfully',
            project: updatedProject
        });
    } catch (error) {
        console.error('[PROJECTS] Error updating project:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating project',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Update project
router.put('/api/admin/projects/:id', isAuthenticated, express.json(), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            description,
            category,
            mainImageUrl,
            thumbnailUrls,
            tags,
            isActive
        } = req.body;
        
        const data = await readProjectsData();
        const projectIndex = data.projects.findIndex(p => p.id === parseInt(id));
        
        if (projectIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }
        
        // Update project
        const updatedProject = {
            ...data.projects[projectIndex],
            title: title !== undefined ? title : data.projects[projectIndex].title,
            description: description !== undefined ? description : data.projects[projectIndex].description,
            category: category !== undefined ? category : data.projects[projectIndex].category,
            mainImageUrl: mainImageUrl !== undefined ? mainImageUrl : data.projects[projectIndex].mainImageUrl,
            thumbnailUrls: thumbnailUrls !== undefined ? thumbnailUrls : data.projects[projectIndex].thumbnailUrls,
            tags: tags !== undefined ? tags : data.projects[projectIndex].tags,
            isActive: isActive !== undefined ? isActive : data.projects[projectIndex].isActive,
            updatedAt: new Date().toISOString()
        };
        
        data.projects[projectIndex] = updatedProject;
        await writeProjectsData(data);
        
        res.json({
            success: true,
            message: 'Project updated successfully',
            project: updatedProject
        });
    } catch (error) {
        console.error('[PROJECTS] Error updating project:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating project',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Delete project (CMS alias)
router.delete('/api/cms/projects/:id', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const data = await readProjectsData();
        const projectIndex = data.projects.findIndex(p => p.id === parseInt(id));
        
        if (projectIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }
        
        data.projects.splice(projectIndex, 1);
        await writeProjectsData(data);
        
        res.json({
            success: true,
            message: 'Project deleted successfully'
        });
    } catch (error) {
        console.error('[PROJECTS] Error deleting project:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting project',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Delete project
router.delete('/api/admin/projects/:id', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const data = await readProjectsData();
        const projectIndex = data.projects.findIndex(p => p.id === parseInt(id));
        
        if (projectIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }
        
        data.projects.splice(projectIndex, 1);
        await writeProjectsData(data);
        
        res.json({
            success: true,
            message: 'Project deleted successfully'
        });
    } catch (error) {
        console.error('[PROJECTS] Error deleting project:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting project',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Upload project images
router.post('/api/admin/projects/upload', isAuthenticated, projectUpload.array('images', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No files uploaded'
            });
        }
        
        const uploadedFiles = req.files.map(file => ({
            filename: file.filename,
            originalName: file.originalname,
            size: file.size,
            url: `/uploads/projects/${file.filename}`
        }));
        
        res.json({
            success: true,
            message: `${uploadedFiles.length} image(s) uploaded successfully`,
            files: uploadedFiles
        });
    } catch (error) {
        console.error('[PROJECTS] Error uploading images:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading images',
            error: error.message
        });
    }
});

// ADMIN ENDPOINT: Delete project image
router.delete('/api/admin/projects/image/:filename', isAuthenticated, async (req, res) => {
    try {
        const { filename } = req.params;
        
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).json({
                success: false,
                message: 'Invalid filename'
            });
        }
        
        const filePath = path.join(PROJECTS_UPLOAD_DIR, filename);
        
        try {
            await fs.access(filePath);
        } catch (error) {
            return res.status(404).json({
                success: false,
                message: 'Image not found'
            });
        }
        
        await fs.unlink(filePath);
        
        res.json({
            success: true,
            message: 'Image deleted successfully'
        });
    } catch (error) {
        console.error('[PROJECTS] Error deleting image:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting image',
            error: error.message
        });
    }
});

module.exports = router;
