from leaguepedia_sb_parser.grid_parser import GridParser
from leaguepedia_sb_parser.live_parser import LiveParser
from leaguepedia_sb_parser.qq_parser import QQParser
from leaguepedia_sb_parser.components.errors import InvalidGameSource, EventCannotBeLocated, InvalidInput
from mwrogue.esports_client import EsportsClient
import traceback


class ParserHandler(object):
    BOX_BETWEEN = "\n{{box|break}}\n"
    BOX_START = "{{box|start}}\n"
    BOX_END = "\n{{box|end}}"
    ALLOWED_SOURCES = ("riot", "riot-live", "qq")

    def __init__(
        self,
        site: EsportsClient,
        game_ids: str | list[list[str]] = None,
        source: str = None,
        include_header: str | bool = True,
        skip_queries: str | bool = False,
        use_leaguepedia_mirror: str | bool = False,
    ):
        self.site = site
        self.game_ids = game_ids
        self.source = source
        self.include_header = self.cast_into_bool_if_necessary(include_header)
        self.skip_queries = self.cast_into_bool_if_necessary(skip_queries)
        self.use_leaguepedia_mirror = self.cast_into_bool_if_necessary(use_leaguepedia_mirror)
        self.raw_output = []
        self.errors = []
        self.warnings = []
        self.event_link = None
        self.n_parsed_matches = 0

    @staticmethod
    def cast_into_bool_if_necessary(value):
        if isinstance(value, bool):
            return value
        return True if value == "yes" else False

    def process_and_validate_input(self):
        try:
            if not self.game_ids or not self.source:
                self.errors.append("A required parameter (either ids or source) is missing")
                return
            if isinstance(self.game_ids, list):
                for match in self.game_ids:
                    if not match:
                        self.errors.append("A required parameter (either ids or source) is missing")
                        return
            self.cast_game_ids()
            if self.source not in self.ALLOWED_SOURCES:
                self.errors.append("The provided source is invalid")
                return
            self.event_link = self.query_event()
        except InvalidInput:
            self.errors.append("The provided game IDs are not correctly formatted")
        except EventCannotBeLocated:
            self.errors.append("The event for a game ID cannot be located")
        except:
            self.errors.append(traceback.format_exc().replace("\n", "<br>"))

    def run(self):
        try:
            if self.source == "qq" and self.use_leaguepedia_mirror:
                raise Exception("QQ games can't be retrieved from the wiki!")
            for match in self.game_ids:
                self.parse_match(match)
            output = self.make_output()
        except:
            output = None
            self.errors.append(traceback.format_exc().replace("\n", "<br>"))
        return output, self.errors, self.warnings

    def cast_game_ids(self):
        if isinstance(self.game_ids, list):
            return

        game_ids = self.game_ids.replace(" ", "").strip()

        casted_game_ids = []

        for match in game_ids.split("\n\n"):
            if self.source == "qq" and "\n" in match.strip():
                raise InvalidInput
            games = match.split("\n")
            casted_game_ids.append(games)

        self.game_ids = casted_game_ids

    def get_where_event(self):
        game_id = self.game_ids[0][0]
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
            parser = GridParser(self.site, self.event_link,
                                use_leaguepedia_mirror=self.use_leaguepedia_mirror)
        elif self.source == "riot-live":
            parser = LiveParser(self.site, self.event_link)
        elif self.source == "qq":
            parser = QQParser(self.site, self.event_link)
            match = match[0]
        else:
            raise InvalidGameSource(self.source)
        match_output, match_warnings = parser.parse_series(match, self.include_header)
        self.raw_output.append(match_output)
        self.warnings.extend(match_warnings)
        self.n_parsed_matches += 1

    def make_output(self):
        if len(self.raw_output) > 1:
            return (
                self.BOX_START + self.BOX_BETWEEN.join(self.raw_output) + self.BOX_END
            )
        return self.raw_output[0]
