var Application = require("stick").Application;

function resolve(n) {
	return module.resolve ? module.resolve(n) : require.resolve(n.charAt(0) != '.' ? './' + n : n)
}

var app = exports.app = Application();
app.configure("params", "route", "render");
app.render.base = resolve("templates");
app.render.master = "page.html";


app.get("/", function(request) {
    var context = {title: "It's working!"};
    return app.render("index.html", context);
});
