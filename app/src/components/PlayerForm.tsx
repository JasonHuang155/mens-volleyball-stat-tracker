import { useId, useRef, useState, type FormEvent } from 'react'
import type { PlayerInput } from '../db/roster.ts'
import type { Position } from '../domain/types.ts'
import { errorMessage } from './errorMessage.ts'

const POSITIONS: { value: Position; title: string }[] = [
  { value: 'OH', title: 'Outside hitter' },
  { value: 'OPP', title: 'Opposite' },
  { value: 'MB', title: 'Middle blocker' },
  { value: 'S', title: 'Setter' },
  { value: 'L', title: 'Libero' },
]

type Props = {
  /** Accessible name for the form, e.g. "Add a player". */
  label: string
  submitLabel: string
  /** The player being edited. Leave out to add a new player. */
  initial?: PlayerInput
  onSubmit: (input: PlayerInput) => Promise<void>
  onCancel?: () => void
  onDelete?: () => Promise<void>
}

/** Jersey number, name, and position. Used both for adding and for editing a player. */
function PlayerForm({ label, submitLabel, initial, onSubmit, onCancel, onDelete }: Props) {
  const [numberText, setNumberText] = useState(initial ? String(initial.number) : '')
  const [name, setName] = useState(initial?.name ?? '')
  const [position, setPosition] = useState<Position>(initial?.position ?? 'OH')
  const [error, setError] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const numberInput = useRef<HTMLInputElement>(null)
  const positionGroup = useId() // each form needs its own radio group name

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = numberText.trim()
    if (trimmed === '') return setError('Enter a jersey number')
    if (!/^\d+$/.test(trimmed)) return setError('Jersey numbers go from 0 to 99')

    try {
      await onSubmit({ number: Number(trimmed), name, position })
    } catch (err) {
      return setError(errorMessage(err))
    }

    setError('')
    if (!initial) {
      // Clear the form and jump back to the number box, ready for the next player.
      setNumberText('')
      setName('')
      numberInput.current?.focus()
    }
  }

  async function handleDelete() {
    if (!onDelete) return
    // The first tap asks for confirmation, so a stray tap can't delete anyone.
    if (!confirmingDelete) return setConfirmingDelete(true)
    try {
      await onDelete()
    } catch (err) {
      setConfirmingDelete(false)
      setError(errorMessage(err))
    }
  }

  return (
    <form className="player-form" aria-label={label} onSubmit={handleSubmit}>
      <div className="player-form-row">
        <label className="field field-number">
          Number
          <input
            ref={numberInput}
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={numberText}
            onChange={(e) => setNumberText(e.target.value)}
          />
        </label>
        <label className="field field-grow">
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>

      <fieldset className="segmented">
        <legend>Position</legend>
        {POSITIONS.map((p) => (
          <label key={p.value} title={p.title}>
            <input
              type="radio"
              name={positionGroup}
              value={p.value}
              checked={position === p.value}
              onChange={() => setPosition(p.value)}
            />
            {p.value}
          </label>
        ))}
      </fieldset>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="button-row">
        <button className="button button-primary" type="submit">
          {submitLabel}
        </button>
        {onCancel && (
          <button className="button" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
        {onDelete && (
          <button className="button button-danger" type="button" onClick={handleDelete}>
            {confirmingDelete ? 'Tap again to delete' : 'Delete'}
          </button>
        )}
      </div>
    </form>
  )
}

export default PlayerForm
