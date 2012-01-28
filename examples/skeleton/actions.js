var Application = require("stick").Application;

var app = exports.app = Application();
app.configure("params", "route", "render");
app.render.base = resolve(module, "templates");
app.render.master = "page.html";

app.get("/", function(request) {
    var context = {title: "It's working!"};
    return app.render("index.html", context);
});
