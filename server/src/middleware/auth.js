const jwt = require('jsonwebtoken');
const config = require('../config/config');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, config.JWT_SECRET);

      // Attach user from database
      const user = await User.findById(decoded.id).select('-password_hash');
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'User account not found',
        });
      }

      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          error: 'User account is deactivated',
        });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error('[Auth Middleware] Invalid token:', error.message);
      return res.status(401).json({
        success: false,
        error: 'Not authorized, token failed or expired',
      });
    }
  } else {
    return res.status(401).json({
      success: false,
      error: 'Not authorized, no authorization header with Bearer token provided',
    });
  }
};

module.exports = { protect };
