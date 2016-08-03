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
    
    
    // Socket.io helper functions requiring the server object
    function emitPlayers (socket, connections) {
        
        let playerRed = _.findKey(connections, (o) => {return o === "red"});
        let playerBlue = _.findKey(connections, (o) => {return o === "blue"});

        // Async query cache to get red's name and emit it. If not exists, clear player box.
        if (playerRed) {
            cache.get(playerRed, (err, val) => {
                if (err || !val) {
                    return;
                }

                let payload = {};
                payload["red"] = val.name || "Anonymous";

                emitChangedPlayer(socket, payload);
            })
        } else {
            emitRemoveColourPlayer(socket, "red");
        };

        // Async query cache to get blue's name and emit it. If not exists, clear player box.
        if (playerBlue) {
            cache.get(playerBlue, (err, val) => {
                if (err || !val) {
                    return;
                }

                let payload = {};
                payload["blue"] = val.name || "Anonymous";

                emitChangedPlayer(socket, payload);
            })
        } else {
            emitRemoveColourPlayer(socket, "blue");
        };

    };

    function emitChangedPlayer (socket, data) {
        socket.nsp.to(socket.roomId).emit("game:cli:changedPlayer", data);
    };

    function emitRemoveColourPlayer (socket, data) {
        socket.nsp.to(socket.roomId).emit("game:cli:removePlayer", data);
    };
    
    function emitBecomePlayer (socket, colour) {
        socket.emit("game:cli:becomePlayer", colour);
    };
    
    // Init socket.io namespace "/socket-qgame"
    const io = require("socket.io")(server.listener).of("/socket-qgame");
    
    // On socket connection, decorate socket object with fields
    io.use(function (socket, next) {
        
        console.log("New socket connection!");
        
        let sessionCookie = utils.getCookie(socket.request.headers.cookie, options.sessions.name);
        
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
                
                // Join room based on URL
                let headerArgs = socket.request.headers.referer.split("/");
                let roomId = headerArgs[headerArgs.length - 1];
                
                if (!roomId) {
                    console.log("Unable to resolve roomId on socket connection");
                    return next(new Error("Unable to resolve roomId"));
                }
                
                // TODO: validate room exists in redis
                socket.join(roomId, (err) => {
                    
                    console.log("New client joining room at: " + roomId);
                    socket.roomId = roomId;
                    return next();
                    
                }); // End of socket.join
            }); // End of cache.get
        }); // End of def.parse
    }); // End of io.use
    
    // Set up socket.io init
    function socketHandler (socket) {
        
        // Fires on connection event
        // console.log("Someone has connected: " + socket.id);
        
        // Fires on name change
        socket.on("chat:sv:namechange", function (msg) {
            
            if (msg.length > 12) {
                return false;
            }
            
            console.log("User changed name to: " + msg);
            socket.q_name = msg;
            
            cache.get(socket.q_sid, (err, val, cached, log) => {
                let toStore = val;
                toStore.name = msg;
                
                cache.set(socket.q_sid, toStore, null, (err) => {
                    if (err) {
                        console.dir(err)
                    }
                    socket.emit("chat:cli:updatename", socket.q_name);
                });
            });
        });
        
        // Init chat history
        socket.on("chat:sv:initChat", function () {
            
            redisClient.lrange("quoridor:chat:" + socket.roomId, 0, -1, (err, val) => {
                socket.emit("chat:cli:recent", val);
                socket.emit("chat:cli:updatename", socket.q_name);
            });
            
        });
        
        // Fires on message
        socket.on("chat:sv:message", function (msg) {
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
                    io.to(socket.roomId).emit("chat:cli:message", output);
            });
            // Currently, room expires after 10 minutes
            // TODO: Implement a way to destroy array when last client leaves room
        });
        
        // Fires on connection
        socket.on("game:sv:refreshState", function () {
            
            console.log("Socket at " + socket.roomId + " requesting gameState");
            
            redisClient.get("quoridor:room:" + socket.roomId, function (err, val) {
                if (err) {
                    throw err;
                }
                
                let roomObject = JSON.parse(val);
                
                // band aid fix
                if (!roomObject) {
                    return socket.emit("cli:redirect", {redirect: true})
                }
                
                // Add the connection to the roomObject if it doesn't exist
                roomObject.connections[socket.q_sid] = roomObject.connections[socket.q_sid] || null; 
                
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
                
                // Emit current players
                emitPlayers(socket, roomObject.connections);
                
                // Emit current gameState
                socket.emit("game:cli:receiveState", roomObject.gameState);
            })
        
        });
        
        // Fires on remake game
        socket.on("game:sv:restartGame", function () {
            
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
                
                socket.emit("game:cli:receiveState", roomObject.gameState);
            })
        
        });
        
        socket.on("game:sv:sendState", function (msg) {
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
                    
                    io.to(socket.roomId).emit("game:cli:receiveState", msg)
                    
                    if (!val) {
                        console.warn("Warning! Attempt modify roomObject that does not exist??")
                            // how to handle wat
                    }
                });
                
            });
            
        });
        
        // Player joins a color?
        socket.on("game:sv:pickColour", function (msg) {
            console.log("Player requesting to join " + msg);
            redisClient.get("quoridor:room:" + socket.roomId, (err, val) => {
                if (err) {
                    throw err;
                }
                
                let roomObject = JSON.parse(val);
                let q_sid = socket.q_sid;
                
                let playerExists = _.findKey(roomObject.connections, (o) => {return o === msg});
                
                if (!playerExists) {
                    // nobody is currently assigned colour <msg>; assign the socket to that colour
                    console.log("Assigning player to colour " + msg);
                    roomObject.connections[q_sid] = msg;
                    
                    // Serialize the modified object, then emit to all connected clients. Only serialize if !playerExists (therefore it changed)
                    redisClient.set("quoridor:room:" + socket.roomId, JSON.stringify(roomObject), "PX", ROOM_EXPIRE_TIME, "XX",(err, val) => {
                        if (err) {
                            throw err;
                        }

                        // Resets the room expiry back to 30 minutes
                        // XX means only set the key if it already exists
                        if (!val) {
                            console.warn("Warning! Attempt modify roomObject that does not exist??")
                            // how to handle wat
                            return;
                        }

                        // roomObject serialized; emit to connected clients changed player
                        /*
                        let payload = {};
                        payload[msg] = socket.q_name;
                        emitChangedPlayer(socket, payload);
                        */
                        emitPlayers(socket, roomObject.connections);
                        emitBecomePlayer(socket, msg);
                    });

                } // end of if (!playerExists)
            }) // end of redisClient.get
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
                    
                    if (roomObject.connections[q_sid]) {
                        // entry is not null, must be either "red" or "blue"
                        // Emit an event that clears the button from the client
                        emitRemoveColourPlayer(socket, roomObject.connections[q_sid]);
                    }
                    
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
                            return;
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
                
                console.log("Room exists!!")
                
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

