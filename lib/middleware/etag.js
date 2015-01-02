/**
 * @fileOverview Middleware for conditional HTTP GET request based on
 * response body message digests.
 *
 * The response body must implement a digest() method for this middleware to work.
 */

var COMMON_NODE = global.process;
var strings = require('common-utils/strings');
var md5 = require('common-utils/md5').md5;
var Headers = require('../utils/http').Headers;
var ByteString = require('binary').ByteString;

var digest = function() {
  if (COMMON_NODE) {
    var crypto = require('crypto');
    return function(body) {
      var r = crypto.createHash('md5');
      body.forEach(function(part) {
        r.update(part.buffer);
      });
      return r.digest('hex');
    };
  } else {
    return function(body) {
      var b = [];
      body.forEach(function(part) {
        b.push(part.toArray());
      });
      return md5(Array.prototype.concat.apply([], b)).toLowerCase();
    };
  }
}();

function getETags(request) {
  var header = request.headers["if-none-match"];
  return header ? header[0].split(",").map(function(s) {
    return s.trim();
  }) : [];
}

/**
 * Middleware for conditional HTTP GET request based on
 * response body message digests.
 * @param {Function} next the wrapped middleware chain
 * @param {Object} app the Stick Application object
 * @returns {Function} a JSGI middleware function
 */
exports.middleware = function etag(next, app) {
  return function etag(request) {
    var res = next(request);
    var body = res.body;

    if (res.status === 200) {
      var code;
      // if body provides a digest() method use that
      if (typeof body.digest === "function") {
        code = body.digest();
      } else {
        // we can't rely on body having map(), so we fake it with forEach()
        var binBody = [];
        var length = 0;
        body.forEach(function(part) {
          part = part.toByteString();
          binBody.push(part);
          length += part.length;
        });
        if (length) {
          code = digest(binBody);
          binBody.digest = function() {
            return code;
          };
        }
      }
      if (code) {
        var etag = '"' + code + '"';
        var headers = Headers(res.headers);
        headers.set('ETag', etag);
        if (strings.contains(getETags(request), etag)) {
          // return not-modified response
          headers.unset('Content-Length');
          return {status:304, headers:headers, body:[]};
        }
      }

      if (binBody) {
        // body has been converted to ByteStrings as a byproduct of digest()
        res.body = binBody;
      }
    }
    return res;
  };
};