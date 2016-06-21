"use strict";

const redis = require("redis");
const redisClient = redis.createClient(); // TODO: Configure this in production

exports.register = function (server, options, next) {
    // Init socket.io namespace "/quoridor"
    const io = require("socket.io")(server.listener).of("/quoridor");
    
    function socketHandler (socket) {
        // Fires on connection event and binds listeners?
        
        // Fires on client page load with room parameter
        socket.on("sv:room", function (msg) {
            // Case: room exists in socket.io. Join room.
            // Case: room does not exist. Check redis. If room exists, create room
            
            redisClient.srem("quoridor:validrooms", msg, (err, val) => {
                if (err) {
                    throw err;
                }
                if (!val && !io.adapter.rooms.hasOwnProperty(msg)) {
                    // Room did not exist in socket.io and Redis
                    console.log("Client connecting with invalid id: " + msg)
                    return socket.emit("sv:redirect", {redirect: true});
                }
                // Client either had a valid Redis Id, or the room already exists
                // TODO: Ensure that only one room is joined at any one time???
                return socket.join(msg, (err) => {
                    console.log("New client joining room at: " + msg);
                    console.log("Client's active rooms: " + JSON.stringify(socket.rooms));
                    socket.roomId = msg; // Stores current room on the socket object
                    
                    // Send the recent data to the client
                    redisClient.lrange("quoridor:chat:" + msg, 0, -1, (err, val) => {
                        if (err) {
                            throw err;
                        }
                        let output = val || [];
                        socket.emit("chat:recent", output);
                    })
                }) 
            });
            
        });
        
        // Fires on message
        socket.on("io:message", function (msg) {
            console.log("Received message in room: " + socket.roomId);
            
            redisClient.multi()
                .rpush("quoridor:chat:" + socket.roomId, msg)
                .expire("quoridor:chat:" + socket.roomId, 600)
                .exec(function (err, replies) {
                    // replies is an array of redis responses
                    // Emit the new message to all connected sockets IN THE ROOM
                    io.to(socket.roomId).emit("chat:message", msg)
            });
            // Currently, room expires after 10 minutes
            // TODO: Implement a way to destroy array when last client leaves room
        });   
        
        // Fires on disconnect??
        socket.on("disconnect", function () {
            console.log("A socket disconnected from room: " + socket.roomId);
            if (!io.adapter.rooms.hasOwnProperty(socket.roomId)) {
                // Room no longer has people in it
                console.log("Room " + socket.roomId + " no longer has people in it!");
                redisClient.del("quoridor:chat:" + socket.roomId);
            }
        })
    };
    
    // ------ Set up routes ------
    // Set up landing page /quoridor
    server.route({
        method: "GET",
        path: "/quoridor",
        handler: function (request, reply) {
            reply.view("quoridor-home", {scripts: "/quoridor-home/bundle.js"});
        }
    });
    
    // Set up game room pages /quoridor/game/{roomId?}
    server.route({
        method: "GET",
        path: "/quoridor/game/{roomId?}",
        handler: function (request, reply) {
            if (!request.params.roomId) {
                // No roomId specified
                return reply.redirect("/quoridor");
            }
            
            reply.view("quoridor", {scripts: "/quoridor/bundle.js"});
        }
    });
    
    // ------ JSON API ------
    // Set up room validation endpoint GET /quoridor/validate?
    server.route({
        method: "GET",
        path: "/quoridor/validate",
        handler: function (request, reply) {
            console.log("/quoridor/validate: " + JSON.stringify(request.query));
            if (!request.query.room) {
                // No query provided
                return reply({});
            }
            
            let payload = {
                room: request.query.room,
                exists: false
            };
            
            if (io.adapter.rooms.hasOwnProperty(request.query.room)) {
                // Room exists
                payload.exists = true;
            }
            
            return reply(payload);
        }
    });
    
    // Set up room creation endpoint POST /quoridor/validate
    server.route({
        method: "POST",
        path: "/quoridor/validate",
        handler: function (request, reply) {
            let roomId;
            // Generate a roomId that doesn't exist
            // There's probably a race condition here but not important
            do {
                roomId = makeId(5);
            } while (io.adapter.rooms.hasOwnProperty(roomId));
            
            // Append it to a Redis set to allow room creation with that ID, then reply with a JSON containing redirect info
            // This does not handle cases where rooms are never consumed! Implement sorted sets for that?
            redisClient.sadd("quoridor:validrooms", roomId, (err, val) => {
                if (err) {
                    throw err;
                }
                let payload = {
                    room: roomId,
                    redirect: true
                };
                console.log("Room request granted at: " + roomId)
                return reply(payload);
            });
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

// ------ Helper functions ------
function makeId (length) {
    let id = "";
    let chars = "abcdefghijklmnopqrstuvwxyz";
    for (let i=0; i < length; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}