import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import Scoreboard from '../components/Scoreboard.tsx'
import UndoButton from '../components/UndoButton.tsx'
import { db } from '../db/database.ts'
import { getEvents, getMatch } from '../db/matches.ts'
import { listPlayers } from '../db/roster.ts'
import { replay } from '../domain/replay.ts'
import { lastActiveEvent } from '../domain/undo.ts'
import FollowUpStrip, { type FollowUp } from './FollowUpStrip.tsx'
import LiveEntry from './LiveEntry.tsx'
import SetLineup from './SetLineup.tsx'

/** One match. Shows the lineup form between sets and the tap screen during a set. */
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
  // Lives here, not in LiveEntry, so "Assist by?" still shows after the kill that ends a set.
  const [followUp, setFollowUp] = useState<FollowUp | null>(null)

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
  // Only ask about the play that was just made: any newer tap or an undo hides the question.
  const openFollowUp = followUp && lastActiveEvent(events)?.actionId === followUp.actionId ? followUp : null
  // During a set, everything should fit on a phone screen without scrolling,
  // so the heading is hidden (the scoreboard shows both names) and things are tighter.
  const playing = state.status === 'playing'

  return (
    <main className={playing ? 'screen screen-live' : 'screen'}>
      <Link className="back-link" to="/">
        ‹ Home
      </Link>
      <h1 className={playing ? 'sr-only' : undefined}>vs {match.opponentName}</h1>
      <Scoreboard state={state} teamName={teamName} opponentName={match.opponentName} compact={playing} />
      {openFollowUp && (
        <FollowUpStrip followUp={openFollowUp} match={match} players={players} state={state} onChange={setFollowUp} />
      )}

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
      {state.status === 'playing' && (
        <LiveEntry
          key={state.setNumber}
          match={match}
          players={players}
          events={events}
          state={state}
          onFollowUp={setFollowUp}
        />
      )}
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

export default MatchScreen
