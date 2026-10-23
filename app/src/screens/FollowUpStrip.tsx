import { useState } from 'react'
import { errorMessage } from '../components/errorMessage.ts'
import { db } from '../db/database.ts'
import { recordFollowUpTap, type MatchData } from '../db/matches.ts'
import { playerLabel } from '../db/roster.ts'
import { nextQuestion, playEvents, type Question } from '../domain/plays.ts'
import { courtRow, replay } from '../domain/replay.ts'
import type { MatchState, Player, StatBody } from '../domain/types.ts'

/** Which play the questions are about, and which questions the stat keeper skipped. */
export type FollowUpState = { actionId: string; skipped: Question['kind'][] }

type Props = {
  data: MatchData
  state: MatchState
  followUp: FollowUpState
  onChange: (followUp: FollowUpState | null) => void
}

/**
 * The questions after a play that involves other players: "Assist by?",
 * "Who was aced?", "Blocked by?", "Whose attack?". Skipping is fine, and
 * tapping anything else closes it.
 */
function FollowUpStrip({ data, followUp, onChange }: Props) {
  const { match, rosters, teams, events } = data
  const play = playEvents(events, followUp.actionId)
  const question = nextQuestion(events, followUp.actionId, followUp.skipped)
  if (!question || play.length === 0) return null

  // Who was on court when the play happened. If it won a sideout, that team has rotated since.
  const before = replay(match, events.filter((e) => e.seq < play[0].seq))
  const credited = play.flatMap((e) => ('playerId' in e ? [e.playerId] : []))
  const byId = new Map([...rosters.home, ...rosters.away].map((p) => [p.id, p]))
  let candidates = before.courts[question.side].lineup
    .filter((id) => !credited.includes(id))
    .map((id) => byId.get(id))
    .filter((p): p is Player => p !== undefined)
  if (question.kind === 'blockers') candidates = candidates.filter((p) => courtRow(before, question.side, p.id) === 'front')
  if (question.kind === 'assist') candidates.sort((a, b) => Number(b.position === 'S') - Number(a.position === 'S'))

  const attackErrorFirst = play[0].type === 'attack'
  const title = {
    assist: 'Assist by?',
    aced: 'Who was aced?',
    blockers: attackErrorFirst ? 'Blocked by?' : 'Who else blocked?',
    attacker: 'Whose attack?',
  }[question.kind]
  const skipLabel = {
    assist: 'No assist',
    aced: 'Untouched',
    blockers: attackErrorFirst ? 'Not blocked' : 'No one else',
    attacker: 'Skip',
  }[question.kind]

  async function record(bodies: StatBody[]) {
    for (const body of bodies) await recordFollowUpTap(db, match, body)
  }

  const bodyFor = (player: Player): StatBody => {
    const side = question.side
    switch (question.kind) {
      case 'assist':
        return { type: 'assist', side, playerId: player.id }
      case 'aced':
        return { type: 'pass', side, playerId: player.id, result: 0 }
      case 'attacker':
        return {
          type: 'attack',
          side,
          playerId: player.id,
          result: 'error',
          detail: { row: courtRow(before, side, player.id) ?? 'front' },
        }
      case 'blockers': // blockers are saved together by BlockerPicker below
        return { type: 'block', side, playerId: player.id, result: 'assist' }
    }
  }

  return (
    <section className={`follow-up side-${question.side}`} aria-label={title}>
      <p className="follow-up-title">
        {title} <span className="muted">{teams[question.side].name}</span>
      </p>
      {question.kind === 'blockers' ? (
        <BlockerPicker
          key={`${followUp.actionId}-${credited.length}`}
          candidates={candidates}
          skipLabel={skipLabel}
          onSkip={() => onChange({ ...followUp, skipped: [...followUp.skipped, question.kind] })}
          onSave={(picked) => {
            // One blocker on an attack error is a solo block; otherwise every blocker gets a block assist.
            const result = attackErrorFirst && picked.length === 1 ? 'solo' : 'assist'
            return record(picked.map((p) => ({ type: 'block', side: question.side, playerId: p.id, result })))
          }}
        />
      ) : (
        <SinglePicker
          candidates={candidates}
          skipLabel={skipLabel}
          onSkip={() => onChange({ ...followUp, skipped: [...followUp.skipped, question.kind] })}
          onPick={(p) => record([bodyFor(p)])}
        />
      )}
    </section>
  )
}

type SingleProps = {
  candidates: Player[]
  skipLabel: string
  onSkip: () => void
  onPick: (player: Player) => Promise<void>
}

/** One tap picks the player. */
function SinglePicker({ candidates, skipLabel, onSkip, onPick }: SingleProps) {
  const [error, setError] = useState('')
  return (
    <>
      <div className="follow-up-buttons">
        {candidates.map((p) => (
          <button
            key={p.id}
            className="button follow-up-button"
            type="button"
            aria-label={playerLabel(p)}
            onClick={() => onPick(p).catch((err) => setError(errorMessage(err)))}
          >
            #{p.number}
          </button>
        ))}
        <button className="button" type="button" onClick={onSkip}>
          {skipLabel}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

type BlockerProps = {
  candidates: Player[]
  skipLabel: string
  onSkip: () => void
  onSave: (picked: Player[]) => Promise<void>
}

/** Tap one, two, or three blockers, then Save. */
function BlockerPicker({ candidates, skipLabel, onSkip, onSave }: BlockerProps) {
  const [picked, setPicked] = useState<Player[]>([])
  const [error, setError] = useState('')

  function toggle(player: Player) {
    setPicked(picked.includes(player) ? picked.filter((p) => p !== player) : [...picked, player])
  }

  return (
    <>
      <div className="follow-up-buttons">
        {candidates.map((p) => (
          <button
            key={p.id}
            className="button follow-up-button"
            type="button"
            aria-label={playerLabel(p)}
            aria-pressed={picked.includes(p)}
            onClick={() => toggle(p)}
          >
            #{p.number}
          </button>
        ))}
        <button
          className="button button-primary"
          type="button"
          onClick={() =>
            picked.length === 0 ? setError('Tap who blocked, then Save') : onSave(picked).catch((err) => setError(errorMessage(err)))
          }
        >
          Save
        </button>
        <button className="button" type="button" onClick={onSkip}>
          {skipLabel}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

export default FollowUpStrip
