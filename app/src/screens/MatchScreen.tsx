import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import Scoreboard from '../components/Scoreboard.tsx'
import UndoButton from '../components/UndoButton.tsx'
import { db } from '../db/database.ts'
import { getMatchData } from '../db/matches.ts'
import { nextQuestion } from '../domain/plays.ts'
import { replay } from '../domain/replay.ts'
import { lastActiveEvent } from '../domain/undo.ts'
import FollowUpStrip, { type FollowUpState } from './FollowUpStrip.tsx'
import LiveEntry from './LiveEntry.tsx'
import SetLineup from './SetLineup.tsx'

/** One match. Shows the lineup form between sets and the tap screen during a set. */
function MatchScreen() {
  const { matchId = '' } = useParams()
  const data = useLiveQuery(() => getMatchData(db, matchId), [matchId])
  // Lives here, not in LiveEntry, so "Assist by?" still shows after the kill that ends a set.
  const [followUp, setFollowUp] = useState<FollowUpState | null>(null)

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

  const { match, teams, events } = data
  const names = { home: teams.home.name, away: teams.away.name }
  // The whole match state is rebuilt from the saved taps every time something changes.
  const state = replay(match, events)
  // Only ask about the play that was just made (any newer tap or an undo hides the
  // question), and only while there's still something to ask.
  const openFollowUp =
    followUp &&
    lastActiveEvent(events)?.actionId === followUp.actionId &&
    nextQuestion(events, followUp.actionId, followUp.skipped)
      ? followUp
      : null
  // During a set, everything should fit on a phone screen without scrolling,
  // so the heading is hidden (the scoreboard shows both names) and things are tighter.
  const playing = state.status === 'playing'

  return (
    <main className={playing ? 'screen screen-live' : 'screen'}>
      <div className="top-links">
        <Link className="back-link" to="/">
          ‹ Home
        </Link>
        {state.setNumber > 0 && (
          <Link className="back-link" to={`/matches/${match.id}/box-score`}>
            Box score ›
          </Link>
        )}
      </div>
      <h1 className={playing ? 'sr-only' : undefined}>
        {names.away} at {names.home}
      </h1>
      <Scoreboard state={state} teamNames={names} compact={playing} />
      {/* During a set the question sits in the tap screen's button area, so the court doesn't jump. */}
      {openFollowUp && !playing && (
        <FollowUpStrip data={data} state={state} followUp={openFollowUp} onChange={setFollowUp} />
      )}

      {state.status === 'waiting_for_lineup' && (
        <>
          {/* key: a fresh form for each set */}
          <SetLineup key={state.setNumber} data={data} state={state} />
          {state.setNumber > 0 && <UndoButton match={match} />}
        </>
      )}
      {playing && (
        <LiveEntry
          key={state.setNumber}
          data={data}
          state={state}
          onPlay={(actionId) => setFollowUp(actionId ? { actionId, skipped: [] } : null)}
          question={
            openFollowUp && <FollowUpStrip data={data} state={state} followUp={openFollowUp} onChange={setFollowUp} />
          }
        />
      )}
      {state.status === 'finished' && state.winner && (
        <section className="card">
          <h2>{names[state.winner]} won</h2>
          <p className="muted">
            Sets {state.setsWon.away}–{state.setsWon.home} ({names.away}–{names.home})
          </p>
          <UndoButton match={match} />
        </section>
      )}
    </main>
  )
}

export default MatchScreen
