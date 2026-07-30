// 라우팅과 공통 레이아웃(내비·푸터)을 정의하는 앱 루트
import { Route, Routes, useLocation } from 'react-router-dom'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { Landing } from './pages/Landing'
import { Signup } from './pages/Signup'
import { Login } from './pages/Login'
import { Trade } from './pages/Trade'
import { Portfolio } from './pages/Portfolio'
import { Community } from './pages/Community'
import { CommunityPost } from './pages/CommunityPost'
import { MyPage } from './pages/MyPage'
import { Support } from './pages/Support'
import { NotFound } from './pages/NotFound'

export default function App() {
  const location = useLocation()
  // 인증 페이지는 자체 풀스크린 레이아웃이라 푸터를 숨긴다
  const hideChrome = location.pathname === '/login' || location.pathname === '/signup'

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Nav />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
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
          {/* 커뮤니티는 목록 조회도 Bearer 토큰이 필요해 전부 보호한다 */}
          <Route
            path="/community"
            element={
              <ProtectedRoute>
                <Community />
              </ProtectedRoute>
            }
          />
          <Route
            path="/community/:postId"
            element={
              <ProtectedRoute>
                <CommunityPost />
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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      {!hideChrome && <Footer />}
    </div>
  )
}
