# Account access UI

A React + TypeScript frontend for the existing authentication API. The same frontend can be deployed as a website and packaged as an Android app with Capacitor. It currently provides login and signup only.

## Requirements

- Node.js 24 LTS (checked locally: `v24.22.1`)
- npm 11 or newer

## Web setup

Install dependencies with `npm install`. The included `.env.local` points the UI at the deployed Spring Boot backend at `https://tgmagazine-api.onrender.com`. Set `VITE_API_BASE_URL` in the hosting provider's build environment as well. The backend must allow the website's origin in Spring Security CORS; add the final deployed website URL to the backend's CORS allowlist before release.

Start the development server with `npm run dev`. Create a production build with `npm run build`.

## Android app

The Android app and website share this React code; both call the same Spring Boot API. The Android package contains the built frontend, while the website remains available in a browser.

The Android Gradle wrapper is set to Gradle 9.1.0 so the project can build with Android Studio's bundled Java 25 runtime. The debug APK has been verified with Java 25.

1. Deploy the Spring Boot API at a publicly reachable HTTPS URL. A phone's `localhost` refers to the phone, not your development computer.
2. Set `VITE_API_BASE_URL` to that HTTPS API URL in the environment used to build the app.
3. Install Android Studio and its Android SDK, then run `npm run android:sync` and `npm run android:open`. Use Android Studio to run the app or create a Play Store release.
4. Before publishing, replace the provisional `appId` in `capacitor.config.ts` with an application ID owned by your startup. Application IDs should be chosen carefully because changing one later creates a different Play Store app.

On Android, the JWT is stored through Android Keystore-backed encrypted storage. The website still uses `localStorage`; for a production web release, prefer an `HttpOnly`, `Secure`, `SameSite` cookie-based session implemented by the backend. A mobile wrapper alone does not secure the API: enforce authentication and authorization in Spring Boot, use HTTPS, and configure CORS for the website and mobile app.

## API contract

- `POST /api/auth/login` receives `{ "email", "password" }`.
- `POST /api/auth/signup` receives `{ "fullName", "email", "password" }`.

After login, the client stores a JWT found at `accessToken`, `token`, `jwt`, or the matching field inside `data` as `authToken`. It sends that token as a Bearer token to `GET /api/welcome` and `GET /api/user/profile`. The token storage is platform-specific: Android uses encrypted native storage, and the website uses local storage. Update `src/auth.ts` if your backend uses a different token response field. Server error messages from a JSON `message` field are displayed in the form.
