import { column as c, table } from "remix/data-table";

export const team = table({
  name: "team",
  columns: {
    id: c.integer(),
    name: c.text(),
    color: c.text().nullable(),
    user_id: c.integer(),
    abbreviation: c.text(),
    captain_id: c.integer().nullable(),
    conference_id: c.integer().nullable(),
  },
});

export const players = table({
  name: "players",
  columns: {
    id: c.integer(),
    name: c.text(),
    team_id: c.integer().nullable(),
    stats_character: c.text().nullable(),
    sort_position: c.integer(),
  },
});

export const user = table({
  name: "user",
  columns: {
    id: c.integer(),
    name: c.text(),
  },
});

export const conferences = table({
  name: "conferences",
  columns: {
    id: c.integer(),
    name: c.text(),
    color: c.text().nullable(),
    season_id: c.integer(),
  },
});

export const stat = table({
  name: "stat",
  primaryKey: "character",
  columns: {
    character: c.text(),
    character_class: c.text(),
    captain: c.boolean(),
    throwing_arm: c.text(),
    batting_stance: c.text(),
    ability: c.text(),
    weight: c.integer(),
    hitting_trajectory: c.text(),
    slap_hit_contact_size: c.integer(),
    charge_hit_contact_size: c.integer(),
    slap_hit_power: c.integer(),
    charge_hit_power: c.integer(),
    bunting: c.integer(),
    speed: c.integer(),
    throwing_speed: c.integer(),
    fielding: c.integer(),
    curveball_speed: c.integer(),
    fastball_speed: c.integer(),
    curve: c.integer(),
    stamina: c.integer(),
    pitching_css: c.integer(),
    batting_css: c.integer(),
    fielding_css: c.integer(),
    speed_css: c.integer(),
  },
});

export const chemistry = table({
  name: "chemistry",
  primaryKey: ["character1", "character2"],
  columns: {
    character1: c.text(),
    character2: c.text(),
    relationship: c.text(),
  },
});

export const team_lineup = table({
  name: "team_lineup",
  primaryKey: "player_id",
  columns: {
    player_id: c.integer(),
    fielding_position: c.text().nullable(),
    batting_order: c.integer().nullable(),
    is_starred: c.boolean(),
  },
});

export const season = table({
  name: "season",
  columns: {
    id: c.integer(),
    state: c.text(),
    current_drafting_user_id: c.integer().nullable(),
    draft_timer_started_at: c.timestamp().nullable(),
    draft_timer_paused_at: c.timestamp().nullable(),
    draft_timer_duration: c.integer(),
  },
});

export const users_seasons = table({
  name: "users_seasons",
  primaryKey: ["user_id", "season_id"],
  columns: {
    user_id: c.integer(),
    season_id: c.integer(),
    drafting_turn: c.integer(),
  },
});

export const match_days = table({
  name: "match_days",
  columns: {
    id: c.integer(),
    name: c.text().nullable(),
    date: c.timestamp().nullable(),
    order_in_season: c.integer().nullable(),
    season_id: c.integer(),
  },
});

export const match_locations = table({
  name: "match_locations",
  columns: {
    id: c.integer(),
    name: c.text(),
  },
});

export const matches = table({
  name: "matches",
  columns: {
    id: c.integer(),
    match_day_id: c.integer().nullable(),
    order_in_day: c.integer().nullable(),
    team_a_id: c.integer(),
    team_b_id: c.integer(),
    location_id: c.integer().nullable(),
    state: c.text(),
    scheduled_date: c.timestamp().nullable(),
    team_a_score: c.integer().nullable(),
    team_b_score: c.integer().nullable(),
  },
});

export const match_batting_orders = table({
  name: "match_batting_orders",
  primaryKey: ["match_id", "team_id", "player_id"],
  columns: {
    match_id: c.integer(),
    team_id: c.integer(),
    player_id: c.integer(),
    batting_order: c.integer(),
    fielding_position: c.text().nullable(),
    is_starred: c.boolean(),
  },
});

export const match_player_stats = table({
  name: "match_player_stats",
  primaryKey: ["match_id", "player_id"],
  columns: {
    match_id: c.integer(),
    player_id: c.integer(),
    team_id: c.integer(),
    plate_appearances: c.integer().nullable(),
    hits: c.integer().nullable(),
    home_runs: c.integer().nullable(),
    outs: c.integer().nullable(),
    rbi: c.integer().nullable(),
    innings_pitched_whole: c.integer().nullable(),
    innings_pitched_partial: c.integer().nullable(),
    strikeouts: c.integer().nullable(),
    earned_runs: c.integer().nullable(),
    putouts: c.integer().nullable(),
    assists: c.integer().nullable(),
    double_plays: c.integer().nullable(),
    triple_plays: c.integer().nullable(),
    errors: c.integer().nullable(),
  },
});

export const events = table({
  name: "events",
  columns: {
    id: c.integer(),
    event_type: c.text(),
    season_id: c.integer(),
    created_at: c.timestamp(),
  },
});

export const event_draft = table({
  name: "event_draft",
  primaryKey: "event_id",
  columns: {
    event_id: c.integer(),
    player_id: c.integer(),
    team_id: c.integer(),
    pick_number: c.integer(),
  },
});

export const event_season_state_change = table({
  name: "event_season_state_change",
  primaryKey: "event_id",
  columns: {
    event_id: c.integer(),
    from_state: c.text().nullable(),
    to_state: c.text(),
  },
});

export const event_match_state_change = table({
  name: "event_match_state_change",
  primaryKey: "event_id",
  columns: {
    event_id: c.integer(),
    match_id: c.integer(),
    from_state: c.text().nullable(),
    to_state: c.text(),
  },
});

export const event_trade = table({
  name: "event_trade",
  primaryKey: "event_id",
  columns: {
    event_id: c.integer(),
    trade_id: c.integer(),
    action: c.text(),
  },
});

export const trades = table({
  name: "trades",
  columns: {
    id: c.integer(),
    from_user_id: c.integer(),
    to_user_id: c.integer(),
    status: c.text(),
    created_at: c.timestamp(),
    updated_at: c.timestamp(),
  },
});

export const trade_players = table({
  name: "trade_players",
  primaryKey: ["trade_id", "player_id"],
  columns: {
    trade_id: c.integer(),
    player_id: c.integer(),
    from_team_id: c.integer(),
    to_team_id: c.integer(),
  },
});
