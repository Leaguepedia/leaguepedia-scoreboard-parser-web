from flask import Flask, render_template, request
from flaskext.autoversion import Autoversion
from parser_handler import ParserHandler
from mwrogue.esports_client import EsportsClient
from threading import Thread, Lock
import random
import time

app = Flask(__name__)
app.autoversion = True
Autoversion(app)

lol_site = EsportsClient("lol")

lock = Lock()

in_process = {}


@app.route('/parser')
def parser():
    return render_template('index.html')


@app.route("/parser/query", methods=["GET", "POST"])
def query():
    if request.method == "GET":
        query_id = int(request.args.get("queryId"))
        if query_id not in in_process:
            return "", 404
        if not in_process[query_id]["finished"]:
            in_process[query_id]["last_requested"] = time.time()
            parser_handler = in_process[query_id]["parser_handler"]
            n_parsed_matches = parser_handler.parsed_matches
            total_matches = len(parser_handler.matches)
            return {"ready": False, "nParsedMatches": n_parsed_matches, "totalMatches": total_matches}
        else:
            payload = in_process[query_id]["data"]
            if payload["errors"]:
                success = False
            else:
                success = True
            payload["success"] = success
            del in_process[query_id]
            return {"ready": True, "payload": payload}
    elif request.method == "POST":
        for process in in_process.values():
            if (time.time() - process["last_requested"]) > 60:
                del process
        ids = request.form.get("ids")
        source = request.form.get("source")
        header = request.form.get("header")
        skip_queries = request.form.get("skipQueries")
        use_wiki_mirror = request.form.get("useWikiMirror")
        if not source or not ids:
            return {"success": False, "errors": ["You must provide at least one ID and source!"]}
        query_id = random.randint(0, 100000000000)
        while query_id in in_process:
            query_id = random.randint(0, 100000000000)
        in_process[query_id] = {"finished": False, "last_requested": time.time()}
        parser_handler = ParserHandler(lol_site, ids, source, lock, header, skip_queries, use_wiki_mirror)
        if parser_handler.process_input():
            return {"errors": parser_handler.errors, "success": False}
        resp = {"queryId": query_id, "totalMatches": len(parser_handler.matches)}
        Thread(target=parse_scoreboard, args=[parser_handler, query_id]).start()
        return resp, 202


def parse_scoreboard(parser_handler, query_id):
    in_process[query_id]["parser_handler"] = parser_handler
    output, errors, warnings = parser_handler.run()
    in_process[query_id] = {
        "finished": True,
        "last_requested": in_process.get(query_id)["last_requested"],
        "data": {
            "text": output,
            "errors": errors,
            "warnings": warnings
        },
    }


@app.route('/clearcache', methods=["GET", "POST"])
def clearcache():
    if request.method == "POST":
        try:
            lol_site.cache.clear()
        except:
            return {"success": False}
        return {"success": True}


if __name__ == "__main__":
    app.run()
