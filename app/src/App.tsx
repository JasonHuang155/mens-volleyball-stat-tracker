import { Route, Routes } from 'react-router'
import HomeScreen from './screens/HomeScreen.tsx'
import MatchScreen from './screens/MatchScreen.tsx'
import NewMatchScreen from './screens/NewMatchScreen.tsx'
import RosterScreen from './screens/RosterScreen.tsx'

// Which screen to show for each web address.
function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/teams/:teamId" element={<RosterScreen />} />
      <Route path="/teams/:teamId/new-match" element={<NewMatchScreen />} />
      <Route path="/matches/:matchId" element={<MatchScreen />} />
    </Routes>
  )
}

export default App
