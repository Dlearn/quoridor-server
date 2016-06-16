"use strict";

const Hapi = require('hapi');
const env = require('env2')('./.env');

const server = new Hapi.Server();
server.connection({
    host: '0.0.0.0',
    port: parseInt(process.env.SV_PORT, 10)
});

server.register({
    register: require("./plugins/quoridor.js"),
    options: {}
}, (err) => {
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
