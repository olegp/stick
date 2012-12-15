/**
 * @fileOverview Middleware for conditional HTTP GET request based on
 * response body message digests.
 *
 * The response body must implement a digest() method for this middleware to work.
 */

var strings = require('common-utils/strings');
var md5 = require('common-utils/md5').md5;
var Headers = require('../utils/http').Headers;
var ByteString = require('binary').ByteString;

/**
 * Middleware for conditional HTTP GET request based on
 * response body message digests.
 * @param {Function} next the wrapped middleware chain
 * @param {Object} app the Stick Application object
 * @returns {Function} a JSGI middleware function
 */
exports.middleware = function etag(next, app) {

    function digest(body) {
        var b = [];
        body.forEach(function(part) {
            b.push(part.toArray());
        });
        return md5(Array.prototype.concat.apply([], b)).toLowerCase();
    }

    return function etag(request) {

        var res = next(request);
        var status = res.status, headers = res.headers, body = res.body;

        if (status === 200) {
            var etags, etag;
            var header = request.headers["if-none-match"];
            if (header) {
                etags = header.split(",").map(function(s) { return s.trim(); }); 
            }
            // if body provides a digest() method use that
            if (typeof body.digest === "function") {
                etag = body.digest();
            } else {
                // we can't rely on body having map(), so we fake it with forEach()
                var binBody = [];
                body.forEach(function(part) {
                    binBody.push(part.toByteString());
                });
                etag = digest(binBody);
            }
            if (etag) {
                etag = '"' + etag + '"';
                headers = Headers(headers);
                headers.set("ETag", etag);

                if (etags && strings.contains(etags, etag)) {
                    // return not-modified response
                    headers.unset('Content-Length');
                    return {status: 304, headers: headers, body: []};
                }
            }

            if (binBody) {
                // body has been converted to ByteStrings as a byproduct of digest()
                res.body = binBody;
            }
        }
        return res;
    };

}
