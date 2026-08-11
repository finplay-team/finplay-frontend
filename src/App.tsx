// 라우팅과 공통 레이아웃(내비·푸터)을 정의하는 앱 루트
import { Route, Routes, useLocation } from 'react-router-dom'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { RequireTutorial } from './auth/RequireTutorial'
import { Landing } from './pages/Landing'
import { Signup } from './pages/Signup'
import { Login } from './pages/Login'
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
          {/*
            튜토리얼은 그 자체가 강제 이동 목적지라 RequireTutorial 로 감싸면 안 된다(무한 리다이렉트).
            로그인만 필요하다.
          */}
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
                <RequireTutorial>
                  <Trade />
                </RequireTutorial>
              </ProtectedRoute>
            }
          />
          <Route
            path="/portfolio"
            element={
              <ProtectedRoute>
                <RequireTutorial>
                  <Portfolio />
                </RequireTutorial>
              </ProtectedRoute>
            }
          />
          {/* 커뮤니티는 목록 조회도 Bearer 토큰이 필요해 전부 보호한다 */}
          <Route
            path="/community"
            element={
              <ProtectedRoute>
                <RequireTutorial>
                  <Community />
                </RequireTutorial>
              </ProtectedRoute>
            }
          />
          <Route
            path="/community/:postId"
            element={
              <ProtectedRoute>
                <RequireTutorial>
                  <CommunityPost />
                </RequireTutorial>
              </ProtectedRoute>
            }
          />
          <Route
            path="/journal"
            element={
              <ProtectedRoute>
                <RequireTutorial>
                  <Journal />
                </RequireTutorial>
              </ProtectedRoute>
            }
          />
          <Route
            path="/news"
            element={
              <ProtectedRoute>
                <RequireTutorial>
                  <News />
                </RequireTutorial>
              </ProtectedRoute>
            }
          />
          <Route
            path="/feedback"
            element={
              <ProtectedRoute>
                <RequireTutorial>
                  <Feedback />
                </RequireTutorial>
              </ProtectedRoute>
            }
          />
          <Route
            path="/rankings"
            element={
              <ProtectedRoute>
                <RequireTutorial>
                  <Rankings />
                </RequireTutorial>
              </ProtectedRoute>
            }
          />
          <Route
            path="/me"
            element={
              <ProtectedRoute>
                <RequireTutorial>
                  <MyPage />
                </RequireTutorial>
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
