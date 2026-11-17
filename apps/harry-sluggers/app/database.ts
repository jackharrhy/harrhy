import { createPostgresDatabase } from "remix/data-table/postgres";
import * as s from "./schema.ts";
import { parseSafe, string } from "remix/data-schema";

export function openArchive(connectionString: string) {
  const db = createPostgresDatabase({
    connectionString,
    max: 4,
    options:
      "-c default_transaction_read_only=on -c statement_timeout=5000 -c idle_in_transaction_session_timeout=5000",
  });
  async function read() {
    return db.transaction(
      async (tx) => ({
        teams: await tx
          .query(s.team)
          .select({
            id: s.team.id,
            name: s.team.name,
            color: s.team.color,
            user_id: s.team.user_id,
            abbreviation: s.team.abbreviation,
            captain_id: s.team.captain_id,
            conference_id: s.team.conference_id,
          })
          .all(),
        players: await tx
          .query(s.players)
          .select({
            id: s.players.id,
            name: s.players.name,
            team_id: s.players.team_id,
            stats_character: s.players.stats_character,
            sort_position: s.players.sort_position,
          })
          .all(),
        managers: await tx
          .query(s.user)
          .select({ id: s.user.id, name: s.user.name })
          .all(),
        conferences: await tx
          .query(s.conferences)
          .select({
            id: s.conferences.id,
            name: s.conferences.name,
            color: s.conferences.color,
            season_id: s.conferences.season_id,
          })
          .all(),
        stats: await tx
          .query(s.stat)
          .select({
            character: s.stat.character,
            character_class: s.stat.character_class,
            captain: s.stat.captain,
            throwing_arm: s.stat.throwing_arm,
            batting_stance: s.stat.batting_stance,
            ability: s.stat.ability,
            weight: s.stat.weight,
            hitting_trajectory: s.stat.hitting_trajectory,
            slap_hit_contact_size: s.stat.slap_hit_contact_size,
            charge_hit_contact_size: s.stat.charge_hit_contact_size,
            slap_hit_power: s.stat.slap_hit_power,
            charge_hit_power: s.stat.charge_hit_power,
            bunting: s.stat.bunting,
            speed: s.stat.speed,
            throwing_speed: s.stat.throwing_speed,
            fielding: s.stat.fielding,
            curveball_speed: s.stat.curveball_speed,
            fastball_speed: s.stat.fastball_speed,
            curve: s.stat.curve,
            stamina: s.stat.stamina,
            pitching_css: s.stat.pitching_css,
            batting_css: s.stat.batting_css,
            fielding_css: s.stat.fielding_css,
            speed_css: s.stat.speed_css,
          })
          .all(),
        chemistry: await tx
          .query(s.chemistry)
          .select({
            character1: s.chemistry.character1,
            character2: s.chemistry.character2,
            relationship: s.chemistry.relationship,
          })
          .all(),
        lineups: await tx
          .query(s.team_lineup)
          .select({
            player_id: s.team_lineup.player_id,
            fielding_position: s.team_lineup.fielding_position,
            batting_order: s.team_lineup.batting_order,
            is_starred: s.team_lineup.is_starred,
          })
          .all(),
        seasons: await tx
          .query(s.season)
          .select({
            id: s.season.id,
            state: s.season.state,
            current_drafting_user_id: s.season.current_drafting_user_id,
            draft_timer_started_at: s.season.draft_timer_started_at,
            draft_timer_paused_at: s.season.draft_timer_paused_at,
            draft_timer_duration: s.season.draft_timer_duration,
          })
          .all(),
        turns: await tx
          .query(s.users_seasons)
          .select({
            user_id: s.users_seasons.user_id,
            season_id: s.users_seasons.season_id,
            drafting_turn: s.users_seasons.drafting_turn,
          })
          .all(),
        days: await tx
          .query(s.match_days)
          .select({
            id: s.match_days.id,
            name: s.match_days.name,
            date: s.match_days.date,
            order_in_season: s.match_days.order_in_season,
            season_id: s.match_days.season_id,
          })
          .all(),
        locations: await tx
          .query(s.match_locations)
          .select({ id: s.match_locations.id, name: s.match_locations.name })
          .all(),
        matches: await tx
          .query(s.matches)
          .select({
            id: s.matches.id,
            match_day_id: s.matches.match_day_id,
            order_in_day: s.matches.order_in_day,
            team_a_id: s.matches.team_a_id,
            team_b_id: s.matches.team_b_id,
            location_id: s.matches.location_id,
            state: s.matches.state,
            scheduled_date: s.matches.scheduled_date,
            team_a_score: s.matches.team_a_score,
            team_b_score: s.matches.team_b_score,
          })
          .all(),
        appearances: await tx
          .query(s.match_batting_orders)
          .select({
            match_id: s.match_batting_orders.match_id,
            team_id: s.match_batting_orders.team_id,
            player_id: s.match_batting_orders.player_id,
            batting_order: s.match_batting_orders.batting_order,
            fielding_position: s.match_batting_orders.fielding_position,
            is_starred: s.match_batting_orders.is_starred,
          })
          .all(),
        performances: await tx
          .query(s.match_player_stats)
          .select({
            match_id: s.match_player_stats.match_id,
            player_id: s.match_player_stats.player_id,
            team_id: s.match_player_stats.team_id,
            plate_appearances: s.match_player_stats.plate_appearances,
            hits: s.match_player_stats.hits,
            home_runs: s.match_player_stats.home_runs,
            outs: s.match_player_stats.outs,
            rbi: s.match_player_stats.rbi,
            innings_pitched_whole: s.match_player_stats.innings_pitched_whole,
            innings_pitched_partial:
              s.match_player_stats.innings_pitched_partial,
            strikeouts: s.match_player_stats.strikeouts,
            earned_runs: s.match_player_stats.earned_runs,
            putouts: s.match_player_stats.putouts,
            assists: s.match_player_stats.assists,
            double_plays: s.match_player_stats.double_plays,
            triple_plays: s.match_player_stats.triple_plays,
            errors: s.match_player_stats.errors,
          })
          .all(),
        events: await tx
          .query(s.events)
          .select({
            id: s.events.id,
            event_type: s.events.event_type,
            season_id: s.events.season_id,
            created_at: s.events.created_at,
          })
          .orderBy("id", "desc")
          .limit(200)
          .all(),
        picks: await tx
          .query(s.event_draft)
          .select({
            event_id: s.event_draft.event_id,
            player_id: s.event_draft.player_id,
            team_id: s.event_draft.team_id,
            pick_number: s.event_draft.pick_number,
          })
          .all(),
        seasonChanges: await tx
          .query(s.event_season_state_change)
          .select({
            event_id: s.event_season_state_change.event_id,
            from_state: s.event_season_state_change.from_state,
            to_state: s.event_season_state_change.to_state,
          })
          .all(),
        matchChanges: await tx
          .query(s.event_match_state_change)
          .select({
            event_id: s.event_match_state_change.event_id,
            match_id: s.event_match_state_change.match_id,
            from_state: s.event_match_state_change.from_state,
            to_state: s.event_match_state_change.to_state,
          })
          .all(),
        tradeEvents: await tx
          .query(s.event_trade)
          .select({
            event_id: s.event_trade.event_id,
            trade_id: s.event_trade.trade_id,
            action: s.event_trade.action,
          })
          .all(),
        trades: await tx
          .query(s.trades)
          .select({
            id: s.trades.id,
            from_user_id: s.trades.from_user_id,
            to_user_id: s.trades.to_user_id,
            status: s.trades.status,
            created_at: s.trades.created_at,
            updated_at: s.trades.updated_at,
          })
          .all(),
        tradePlayers: await tx
          .query(s.trade_players)
          .select({
            trade_id: s.trade_players.trade_id,
            player_id: s.trade_players.player_id,
            from_team_id: s.trade_players.from_team_id,
            to_team_id: s.trade_players.to_team_id,
          })
          .all(),
      }),
      { readOnly: true, isolationLevel: "repeatable read" },
    );
  }
  return { read, close: () => db.close() };
}
export type Archive = Awaited<
  ReturnType<ReturnType<typeof openArchive>["read"]>
>;
export type Match = Archive["matches"][number];
export function result(match: Match, team: number) {
  if (
    match.state !== "finished" ||
    match.team_a_score === null ||
    match.team_b_score === null ||
    ![match.team_a_id, match.team_b_id].includes(team)
  )
    return null;
  const difference =
    (match.team_a_score - match.team_b_score) *
    (team === match.team_a_id ? 1 : -1);
  return difference > 0 ? "Win" : difference < 0 ? "Loss" : "Draw";
}
const routeId = string().pipe({
  check: (value) => /^[1-9]\d{0,8}$/.test(value),
  code: "route.id",
  message: "Expected a positive record ID",
});
export function positiveId(input: string | undefined) {
  const parsed = parseSafe(routeId, input);
  return parsed.success ? Number(parsed.value) : null;
}
