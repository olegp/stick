# Stick

Stick is a modular JSGI middleware composition layer and application framework.

It was originally made for [RingoJS](http://ringojs.org/), but this fork allows it to also run on [Common Node](http://olegp.github.com/common-node/) (a synchronous CommonJS compatibility layer for Node.js using node-fibers).

If you have any questions about Stick or its use in conjunction with [`mongo-sync`](https://github.com/olegp/mongo-sync) and other libraries built on top of Common Node, please post them to the [Common Node mailing list](https://groups.google.com/forum/#!forum/common-node).

## Overview

Stick provides an `Application` object that can be used to compose web
applications out of JSGI middleware components. Middleware can in turn
define methods or properties on the application object to make itself
configurable to the outside world.

Currently Stick comes with the following middleware modules:

 * basicauth    - basic HTTP authentication
 * <del>continuation - generator-based async requests</del>
 * error        - generating error pages
 * etag         - ETag based conditional GET
 * <del>gzip         - GZip content encoding</del>
 * method       - HTTP method overriding
 * mount        - mounting other applications
 * notfound     - generating 404 pages
 * params       - form data parsing
 * <del>profiler     - JavaScript profiling</del>
 * render       - mustache.js templates (mustache shold be installed separately with `npm install mustache`)
 * requestlog   - collecting per-request log messages
 * route        - Sinatra-like request routing
 * session      - session support
 * static       - serving static files
 * upload       - handling file uploads

 Check out the demo applications and documentation to learn more.

## Running

Use `npm` to to install Stick:

    $ npm install stick


To start the stick demo application run the `common-node` ([Common Node](http://olegp.github.com/common-node/) is installed via `npm install common-node -g`) command with the 
`demo.js` script in the stick directory:

    $ common-node examples/demo.js

Then point your browser to <http://localhost:8080/>.

## License

Stick is distributed under the MIT license.
