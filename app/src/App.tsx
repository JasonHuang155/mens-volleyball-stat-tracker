import { Route, Routes } from 'react-router'
import AccountScreen from './screens/AccountScreen.tsx'
import BoxScoreScreen from './screens/BoxScoreScreen.tsx'
import HomeScreen from './screens/HomeScreen.tsx'
import MatchScreen from './screens/MatchScreen.tsx'
import NewMatchScreen from './screens/NewMatchScreen.tsx'
import RosterScreen from './screens/RosterScreen.tsx'
import { SyncProvider } from './sync/SyncProvider.tsx'

// Which screen to show for each web address. SyncProvider keeps uploading
// in the background whichever screen is showing.
function App() {
  return (
    <SyncProvider>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/account" element={<AccountScreen />} />
        <Route path="/teams/:teamId" element={<RosterScreen />} />
        <Route path="/new-match" element={<NewMatchScreen />} />
        <Route path="/matches/:matchId" element={<MatchScreen />} />
        <Route path="/matches/:matchId/box-score" element={<BoxScoreScreen />} />
      </Routes>
    </SyncProvider>
  )
}

export default App
