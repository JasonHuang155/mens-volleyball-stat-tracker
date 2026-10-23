import { useState, type ReactNode } from 'react'
import Court from '../components/Court.tsx'
import { describeEvent } from '../components/describeEvent.ts'
import { errorMessage } from '../components/errorMessage.ts'
import UndoButton from '../components/UndoButton.tsx'
import { db } from '../db/database.ts'
import { recordFollowUpTap, recordTap, type MatchData } from '../db/matches.ts'
import { playerLabel } from '../db/roster.ts'
import { courtRow } from '../domain/replay.ts'
import type { MatchEvent, MatchState, Player, ServeType, Side, StatBody } from '../domain/types.ts'
import { activeEvents, lastActiveEvent } from '../domain/undo.ts'
import SubPanel from './SubPanel.tsx'

const SERVE_TYPES: { value: ServeType; label: string }[] = [
  { value: 'jump_spin', label: 'Jump spin' },
  { value: 'jump_float', label: 'Jump float' },
  { value: 'standing_float', label: 'Standing float' },
]

type Props = {
  data: MatchData
  state: MatchState
  /** Called with each saved play, so the match screen can ask about the other players involved. */
  onPlay: (actionId: string | null) => void
  /** An open question about the last play ("Assist by?"), shown in place of the team buttons. */
  question?: ReactNode
}

type Selected = { side: Side; player: Player }

