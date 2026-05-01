const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../../middlewares/auth');

// Ensure upload directory exists
const uploadDir = path.resolve(__dirname, '../../uploads');
console.log('Upload Dir Configured:', uploadDir);
if (!fs.existsSync(uploadDir)) {
    console.log('Creating upload dir...');
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure Storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Generate unique filename: timestamp-random.ext
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only images are allowed!'));
    }
});

// @route   POST api/v1/upload
// @desc    Upload file
// @access  Public (or Protected)
router.post('/', auth, (req, res) => {
    upload.single('file')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            // A Multer error occurred when uploading.
            console.error('Multer Error:', err);
            return res.status(500).json({ code: 500, msg: err.message });
        } else if (err) {
            // An unknown error occurred when uploading.
            console.error('Upload Unknown Error:', err);
            return res.status(500).json({ code: 500, msg: err.message });
        }

        // Everything went fine.
        try {
            if (!req.file) {
                return res.status(400).json({ code: 400, msg: 'No file uploaded' });
            }
            // Return full URL
            const fileUrl = `/uploads/${req.file.filename}`;
            res.json({
                code: 200,
                data: {
                    url: fileUrl,
                    filename: req.file.filename
                }
            });
        } catch (err) {
            console.error('Processing Error:', err);
            res.status(500).json({ code: 500, msg: 'Upload processing failed' });
        }
    });
});

module.exports = router;
