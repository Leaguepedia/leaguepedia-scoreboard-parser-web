var jqxhr = {abort: function () {}};
var timeout;
var retries = 0;
const MAX_RETRIES = 3;

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
        $("#output").html("An error has occurred:");
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

function loadUserPreferences() {
    let prefsSource = localStorage.getItem("prefsSource");
    checkSource(prefsSource);
}

function startParser() {
    retries = 0;
    let source = $("input[name='source']:checked").val();
    localStorage.setItem("prefsSource", source);
    clearTimeout(timeout);
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
            let outputTextObject = '<span id="output-text">Doing parser magic...<br>Parsed matches 0/?</span>';
            let progressObject = '<progress id="progressbar" value="0" max="100"></progress>';
            $(outputTextObject).appendTo("#output");
            $("<br>").appendTo("#output");
            $(progressObject).appendTo("#output");
        },
        success: function(response) {
            if (response.errors) {
                printOutput(response);
                return;
            }
            let outputText = "Doing parser magic...<br>Parsed matches 0/" + response.totalMatches;
            $("#output-text").html(outputText);
            updateProgressBar(0, response.totalMatches);
            timeout = setTimeout(function(response) {
                queryParserProgress(response.queryId, function(payload) {
                    if (payload) {
                        printOutput(payload);
                    }
                });
            }, 5000, response);
        },
        error: function() {
            $("#output").html("An error has occurred! Please try again.");
        }
    });
}

function queryParserProgress(queryId, callback) {
    jqxhr = $.ajax({
        type: "GET",
        url: "/parser/query",
        data: {
            queryId: queryId,
        },
        success: function(response) {
            retries = 0;
            if (response.ready === true) {
                callback(response.payload);
            } else {
                let outputText = "Doing parser magic...<br>Parsed matches " + response.nParsedMatches + "/" + response.totalMatches;
                if ($("#output-text").html() != outputText) {
                    $("#output-text").html(outputText);
                    updateProgressBar(response.nParsedMatches, response.totalMatches);
                }
                timeout = setTimeout(function(queryId, callback) { 
                    queryParserProgress(queryId, callback) 
                }, 5000, queryId, callback);
            }
        },
        error: function() {
            if ( retries >= MAX_RETRIES ) {
                $("#output").html("An error has occurred! Please try again.");
                callback(null);
            } else {
                retries++;
                timeout = setTimeout(function(queryId, callback) { 
                    queryParserProgress(queryId, callback) 
                }, 5000, queryId, callback);
            }
        },
    });
}

$(document).ready(function(){
    loadUserPreferences();

    $('#parser-form').submit(function(e) {
        e.preventDefault();
        startParser();
    });

    $("body").on("keydown", function(e) {
        if(e.altKey && e.keyCode == 80) {
            $("input#submit").click();
        }
    });

    $('#clear-cache').click(function(e) {
        e.preventDefault();
        clearTimeout(timeout);
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
                $("#output").html("An error has occurred! Please try again.");
            }
        });
    });

    $('#clear-prefs').click(function() {
        localStorage.clear()
        checkSource("riot");
        $(document.documentElement).attr("data-theme", "dark");
    });
});
