from flask import Flask, render_template, request
from flaskext.autoversion import Autoversion

from parser_handler import ParserHandler
from mwrogue.esports_client import EsportsClient
from threading import Thread
import uuid
from datetime import datetime

app = Flask(__name__)
app.autoversion = True
Autoversion(app)

lol_site = EsportsClient("lol")

tasks = {}


@app.route('/parser')
def parser():
    return render_template('index.html')


@app.before_request
def cleanup_old_tasks():
    global tasks
    print(tasks)
    five_min_ago = datetime.now().timestamp() - 5 * 60
    tasks = {task_id: task_data for task_id, task_data in tasks.items()
             if "finish_time" not in task_data or task_data["finish_time"] > five_min_ago}


@app.route("/parser/query", methods=["GET", "POST"])
def query():
    if request.method == "GET":
        task_id = request.args.get("queryId")

        if not task_id:
            return "", 400

        if task_id not in tasks:
            return "", 404

        if "return_data" not in tasks[task_id]:
            parser_handler = tasks[task_id]["parser_handler"]
            n_parsed_matches = parser_handler.n_parsed_matches
            total_matches = len(parser_handler.game_ids)
            return {"ready": False, "nParsedMatches": n_parsed_matches, "totalMatches": total_matches}, 202
        else:
            payload = tasks[task_id]["return_data"]
            payload["success"] = False if payload["errors"] else True
            del tasks[task_id]
            return {"ready": True, "payload": payload}
    elif request.method == "POST":
        request_data = request.json if request.mimetype == "application/json" else request.form

        task_id = uuid.uuid4().hex

        parser_handler = ParserHandler(
            lol_site,
            request_data.get("ids"),
            request_data.get("source"),
            request_data.get("header"),
            request_data.get("skipQueries"),
            request_data.get("useWikiMirror")
        )

        parser_handler.process_and_validate_input()
        if parser_handler.errors:
            return {"errors": parser_handler.errors, "success": False}

        resp = {"queryId": task_id, "totalMatches": len(parser_handler.game_ids)}
        Thread(target=run_parse_scoreboard_task, args=[parser_handler, task_id]).start()
        return resp, 202


def run_parse_scoreboard_task(parser_handler, task_id):
    tasks[task_id] = {"parser_handler": parser_handler}
    output, errors, warnings = parser_handler.run()
    tasks[task_id]["finish_time"] = datetime.now().timestamp()
    tasks[task_id]["return_data"] = {
        "text": output,
        "errors": errors,
        "warnings": warnings
    }


@app.route('/clearcache', methods=["POST"])
def clearcache():
    if request.method == "POST":
        lol_site.cache.clear()
        return "", 200


if __name__ == "__main__":
    app.run()
