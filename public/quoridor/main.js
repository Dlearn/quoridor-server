window.jQuery = window.$ = require("jquery"); // Ensure bootstrap dependency
var io = require("socket.io-client");
var QuoridorApp = require("./quoridor-app.js");
var Chat = require("../chat.js");

// On page ready
$( document ).ready(function () {
    // Init socket on quoridor namespace
    var socket = io("/quoridor");
    
    // Init quoridor
    QuoridorApp.init(socket);
    
    // Init chat
    Chat.init(socket);
    
    // Server makes you redirect; does it need extra checks? i.e. auth
    socket.on("cli:redirect", function (data) {
        if (data.redirect) {
            window.location.replace("/quoridor");
        }
    });
    
});
