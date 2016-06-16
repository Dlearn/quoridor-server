"use strict";

const Inert = require("inert");
const redis = require("redis");
const redisClient = redis.createClient(); // TODO: Configure this in production

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
    
    // Set up routes, which requires Inert to serve static pages
    server.register(Inert, (err) => {
        if (err) {
            throw err;
        }
        
        // Set up landing page
        server.route({
            method: "GET",
            path: "/quoridor/{param*}",
            handler: {
                directory: {
                    path: "views/quoridor",
                    index: true
                }
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
        
        // Set up socket.io init
        io.on("connection", socketHandler);
    });
};

// Hapi boilerplate
exports.register.attributes = {
    name: "quoridor",
    version: require("../package.json").version
};