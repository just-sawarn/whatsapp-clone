import { Route, Routes } from 'react-router-dom'
import StatusLayout, { StatusViewerRoute, StatusWelcome } from './StatusLayout'

export default function StatusRoutes() {
  return (
    <Routes>
      <Route element={<StatusLayout />}>
        <Route index element={<StatusWelcome />} />
        <Route path=":userId" element={<StatusViewerRoute />} />
      </Route>
    </Routes>
  )
}
