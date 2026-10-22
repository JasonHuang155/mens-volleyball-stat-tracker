import { useState, type ReactNode } from 'react'
import Court from '../components/Court.tsx'
import { describeEvent } from '../components/describeEvent.ts'
import { errorMessage } from '../components/errorMessage.ts'
import UndoButton from '../components/UndoButton.tsx'
import { db } from '../db/database.ts'
import { recordTap } from '../db/matches.ts'
import { courtRow } from '../domain/replay.ts'
import type { Match, MatchEvent, MatchState, Player, ServeType, StatBody } from '../domain/types.ts'
import { activeEvents, lastActiveEvent } from '../domain/undo.ts'
import type { FollowUp } from './FollowUpStrip.tsx'
import SubPanel from './SubPanel.tsx'

const SERVE_TYPES: { value: ServeType; label: string }[] = [
  { value: 'jump_spin', label: 'Jump spin' },
  { value: 'jump_float', label: 'Jump float' },
  { value: 'standing_float', label: 'Standing float' },
]

type Props = {
  match: Match
  players: Player[]
  events: MatchEvent[]
  state: MatchState
  /** After a kill or block assist, the match screen asks who else was involved. */
  onFollowUp: (followUp: FollowUp | null) => void
}

/** The courtside screen: tap a player, then what they did. */
function LiveEntry({ match, players, events, state, onFollowUp }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showSubs, setShowSubs] = useState(false)
  const [serveTypeChoices, setServeTypeChoices] = useState<Record<string, ServeType>>({})
  const [error, setError] = useState('')

  const byId = new Map(players.map((p) => [p.id, p]))
  const server = state.serverId ? byId.get(state.serverId) : undefined
  const last = lastActiveEvent(events)
  const selected = selectedId ? byId.get(selectedId) : undefined

  function selectPlayer(id: string) {
    setSelectedId(id === selectedId ? null : id) // tapping the same player again deselects
    setShowSubs(false)
    setError('')
    onFollowUp(null) // a new tap closes any open "Assist by?" question
  }

  async function save(body: StatBody) {
    try {
      const event = await recordTap(db, match, body)
      setError('')
      setSelectedId(null)
      onFollowUp(followUpAfter(event))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  // Each player's serve type defaults to the one they used last, since most players
  // always hit the same serve.
  function serveTypeFor(playerId: string): ServeType {
    return serveTypeChoices[playerId] ?? lastServeType(events, playerId) ?? 'jump_float'
  }

  return (
    <section className="live" aria-label="On court">
      <p className="status-line">
        {server ? `#${server.number} ${server.name} serving` : `${match.opponentName} serving`} · Rotation{' '}
        {state.rotation}
      </p>
      {last && <p className="muted last-tap">Last: {describeEvent(last, byId)}</p>}

      <Court
        renderSlot={(position) => {
          const id = state.lineup[position - 1]
          const player = byId.get(id)
          const serving = state.serverId === id
          return (
            <button
              type="button"
              className={id === selectedId ? 'court-button court-button-selected' : 'court-button'}
              aria-pressed={id === selectedId}
              aria-label={`#${player?.number} ${player?.name}${serving ? ', serving' : ''}`}
              onClick={() => selectPlayer(id)}
            >
              <span className="court-position">{position}</span>
              <span className="jersey">#{player?.number}</span>
              <span className="court-name">{player?.name}</span>
              {serving && <span className="badge">Serving</span>}
              {id === state.liberoId && <span className="badge">Libero</span>}
            </button>
          )
        }}
      />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {selected ? (
        <PlayerActions
          player={selected}
          state={state}
          serveType={serveTypeFor(selected.id)}
          onServeType={(type) => setServeTypeChoices({ ...serveTypeChoices, [selected.id]: type })}
          onSave={save}
          onCancel={() => setSelectedId(null)}
        />
      ) : showSubs ? (
        <SubPanel match={match} players={players} state={state} onDone={() => setShowSubs(false)} />
      ) : (
        <section className="action-panel" aria-label="Team actions">
          <p className="muted">Tap a player, then what they did.</p>
          <div className="action-buttons action-buttons-2">
            <ActionButton tone="bad" onClick={() => save({ type: 'their_point' })}>
              Their point
            </ActionButton>
            <ActionButton tone="good" onClick={() => save({ type: 'their_error' })}>
              Their error
            </ActionButton>
          </div>
          <div className="button-row">
            <UndoButton match={match} />
            <button
              className="button"
              type="button"
              onClick={() => {
                setShowSubs(true)
                onFollowUp(null)
              }}
            >
              Subs
            </button>
          </div>
        </section>
      )}
    </section>
  )
}

type PlayerActionsProps = {
  player: Player
  state: MatchState
  serveType: ServeType
  onServeType: (type: ServeType) => void
  onSave: (body: StatBody) => void
  onCancel: () => void
}

/** The outcome buttons for one player. Only the buttons that make sense right now are shown. */
function PlayerActions({ player, state, serveType, onServeType, onSave, onCancel }: PlayerActionsProps) {
  const playerId = player.id
  const row = courtRow(state, playerId) ?? 'back'
  const serving = state.serverId === playerId
  const receiving = state.servingTeam === 'them'

  return (
    <section className="action-panel" aria-label={`Stats for #${player.number} ${player.name}`}>
      <div className="action-panel-title">
        <strong>
          #{player.number} {player.name}
        </strong>
        <button className="button button-small" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {serving && (
        <ActionGroup label="Serve">
          <div className="chip-row" role="group" aria-label="Serve type">
            {SERVE_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                className="chip"
                aria-pressed={t.value === serveType}
                onClick={() => onServeType(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="action-buttons">
            <ActionButton tone="good" onClick={() => onSave({ type: 'serve', playerId, result: 'ace', detail: { serveType } })}>
              Ace
            </ActionButton>
            <ActionButton tone="bad" onClick={() => onSave({ type: 'serve', playerId, result: 'error', detail: { serveType } })}>
              Error
            </ActionButton>
            <ActionButton onClick={() => onSave({ type: 'serve', playerId, result: 'in', detail: { serveType } })}>
              In
            </ActionButton>
          </div>
        </ActionGroup>
      )}

      {receiving && (
        <ActionGroup label="Pass">
          <div className="action-buttons action-buttons-4">
            {([0, 1, 2, 3] as const).map((rating) => (
              <ActionButton
                key={rating}
                tone={rating === 0 ? 'bad' : undefined}
                onClick={() => onSave({ type: 'pass', playerId, result: rating })}
              >
                {rating}
              </ActionButton>
            ))}
          </div>
        </ActionGroup>
      )}

      {/* Front or back row is filled in from where the player is standing. */}
      <ActionGroup label={row === 'front' ? 'Attack' : 'Attack, back row'}>
        <div className="action-buttons">
          <ActionButton tone="good" onClick={() => onSave({ type: 'attack', playerId, result: 'kill', detail: { row } })}>
            Kill
          </ActionButton>
          <ActionButton tone="bad" onClick={() => onSave({ type: 'attack', playerId, result: 'error', detail: { row } })}>
            Error
          </ActionButton>
          <ActionButton onClick={() => onSave({ type: 'attack', playerId, result: 'in_play', detail: { row } })}>
            In play
          </ActionButton>
        </div>
      </ActionGroup>

      {/* Only front-row players can block. */}
      {row === 'front' && (
        <ActionGroup label="Block">
          <div className="action-buttons">
            <ActionButton tone="good" onClick={() => onSave({ type: 'block', playerId, result: 'solo' })}>
              Solo
            </ActionButton>
            <ActionButton tone="good" onClick={() => onSave({ type: 'block', playerId, result: 'assist' })}>
              Assist
            </ActionButton>
            <ActionButton tone="bad" onClick={() => onSave({ type: 'block', playerId, result: 'error' })}>
              Error
            </ActionButton>
          </div>
        </ActionGroup>
      )}

      <ActionGroup label="Other">
        <div className="action-buttons">
          <ActionButton onClick={() => onSave({ type: 'dig', playerId })}>Dig</ActionButton>
          <ActionButton onClick={() => onSave({ type: 'assist', playerId })}>Assist</ActionButton>
          <ActionButton
            tone="bad"
            label="Ball handling error"
            onClick={() => onSave({ type: 'ball_handling_error', playerId })}
          >
            BHE
          </ActionButton>
        </div>
      </ActionGroup>
    </section>
  )
}

function ActionGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="action-group" role="group" aria-label={label}>
      <span className="action-group-label">{label}</span>
      <div className="action-group-body">{children}</div>
    </div>
  )
}

type ActionButtonProps = {
  tone?: 'good' | 'bad'
  /** The full name, when the button shows an abbreviation (read out by screen readers). */
  label?: string
  onClick: () => void
  children: ReactNode
}

/** Green-ish for points to us, red-ish for points to them. */
function ActionButton({ tone, label, onClick, children }: ActionButtonProps) {
  const className = tone ? `button action-button action-${tone}` : 'button action-button'
  return (
    <button className={className} type="button" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  )
}

/** After a kill, ask who set it. After a block assist, ask who else blocked. */
function followUpAfter(event: MatchEvent): FollowUp | null {
  if (event.type === 'attack' && event.result === 'kill') {
    return { kind: 'assist', actionId: event.actionId, alreadyCredited: [event.playerId] }
  }
  if (event.type === 'block' && event.result === 'assist') {
    return { kind: 'block', actionId: event.actionId, alreadyCredited: [event.playerId] }
  }
  return null
}

function lastServeType(events: MatchEvent[], playerId: string): ServeType | undefined {
  const serves = activeEvents(events).filter((e) => e.type === 'serve' && e.playerId === playerId)
  const lastServe = serves[serves.length - 1]
  return lastServe?.type === 'serve' ? lastServe.detail.serveType : undefined
}

export default LiveEntry
