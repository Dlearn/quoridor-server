"use strict";

const redis = require("redis");
const redisClient = redis.createClient(); // TODO: Configure this in production

function scriptTagWrapper (src) {
    return "<script src='" + src + "'></script>";
};

exports.register = function (server, options, next) {
    // Init socket.io namespace "/quoridor"
    const io = require("socket.io")(server.listener).of("/quoridor");
    
    function socketHandler (socket) {
        // Fires on connection event and binds listeners?
        socket.on("io:message", function (msg) {
            console.log("Received on io:message: " + msg);
            
            // Push the message to a Redis array named quoridor
            // TODO: When implementing rooms, a new array is required for each room
            redisClient.rpush("quoridor", msg, (err, val) => {
                // Async callback
                // Emit the new message to all connected sockets
                if (err) {
                    throw err;
                }
                
                let output = msg || "";
                io.emit("chat:message", msg);
            })
        });
    };
    
    // Set up routes
    // Set up landing page
    server.route({
        method: "GET",
        path: "/quoridor",
        handler: function (request, reply) {
            reply.view("quoridor", {footer: scriptTagWrapper("quoridor/bundle.js")});
        }
    });

    // Set up helper page to get initial data on page load
    server.route({
        method: "GET",
        path: "/quoridor/recent",
        handler: function (request, reply) {
            // Query the Redis quoridor array
            redisClient.lrange("quoridor", 0, -1, (err, val) => {
                if (err) {
                    throw err;
                }

                let output = val || [];
                console.log("/quoridor/recent: " + val);
                return reply(JSON.stringify(val));
            })
        }
    });

    // Set up game room pages
    server.route({
        method: "GET",
        path: "/quoridor/game/{roomId?}",
        handler: function (request, reply) {
            if (!request.params.roomId) {
                // No roomId specified
                return reply.redirect("/quoridor");
            }
            
            // TODO: Room validation. Right now any room is valid
            return reply(encodeURIComponent(request.params.roomId));
        }
    });

    // Set up socket.io init
    io.on("connection", socketHandler);
    
    next();
};

// Hapi boilerplate
exports.register.attributes = {
    name: "quoridor",
    version: require("../package.json").version
};