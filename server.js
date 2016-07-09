"use strict";

const Hapi = require('hapi');

if (!process.env.COOKIE_SECRET) {
    console.log("In dev environment, using environment variables from ./.env")
    const env = require('env2')('./.env');
};

const server = new Hapi.Server({
    cache: {
        engine: require("catbox-redis"), // More config available
        name: "session", // Hapi cache name
        shared: true,
        socket: process.env.REDIS_URL
    }
});


server.connection({
    host: '0.0.0.0',
    port: parseInt(process.env.PORT, 10)
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

// Register yar for cookie session support, using catbox-redis as a cache store
const cookieOptions = {
    password: process.env.COOKIE_SECRET,
    isSecure: false, // Due to deployment on Heroku, this is set to false 
    isHttpOnly: true,
    ttl: null // Cookies are deleted when the browser is closed
};

server.register({
    register: require("yar"),
    options: {
        maxCookieSize: 0, // force server-side storage
        cache: {
            cache: "session", // Declared above in new Hapi.Server()
            expiresIn: 7 * 24 * 60 * 60 * 1000, // Expires in 7 days
            shared: true
        },
        cookieOptions: cookieOptions
    }
}, (err) => {
    if (err) {
        throw err;
    }
});

// Register plugins
server.register([{
    register: require("./plugins/home.js"),
    options: {}
}, {
    register: require("./plugins/quoridor.js"),
    options: {
        sessions: {
            name: "session", // Default cookie name set by yar
            encoding: "iron", // Default cookie encoding set by yar
            cookieOptions: cookieOptions // Same options passed to yar
        }
    }
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
