"use strict";

const Hapi = require('hapi');
const env = require('env2')('./.env');

const server = new Hapi.Server();
server.connection({
    host: '0.0.0.0',
    port: parseInt(process.env.SV_PORT, 10)
});

// Register views and template engine
server.register(require("vision"), (err) => {
    server.views({
        engines: {
            html: require("handlebars")
        },
        path: "views",
        layoutPath: "views/layout",
        layout: "default",
        partialsPath: "views/partials",
        helpersPath: "views/helpers"
    });
});

// Register inert and public folder for serving of scripts, etc
server.register(require("inert"), (err) => {
    server.route({
        method: "GET",
        path: "/{param*}",
        handler: {
            directory: {
                path: "public",
                index: false
            }
        }
    });
})

// Register plugins
server.register([{
    register: require("./plugins/home.js"),
    options: {}
}, {
    register: require("./plugins/quoridor.js"),
    options: {}
}], (err) => {
    if (err) {
        throw err;
    }
});


server.start((err) => {
    if (err) {
        throw err;
    }
    
    console.log("Listening on: " + server.info.uri);
});
