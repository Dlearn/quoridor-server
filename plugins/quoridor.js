"use strict";

const redis = require("redis");
const redisClient = redis.createClient();  // TODO: Configure this in production
const Statehood = require("statehood");

const ROOM_EXPIRE_TIME = 15 * 60 * 1000  // Rooms expire in 15 MINUTES of no activity
// TODO: The rooms don't actually refresh yet


// ------ Helper functions ------
function makeId (length) {
    let id = "";
    let chars = "abcdefghijklmnopqrstuvwxyz";
    for (let i=0; i < length; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
};

const utils = require("../lib/utils.js");


// ------ Register Hapi Plugin ------
exports.register = function (server, options, next) {
    
    // Set up Statehood cookie parsing for use in socket.io middleware
    const cookieOptions = options.sessions.cookieOptions;
    cookieOptions.encoding = options.sessions.encoding;
    const def = new Statehood.Definitions(cookieOptions);
    
    // Init cache connection
    const cache = server.cache({
        cache: "session",
        segment: "!yar",
        shared: true,
        expiresIn: 7 * 24 * 60 * 60 * 1000, // Expires in 7 days, same as the yar session config
    });
    
    // Init socket.io namespace "/quoridor"
    const io = require("socket.io")(server.listener).of("/quoridor");
    
    // On socket connection, decorate socket object with fields
    io.use(function (socket, next) {
        
        let sessionCookie = utils.getCookie(socket.request.headers.cookie, options.sessions.name);
        
        // Parse the signed cookie using Statehood
        def.parse(sessionCookie, (err, state, fail) => {
            
            if (err || !sessionCookie) {
                // Send error message to the socket
                return next(new Error("Invalid session cookie! Try clearing your cookies and trying again."));
            }
            
            // Get session id
            socket.q_sid = state.session.id;
            
            // Get socket name
            cache.get(socket.q_sid, (err, val, cached, log) => {
                if (!val) {
                    // no valid cookie
                    return next(new Error("Invalid session!"));
                }
                socket.q_name = val.name || "Anonymous"
                return next();
            });
        });
    });
    
    // Set up socket.io init
    function socketHandler (socket) {
        // Fires on connection event
        console.log("Someone has connected: " + socket.id);
        
        // Fires on client page load with room parameter
        socket.on("sv:room", function (msg) {
            // Room already exists in quoridor:rooms if you make it here due to route validation
            
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
                    socket.emit("sv:updatename", socket.q_name);
                })
            })
        });
        
        // Fires on name change
        socket.on("sv:namechange", function (msg) {
            
            console.log("User changed name to: " + msg);
            socket.q_name = msg;
            
            cache.get(socket.q_sid, (err, val, cached, log) => {
                let toStore = val;
                toStore.name = msg;
                
                cache.set(socket.q_sid, toStore, null, (err) => {
                    if (err) {
                        console.dir(err)
                    }
                    socket.emit("sv:updatename", socket.q_name);
                });
            });
        });
        
        // Fires on message
        socket.on("io:message", function (msg) {
            console.log("Received message in room: " + socket.roomId);
            
            // Format message
            let mStore = {};
            mStore.name = socket.q_name;
            mStore.msg = msg;
            
            let output = JSON.stringify(mStore);
            
            redisClient.multi()
                .rpush("quoridor:chat:" + socket.roomId, output)
                .expire("quoridor:chat:" + socket.roomId, 600)
                .exec(function (err, replies) {
                    // replies is an array of redis responses
                    // Emit the new message to all connected sockets IN THE ROOM
                    io.to(socket.roomId).emit("chat:message", output)
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
    
    io.on("connection", socketHandler);
    
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
            
            // Ensure a valid session is present in the database
            request.yar.touch();
            
            // Query quoridor:room:* to see if room exists
            redisClient.exists("quoridor:room:" + request.params.roomId, (err, val) => {
                if (err) {
                    throw err;
                }
                
                if (val) {
                    // if val is not 0, room exists
                    // returns 0 if not exists, returns 1 if exists
                    return reply.view("quoridor", {scripts: "/quoridor/bundle.js"});
                }
                
                // room does not exist
                return reply.redirect("/quoridor");
            });
            
        } // End of handler function
    });
    
    // ------ JSON API ------
    // Set up room validation endpoint GET /quoridor/validate?
    server.route({
        method: "GET",
        path: "/quoridor/validate",
        handler: function (request, reply) {
            
            if (!request.query.room) {
                // No query provided
                return reply({});
            }
            
            let room = request.query.room.trim().toLowerCase()
            let payload = {
                room: room,
                exists: false
            };
            
            // Query quoridor:room:* to see if key exists
            redisClient.exists("quoridor:room:" + room, (err, val) => {
                if (err) {
                    throw err;
                }
                
                if (val) {
                    // if val is not 0, room exists
                    // returns 0 if not exists, returns 1 if exists
                    payload.exists = true;
                }
                
                return reply(payload);
            });
            
        } // End of handler function
    });
    
    // Set up room creation endpoint POST /quoridor/validate
    server.route({
        method: "POST",
        path: "/quoridor/validate",
        handler: function (request, reply) {
            
            // Recursive helper function to ensure unique roomIds
            function addRoomToRedis (callback) {
                let roomId = makeId(5);
                let currentTime = Number(new Date());
                
                let roomObject = {
                    connections: [],
                    gameState: {},
                    players: {red: null, blue: null},
                    password: null,
                    roomName: null,
                    roomId: roomId
                };
                
                
                redisClient.set("quoridor:room:" + roomId, JSON.stringify(roomObject), "PX", ROOM_EXPIRE_TIME, "NX", (err, val) => {
                    
                    if (err) {
                        throw err;
                    }
                    
                    if (!val) {
                        // Key already existed (val == null), wasn't added. Try again.
                        return addRoomToRedis(callback);
                    }
                    
                    return callback(null, roomObject)
                });
            };

            // Add room object to Redis in the form quoridor:room:roomId
            addRoomToRedis(function (err, roomObject) {
                // Room is now valid at roomId. Tell that to the client?
                let payload = {
                    room: roomObject.roomId,
                    redirect: true
                };
                console.log("Room request granted at: " + roomObject.roomId)
                return reply(payload);
            });
            
        } // End of handler function
    }); // End of route
    
    next();
};

// ------ Hapi boilerplate ------
exports.register.attributes = {
    name: "quoridor",
    version: require("../package.json").version
};

