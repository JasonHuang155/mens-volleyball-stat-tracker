import type { ReactNode } from 'react'

// Court positions as seen from behind our baseline, looking at the net:
// front row (at the net) is 4, 3, 2 from left to right; back row is 5, 6, 1.
const LAYOUT = [4, 3, 2, 5, 6, 1]

type Props = {
  /** What to draw in each spot. `position` is the court position, 1-6. */
  renderSlot: (position: number) => ReactNode
}

/** Six spots laid out like our half of the court. */
function Court({ renderSlot }: Props) {
  return (
    <div className="court">
      <div className="court-net">Net</div>
      {LAYOUT.map((position) => (
        <div key={position} className="court-slot">
          {renderSlot(position)}
        </div>
      ))}
    </div>
  )
}

export default Court
