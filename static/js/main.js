var jqxhr = {abort: function () {}};
var currentQueryId = null;

function toggleTheme(e) {
    e.preventDefault()
    e.stopPropagation()
    var currentTheme = $("body").attr("class");
    if (currentTheme == "theme-dark") {
        var newTheme = "light"
        $("body").removeClass("theme-dark").addClass("theme-light");
    } else if (currentTheme == "theme-light") {
        var newTheme = "dark"
        $("body").removeClass("theme-light").addClass("theme-dark");
    }

    let expires = getCookieExpiration();

    document.cookie = `theme=${newTheme}; expires=${expires}`;
}

function printOutput(response) {
    $('#output').html("");
    if (response.success === false) {
        $("#output").html("An error has occured:");
        printExceptions(response.errors);
        return;
    }
    let el = document.createElement('textarea');
	$(el).attr('readonly', '')
		.attr('id', 'output-scoreboard')
		.val(response.text);
    $(el).appendTo($('#output'));
    el.select();
    printExceptions(response.warnings);
}

function printExceptions(exceptions) {
    if (exceptions == null) {
        return;
    }
    let warnings = document.createElement("div");
    $(warnings).attr("id", "output-warnings");
    exceptions.forEach(function (item) {
        let el = document.createElement('div');
        $(el).html(item);
        $(el).appendTo($(warnings));
    });
    $(warnings).appendTo($("#output"));
}

function waitForResponse(queryId, callback) {
    currentQueryId = queryId;
    var i = 0;
    var interval = setInterval(function(queryId) {
        if (currentQueryId === queryId) {
            i = i + 1
            $.ajax({
                type: "GET",
                url: "/parser/query",
                data: {
                    queryId: queryId,
                    iteration: i,
                },
                success: function(response) {
                    if (response.ready === true) {
                        clearInterval(interval);
                        callback(response.payload);
                    } else {
                        $("#output").html("Doing parser magic...<br>Parsed matches " + response.nParsedMatches + "/" + response.totalMatches);
                    }
                },
                error: function() {
                    $("#output").html("An error has occured! Please try again.");
                    clearInterval(interval);
                    callback(null);
                },
            });
        } else {
            clearInterval(interval);
        };
    }, 5000, queryId);
}

function getCookieExpiration() {
    const d = new Date();
    return d.toUTCString(d.setTime(d.getTime() + (3650*24*60*60*1000)));
}

$(document).ready(function(){
    $('#parser-form').submit(function(e) {
        e.preventDefault();
        let source = $("input[name='source']:checked").val();
        let expires = getCookieExpiration();
        document.cookie = `prefsSource=${source}; expires=${expires};`
        jqxhr.abort();
        jqxhr = $.ajax({
            type: 'POST',
            url: '/parser/query',
            data: {
                ids: $("#ids").val(),
                source: source,
                header: $("input[name='header']:checked").val(),
                skipQueries: $("input[name='skip-queries']:checked").val(),
                useWikiMirror: $("input[name='wiki-mirror']:checked").val(),
            },
            beforeSend: function() {
                $("#output").html("Doing parser magic...<br>Parsed matches 0/?");
            },
            success: function(response) {
                if (response.errors) {
                    printOutput(response);
                    return;
                }
                $("#output").html("Doing parser magic...<br>Parsed matches 0/" + response.totalMatches);
                waitForResponse(response.queryId, function(payload) {
                    if (payload) {
                        printOutput(payload);
                    }
                });
            },
            error: function() {
                $("#output").html("An error has occured! Please try again.");
            }
        });
    });

    $("body").on("keydown", function(e) {
        if(e.altKey && e.keyCode == 80) {
            $("input#submit").click();
        }
    });

    $('#clear-cache').click(function(e) {
        e.preventDefault();
        $.ajax({
            type: 'POST',
            url: '/clearcache',
            beforeSend: function() {
                $("#output").html("Clearing cache...");
            },
            success: function() {
                $("#output").html("Done!");
            },
            error: function() {
                $("#output").html("An error has occured! Please try again.");
            }
        });
    });

    $('#clear-prefs').click(function() {
        document.cookie = "prefsSource=; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
        document.cookie = "theme=; expires=Thu, 01 Jan 1970 00:00:00 UTC;"
        $("#riot").prop('checked', true);
        $("#riot-live").prop('checked', false);
        $("#qq").prop('checked', false);
        $("body").removeClass("theme-light").addClass("theme-dark");
    });

    $(".toggle-theme").click(function(e) {
        toggleTheme(e);
    });

    $(".toggle-theme").on("keydown", function(e) {
        if (e.keyCode == 13) {
            toggleTheme(e);
        }
    });
});
