window.jQuery = window.$ = require("jquery") // Ensure bootstrap dependency

$ ( document ).ready(function () {
    // Function for creating rooms
    $("#btnCreateRoom").click(function () {
        // How to handle creating rooms?
        // TODO: Use hapi/crumb for CSRF validation
        // For now, make a POST request to /quoridor/validate to create a new room
        $.ajax({
            url: "/quoridor/validate",
            type: "POST",
            dataType: "json"
        }).done(function (json) {
            if (json.redirect) {
                window.location.replace("/quoridor/game/" + json.room);
            }
        }).fail(function (xhr, status, errorThrown) {
            alert("A connection error has occurred!");
            console.dir(errorThrown);
        }).always(function (xhr, status) {
            // Something always doing
        });
    });


    // Function for joining rooms
    $("#inputForm").submit(function () {
        // Do not submit if input is empty
        if ($("#inputRoom").val().match(/^[\s]*$/) !== null) {
            return false;
        }

        // Check with server whether room is valid
        // endpoint: /quoridor/validate
        // TODO: cache response
        $.ajax({
            url: "/quoridor/validate",
            data: {
                room: $("#inputRoom").val()
            },
            type: "GET",
            dataType: "json"
        }).done(function (json) {
            // Do stuff with successful response
            if (!json.exists) {
                $("#inputRoomGroup").addClass("has-error");
                $("#inputRoomFeedback").show();
                $("#inputRoom").val("");  // Clear the input
            } else {
                // Redirect to room
                // Does not perform authentication
                window.location.replace("/quoridor/game/" + json.room);
            }
        }).fail(function (xhr, status, errorThrown) {
            // Do stuff with failure
            alert("A connection error has occured!")
            console.dir(errorThrown);
        }).always(function (xhr, status) {
            // Something always doing
        });
        return false;
    });
});

