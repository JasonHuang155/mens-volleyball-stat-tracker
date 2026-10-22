import { Route, Routes } from 'react-router'
import HomeScreen from './screens/HomeScreen.tsx'
import RosterScreen from './screens/RosterScreen.tsx'

// Which screen to show for each web address.
function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/teams/:teamId" element={<RosterScreen />} />
    </Routes>
  )
}

export default App
