/**
 * @fileoverview This module provides middleware for reading
 * cookies from the request.
 *
 */

/**
 * This middleware provides support for cookie access.
 *
 * @param {Function} next the wrapped middleware chain
 * @param {Object} app the Stick Application object
 * @returns {Function} a JSGI middleware function
 */
exports.middleware = function session(next, app) {
  return function(req) {
    if (!req.cookies) {
      var cookies = req.cookies = {};
      var cookie = req.headers.cookie;
      if (cookie) {
        cookie.forEach(function(line) {
          line.split('; ').forEach(function(c) {
            c = c.split('=');
            cookies[c[0]] = c[1];
          });
        });
      }
    }
    return next(req);
  };
};