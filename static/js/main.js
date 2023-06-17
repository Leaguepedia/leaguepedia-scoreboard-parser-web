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
        .attr('aria-label', 'Scoreboard text ready to be copied')
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
    exceptions.forEach(function (item) {
        let el = document.createElement('span');
        $(el).html(item).addClass("output-warning");
        $(el).appendTo($("#output"));
    });
}

function updateProgressBar(nParsedMatches, totalMatches) {
    let nParsedMatchesInt = parseInt(nParsedMatches);
    let totalMatchesInt = parseInt(totalMatches);
    let progressPercentage = ((nParsedMatchesInt / totalMatchesInt) * 100).toString();
    $("#progressbar").attr("value", progressPercentage);
}

function waitForResponse(queryId, callback) {
    currentQueryId = queryId;
    var interval = setInterval(function(queryId) {
        if (currentQueryId === queryId) {
            $.ajax({
                type: "GET",
                url: "/parser/query",
                data: {
                    queryId: queryId,
                },
                success: function(response) {
                    if (response.ready === true) {
                        clearInterval(interval);
                        callback(response.payload);
                    } else {
                        var outputText = "Doing parser magic...<br>Parsed matches " + response.nParsedMatches + "/" + response.totalMatches;
                        if ($("#output-text").html() != outputText) {
                            $("#output-text").html(outputText);
                            updateProgressBar(response.nParsedMatches, response.totalMatches);
                        }
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
                $("#output").html("");
                var outputTextObject = '<span id="output-text">Doing parser magic...<br>Parsed matches 0/?</span>';
                var progressObject = '<progress id="progressbar" value="0" max="100"></progress>';
                $(outputTextObject).appendTo("#output");
                $("<br>").appendTo("#output");
                $(progressObject).appendTo("#output");
            },
            success: function(response) {
                if (response.errors) {
                    printOutput(response);
                    return;
                }
                var outputText = "Doing parser magic...<br>Parsed matches 0/" + response.totalMatches;
                $("#output-text").html(outputText);
                updateProgressBar(0, response.totalMatches);
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
