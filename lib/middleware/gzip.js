/**
 * @fileOverview Middleware for on-the-fly GZip compression of response bodies.
 *
 * By default only text content types are compressed. This can be controlled
 * using the `gzip.contentTypes` property:
 * @example
 * app.configure("gzip");
 * app.gzip.contentTypes = /^text|xml|json|javascript/;
 *
 */
var zlib = require('zlib');
var Binary = require('binary').Binary;
var Stream = require('io').Stream;
var Headers = require('../utils/http').Headers;

var CHARSET_PATTERN = /charset=([^;]+)/;
function getCharset(contentType) {
  var value = CHARSET_PATTERN.exec(contentType);
  return value && value[1];
}

/**
 * JSGI middleware for GZIP compression.
 * @param {Function} next the wrapped middleware chain
 * @param {Object} app the Stick Application object
 * @returns {Function} a JSGI middleware function
 */
exports.middleware = function(next, app) {
  // app.gzip.contentTypes is a regular expression that use used to determine
  // whether or not gzip encoding should be applied to a response
  app.gzip = {
    contentTypes:/^text|xml|json|javascript/,
    options:{
      chunkSize:256 * 1024,
      windowBits:15,
      level:zlib.Z_BEST_COMPRESSION,
      memLevel:9
    }
  };

  // Return true if content-type matches regex and other conditions are met
  function canCompress(status, acceptEncoding, contentType, contentEncoding) {
    if (status === 200 && acceptEncoding && contentType && !contentEncoding) {
      if (typeof acceptEncoding !== 'string') {
        acceptEncoding = acceptEncoding.join(', ');
      }
      if (typeof contentType !== 'string') {
        contentType = contentType.join(', ');
      }
      return ~acceptEncoding.indexOf('gzip') && app.gzip.contentTypes.test(contentType);
    }
    return false;
  }

  return function(request) {
    var res = next(request);
    var headers = Headers(res.headers);
    var contentType = headers.get('Content-Type');

    if (canCompress(res.status, request.headers['accept-encoding'], contentType, headers.get('Content-Encoding'))) {
      headers.set('Content-Encoding', 'gzip');
      var gzip = zlib.createGzip(app.gzip.options);
      var charset = getCharset(contentType);
      res.body.forEach(function(part) {
        if (!(part instanceof Binary)) {
          part = part.toByteString(charset);
        }
        gzip.write(part.buffer);
      });
      gzip.end();
      gzip.writeable = false;
      res.body = [new Stream(gzip).read()];
    }
    return res;
  };
};