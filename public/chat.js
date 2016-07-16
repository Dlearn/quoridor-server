var $ = require("jquery");
var socket;
var utils = require("./utils.js");
var escapeHTML = utils.escapeHTML;
var unescapeHTML = utils.unescapeHTML;

function scrollBottom () {
    $('#chatMessages').scrollTop($('#chatMessages')[0].scrollHeight);
}


// ------ DEFINE INIT FUNCTION ------

exports.init = function (io_socket) {
    
    socket = io_socket;
    
    socket.on("connect", function() {
        socket.emit("chat:sv:initChat");
    });
    
    socket.on("chat:cli:updatename", function (data) {
        // Update the name header
        $("#nameHeader").html(escapeHTML(data));
    });
    
    // Init history
    // What happens if dc (e.g. no wifi) and reconnect? do we need to clear the #chatMessages pane? (i.e. will it send the whole block again) What if the room whiffs since there's no one in it?
    socket.on("chat:cli:recent", function (data) {
        // assumes data is an array
        data.forEach(function (item) {
            var r = JSON.parse(item);
            var msg = "<div><b>" + escapeHTML(r.name) + "</b>: " + escapeHTML(r.msg) + "</div>";
            $("#chatMessages").append(msg);
            scrollBottom();
        });
    });
    
    // On message received from server
    socket.on("chat:cli:message", function (data) {
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
        socket.emit("chat:sv:message", $("#chatInput").val());
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
        socket.emit("chat:sv:namechange", $("#nameInput").val());
        // Close the modal
        $("#changeNameModal").modal("toggle");
        return false;
    });
    
};

