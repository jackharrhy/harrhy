-- Synthetic reader fixture, not a migration or a production schema dump.

CREATE TABLE "team" (
  "id" integer NOT NULL,
  "name" text NOT NULL,
  "color" text,
  "user_id" integer NOT NULL,
  "abbreviation" text NOT NULL,
  "captain_id" integer,
  "conference_id" integer
);

CREATE TABLE "players" (
  "id" integer NOT NULL,
  "name" text NOT NULL,
  "team_id" integer,
  "stats_character" text,
  "sort_position" integer NOT NULL
);

CREATE TABLE "user" (
  "id" integer NOT NULL,
  "name" text NOT NULL
);

CREATE TABLE "conferences" (
  "id" integer NOT NULL,
  "name" text NOT NULL,
  "color" text,
  "season_id" integer NOT NULL
);

CREATE TABLE "stat" (
  "character" text NOT NULL,
  "character_class" text NOT NULL,
  "captain" boolean NOT NULL,
  "throwing_arm" text NOT NULL,
  "batting_stance" text NOT NULL,
  "ability" text NOT NULL,
  "weight" integer NOT NULL,
  "hitting_trajectory" text NOT NULL,
  "slap_hit_contact_size" integer NOT NULL,
  "charge_hit_contact_size" integer NOT NULL,
  "slap_hit_power" integer NOT NULL,
  "charge_hit_power" integer NOT NULL,
  "bunting" integer NOT NULL,
  "speed" integer NOT NULL,
  "throwing_speed" integer NOT NULL,
  "fielding" integer NOT NULL,
  "curveball_speed" integer NOT NULL,
  "fastball_speed" integer NOT NULL,
  "curve" integer NOT NULL,
  "stamina" integer NOT NULL,
  "pitching_css" integer NOT NULL,
  "batting_css" integer NOT NULL,
  "fielding_css" integer NOT NULL,
  "speed_css" integer NOT NULL
);

CREATE TABLE "chemistry" (
  "character1" text NOT NULL,
  "character2" text NOT NULL,
  "relationship" text NOT NULL
);

CREATE TABLE "team_lineup" (
  "player_id" integer NOT NULL,
  "fielding_position" text,
  "batting_order" integer,
  "is_starred" boolean NOT NULL
);

CREATE TABLE "season" (
  "id" integer NOT NULL,
  "state" text NOT NULL,
  "current_drafting_user_id" integer,
  "draft_timer_started_at" timestamp,
  "draft_timer_paused_at" timestamp,
  "draft_timer_duration" integer NOT NULL
);

CREATE TABLE "users_seasons" (
  "user_id" integer NOT NULL,
  "season_id" integer NOT NULL,
  "drafting_turn" integer NOT NULL
);

CREATE TABLE "match_days" (
  "id" integer NOT NULL,
  "name" text,
  "date" timestamp,
  "order_in_season" integer,
  "season_id" integer NOT NULL
);

CREATE TABLE "match_locations" (
  "id" integer NOT NULL,
  "name" text NOT NULL
);

CREATE TABLE "matches" (
  "id" integer NOT NULL,
  "match_day_id" integer,
  "order_in_day" integer,
  "team_a_id" integer NOT NULL,
  "team_b_id" integer NOT NULL,
  "location_id" integer,
  "state" text NOT NULL,
  "scheduled_date" timestamp,
  "team_a_score" integer,
  "team_b_score" integer
);

CREATE TABLE "match_batting_orders" (
  "match_id" integer NOT NULL,
  "team_id" integer NOT NULL,
  "player_id" integer NOT NULL,
  "batting_order" integer NOT NULL,
  "fielding_position" text,
  "is_starred" boolean NOT NULL
);

CREATE TABLE "match_player_stats" (
  "match_id" integer NOT NULL,
  "player_id" integer NOT NULL,
  "team_id" integer NOT NULL,
  "plate_appearances" integer,
  "hits" integer,
  "home_runs" integer,
  "outs" integer,
  "rbi" integer,
  "innings_pitched_whole" integer,
  "innings_pitched_partial" integer,
  "strikeouts" integer,
  "earned_runs" integer,
  "putouts" integer,
  "assists" integer,
  "double_plays" integer,
  "triple_plays" integer,
  "errors" integer
);

CREATE TABLE "events" (
  "id" integer NOT NULL,
  "event_type" text NOT NULL,
  "season_id" integer NOT NULL,
  "created_at" timestamp NOT NULL
);

CREATE TABLE "event_draft" (
  "event_id" integer NOT NULL,
  "player_id" integer NOT NULL,
  "team_id" integer NOT NULL,
  "pick_number" integer NOT NULL
);

CREATE TABLE "event_season_state_change" (
  "event_id" integer NOT NULL,
  "from_state" text,
  "to_state" text NOT NULL
);

CREATE TABLE "event_match_state_change" (
  "event_id" integer NOT NULL,
  "match_id" integer NOT NULL,
  "from_state" text,
  "to_state" text NOT NULL
);

CREATE TABLE "event_trade" (
  "event_id" integer NOT NULL,
  "trade_id" integer NOT NULL,
  "action" text NOT NULL
);

CREATE TABLE "trades" (
  "id" integer NOT NULL,
  "from_user_id" integer NOT NULL,
  "to_user_id" integer NOT NULL,
  "status" text NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE TABLE "trade_players" (
  "trade_id" integer NOT NULL,
  "player_id" integer NOT NULL,
  "from_team_id" integer NOT NULL,
  "to_team_id" integer NOT NULL
);
