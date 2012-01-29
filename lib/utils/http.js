var binary = require("binary");
var ByteArray = binary.ByteArray, ByteString = binary.ByteString;
var MemoryStream = require("io").MemoryStream;

/**
 * A utility class for implementing JSGI response filters. Each part of the
 * response is first passed to the filter function. If the filter function
 * returns a value, that value is passed on to the JSGI response stream.
 * @param {Object} body a JSGI response body
 * @param {Function} filter a filter function
 */
var ResponseFilter = exports.ResponseFilter = function(body, filter) {
    /**
     * forEach function called by the JSGI connector.
     * @param {Function} fn the response handler callback function
     */
    this.forEach = function(fn) {
        body.forEach(function(block) {
            var filtered = filter(block);
            if (filtered != null) {
                fn(filtered);
            }
        });
    };
}

/**
 * Returns an object for use as a HTTP header collection. The returned object
 * provides methods for setting, getting, and deleting its properties in a case-insensitive and
 * case-preserving way.
 *
 * This function can be used as mixin for an existing JavaScript object or as a constructor.
 * @param {Object} headers an existing JS object. If undefined, a new object is created
 */
var Headers = exports.Headers = function(headers) {
    // when is a duck a duck?
    if (headers && headers.get && headers.set) {
        return headers;
    }

    headers = headers || {};
    var keys = {};
    // populate internal lower case to original case map
    for (var key in headers) {
        keys[String(key).toLowerCase()] = key;
    }

    /**
     * Get the value of the header with the given name
     * @param {String} name the header name
     * @returns the header value
     * @name Headers.instance.get
     */
    Object.defineProperty(headers, "get", {
        value: function(key) {
            var value = this[key];
            if (value === undefined) {
                value = (key = keys[key.toLowerCase()]) && this[key];
            }
            return value;
        }
    });

    /**
     * Set the header with the given name to the given value.
     * @param {String} name the header name
     * @param {String} value the header value
     * @name Headers.instance.set
     */
    Object.defineProperty(headers, "set", {
        value: function(key, value) {
            // JSGI uses \n as separator for mulitple headers
            value = value.replace(/\n/g, "");
            var oldkey = keys[key.toLowerCase()];
            if (oldkey) {
                delete this[oldkey];
            }
            this[key] = value;
            keys[key.toLowerCase()] = key;
        }
    });

    /**
     * Add a header with the given name and value.
     * @param {String} name the header name
     * @param {String} value the header value
     * @name Headers.instance.add
     */
    Object.defineProperty(headers, "add", {
        value: function(key, value) {
            // JSGI uses \n as separator for mulitple headers
            value = value.replace(/\n/g, "");
            if (this[key]) {
                // shortcut
                this[key] = this[key] + "\n" + value;
                return;
            }
            var lowerkey = key.toLowerCase();
            var oldkey = keys[lowerkey];
            if (oldkey) {
                value = this[oldkey] + "\n" + value;
                if (key !== oldkey)
                    delete this[oldkey];
            }
            this[key] = value;
            keys[lowerkey] = key;
        }

    });

    /**
     * Queries whether a header with the given name is set
     * @param {String} name the header name
     * @returns {Boolean} true if a header with this name is set
     * @name Headers.instance.contains
     */
    Object.defineProperty(headers, "contains", {
        value: function(key) {
            return Boolean(this[key] !== undefined
                || (key = keys[key.toLowerCase()]) && this[key] !== undefined);
        }
    });

    /**
     * Unsets any cookies with the given name
     * @param {String} name the header name
     * @name Headers.instance.unset
     */
    Object.defineProperty(headers, "unset", {
        value: function(key) {
           key = key.toLowerCase();
            if (key in keys) {
                delete this[keys[key]]
                delete keys[key];
            }
        }
    });

    /**
     * Returns a string representation of the headers in MIME format.
     * @returns {String} a string representation of the headers
     * @name Headers.instance.toString
     */
    Object.defineProperty(headers, "toString", {
         value: function() {
            var buffer = new Buffer();
            for (var key in this) {
                this[key].split("\n").forEach(function(value) {
                    buffer.write(key).write(": ").writeln(value);
                });
            }
            return buffer.toString();
        }
    });

    return headers;
}

