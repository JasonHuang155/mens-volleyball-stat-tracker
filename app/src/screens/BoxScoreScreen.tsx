import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { formatAverage, formatHalf, formatHitting } from '../components/formatStats.ts'
import { db } from '../db/database.ts'
import { getMatchData } from '../db/matches.ts'
import { playerLabel } from '../db/roster.ts'
import { buildBoxScore, teamTotals, type PlayerLine } from '../domain/boxScore.ts'
import { replay } from '../domain/replay.ts'
import type { MatchEvent, Player } from '../domain/types.ts'
import { activeEvents } from '../domain/undo.ts'

type Column = { abbr: string; title: string; value: (line: PlayerLine) => string }

// The NCAA box score columns, in NCAA order, plus pass average and total blocks.
const COLUMNS: Column[] = [
  { abbr: 'S', title: 'Sets played', value: (l) => String(l.setsPlayed) },
  { abbr: 'K', title: 'Kills', value: (l) => String(l.kills) },
  { abbr: 'E', title: 'Attack errors', value: (l) => String(l.attackErrors) },
  { abbr: 'TA', title: 'Total attacks', value: (l) => String(l.totalAttacks) },
  { abbr: 'PCT', title: 'Hitting percentage', value: (l) => formatHitting(l.hittingPercentage) },
  { abbr: 'A', title: 'Assists', value: (l) => String(l.assists) },
  { abbr: 'SA', title: 'Service aces', value: (l) => String(l.serviceAces) },
  { abbr: 'SE', title: 'Service errors', value: (l) => String(l.serviceErrors) },
  { abbr: 'RA', title: 'Reception attempts', value: (l) => String(l.receptionAttempts) },
  { abbr: 'RE', title: 'Reception errors', value: (l) => String(l.receptionErrors) },
  { abbr: 'PASS', title: 'Pass average (0-3)', value: (l) => formatAverage(l.passAverage) },
  { abbr: 'DIG', title: 'Digs', value: (l) => String(l.digs) },
  { abbr: 'BS', title: 'Block solos', value: (l) => String(l.blockSolos) },
  { abbr: 'BA', title: 'Block assists', value: (l) => String(l.blockAssists) },
  { abbr: 'TB', title: 'Total blocks', value: (l) => formatHalf(l.totalBlocks) },
  { abbr: 'BE', title: 'Block errors', value: (l) => String(l.blockErrors) },
  { abbr: 'BHE', title: 'Ball handling errors', value: (l) => String(l.ballHandlingErrors) },
  { abbr: 'PTS', title: 'Points', value: (l) => formatHalf(l.points) },
]

/** Both teams' stats for the match, or for one set, counted from the saved taps. */
function BoxScoreScreen() {
  const { matchId = '' } = useParams()
  const data = useLiveQuery(() => getMatchData(db, matchId), [matchId])
  const [setFilter, setSetFilter] = useState<number | 'match'>('match')

  if (data === undefined) return <p className="screen muted">Loading…</p>
  if (data === null) {
    return (
      <main className="screen">
        <h1>Match not found</h1>
        <Link className="button" to="/">
          Back to home
        </Link>
      </main>
    )
  }

  const { match, teams, rosters, events } = data
  const state = replay(match, events)
  const counted = activeEvents(events).filter((e) => setFilter === 'match' || e.setNumber === setFilter)
  const setsShown = setFilter === 'match' ? state.setNumber : 1

  return (
    <main className="screen screen-wide">
      <div className="top-links">
        <Link className="back-link" to={`/matches/${match.id}`}>
          ‹ Back to match
        </Link>
      </div>
      <h1>Box score</h1>
      <p className="muted">
        {teams.away.name} at {teams.home.name}
      </p>
      {state.sets.length > 0 && (
        <table className="set-scores" aria-label="Set scores">
          <tbody>
            {(['away', 'home'] as const).map((side) => (
              <tr key={side}>
                <th scope="row">{teams[side].name}</th>
                {state.sets.map((set, i) => (
                  <td key={i}>{set[side]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {state.setNumber > 1 && (
        <fieldset className="segmented segmented-auto">
          <legend>Show</legend>
          {(['match', ...state.sets.map((_, i) => i + 1)] as const).map((option) => (
            <label key={option}>
              <input
                type="radio"
                name="box-score-sets"
                checked={setFilter === option}
                onChange={() => setSetFilter(option)}
              />
              {option === 'match' ? 'Match' : `Set ${option}`}
            </label>
          ))}
        </fieldset>
      )}

      {state.setNumber === 0 ? (
        <p className="muted">No stats yet. They show up here as you record taps.</p>
      ) : (
        // Away team first, the way NCAA box scores list them.
        (['away', 'home'] as const).map((side) => (
          <TeamTable key={side} teamName={teams[side].name} roster={rosters[side]} events={counted} sets={setsShown} />
        ))
      )}

      <details className="legend">
        <summary>What the columns mean</summary>
        <dl>
          {COLUMNS.map((c) => (
            <div key={c.abbr}>
              <dt>{c.abbr}</dt>
              <dd>{c.title}</dd>
            </div>
          ))}
        </dl>
        <p className="muted">
          PCT = (kills − errors) ÷ total attacks. TB = solo blocks + half of block assists. PTS = kills + aces + solo
          blocks + half of block assists.
        </p>
      </details>
    </main>
  )
}

type TeamTableProps = { teamName: string; roster: Player[]; events: MatchEvent[]; sets: number }

/** One team's box score, with a team row at the bottom. */
function TeamTable({ teamName, roster, events, sets }: TeamTableProps) {
  // Only list players who got on the court. (Anyone with a stat was on the court.)
  const played = buildBoxScore(events, roster).filter((line) => line.setsPlayed > 0)
  const team = teamTotals(played, sets)
  const byId = new Map(roster.map((p) => [p.id, p]))

  return (
    <section aria-label={`${teamName} box score`}>
      <h2>{teamName}</h2>
      <div className="table-scroll">
        <table className="box-score" aria-label={`${teamName} stats`}>
          <thead>
            <tr>
              <th scope="col">Player</th>
              {COLUMNS.map((c) => (
                <th key={c.abbr} scope="col">
                  <abbr title={c.title}>{c.abbr}</abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {played.map((line) => {
              const player = byId.get(line.playerId)
              return (
                <tr key={line.playerId}>
                  <th scope="row">{player ? playerLabel(player) : '?'}</th>
                  {COLUMNS.map((c) => (
                    <td key={c.abbr}>{c.value(line)}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Team</th>
              {COLUMNS.map((c) => (
                <td key={c.abbr}>{c.value(team)}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

export default BoxScoreScreen
