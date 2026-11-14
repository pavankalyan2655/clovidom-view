# Clovidom Estates

A React + TypeScript real-estate discovery frontend built with Vite. Users can discover published properties, filter and view listings, and send enquiries. Administrators can create and manage listings and upload property photographs through the backend.

## Local development

Requirements: Node.js 24 LTS and npm 11 or newer.

1. Start the Spring Boot API at `http://localhost:8080`.
2. Install frontend packages with `npm install`.
3. The included `.env.local` targets `http://localhost:8080`. Change `VITE_API_BASE_URL` when using a different backend.
4. Start the frontend with `npm run dev` (Vite defaults to `http://localhost:5173`).
5. Build with `npm run build`.

The backend must allow the frontend's origin in CORS. For the Render static site, set `VITE_API_BASE_URL` to `https://tgmagazine-api.onrender.com` in the Render environment and redeploy. `https://clovidom-view.onrender.com` is the frontend URL, not the API.

## Backend API contract

The frontend expects these endpoints:

### Authentication

- `POST /api/auth/login` with `{ "email": "...", "password": "..." }`
- `POST /api/auth/signup` with `{ "fullName": "...", "email": "...", "password": "..." }`
- `GET /api/user/profile` with a Bearer JWT

Login returns an `accessToken`, `authToken`, `token`, or `jwt`, and the user role (`ADMIN` or `USER`) either directly or in `data`. Signup must always create a `USER`; admin accounts are provisioned by the backend. The backend must enforce authorization for every admin operation.

### User property experience

- `GET /api/properties` supports `search`, `category`, `location`, `availability`, `minPrice`, `maxPrice`, and `sort` query parameters.
- `GET /api/properties/{id}` returns property details, images, amenities, category-specific details, and contact/map information.
- `POST /api/enquiries` accepts `propertyId`, `fullName`, `email`, `phone`, and `message`.

Property responses should include `id`, `title`, `projectName`, `builder`, `category`, `location`, `startingPrice`, `maxPrice`, `availability`, `description`, `images`, `amenities`, and `details`. The client accepts list responses as an array or `{ "items": [...] }`, optionally wrapped in `data`.

### Admin experience

The admin dashboard displays counts from the property and enquiry endpoints. All admin endpoints require an admin Bearer JWT:

- `GET /api/admin/properties` returns published and draft listings.
- `POST /api/admin/properties` creates a property from the property form payload.
- `PUT /api/admin/properties/{id}` updates a property.
- `PATCH /api/admin/properties/{id}/publish` accepts `{ "published": true }` or `{ "published": false }`.
- `DELETE /api/admin/properties/{id}` deletes a property.
- `POST /api/admin/properties/{id}/images` accepts multiple `files` in `multipart/form-data`.
- `DELETE /api/admin/properties/{id}/images/{imageId}` removes a photo.

The admin dashboard and image gallery use these existing endpoints. Persistent photo reordering and cover-image selection are not available until the backend exposes corresponding operations; the frontend does not send undocumented requests.
The property editor supports drag-and-drop and multi-file image selection, previews, removal, and reordering before upload. Existing uploaded photos can be removed from the editor or gallery.

The admin form requires only a property title. Category and availability have defaults; other property fields may be blank and are sent as `null` (or `null` values within `details`). The backend DTO and database model should allow those optional fields to be null.

Store photo binaries in cloud storage and return their public URLs and metadata from the API; do not put image binaries in MongoDB or expose cloud credentials in the frontend.

## Android

The web app and Android app share the React frontend and Spring Boot API. Android stores the JWT using the secure-storage plugin; the browser currently uses local storage. The Android display name is `Clovidom`. Build/sync the bundled Android app in PowerShell with the production API URL:

```powershell
$env:VITE_API_BASE_URL = 'https://tgmagazine-api.onrender.com'
npm.cmd run android:sync
```

The backend must allow both `https://clovidom-view.onrender.com` and the Capacitor Android origin (`https://localhost`) in CORS. Protect all APIs in Spring Security regardless of client and use HTTPS outside local development. The provisional `appId` in `capacitor.config.ts` should be changed only if a new Android application identity is intended.