/**
 * Get a parameter from a MIME header value. For example, calling this function
 * with "Content-Type: text/plain; charset=UTF-8" and "charset" will return "UTF-8".
 * @param {String} headerValue a header value
 * @param {String} paramName a MIME parameter name
 */
var getMimeParameter = exports.getMimeParameter = function(headerValue, paramName) {
    if (!headerValue)
        return null;
    var start, end = 0;
    paramName = paramName.toLowerCase();
    while((start = headerValue.indexOf(";", end)) > -1) {
        end = headerValue.indexOf(";", ++start);
        if (end < 0)
            end = headerValue.length;
        var eq = headerValue.indexOf("=", start);
        if (eq > start && eq < end) {
            var name = headerValue.slice(start, eq);
            if (name.toLowerCase().trim() == paramName) {
                var value = headerValue.slice(eq + 1, end).trim();
                if (strings.startsWith(value, '"') && strings.endsWith(value, '"')) {
                    return value.slice(1, -1).replace('\\\\', '\\').replace('\\"', '"');
                } else if (strings.startsWith(value, '<') && strings.endsWith(value, '>')) {
                    return value.slice(1, -1);
                }

                return value;
            }
        }
    }
    return null;
}

/**
 * Encode an object's properties into an URL encoded string.
 * @param {Object} object an object
 * @returns {String} a string containing the URL encoded properties of the object
 */
var urlEncode = exports.urlEncode = function(object) {
    var buf = new Buffer();
    var key, value;
    for (key in object) {
        value = object[key];
        if (value instanceof Array) {
            for (var i = 0; i < value.length; i++) {
                if (buf.length) buf.write("&");
                buf.write(encodeURIComponent(key), "=", encodeURIComponent(value[i]));
            }
        } else {
            if (buf.length) buf.write("&");
            buf.write(encodeURIComponent(key), "=", encodeURIComponent(value));
        }
    }
    return buf.toString();
}

//used for multipart parsing
var HYPHEN  = "-".charCodeAt(0);
var CR = "\r".charCodeAt(0);
var CRLF = new ByteString("\r\n", "ASCII");
var EMPTY_LINE = new ByteString("\r\n\r\n", "ASCII");

/**
 * Find out whether the content type denotes a format this module can parse.
 * @param {String} contentType a HTTP request Content-Type header
 * @return true if the content type can be parsed as form data by this module
 */
var isFileUpload = exports.isFileUpload = function(contentType) {
    return contentType && strings.startsWith(
            String(contentType).toLowerCase(), "multipart/form-data");
}

/**
 * Parses a multipart MIME input stream.
 * Parses a multipart MIME input stream.
 * @param {Object} request the JSGI request object
 * @param {Object} params the parameter object to parse into. If not defined
 *        a new object is created and returned.
 * @param {string} encoding optional encoding to apply to non-file parameters.
 *        Defaults to "UTF-8".
 * @param {function} streamFactory factory function to create streams for mime parts
 * @returns {Object} the parsed parameter object
 */