/** The courtside screen: both teams on one court. Tap a player, then what they did. */
function LiveEntry({ data, state, onPlay, question }: Props) {
  const { match, teams, rosters, events } = data
  const [selected, setSelected] = useState<Selected | null>(null)
  const [showSubs, setShowSubs] = useState(false)
  const [serveTypeChoices, setServeTypeChoices] = useState<Record<string, ServeType>>({})
  const [error, setError] = useState('')

  const names = { home: teams.home.name, away: teams.away.name }
  const byId = new Map([...rosters.home, ...rosters.away].map((p) => [p.id, p]))
  const server = state.serverId ? byId.get(state.serverId) : undefined
  const last = lastActiveEvent(events)

  function select(side: Side, player: Player) {
    setSelected(selected?.player.id === player.id ? null : { side, player }) // tapping again deselects
    setShowSubs(false)
    setError('')
    onPlay(null) // a new tap closes any open question
  }

  async function save(body: StatBody) {
    const serverBefore = state.serverId
    try {
      const event = await recordTap(db, match, body)
      // A reception error is the other half of the server's ace, so add the ace too.
      if (body.type === 'pass' && body.result === 0 && serverBefore) {
        await recordFollowUpTap(db, match, {
          type: 'serve',
          side: state.servingSide,
          playerId: serverBefore,
          result: 'ace',
          detail: { serveType: serveTypeFor(serverBefore) },
        })
      }
      setError('')
      setSelected(null)
      onPlay(event.actionId)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  // Each player's serve type defaults to the one they used last, since most players
  // always hit the same serve.
  function serveTypeFor(playerId: string): ServeType {
    return serveTypeChoices[playerId] ?? lastServeType(events, playerId) ?? 'jump_float'
  }

  function renderCourt(side: Side) {
    return (position: number) => {
      const id = state.courts[side].lineup[position - 1]
      const player = byId.get(id)
      if (!player) return null
      const serving = state.serverId === id
      const isSelected = selected?.player.id === id
      return (
        <button
          type="button"
          className={`court-button side-${side}${isSelected ? ' court-button-selected' : ''}`}
          aria-pressed={isSelected}
          aria-label={`${names[side]} ${playerLabel(player)}${serving ? ', serving' : ''}`}
          onClick={() => select(side, player)}
        >
          <span className="jersey">#{player.number}</span>
          {player.name && <span className="court-name">{player.name}</span>}
          {serving && <span className="badge">Serving</span>}
          {id === state.courts[side].liberoId && <span className="badge">Libero</span>}
        </button>
      )
    }
  }

  return (
    <section className="live" aria-label="On court">
      {/* Who's serving is shown by the dot on the scoreboard and the SERVING tag on the court. */}
      {server && <p className="sr-only">{`${names[state.servingSide]} ${playerLabel(server)} serving`}</p>}
      {last && <p className="muted last-tap">Last: {describeEvent(last, byId, names)}</p>}

      <div className="full-court">
        <Court
          far
          renderSlot={renderCourt('away')}
          netLabel={
            <>
              <span className="side-away court-team-label">▲ {names.away}</span>
              <span>Net</span>
              <span className="side-home court-team-label">{names.home} ▼</span>
            </>
          }
        />
        <Court showNet={false} renderSlot={renderCourt('home')} />
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {selected ? (
        <PlayerActions
          teamName={names[selected.side]}
          side={selected.side}
          player={selected.player}
          state={state}
          serveType={serveTypeFor(selected.player.id)}
          onServeType={(type) => setServeTypeChoices({ ...serveTypeChoices, [selected.player.id]: type })}
          onSave={save}
          onCancel={() => setSelected(null)}
        />
      ) : showSubs ? (
        <SubPanel data={data} state={state} onDone={() => setShowSubs(false)} />
      ) : question ? (
        question
      ) : (
        <section className="action-panel" aria-label="Team actions">
          <p className="muted">Tap a player, then what they did.</p>
          <div className="action-buttons action-buttons-2">
            {(['away', 'home'] as const).map((side) => (
              <ActionButton
                key={side}
                label={`Point to ${names[side]}, no stat`}
                onClick={() => save({ type: 'point', side })}
              >
                +1 {names[side]}
              </ActionButton>
            ))}
          </div>
          <div className="button-row">
            <UndoButton match={match} />
            <button
              className="button"
              type="button"
              onClick={() => {
                setShowSubs(true)
                onPlay(null)
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
  teamName: string
  side: Side
  player: Player
  state: MatchState
  serveType: ServeType
  onServeType: (type: ServeType) => void
  onSave: (body: StatBody) => void
  onCancel: () => void
}

/** The outcome buttons for one player. Only the buttons that make sense right now are shown. */
function PlayerActions({ teamName, side, player, state, serveType, onServeType, onSave, onCancel }: PlayerActionsProps) {
  const playerId = player.id
  const row = courtRow(state, side, playerId) ?? 'back'
  const serving = state.serverId === playerId
  const receiving = state.servingSide !== side

  return (
    <section className={`action-panel side-${side}`} aria-label={`Stats for ${teamName} ${playerLabel(player)}`}>
      <div className="action-panel-title">
        <strong>
          {playerLabel(player)} <span className="muted">{teamName}</span>
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
            <ActionButton tone="good" onClick={() => onSave({ type: 'serve', side, playerId, result: 'ace', detail: { serveType } })}>
              Ace
            </ActionButton>
            <ActionButton tone="bad" onClick={() => onSave({ type: 'serve', side, playerId, result: 'error', detail: { serveType } })}>
              Error
            </ActionButton>
            <ActionButton onClick={() => onSave({ type: 'serve', side, playerId, result: 'in', detail: { serveType } })}>
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
                onClick={() => onSave({ type: 'pass', side, playerId, result: rating })}
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
          <ActionButton tone="good" onClick={() => onSave({ type: 'attack', side, playerId, result: 'kill', detail: { row } })}>
            Kill
          </ActionButton>
          <ActionButton tone="bad" onClick={() => onSave({ type: 'attack', side, playerId, result: 'error', detail: { row } })}>
            Error
          </ActionButton>
          <ActionButton onClick={() => onSave({ type: 'attack', side, playerId, result: 'in_play', detail: { row } })}>
            In play
          </ActionButton>
        </div>
      </ActionGroup>

      {/* Only front-row players can block. */}
      {row === 'front' && (
        <ActionGroup label="Block">
          <div className="action-buttons">
            <ActionButton tone="good" onClick={() => onSave({ type: 'block', side, playerId, result: 'solo' })}>
              Solo
            </ActionButton>
            <ActionButton tone="good" onClick={() => onSave({ type: 'block', side, playerId, result: 'assist' })}>
              Assist
            </ActionButton>
            <ActionButton tone="bad" onClick={() => onSave({ type: 'block', side, playerId, result: 'error' })}>
              Error
            </ActionButton>
          </div>
        </ActionGroup>
      )}

      <ActionGroup label="Other">
        <div className="action-buttons">
          <ActionButton onClick={() => onSave({ type: 'dig', side, playerId })}>Dig</ActionButton>
          <ActionButton onClick={() => onSave({ type: 'assist', side, playerId })}>Assist</ActionButton>
          <ActionButton tone="bad" label="Ball handling error" onClick={() => onSave({ type: 'ball_handling_error', side, playerId })}>
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

/** Green-ish for a point to that player's team, red-ish for a point to the other team. */
function ActionButton({ tone, label, onClick, children }: ActionButtonProps) {
  const className = tone ? `button action-button action-${tone}` : 'button action-button'
  return (
    <button className={className} type="button" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  )
}

function lastServeType(events: MatchEvent[], playerId: string): ServeType | undefined {
  const serves = activeEvents(events).filter((e) => e.type === 'serve' && e.playerId === playerId)
  const lastServe = serves[serves.length - 1]
  return lastServe?.type === 'serve' ? lastServe.detail.serveType : undefined
}

export default LiveEntry
