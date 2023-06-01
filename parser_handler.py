from leaguepedia_sb_parser.bayes_parser import BayesParser
from leaguepedia_sb_parser.live_parser import LiveParser
from leaguepedia_sb_parser.qq_parser import QQParser
from leaguepedia_sb_parser.components.errors import InvalidGameSource, EventCannotBeLocated, InvalidInput
from mwrogue.esports_client import EsportsClient
import traceback
import os
import json
from datetime import datetime
import pytz
from threading import Lock


class ParserHandler(object):
    BOX_BETWEEN = "\n{{box|break}}\n"
    BOX_START = "{{box|start}}\n"
    BOX_END = "\n{{box|end}}"
    ALLOWED_SOURCES = ("riot", "riot-live", "qq")

    def __init__(
        self,
        site: EsportsClient,
        game_ids: str,
        source: str,
        lock: Lock,
        header: str = None,
        skip_queries: str = None,
        use_leaguepedia_mirror: str = None,
    ):
        self.site = site
        self.game_ids = game_ids.replace(" ", "").strip()
        self.source = source
        self.header = True if header == "yes" else False
        self.skip_queries = True if skip_queries == "yes" else False
        self.use_leaguepedia_mirror = True if use_leaguepedia_mirror == "yes" else False
        self.matches = []
        self.raw_output = []
        self.errors = []
        self.warnings = []
        self.event_link = None
        self.parsed_matches = 0
        self.lock = lock

    def process_input(self):
        try:
            self.split_game_ids()
            if self.source not in self.ALLOWED_SOURCES:
                raise InvalidGameSource(self.source)
            self.event_link = self.query_event()
        except:
            self.errors.append(traceback.format_exc().replace("\n", "<br>"))
            return self.errors

    def run(self):
        try:
            for match in self.matches:
                self.parse_match(match)
            output = self.make_output()
            self.update_statistics()
        except:
            output = None
            self.errors.append(traceback.format_exc().replace("\n", "<br>"))
        return output, self.errors, self.warnings

    def update_statistics(self):
        stats = self.open_statistics()
        stats["times_ran"] += 1
        stats["executions"].append(
            {
                "game_ids": self.matches,
                "date": datetime.now().astimezone(
                        tz=pytz.timezone("America/Argentina/Buenos_Aires")
                        ).strftime("%Y-%m-%d %H:%M:%S"),
                "header": self.header,
                "skip_queries": self.skip_queries,
                "tournament": self.event_link,
                "source": self.source,
            }
        )
        self.save_statistics(stats)

    def save_statistics(self, stats):
        with self.lock:
            with open(file="stats.json", mode="w+", encoding="utf8") as f:
                json.dump(stats, f, ensure_ascii=False, indent=4)

    @staticmethod
    def open_statistics():
        if not os.path.isfile("stats.json"):
            with open(file="stats.json", mode="w+", encoding="utf8") as f:
                json.dump({"times_ran": 0, "executions": []}, f, ensure_ascii=False)
        with open(file="stats.json", mode="r+", encoding="utf8") as f:
            stats = json.load(f)
        return stats

    def split_game_ids(self):
        for match in self.game_ids.split("\n\n"):
            if self.source == "qq" and "\n" in match.strip():
                raise InvalidInput
            games = match.split("\n")
            self.matches.append(games)

    def get_where_event(self):
        game_id = self.matches[0][0]
        if self.source == "qq":
            return (
                f"MSG.MatchHistory = 'https://lpl.qq.com/es/stats.shtml?bmid={game_id}'"
            )
        else:
            return f"MSG.RiotPlatformGameId = '{game_id}'"

    def query_event(self):
        if self.skip_queries:
            return "Season 1 World Championship"
        response = self.site.cargo_client.query(
            tables="MatchScheduleGame=MSG, Tournaments=T",
            fields="COALESCE(T.StandardName, T.Name)=Name",
            where=self.get_where_event(),
            limit=1,
            join_on="MSG.OverviewPage=T.OverviewPage",
        )
        if response and response[0]["Name"] is not None:
            return response[0]["Name"]
        else:
            raise EventCannotBeLocated

    def parse_match(self, match):
        if self.source == "riot":
            parser = BayesParser(self.site, self.event_link,
                                 use_leaguepedia_mirror=self.use_leaguepedia_mirror)
        elif self.source == "riot-live":
            parser = LiveParser(self.site, self.event_link)
        elif self.source == "qq":
            parser = QQParser(self.site, self.event_link)
            match = match[0]
        else:
            raise InvalidGameSource(self.source)
        match_output, match_warnings = parser.parse_series(match, self.header)
        self.raw_output.append(match_output)
        self.warnings.extend(match_warnings)
        self.parsed_matches += 1

    def make_output(self):
        if len(self.raw_output) > 1:
            return (
                self.BOX_START + self.BOX_BETWEEN.join(self.raw_output) + self.BOX_END
            )
        return self.raw_output[0]