var parseFileUpload = exports.parseFileUpload = function(request, params, encoding, streamFactory) {
    params = params || {};
    encoding = encoding || "UTF-8";
    streamFactory = streamFactory || BufferFactory;
    var boundary = getMimeParameter(request.headers["content-type"], "boundary");
    if (!boundary) {
        return params;
    }
    boundary = new ByteArray("--" + boundary, "ASCII");
    var input = request.input;
    var buflen = 8192;
    var refillThreshold = 1024; // minimum fill to start parsing
    var buffer = new ByteArray(buflen); // input buffer
    var data;  // data object for current mime part properties
    var stream; // stream to write current mime part to
    var eof = false;
    // the central variables for managing the buffer:
    // current position and end of read bytes
    var position = 0, limit = 0;

    var refill = function(waitForMore) {
        if (position > 0) {
            // "compact" buffer
            if (position < limit) {
                buffer.copy(position, limit, buffer, 0);
                limit -= position;
                position = 0;
            } else {
                position = limit = 0;
            }
        }
        // read into buffer starting at limit
        var totalRead = 0;
        do {
            var read = input.readInto(buffer, limit, buffer.length);
            if (read > -1) {
                totalRead += read;
                limit += read;
            } else {
                eof = true;
            }
        } while (waitForMore && !eof && limit < buffer.length);
        return totalRead;
    };

    refill();

    while (position < limit) {
        if (!data) {
            // refill buffer if we don't have enough fresh bytes
            if (!eof && limit - position < refillThreshold) {
                refill(true);
            }
            var boundaryPos = buffer.indexOf(boundary, position, limit);
            if (boundaryPos < 0) {
                throw new Error("boundary not found in multipart stream");
            }
            // move position past boundary to beginning of multipart headers
            position = boundaryPos + boundary.length + CRLF.length;
            if (buffer[position - 2] == HYPHEN && buffer[position - 1] == HYPHEN) {
                // reached final boundary
                break;
            }
            var b = buffer.indexOf(EMPTY_LINE, position, limit);
            if (b < 0) {
                throw new Error("could not parse headers");
            }
            data = {};
            var headers = [];
            buffer.slice(position, b).split(CRLF).forEach(function(line) {
                line = line.decodeToString(encoding);
                // unfold multiline headers
                if ((strings.startsWith(line, " ") || strings.startsWith(line, "\t")) && headers.length) {
                    arrays.peek(headers) += line;
                } else {
                    headers.push(line);
                }
            });
            for each (var header in headers) {
                if (strings.startsWith(header.toLowerCase(), "content-disposition:")) {
                    data.name = getMimeParameter(header, "name");
                    data.filename = getMimeParameter(header, "filename");
                } else if (strings.startsWith(header.toLowerCase(), "content-type:")) {
                    data.contentType = header.substring(13).trim();
                }
            }
            // move position after the empty line that separates headers from body
            position = b + EMPTY_LINE.length;
            // create stream for mime part
            stream = streamFactory(data, encoding);
        }
        boundaryPos = buffer.indexOf(boundary, position, limit);
        if (boundaryPos < 0) {
            // no terminating boundary found, slurp bytes and check for
            // partial boundary at buffer end which we know starts with "\r\n--"
            // but we just check for \r to keep it simple.
            var cr = buffer.indexOf(CR, Math.max(position, limit - boundary.length - 2), limit);
            var end =  (cr < 0) ? limit : cr;
            stream.write(buffer, position, end);
            // stream.flush();
            position = end;
            if (!eof) {
                refill();
            }
        } else {
            // found terminating boundary, complete data and merge into parameters
            stream.write(buffer, position, boundaryPos - 2);
            stream.close();
            position = boundaryPos;
            if (typeof data.value === "string") {
                mergeParameter(params, data.name, data.value);
            } else {
                mergeParameter(params, data.name, data);
            }
            data = stream = null;
        }
    }
    return params;
}


/**
 * A stream factory that stores file upload in a memory buffer. This
 * function is not meant to be called directly but to be passed as streamFactory
 * argument to [parseFileUpload()](#parseFileUpload).
 *
 * The buffer is stored in the `value` property of the parameter's data object.
 * @param {Object} data
 * @param {String} encoding
 */
var BufferFactory = exports.BufferFactory = function(data, encoding) {
    var isFile = data.filename != null;
    var stream = new MemoryStream();
    var close = stream.close;
    // overwrite stream.close to set the part's content in data
    stream.close = function() {
        close.apply(stream);
        // set value property to binary for file uploads, string for form data
        if (isFile) {
            data.value = stream.content;
        } else {
            data.value = stream.content.decodeToString(encoding);
        }
    };
    return stream;
}