"use strict";

exports.register = function (server, options, next) {
    server.route({
        method: "GET",
        path: "/",
        handler: function (request, reply) {
            reply.view("index", {title: "Welcome! Please select a game from the bar above.", footer: "<script>alert('!!')</script>"});
        }
    });

    next();
};

// Hapi boilerplate
exports.register.attributes = {
    name: "home",
    version: require("../package.json").version
};
