import type { ReactNode } from 'react'

// Court positions as seen from behind the home baseline, looking at the net.
// Our own half: front row (at the net) is 4, 3, 2 from left to right; back row is 5, 6, 1.
// The far half (the other team, facing us): back row 1, 6, 5 at the top, front row 2, 3, 4 at the net.
const NEAR = [4, 3, 2, 5, 6, 1]
const FAR = [1, 6, 5, 2, 3, 4]

type Props = {
  /** What to draw in each spot. `position` is the court position, 1-6. */
  renderSlot: (position: number) => ReactNode
  /** The half across the net, mirrored because that team faces us. */
  far?: boolean
  /** Draw the net line (on the near half it's above the players, on the far half below). */
  showNet?: boolean
  /** What the net line says. */
  netLabel?: ReactNode
}

/** Six spots laid out like one team's half of the court. */
function Court({ renderSlot, far = false, showNet = true, netLabel = 'Net' }: Props) {
  const net = showNet && <div className="court-net">{netLabel}</div>
  return (
    <div className="court">
      {!far && net}
      {(far ? FAR : NEAR).map((position) => (
        <div key={position} className="court-slot">
          {renderSlot(position)}
        </div>
      ))}
      {far && net}
    </div>
  )
}

export default Court
