import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { formatAverage, formatHalf, formatHitting } from '../components/formatStats.ts'
import { db } from '../db/database.ts'
import { getEvents, getMatch } from '../db/matches.ts'
import { listPlayers } from '../db/roster.ts'
import { buildBoxScore, teamTotals, type PlayerLine } from '../domain/boxScore.ts'
import { replay } from '../domain/replay.ts'
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

/** Every player's stats for the match, or for one set, counted from the saved taps. */
function BoxScoreScreen() {
  const { matchId = '' } = useParams()
  const data = useLiveQuery(async () => {
    const match = await getMatch(db, matchId)
    if (!match) return null
    const [team, players, events] = await Promise.all([
      db.teams.get(match.teamId),
      listPlayers(db, match.teamId),
      getEvents(db, matchId),
    ])
    return { match, teamName: team?.name ?? 'Us', players, events }
  }, [matchId])
  const [setFilter, setSetFilter] = useState<number | 'match'>('match')

  if (data === undefined) return null
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

  const { match, teamName, players, events } = data
  const state = replay(match, events)
  const counted = activeEvents(events).filter((e) => setFilter === 'match' || e.setNumber === setFilter)
  const lines = buildBoxScore(counted, players)
  // Only list players who got on the court. (Anyone with a stat was on the court.)
  const played = lines.filter((line) => line.setsPlayed > 0)
  const team = teamTotals(played, setFilter === 'match' ? state.setNumber : 1)
  const byId = new Map(players.map((p) => [p.id, p]))

  return (
    <main className="screen screen-wide">
      <div className="top-links">
        <Link className="back-link" to={`/matches/${match.id}`}>
          ‹ Back to match
        </Link>
      </div>
      <h1>Box score</h1>
      <p className="muted">
        {teamName} vs {match.opponentName}
        {state.sets.length > 0 && ` · ${state.sets.map((s) => `${s.us}–${s.them}`).join(', ')}`}
      </p>

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

      {played.length === 0 ? (
        <p className="muted">No stats yet. They show up here as you record taps.</p>
      ) : (
        <div className="table-scroll">
          <table className="box-score" aria-label="Box score">
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
                    <th scope="row">
                      #{player?.number} {player?.name}
                    </th>
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

export default BoxScoreScreen
