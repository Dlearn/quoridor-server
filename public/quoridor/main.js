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

function scrollBottom () {
    $('#chatMessages').scrollTop($('#chatMessages')[0].scrollHeight);
}

// On page ready
$( document ).ready(function () {
    // Init socket on quoridor namespace
    var socket = io("/quoridor");
    
    // Emit room name to join relevant room
    var urlPath = window.location.pathname.split("/");
    var room = urlPath[urlPath.length - 1];
    
    socket.on("disconnect", function() {
        //alert("disconnect")
    })
    
    socket.on("connect", function() {
        socket.emit("sv:room", room);
    })
    
    socket.on("reconnect", function() {
        //alert("reconnect")
    })
    
    // Server makes you redirect; does it need extra checks? i.e. auth
    socket.on("sv:redirect", function (data) {
        if (data.redirect) {
            window.location.replace("/quoridor");
        }
    });
    
    socket.on("sv:updatename", function (data) {
        // Update the name header
        $("#nameHeader").html(escapeHTML(data));
    });
    
    // Init history
    // What happens if dc (e.g. no wifi) and reconnect? do we need to clear the #chatMessages pane? (i.e. will it send the whole block again) What if the room whiffs since there's no one in it?
    socket.on("chat:recent", function (data) {
        // assumes data is an array
        data.forEach(function (item) {
            var r = JSON.parse(item);
            var msg = "<div><b>" + escapeHTML(r.name) + "</b>: " + escapeHTML(r.msg) + "</div>";
            $("#chatMessages").append(msg);
            scrollBottom();
        });
    });
    
    // On message received from server
    socket.on("chat:message", function (data) {
        var r = JSON.parse(data);
        var msg = "<div><b>" + escapeHTML(r.name) + "</b>: " + escapeHTML(r.msg) + "</div>";
        $("#chatMessages").append(msg);
        scrollBottom();
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
    
    // On change name submit
    $("#changeNameForm").submit(function () {
        // Do not emit if input is empty
        if ($("#nameInput").val().match(/^[\s]*$/) !== null) {
            return false;
        }
        
        // Send the message to the server
        socket.emit("sv:namechange", $("#nameInput").val());
        // Close the modal
        $("#changeNameModal").modal("toggle");
        return false;
    });
});