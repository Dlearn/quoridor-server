"use strict";

exports.register = function (server, options, next) {
    server.route({
        method: "GET",
        path: "/",
        handler: function (request, reply) {
            reply.view("index", {title: "wat", footer: "<script>alert('!!')</script>"});
        }
    });

    next();
};

// Hapi boilerplate
exports.register.attributes = {
    name: "home",
    version: require("../package.json").version
};
