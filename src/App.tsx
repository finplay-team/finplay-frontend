// 라우팅과 공통 레이아웃(내비·푸터)을 정의하는 앱 루트
import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { Landing } from './pages/Landing'
import { Signup } from './pages/Signup'
import { Login } from './pages/Login'
import { OAuthCallback } from './pages/OAuthCallback'
import { Trade } from './pages/Trade'
import { Portfolio } from './pages/Portfolio'
import { Community } from './pages/Community'
import { CommunityPost } from './pages/CommunityPost'
import { MyPage } from './pages/MyPage'
import { Journal } from './pages/Journal'
import { Rankings } from './pages/Rankings'
import { News } from './pages/News'
import { Feedback } from './pages/Feedback'
import { Tutorial } from './pages/Tutorial'
import { Support } from './pages/Support'
import { NotFound } from './pages/NotFound'

export default function App() {
  const location = useLocation()

  // 클라이언트 사이드 라우팅은 브라우저가 스크롤을 알아서 맨 위로 올려주지 않는다 —
  // 이전 페이지에서 스크롤해 둔 위치가 새 페이지에 그대로 남아 "밑에서부터 열리는" 것처럼 보인다.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  // 인증 페이지는 자체 풀스크린 레이아웃이라 푸터를 숨긴다
  const hideChrome =
    location.pathname === '/login' ||
    location.pathname === '/signup' ||
    location.pathname.startsWith('/oauth/')

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Nav />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/oauth/:provider/callback" element={<OAuthCallback />} />
          <Route path="/support" element={<Support />} />
          {/* 튜토리얼은 건너뛸 수 있다 — 완료 여부와 무관하게 로그인만 하면 언제든 드나들 수 있고,
              다른 메뉴 접근을 막지 않는다. */}
          <Route
            path="/tutorial"
            element={
              <ProtectedRoute>
                <Tutorial />
              </ProtectedRoute>
            }
          />
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
            path="/journal"
            element={
              <ProtectedRoute>
                <Journal />
              </ProtectedRoute>
            }
          />
          <Route
            path="/news"
            element={
              <ProtectedRoute>
                <News />
              </ProtectedRoute>
            }
          />
          <Route
            path="/feedback"
            element={
              <ProtectedRoute>
                <Feedback />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rankings"
            element={
              <ProtectedRoute>
                <Rankings />
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
