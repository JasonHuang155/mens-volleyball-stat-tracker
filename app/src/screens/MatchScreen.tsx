import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useParams } from 'react-router'
import Court from '../components/Court.tsx'
import Scoreboard from '../components/Scoreboard.tsx'
import UndoButton from '../components/UndoButton.tsx'
import { db } from '../db/database.ts'
import { getEvents, getMatch } from '../db/matches.ts'
import { listPlayers } from '../db/roster.ts'
import { replay } from '../domain/replay.ts'
import type { Match, MatchState, Player } from '../domain/types.ts'
import SetLineup from './SetLineup.tsx'

/** One match. Shows the lineup form between sets and the set being played otherwise. */
function MatchScreen() {
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
  // The whole match state is rebuilt from the saved taps every time something changes.
  const state = replay(match, events)

  return (
    <main className="screen">
      <Link className="back-link" to="/">
        ‹ Home
      </Link>
      <h1>vs {match.opponentName}</h1>
      <Scoreboard state={state} teamName={teamName} opponentName={match.opponentName} />

      {state.status === 'waiting_for_lineup' && (
        <>
          {/* key: a fresh form for each set */}
          <SetLineup
            key={state.setNumber}
            match={match}
            teamName={teamName}
            players={players}
            events={events}
            state={state}
          />
          {state.setNumber > 0 && <UndoButton match={match} />}
        </>
      )}
      {state.status === 'playing' && <SetInProgress match={match} players={players} state={state} />}
      {state.status === 'finished' && (
        <section className="card">
          <h2>{state.winner === 'us' ? `${teamName} won` : `${match.opponentName} won`}</h2>
          <p className="muted">
            Sets {state.setsWon.us}–{state.setsWon.them}
          </p>
          <UndoButton match={match} />
        </section>
      )}
    </main>
  )
}

type InProgressProps = { match: Match; players: Player[]; state: MatchState }

/** Who's on court and who's serving. The tap-to-record buttons build on this next. */
function SetInProgress({ match, players, state }: InProgressProps) {
  const byId = new Map(players.map((p) => [p.id, p]))
  const server = state.serverId ? byId.get(state.serverId) : undefined

  return (
    <section className="card" aria-label="On court">
      <p>
        {server ? `#${server.number} ${server.name} serving` : `${match.opponentName} serving`} · Rotation{' '}
        {state.rotation}
      </p>
      <Court
        renderSlot={(position) => {
          const player = byId.get(state.lineup[position - 1])
          return (
            <div className="court-player">
              <span className="court-position">{position}</span>
              <span className="jersey">#{player?.number}</span>
              <span className="court-name">{player?.name}</span>
            </div>
          )
        }}
      />
      <UndoButton match={match} />
    </section>
  )
}

export default MatchScreen
