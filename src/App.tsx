// 라우팅과 공통 레이아웃(내비·푸터)을 정의하는 앱 루트
import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { Landing } from './pages/Landing'
import { Signup } from './pages/Signup'
import { Login } from './pages/Login'
import { ForgotPassword } from './pages/ForgotPassword'
import { OAuthCallback } from './pages/OAuthCallback'
import { OAuthLoginCallback } from './pages/OAuthLoginCallback'
import { OAuthReauthCallback } from './pages/OAuthReauthCallback'
import { Trade } from './pages/Trade'
import { Portfolio } from './pages/Portfolio'
import { Community } from './pages/Community'
import { CommunityPost } from './pages/CommunityPost'
import { MyPage } from './pages/MyPage'
import { Journal } from './pages/Journal'
import { Trades } from './pages/Trades'
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

  // 인증 페이지는 자체 풀스크린 레이아웃이라 푸터를 숨긴다.
  // /trade 는 스크롤 없이 한 화면에 다 보이게 하려고 푸터를 없앴다(2026-08-18 피드백).
  // /tutorial 도 같은 이유로 함께 숨긴다 — 화면 구조를 /trade 와 같은 100dvh 고정으로 맞추면서
  // 푸터를 두면 그 높이만큼 페이지가 스크롤돼 "한 화면에 다 보인다"는 전제가 깨진다.
  const hideChrome =
    location.pathname === '/login' ||
    location.pathname === '/signup' ||
    location.pathname === '/forgot-password' ||
    location.pathname.startsWith('/oauth/') ||
    location.pathname === '/trade' ||
    location.pathname === '/tutorial'

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Nav />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/oauth/:provider/callback" element={<OAuthCallback />} />
          {/* finplay-api PR #385 — LOGIN 콜백이 이 경로로 1회용 교환 코드를 실어 리다이렉트한다.
              위 /oauth/:provider/callback(OAuthCallback)은 그 이전 설계의 잔존 라우트다. */}
          <Route path="/oauth/callback" element={<OAuthLoginCallback />} />
          {/* finplay-api spec 039 — 내 정보 재인증 팝업이 성공 시 이 경로로 1회용 교환 코드를 실어
              리다이렉트한다(OAUTH_REAUTH_REDIRECT_URI). 팝업 전용 라우트라 오프너가 있을 때만 의미가 있다. */}
          <Route path="/oauth/reauth-callback" element={<OAuthReauthCallback />} />
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
            path="/trades"
            element={
              <ProtectedRoute>
                <Trades />
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
