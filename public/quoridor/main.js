window.jQuery = window.$ = require("jquery") // Ensure bootstrap dependency
var io = require("socket.io-client");

// Escaping functions
function escapeHTML (str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
};

function unescapeHTML (escapedStr) {
    // Unsafe on untrusted strings, use only on trusted
    var div = document.createElement("div");
    div.innerHTML = escapedStr;
    var child = div.childNodes[0];
    return child ? child.nodeValue : "";
};

// On page ready
$( document ).ready(function () {
    // Init socket on quoridor namespace
    var socket = io("/quoridor");
    
    // Emit room name to join relevant room
    var urlPath = window.location.pathname.split("/");
    var room = urlPath[urlPath.length - 1];
    socket.emit("sv:room", room);
    // need to check if room is valid!!
    
    socket.on("sv:redirect", function (data) {
        if (data.redirect) {
            window.location.replace("/quoridor");
        }
    });
    
    // Init history
    socket.on("chat:recent", function (data) {
        // assumes data is an array
        data.forEach(function (item) {
            var msg = "<li>" + escapeHTML(item) + "</li>";
            $("#chatMessages").prepend(msg);
        });
    });
    
    // On message received from server
    socket.on("chat:message", function (data) {
        var msg = "<li>" + escapeHTML(data) + "</li>";
        $("#chatMessages").prepend(msg);
    });
    
    // On chatForm submit
    $("#chatForm").submit(function () {
        // Do not emit if input is empty
        if ($("#chatInput").val().match(/^[\s]*$/) !== null) {
            return false;
        }
        
        // Send the message to the server
        socket.emit("io:message", $("#chatInput").val());
        // Clear input for next message
        $("#chatInput").val("");
        return false;
    });
});