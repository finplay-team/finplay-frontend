// 라우팅과 공통 레이아웃(내비·푸터·AI 어시스턴트)을 정의하는 앱 루트
import { Route, Routes, useLocation } from 'react-router-dom'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'
import { AssistantWidget } from './components/AssistantWidget'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { Landing } from './pages/Landing'
import { Signup } from './pages/Signup'
import { Login } from './pages/Login'
import { Rankings } from './pages/Rankings'
import { Admin } from './pages/Admin'
import { Trade } from './pages/Trade'
import { Portfolio } from './pages/Portfolio'
import { MyPage } from './pages/MyPage'
import { Support } from './pages/Support'

export default function App() {
  const location = useLocation()
  // 인증 페이지는 자체 풀스크린 레이아웃이라 푸터·위젯을 숨긴다
  const hideChrome = location.pathname === '/login' || location.pathname === '/signup'

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Nav />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/rankings" element={<Rankings />} />
          <Route path="/support" element={<Support />} />
          <Route
            path="/trade"
            element={
              <ProtectedRoute>
                <Trade />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portfolio"
            element={
              <ProtectedRoute>
                <Portfolio />
              </ProtectedRoute>
            }
          />
          <Route
            path="/me"
            element={
              <ProtectedRoute>
                <MyPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin>
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Landing />} />
        </Routes>
      </main>
      {!hideChrome && <Footer />}
      {!hideChrome && <AssistantWidget />}
    </div>
  )
}
