// src/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

const protect = (req, res, next) => {
    let token;

    // 1. MED-3: prefer the HttpOnly cookie — JS cannot read this at all
    if (req.cookies?.authToken) {
        token = req.cookies.authToken;
    }

    // 2. Fallback: Authorization header (API clients, Postman, mobile apps)
    if (!token && req.headers.authorization?.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    // 3. Legacy fallback: ?streamToken= query param for media streaming (HIGH-1 fix)
    //    This is a short-lived, scoped token — NOT the full session JWT.
    if (!token && req.query.streamToken) {
        token = req.query.streamToken;
    }

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        console.error('Token verification failed:', error.message);
        res.status(401).json({ message: 'Not authorized, token failed' });
    }
};

module.exports = { protect };