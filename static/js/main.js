var jqxhr = {abort: function () {}};
var interval;

function toggleTheme(e) {
    e.preventDefault()
    e.stopPropagation()
    var currentTheme = $(document.documentElement).attr("data-theme");
    var newTheme;
    if (currentTheme == "dark") {
        newTheme = "light";
        $(document.documentElement).attr("data-theme", newTheme);
    } else {
        newTheme = "dark";
        $(document.documentElement).attr("data-theme", newTheme);
    }

    localStorage.setItem("theme", newTheme);
}

function checkSource(source) {
    if (source == null) {
        source = "riot";
    }
    const availableSources = ["riot", "riot-live", "qq"]
    $("#" + source).prop('checked', true);
    availableSources.forEach(function(sourceUnchecked) {
        if (sourceUnchecked == source) {
            return;
        }
        $("#" + sourceUnchecked).prop('checked', false);
    });
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
    interval = setInterval(function(queryId) {
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
    }, 5000, queryId);
}

function loadUserPreferences() {
    var prefsSource = localStorage.getItem("prefsSource");
    checkSource(prefsSource);
}

$(document).ready(function(){
    loadUserPreferences();

    $('#parser-form').submit(function(e) {
        e.preventDefault();
        let source = $("input[name='source']:checked").val();
        localStorage.setItem("prefsSource", source);
        clearInterval(interval);
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
        clearInterval(interval);
        jqxhr.abort();
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
        localStorage.clear()
        checkSource("riot");
        $(document.documentElement).attr("data-theme", "dark");
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
