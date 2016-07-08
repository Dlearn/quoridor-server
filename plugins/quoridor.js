"use strict";

const redis = require("redis");
const redisClient = redis.createClient(process.env.REDIS_URL);  // TODO: Configure this in production
const Statehood = require("statehood");
const _ = require("lodash");

const ROOM_EXPIRE_TIME = 30 * 60 * 1000  // Rooms expire in 30 MINUTES of no activity
// TODO: The rooms don't actually refresh yet


// ------ RoomObject class ------
class RoomObject {
    constructor(roomId) {
        // red and blue players are stored in here
        // e.g. this.connections = {<socketid>: null, <socketid2>: "red"} etc
        this.connections = {}; 
        
        this.gameState = null;
        this.password = null;
        this.roomName = null;
        this.roomId = roomId;
    }
};

// ------ Helper functions ------
function makeId (length) {
    let id = "";
    let chars = "abcdefghijklmnopqrstuvwxyz";
    for (let i=0; i < length; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
};

function initGameState () {
    let horizontalWalls = [];
    let verticalWalls = [];

    for (let col = 0; col < (9-1); col++)
    {
        let temporaryWallArrayForHorizontal = [];
        let temporaryWallArrayForVertical = [];
        
        for (let row = 0; row < (9-1); row++)
        {
            temporaryWallArrayForHorizontal[row] = "EMPTY";
            temporaryWallArrayForVertical[row] = "EMPTY";
        }
        
        horizontalWalls[col] = temporaryWallArrayForHorizontal;
        verticalWalls[col] = temporaryWallArrayForVertical;
    };

    let gameState = {
        redX : 4,
        redY : 9-1,
        redRemainingWalls : 10,
        bluX : 4,
        bluY : 0,
        bluRemainingWalls : 10,
        horizontalWalls : horizontalWalls,
        verticalWalls : verticalWalls,
        validMovementsRed : [[3,8],[4,7],[5,8]],
        validMovementsBlu : [[3,0],[4,1],[5,0]],
        currentStatus : "PLAYING",
        activePlayer : "RED"
    };
    
    return gameState;
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
        
        console.log("New socket connection!!!!!!!!!!!")
        
        let sessionCookie = utils.getCookie(socket.request.headers.cookie, options.sessions.name);
        
        /*
        let headerArgs = socket.request.headers.referer.split("/")
        let roomId = headerArgs[headerArgs.length - 1];
        */
        // If auth is a problem, joinRoom here rather than on sv:room event
        
        // Parse the signed cookie using Statehood
        def.parse(sessionCookie, (err, state, fail) => {
            
            if (err || !sessionCookie || !state.session) {
                // Send error message to the socket
                return next(new Error("Invalid session cookie! Try clearing your cookies and trying again."));
            }
            
            // Get session id
            socket.q_sid = state.session.id;
            
            // Get socket name
            cache.get(socket.q_sid, (err, val, cached, log) => {
                if (err || !val) {
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
            // Room already exists in quoridor:room:{} if you make it here due to route validation
            
            return socket.join(msg, (err) => {
                
                console.log("New client joining room at: " + msg);
                // console.log("Client's active rooms: " + JSON.stringify(socket.rooms));
                socket.roomId = msg; // Stores current room on the socket object
                
                // Add the connection to the RoomObject? And send recent chat data to the client
                redisClient.multi()
                    .get("quoridor:room:" + msg)
                    .lrange("quoridor:chat:" + msg, 0, -1)
                    .exec(function (err, replies) {
                        
                        if (err) {
                            throw err;
                        }
                        
                        
                        
                        // Handling the results of redis.lrange (chat)
                        let output = replies[1] || [];
                        socket.emit("chat:recent", output);
                        socket.emit("sv:updatename", socket.q_name);
                    
                        // Handling the results of redis.get
                        let getResult = replies[0] || null;
                        // band aid fix
                        if (!getResult) {
                            return socket.emit("sv:redirect", {redirect: true});
                        }
                        let roomObject = JSON.parse(getResult);
                        let q_sid = socket.q_sid;
                        
                        roomObject.connections[q_sid] = roomObject.connections[q_sid] || null; // q_sid's presence in the connection object is enough. If it already exists, dont change it
                        
                        redisClient.set("quoridor:room:" + msg, JSON.stringify(roomObject), "PX", ROOM_EXPIRE_TIME, "XX", (err, val) => {
                            if (err) {
                                throw err;
                            }
                            
                            // Resets the room expiry back to 30 minutes
                            // XX means only set the key if it already exists
                            if (!val) {
                                console.warn("Warning! Attempt to join room that does not exist in redis???")
                                // how to handle wat
                            }
                        });
                    
                    } // End of exec callback
                ); // End of exec
            }) // End of socket.join
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
                .pexpire("quoridor:chat:" + socket.roomId, ROOM_EXPIRE_TIME)
                .pexpire("quoridor:room:" + socket.roomId, ROOM_EXPIRE_TIME)
                .exec(function (err, replies) {
                    // replies is an array of redis responses
                    // Emit the new message to all connected sockets IN THE ROOM
                    io.to(socket.roomId).emit("chat:message", output)
            });
            // Currently, room expires after 10 minutes
            // TODO: Implement a way to destroy array when last client leaves room
        });
        
        // Fires on game:refreshState (connection)
        socket.on("game:refreshState", function () {
            
            console.log("New Connection @ socket.roomId: " + socket.roomId);
            
            redisClient.get("quoridor:room:" + socket.roomId, function (err, val) {
                if (err) {
                    throw err;
                }
                
                let roomObject = JSON.parse(val);
                
                // band aid fix
                if (!roomObject) {
                    return socket.emit("sv:redirect", {redirect: true})
                }
                
                if (!roomObject.gameState) {
                    
                    roomObject.gameState = initGameState();
                    
                    redisClient.set("quoridor:room:" + socket.roomId, JSON.stringify(roomObject), "PX", ROOM_EXPIRE_TIME, "XX", (err, val) => {
                        if (err) {
                            throw err;
                        }
                        
                        if (!val) {
                            console.warn("Warning! Attempt modify roomObject that does not exist??")
                            // how to handle wat
                        }
                    });
                };
                
                socket.emit("game:receiveState", roomObject.gameState);
            })
        
        });
        
        // Fires on game:restartGame (remake game)
        socket.on("game:restartGame", function () {
            
            console.log("Remake Game @ socket.roomId: " + socket.roomId);
            
            redisClient.get("quoridor:room:" + socket.roomId, function (err, val) {
                if (err) {
                    throw err;
                }
                
                let roomObject = JSON.parse(val);

                roomObject.gameState = initGameState();

                redisClient.set("quoridor:room:" + socket.roomId, JSON.stringify(roomObject), "PX", ROOM_EXPIRE_TIME, "XX", (err, val) => {
                    if (err) {
                        throw err;
                    }

                    if (!val) {
                        console.warn("Warning! Attempt modify roomObject that does not exist??")
                        // how to handle wat
                    }
                });
                
                socket.emit("game:receiveState", roomObject.gameState);
            })
        
        });
        
        socket.on("game:sendState", function (msg) {
            redisClient.get("quoridor:room:" + socket.roomId, (err, val) => {
                if (err) {
                    throw err;
                }
                
                let roomObject = JSON.parse(val);
                roomObject.gameState = msg;
                
                redisClient.set("quoridor:room:" + socket.roomId, JSON.stringify(roomObject), "PX", ROOM_EXPIRE_TIME, "XX", (err, val) => {
                    if (err) {
                        throw err;
                    }
                    
                    io.to(socket.roomId).emit("game:receiveState", msg)
                    
                    if (!val) {
                        console.warn("Warning! Attempt modify roomObject that does not exist??")
                            // how to handle wat
                    }
                });
                
            });
            
        });
        
        // Fires on disconnect??
        socket.on("disconnect", function () {
            
            console.log("A socket disconnected from room: " + socket.roomId);
            
            if (!io.adapter.rooms.hasOwnProperty(socket.roomId)) {
                // Room no longer has people in it
                console.log("Room " + socket.roomId + " no longer has people in it!");
                redisClient.multi()
                    .del("quoridor:chat:" + socket.roomId)
                    .del("quoridor:room:" + socket.roomId)
                    .exec((err, replies) => {})
            } else {
                // Remove the disconnected socket from the roomObject
                redisClient.get("quoridor:room:" + socket.roomId, (err, val) => {
                    if (err) {
                        throw err;
                    }
                    
                    val = val || {}
                    let roomObject = JSON.parse(val);
                    let q_sid = socket.q_sid;
                    delete roomObject.connections[q_sid];
                    
                    // Persist the object back
                    redisClient.set("quoridor:room:" + socket.roomId, JSON.stringify(roomObject), "PX", ROOM_EXPIRE_TIME, "XX",(err, val) => {
                        if (err) {
                            throw err;
                        }
                        
                        // Resets the room expiry back to 30 minutes
                        // XX means only set the key if it already exists
                        if (!val) {
                            console.warn("Warning! Attempt modify roomObject that does not exist??")
                            // how to handle wat
                        }
                    });
                });
            }
        });
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
                
                let roomObject = new RoomObject(roomId);
                
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

