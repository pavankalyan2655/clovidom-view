import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { TouchEvent } from 'react'
import {
  deleteProperty,
  deletePropertyImage,
  fetchAdminEnquiries,
  fetchAdminProperties,
  fetchProfile,
  fetchProperties,
  fetchProperty,
  saveProperty,
  setPropertyPublished,
  submitEnquiry,
  uploadPropertyImages,
  type PropertyPayload,
} from './api'
import { authenticate, type AuthMode, type AuthUser } from './auth'
import { readAuthToken, removeAuthToken, saveAuthToken } from './tokenStorage'
import AuthPage from './pages/AuthPage'
import ArchitectureSlideshow from './ArchitectureSlideshow'

type Notice = { kind: 'success' | 'error'; text: string } | null
type PropertyCategory = 'APARTMENT' | 'VILLA' | 'INDEPENDENT_HOUSE' | 'PLOT'

interface PropertyImage {
  id: string
  url: string
  altText: string
  isPrimary: boolean
  displayOrder: number
}

interface Property {
  id: string
  title: string
  projectName: string
  builder: string
  category: PropertyCategory
  location: string
  description: string
  startingPrice: number
  maxPrice?: number
  availability: string
  images: PropertyImage[]
  amenities: string[]
  published: boolean
  raw: Record<string, unknown>
}

interface Enquiry {
  id: string
  propertyId: string
  propertyTitle: string
  fullName: string
  email: string
  phone: string
  message: string
  createdAt: string
}

const categories: { value: PropertyCategory | ''; label: string }[] = [
  { value: '', label: 'All property types' },
  { value: 'APARTMENT', label: 'Apartments' },
  { value: 'VILLA', label: 'Villas' },
  { value: 'INDEPENDENT_HOUSE', label: 'Independent houses' },
  { value: 'PLOT', label: 'Plots' },
]

const availabilityOptions = [
  'READY_TO_MOVE',
  'UNDER_CONSTRUCTION',
  'NEW_LAUNCH',
  'LIMITED_INVENTORY',
  'SOLD_OUT',
]

const initialFilters = {
  search: '',
  category: '',
  location: '',
  availability: '',
  minPrice: '',
  maxPrice: '',
  sort: 'featured',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function unwrapResponse(value: unknown): unknown {
  if (!isRecord(value)) return value
  if ('items' in value || 'content' in value || 'properties' in value) return value
  if ('data' in value) return unwrapResponse(value.data)
  return value
}

function asPropertyList(value: unknown): Property[] {
  const unwrapped = unwrapResponse(value)
  const candidates = Array.isArray(unwrapped)
    ? unwrapped
    : isRecord(unwrapped)
      ? unwrapped.items ?? unwrapped.content ?? unwrapped.properties
      : []
  if (!Array.isArray(candidates)) return []
  return candidates.filter(isRecord).map(normalizeProperty)
}

function asEnquiryList(value: unknown): Enquiry[] {
  const unwrapped = unwrapResponse(value)
  const candidates = Array.isArray(unwrapped)
    ? unwrapped
    : isRecord(unwrapped)
      ? unwrapped.items ?? unwrapped.content ?? unwrapped.enquiries
      : []
  if (!Array.isArray(candidates)) return []
  return candidates.filter(isRecord).map((item) => ({
    id: stringValue(item.id ?? item._id),
    propertyId: stringValue(item.propertyId),
    propertyTitle: stringValue(item.propertyTitle, stringValue(item.propertyName, 'Property enquiry')),
    fullName: stringValue(item.fullName ?? item.name, 'Visitor'),
    email: stringValue(item.email),
    phone: stringValue(item.phone),
    message: stringValue(item.message),
    createdAt: stringValue(item.createdAt),
  }))
}

function normalizeCategory(value: unknown): PropertyCategory {
  const normalized = String(value ?? '').toUpperCase().replace(/[\s-]+/g, '_')
  if (normalized.includes('VILLA')) return 'VILLA'
  if (normalized.includes('PLOT')) return 'PLOT'
  if (normalized.includes('HOUSE')) return 'INDEPENDENT_HOUSE'
  return 'APARTMENT'
}

function normalizeAvailability(value: unknown) {
  const normalized = String(value ?? 'AVAILABLE').toUpperCase().replace(/[\s-]+/g, '_')
  return normalized
}

function normalizeProperty(raw: Record<string, unknown>): Property {
  const locationValue = raw.location
  let location = ''
  if (typeof locationValue === 'string') {
    location = locationValue
  } else if (isRecord(locationValue)) {
    location = [
      stringValue(locationValue.address),
      stringValue(locationValue.city),
      stringValue(locationValue.state),
    ].filter(Boolean).join(', ')
  }

  const rawImages = raw.images ?? raw.imageUrls ?? raw.imageUrl
  const imageValues = Array.isArray(rawImages) ? rawImages : rawImages ? [rawImages] : []
  const images = imageValues.flatMap((image, index) => {
    if (typeof image === 'string') {
      return [{ id: `${index}`, url: image, altText: '', isPrimary: index === 0, displayOrder: index }]
    }
    if (!isRecord(image)) return []
    const url = stringValue(image.url ?? image.imageUrl)
    if (!url) return []
    return [{
      id: stringValue(image.id ?? image._id, `${index}`),
      url,
      altText: stringValue(image.altText),
      isPrimary: image.isPrimary === true,
      displayOrder: numberValue(image.displayOrder, index),
    }]
  }).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.displayOrder - b.displayOrder)

  const amenities = Array.isArray(raw.amenities)
    ? raw.amenities.filter((item): item is string => typeof item === 'string')
    : []

  return {
    id: stringValue(raw.id ?? raw._id ?? raw.propertyId),
    title: stringValue(raw.title, stringValue(raw.projectName, 'Untitled property')),
    projectName: stringValue(raw.projectName, stringValue(raw.title, '')),
    builder: stringValue(raw.builder, stringValue(raw.builderName, '')),
    category: normalizeCategory(raw.category ?? raw.propertyType),
    location: location || stringValue(raw.address, 'Location not provided'),
    description: stringValue(raw.description),
    startingPrice: numberValue(raw.startingPrice ?? raw.priceFrom ?? raw.price),
    maxPrice: raw.maxPrice === undefined && raw.priceTo === undefined
      ? undefined
      : numberValue(raw.maxPrice ?? raw.priceTo),
    availability: normalizeAvailability(raw.availability),
    images,
    amenities,
    published: raw.published === true || raw.isPublished === true || raw.status === 'PUBLISHED',
    raw,
  }
}

function formatPrice(value: number) {
  if (value > 0 && value < 100000) {
    return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value)} / sq. yd.`
  }
  if (value <= 0) return 'Price on request'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

function labelFor(value: string) {
  return value.toLowerCase().split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

function authUserFrom(value: unknown): AuthUser | undefined {
  let current = value
  for (let depth = 0; depth < 3; depth += 1) {
    if (!isRecord(current)) return undefined
    if (isRecord(current.user)) return current.user as AuthUser
    if (typeof current.role === 'string') return current as AuthUser
    current = current.data
  }
  return undefined
}

function propertyIdFrom(value: unknown) {
  let current = value
  for (let depth = 0; depth < 3; depth += 1) {
    if (!isRecord(current)) return ''
    const id = current.id ?? current._id ?? current.propertyId
    if (typeof id === 'string') return id
    current = current.data
  }
  return ''
}

function App() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  const isSignup = mode === 'signup'
  const role = String(user?.role ?? '').toUpperCase().replace(/^ROLE_/, '')

  useEffect(() => {
    let active = true
    readAuthToken()
      .then((savedToken) => {
        if (active) setToken(savedToken)
      })
      .catch((error) => {
        if (active) setNotice({ kind: 'error', text: `Could not restore your sign-in. ${errorText(error)}` })
      })
      .finally(() => {
        if (active) setAuthLoading(false)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!token || user?.role) return
    let active = true
    fetchProfile(token)
      .then((profile) => { if (active) setUser(profile) })
      .catch((error) => {
        if (active) setNotice({ kind: 'error', text: `Could not load your account profile. ${errorText(error)}` })
      })
    return () => { active = false }
  }, [token, user?.role])

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode)
    setNotice(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice(null)
    const formData = new FormData(event.currentTarget)
    const fullName = String(formData.get('fullName') ?? '').trim()
    const phone = String(formData.get('phone') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim()
    const password = String(formData.get('password') ?? '')
    const confirmPassword = String(formData.get('confirmPassword') ?? '')

    if (isSignup && password !== confirmPassword) {
      setNotice({ kind: 'error', text: 'Those passwords do not match.' })
      return
    }

    setBusy(true)
    try {
      const result = await authenticate(mode, {
        ...(isSignup ? { fullName, ...(phone ? { phone } : {}) } : {}),
        email,
        password,
      })
      if (isSignup) {
        setMode('login')
        setNotice({ kind: 'success', text: 'Your account is ready. Sign in to continue.' })
        return
      }
      if (!result.token) throw new Error('Login succeeded, but no JWT was found in the response.')
      await saveAuthToken(result.token)
      setUser(result.user ?? authUserFrom(result.data) ?? null)
      setToken(result.token)
    } catch (error) {
      setNotice({ kind: 'error', text: errorText(error) })
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout() {
    try {
      await removeAuthToken()
      setToken(null)
      setUser(null)
      setNotice(null)
      setMode('login')
    } catch (error) {
      setNotice({ kind: 'error', text: `Could not sign out safely. ${errorText(error)}` })
    }
  }

  if (authLoading) return <div className="app-loading"><span className="loader" /> Loading Clovidom…</div>

  if (token && role === 'ADMIN') {
    return <AdminDashboard token={token} user={user} onLogout={handleLogout} />
  }

  if (token && role === 'USER') {
    return <PropertyDashboard token={token} user={user} onLogout={handleLogout} />
  }

  if (token) {
    return (
      <main className="auth-page">
        <div className="auth-image-panel">
          <div className="auth-brand"><img className="brand-mark brand-logo" src="/assets/branding/titleLogo.png" alt="" /><span>CLOVIDOM <i>ESTATES</i></span></div>
          <div className="auth-image-copy">
            <p className="eyebrow">A HIGHER WAY HOME</p>
            <h1>Find a place<br />to belong.</h1>
            <p>Thoughtful homes. Exceptional communities. A more considered way to find your next address.</p>
          </div>
          <div className="auth-image-footer">HYDERABAD · EST. 2026</div>
        </div>
        <section className="auth-form-panel">
          <div className="auth-card">
            <p className="eyebrow">ACCOUNT ACCESS</p>
            <h2>We couldn’t verify your account role.</h2>
            <p className="form-subtitle">Make sure the login or profile response includes a user role: ADMIN or USER.</p>
            {notice && <p className="notice error" role="alert">{notice.text}</p>}
            <button type="button" className="primary-button full-button" onClick={handleLogout}>Sign out and try again</button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <AuthPage
      mode={mode}
      busy={busy}
      notice={notice}
      onModeChange={switchMode}
      onSubmit={handleSubmit}
      onForgotPassword={() => setNotice({ kind: 'error', text: 'Password recovery is not available yet. Please contact the administrator.' })}
    />
  )
}

function PropertyDashboard({ token, user, onLogout }: { token: string; user: AuthUser | null; onLogout: () => void }) {
  const [filters, setFilters] = useState(initialFilters)
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [enquiryNotice, setEnquiryNotice] = useState<Notice>(null)
  const [enquiryBusy, setEnquiryBusy] = useState(false)
  const sequence = useRef(0)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const requestId = ++sequence.current
    const timer = window.setTimeout(() => {
      setLoading(true)
      fetchProperties({ ...filters, category: filters.category, sort: filters.sort }, token)
        .then((result) => {
          if (requestId !== sequence.current) return
          setProperties(asPropertyList(result))
          setLoadError('')
        })
        .catch((error) => {
          if (requestId === sequence.current) setLoadError(errorText(error))
        })
        .finally(() => {
          if (requestId === sequence.current) setLoading(false)
        })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [filters, token])

  useEffect(() => {
    if (!selectedId) return
    let active = true
    setSelectedProperty(null)
    setDetailLoading(true)
    setEnquiryNotice(null)
    fetchProperty(selectedId, token)
      .then((result) => {
        if (active) {
          const value = unwrapResponse(result)
          if (isRecord(value)) setSelectedProperty(normalizeProperty(value))
        }
      })
      .catch((error) => {
        if (active) setEnquiryNotice({ kind: 'error', text: errorText(error) })
      })
      .finally(() => { if (active) setDetailLoading(false) })
    return () => { active = false }
  }, [selectedId, token])

  const locationOptions = useMemo(() => Array.from(new Set(properties.map((property) => property.location).filter(Boolean))), [properties])

  function updateFilter(key: keyof typeof initialFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  async function handleEnquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    if (!selectedProperty?.id) {
      setEnquiryNotice({ kind: 'error', text: 'Property details are unavailable. Close this window and try another listing.' })
      return
    }
    const form = new FormData(formElement)
    setEnquiryBusy(true)
    setEnquiryNotice(null)
    try {
      await submitEnquiry({
        propertyId: selectedProperty.id,
        fullName: String(form.get('fullName') ?? '').trim(),
        email: String(form.get('email') ?? '').trim(),
        phone: String(form.get('phone') ?? '').trim(),
        message: String(form.get('message') ?? '').trim(),
      }, token)
      setEnquiryNotice({ kind: 'success', text: 'Thank you. Your enquiry has been sent.' })
      if (formElement.isConnected) formElement.reset()
    } catch (error) {
      setEnquiryNotice({ kind: 'error', text: errorText(error) })
    } finally {
      setEnquiryBusy(false)
    }
  }

  return (
    <div className="portal">
      <header className="site-header">
        <a className="site-brand" href="#" aria-label="Clovidom Estates home"><img className="brand-mark brand-logo" src="/assets/branding/titleLogo.png" alt="" /><span>CLOVIDOM <i>ESTATES</i></span></a>
        <nav className="site-nav" aria-label="Property categories">
          <a className={!filters.category ? 'active' : ''} href="#discover">Home</a>
          {categories.slice(1).map((category) => (
            <button key={category.value} type="button" className={filters.category === category.value ? 'active' : ''} onClick={() => { updateFilter('category', category.value); document.getElementById('homes')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' }) }}>
              {category.label}
            </button>
          ))}
          <a className="site-nav-search" href="#homes">Search <span aria-hidden="true">⌕</span></a>
        </nav>
        <div className="header-account"><span className="welcome-name">Hello, {user?.fullName?.split(' ')[0] || 'there'}</span><button className="text-button" type="button" onClick={onLogout}>Sign out <span aria-hidden="true">↗</span></button></div>
      </header>

      <main>
        <section className="landing-hero" id="discover">
          <ArchitectureSlideshow className="landing-hero-image" />
          <div className="landing-hero-content">
            <motion.div
              initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.7, ease: 'easeOut' }}
            >
              <p className="eyebrow light-eyebrow">A HIGHER WAY HOME · HYDERABAD</p>
              <h1>Find a place<br />that feels <em>like home.</em></h1>
              <p>Discover considered spaces in the places you want to be.</p>
            </motion.div>
            <form className="hero-search" onSubmit={(event) => { event.preventDefault(); document.getElementById('homes')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' }) }}>
              <label>
                <span>PROPERTY TYPE</span>
                <select aria-label="Property type" value={filters.category} onChange={(event) => updateFilter('category', event.target.value)}>
                  {categories.map((category) => <option key={category.value || 'all'} value={category.value}>{category.label}</option>)}
                </select>
              </label>
              <label>
                <span>LOCATION</span>
                <input aria-label="Location" type="search" value={filters.location} onChange={(event) => updateFilter('location', event.target.value)} placeholder="City or neighbourhood" />
              </label>
              <label>
                <span>MINIMUM BUDGET</span>
                <input aria-label="Minimum budget" type="number" min="0" value={filters.minPrice} onChange={(event) => updateFilter('minPrice', event.target.value)} placeholder="Any price" />
              </label>
              <label>
                <span>MAXIMUM BUDGET</span>
                <input aria-label="Maximum budget" type="number" min="0" value={filters.maxPrice} onChange={(event) => updateFilter('maxPrice', event.target.value)} placeholder="Any price" />
              </label>
              <button type="submit">Explore homes <span aria-hidden="true">↗</span></button>
            </form>
          </div>
          <div className="hero-index"><span>01</span><i /> A PLACE TO BELONG</div>
        </section>

        <section className="discovery-section" id="homes">
          <div className="section-heading">
            <div><p className="eyebrow">THE CLOVIDOM COLLECTION</p><h2>Spaces worth coming home to.</h2></div>
            <p>Explore real listings from our property collection.<br />Thoughtfully found. Ready to be yours.</p>
          </div>

          <div className="category-tabs" role="group" aria-label="Filter by property category">
            {categories.map((category) => (
              <button key={category.value || 'all'} type="button" className={filters.category === category.value ? 'category-tab active' : 'category-tab'} onClick={() => updateFilter('category', category.value)}>
                {category.label}
              </button>
            ))}
          </div>

          <div className="property-filters">
            <label className="search-control"><span aria-hidden="true">⌕</span><input aria-label="Search projects or builders" type="search" value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Search a project or builder" /></label>
            <select aria-label="Filter by location" value={filters.location} onChange={(event) => updateFilter('location', event.target.value)}>
              <option value="">All locations</option>{locationOptions.map((location) => <option key={location} value={location}>{location}</option>)}
            </select>
            <select aria-label="Filter by availability" value={filters.availability} onChange={(event) => updateFilter('availability', event.target.value)}>
              <option value="">Any availability</option>{availabilityOptions.map((value) => <option key={value} value={value}>{labelFor(value)}</option>)}
            </select>
            <select aria-label="Sort properties" value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value)}>
              <option value="featured">Featured</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="location">Location</option>
            </select>
            <input aria-label="Minimum price" type="number" min="0" value={filters.minPrice} onChange={(event) => updateFilter('minPrice', event.target.value)} placeholder="Min price" />
            <input aria-label="Maximum price" type="number" min="0" value={filters.maxPrice} onChange={(event) => updateFilter('maxPrice', event.target.value)} placeholder="Max price" />
          </div>

          <div className="results-caption"><span>{loading ? 'Finding your next place…' : `${properties.length} ${properties.length === 1 ? 'home' : 'homes'} to explore`}</span><span>Thoughtfully found. Ready to be yours.</span></div>
          {loadError && <p className="notice error page-notice" role="alert">{loadError}</p>}
          {loading && properties.length === 0 ? (
            <div className="empty-state"><span className="loader" /><p>Finding homes for you…</p></div>
          ) : properties.length ? (
            <motion.div className="listing-grid" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: reduceMotion ? 0 : 0.07 } } }}>
              {properties.map((property, index) => (
                <motion.button
                  className="listing-card"
                  type="button"
                  key={property.id || index}
                  onClick={() => setSelectedId(property.id)}
                  variants={{ hidden: { opacity: 0, y: reduceMotion ? 0 : 18 }, show: { opacity: 1, y: 0 } }}
                  transition={{ duration: reduceMotion ? 0 : 0.42, ease: 'easeOut' }}
                  whileHover={reduceMotion ? undefined : { y: -4 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.99 }}
                >
                  <div className="listing-photo">
                    {property.images[0]?.url
                      ? <img src={property.images[0].url} alt={property.images[0].altText || property.title} loading="lazy" />
                      : <div className="photo-placeholder"><span>C</span><small>IMAGES COMING SOON</small></div>}
                    <span className="listing-category">{labelFor(property.category)}</span>
                    <span className="listing-arrow" aria-hidden="true">↗</span>
                  </div>
                  <div className="listing-info">
                    <div className="listing-overline"><span>{property.builder || 'CLOVIDOM SELECT'}</span><span>{labelFor(property.availability)}</span></div>
                    <h3>{property.title}</h3>
                    <p className="listing-location"><span aria-hidden="true">⌖</span> {property.location}</p>
                    <div className="listing-bottom"><strong>{formatPrice(property.startingPrice)}</strong>{property.maxPrice ? <span>to {formatPrice(property.maxPrice)}</span> : <span>starting</span>}</div>
                  </div>
                </motion.button>
              ))}
            </motion.div>
          ) : !loading && !loadError ? (
            <div className="empty-state"><span className="empty-monogram">C</span><h3>Your next home is on its way.</h3><p>No listings match those filters yet. Try a different search.</p><button className="text-button" type="button" onClick={() => setFilters(initialFilters)}>Clear filters ↗</button></div>
          ) : null}
        </section>

        <section className="promise-section" id="about">
          <span className="promise-mark">C</span><p className="eyebrow">A MORE PERSONAL SEARCH</p><h2>The right place<br /><em>changes everything.</em></h2><p>We bring meaningful homes and the people looking for them a little closer.</p>
        </section>
      </main>
      <footer className="site-footer"><a className="site-brand" href="#"><img className="brand-mark brand-logo" src="/assets/branding/titleLogo.png" alt="" /><span>CLOVIDOM <i>ESTATES</i></span></a><span>© {new Date().getFullYear()} CLOVIDOM ESTATES</span><span>Find a place to belong.</span></footer>

      <AnimatePresence>
        {selectedId && <PropertyDialog
          key={selectedId}
          property={selectedProperty}
          loading={detailLoading}
          notice={enquiryNotice}
          busy={enquiryBusy}
          similarProperties={properties.filter((property) => property.id !== selectedId && property.category === selectedProperty?.category)}
          onSelectProperty={setSelectedId}
          onClose={() => { setSelectedId(''); setSelectedProperty(null); setEnquiryNotice(null) }}
          onSubmit={handleEnquiry}
        />}
      </AnimatePresence>
    </div>
  )
}

function PropertyDialog({ property, loading, notice, busy, similarProperties, onSelectProperty, onClose, onSubmit }: {
  property: Property | null
  loading: boolean
  notice: Notice
  busy: boolean
  similarProperties: Property[]
  onSelectProperty: (id: string) => void
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const [imageIndex, setImageIndex] = useState(0)
  const [viewerOpen, setViewerOpen] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const reduceMotion = useReducedMotion()
  useEffect(() => {
    setImageIndex(0)
    setViewerOpen(false)
  }, [property?.id])
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (viewerOpen) setViewerOpen(false)
        else onClose()
      }
      if (!viewerOpen || !property?.images.length) return
      if (event.key === 'ArrowLeft') setImageIndex((current) => (current + property.images.length - 1) % property.images.length)
      if (event.key === 'ArrowRight') setImageIndex((current) => (current + 1) % property.images.length)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, property?.images.length, viewerOpen])

  function handleGalleryTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartX.current = event.touches[0]?.clientX ?? null
  }

  function handleGalleryTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStartX.current
    const end = event.changedTouches[0]?.clientX
    touchStartX.current = null
    if (start === null || end === undefined || !property || property.images.length < 2 || Math.abs(end - start) < 45) return
    setImageIndex((current) => (current + (end < start ? 1 : -1) + property.images.length) % property.images.length)
  }

  const propertyContact = property && isRecord(property.raw.contact) ? property.raw.contact : null

  return (
    <motion.div
      className="dialog-backdrop"
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.22 }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <motion.section
        className="property-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={property?.title || 'Property details'}
        initial={{ opacity: 0, y: reduceMotion ? 0 : 12, scale: reduceMotion ? 1 : 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: reduceMotion ? 0 : 8, scale: reduceMotion ? 1 : 0.99 }}
        transition={{ duration: reduceMotion ? 0 : 0.24, ease: 'easeOut' }}
      >
        <button className="dialog-close" type="button" onClick={onClose} aria-label="Close property details">×</button>
        {loading && !property ? <div className="empty-state"><span className="loader" /><p>Loading property details…</p></div> : property ? (
          <>
            <div className="dialog-gallery" onTouchStart={handleGalleryTouchStart} onTouchEnd={handleGalleryTouchEnd}>
              {property.images.length ? <motion.img key={property.images[imageIndex]?.url} src={property.images[imageIndex]?.url} alt={property.images[imageIndex]?.altText || property.title} initial={{ opacity: 0.55 }} animate={{ opacity: 1 }} transition={{ duration: reduceMotion ? 0 : 0.24 }} /> : <div className="photo-placeholder"><span>C</span><small>PROPERTY PHOTOGRAPHY</small></div>}
              <span className="listing-category">{labelFor(property.category)}</span>
              {property.images.length > 1 && <div className="gallery-controls"><button type="button" aria-label="Previous image" onClick={() => setImageIndex((imageIndex + property.images.length - 1) % property.images.length)}>←</button><span>{imageIndex + 1} / {property.images.length}</span><button type="button" aria-label="Next image" onClick={() => setImageIndex((imageIndex + 1) % property.images.length)}>→</button></div>}
              {property.images.length > 0 && <button className="gallery-fullscreen" type="button" onClick={() => setViewerOpen(true)}>View full screen <span aria-hidden="true">⤢</span></button>}
            </div>
            {property.images.length > 1 && <div className="dialog-thumbnails" aria-label="Property photo thumbnails">
              {property.images.map((image, index) => (
                <button key={image.id} type="button" aria-label={`View image ${index + 1}`} aria-pressed={imageIndex === index} onClick={() => setImageIndex(index)}>
                  <img src={image.url} alt="" loading="lazy" />
                </button>
              ))}
            </div>}
            <div className="dialog-content">
              <div className="dialog-main">
                <p className="eyebrow">{property.builder || 'CLOVIDOM SELECT'} · {labelFor(property.availability)}</p>
                <h2>{property.title}</h2><p className="dialog-location">{property.location}</p>
                <p className="dialog-price">{formatPrice(property.startingPrice)}{property.maxPrice ? ` — ${formatPrice(property.maxPrice)}` : ''}</p>
                <p className="dialog-description">{property.description || 'Contact us to learn more about this property.'}</p>
                {property.amenities.length > 0 && <><h3>Considered details</h3><div className="amenity-list">{property.amenities.map((amenity) => <span key={amenity}>{amenity}</span>)}</div></>}
                {isRecord(property.raw.details) && <div className="detail-facts">{Object.entries(property.raw.details).filter(([, value]) => value !== '' && value !== null && value !== undefined).map(([key, value]) => <div key={key}><small>{labelFor(key)}</small><strong>{Array.isArray(value) ? value.join(', ') : String(value)}</strong></div>)}</div>}
                {isRecord(property.raw.location) && stringValue(property.raw.location.mapUrl) && <a className="map-link" href={stringValue(property.raw.location.mapUrl)} target="_blank" rel="noreferrer">View on map ↗</a>}
                {propertyContact && [propertyContact.name, propertyContact.phone, propertyContact.email].some((value) => typeof value === 'string' && value.trim()) && (
                  <div className="property-contact">
                    <p className="eyebrow">PROPERTY CONTACT</p>
                    {stringValue(propertyContact.name) && <strong>{stringValue(propertyContact.name)}</strong>}
                    {stringValue(propertyContact.phone) && <a href={`tel:${stringValue(propertyContact.phone)}`}>{stringValue(propertyContact.phone)}</a>}
                    {stringValue(propertyContact.email) && <a href={`mailto:${stringValue(propertyContact.email)}`}>{stringValue(propertyContact.email)}</a>}
                  </div>
                )}
              </div>
              <aside className="enquiry-card">
                <p className="eyebrow">LET’S TALK</p><h3>Make this place yours.</h3><p>Leave your details and our property team will be in touch.</p>
                <form className="enquiry-form" onSubmit={onSubmit}>
                  <label className="field"><span>Your name</span><input name="fullName" required autoComplete="name" maxLength={100} /></label>
                  <label className="field"><span>Email address</span><input name="email" type="email" required autoComplete="email" maxLength={254} /></label>
                  <label className="field"><span>Phone number</span><input name="phone" type="tel" required autoComplete="tel" maxLength={24} /></label>
                  <label className="field"><span>Your message</span><textarea name="message" rows={3} required maxLength={1000} defaultValue={`I’m interested in ${property.title}. Please share more details.`} /></label>
                  {notice && <p className={`notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</p>}
                  <button className="primary-button full-button" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send enquiry'} <span aria-hidden="true">↗</span></button>
                </form>
              </aside>
            </div>
            {similarProperties.length > 0 && <section className="similar-properties" aria-label="Similar properties">
              <p className="eyebrow">MORE TO DISCOVER</p>
              <h3>Similar properties</h3>
              <div className="similar-property-list">
                {similarProperties.slice(0, 3).map((similar) => (
                  <button type="button" className="similar-property" key={similar.id} onClick={() => onSelectProperty(similar.id)}>
                    {similar.images[0]?.url
                      ? <img src={similar.images[0].url} alt="" loading="lazy" />
                      : <span className="similar-placeholder">C</span>}
                    <span><strong>{similar.title}</strong><small>{similar.location}</small><b>{formatPrice(similar.startingPrice)}</b></span>
                    <span className="similar-arrow" aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
            </section>}
          </>
        ) : <div className="empty-state"><h3>Property details unavailable</h3>{notice && <p className="notice error" role="alert">{notice.text}</p>}<p>Please close this window and try again.</p></div>}
      </motion.section>
      <AnimatePresence>
        {viewerOpen && property?.images[imageIndex] && (
          <motion.div className="image-viewer" role="dialog" aria-modal="true" aria-label={`Photo ${imageIndex + 1} of ${property.images.length}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(event) => { if (event.target === event.currentTarget) setViewerOpen(false) }}>
            <button className="viewer-close" type="button" aria-label="Close full-screen image" onClick={() => setViewerOpen(false)}>×</button>
            {property.images.length > 1 && <button className="viewer-arrow previous" type="button" aria-label="Previous image" onClick={() => setImageIndex((imageIndex + property.images.length - 1) % property.images.length)}>←</button>}
            <motion.img key={property.images[imageIndex].url} src={property.images[imageIndex].url} alt={property.images[imageIndex].altText || property.title} initial={{ opacity: 0.55 }} animate={{ opacity: 1 }} transition={{ duration: reduceMotion ? 0 : 0.24 }} />
            {property.images.length > 1 && <button className="viewer-arrow next" type="button" aria-label="Next image" onClick={() => setImageIndex((imageIndex + 1) % property.images.length)}>→</button>}
            <span className="viewer-count">{imageIndex + 1} / {property.images.length}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function AdminDashboard({ token, user, onLogout }: { token: string; user: AuthUser | null; onLogout: () => void }) {
  const [properties, setProperties] = useState<Property[]>([])
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [enquiryError, setEnquiryError] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const [editing, setEditing] = useState<Property | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState('')
  const [section, setSection] = useState<'dashboard' | 'properties' | 'gallery' | 'enquiries' | 'settings'>('dashboard')
  const [enquiriesLoading, setEnquiriesLoading] = useState(false)
  const roleLabel = user?.role ? labelFor(user.role.toUpperCase().replace(/^ROLE_/, '')) : 'Role unavailable'

  async function reloadProperties(): Promise<string | null> {
    setLoading(true)
    try {
      setProperties(asPropertyList(await fetchAdminProperties(token)))
      setError('')
      return null
    } catch (caught) {
      const message = errorText(caught)
      setError(message)
      return message
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reloadProperties() }, [token])

  useEffect(() => {
    if (section !== 'enquiries' && section !== 'dashboard') return
    let active = true
    setEnquiriesLoading(true)
    fetchAdminEnquiries(token)
      .then((result) => {
        if (active) {
          setEnquiries(asEnquiryList(result))
          setEnquiryError('')
        }
      })
      .catch((caught) => { if (active) setEnquiryError(errorText(caught)) })
      .finally(() => { if (active) setEnquiriesLoading(false) })
    return () => { active = false }
  }, [section, token])

  async function togglePublished(property: Property) {
    try {
      await setPropertyPublished(property.id, !property.published, token)
      const refreshError = await reloadProperties()
      if (refreshError) {
        setNotice({ kind: 'error', text: `${property.title} was updated, but the list could not be refreshed. ${refreshError}` })
        return
      }
      setNotice({ kind: 'success', text: `${property.title} ${property.published ? 'unpublished' : 'published'}.` })
    } catch (caught) {
      setNotice({ kind: 'error', text: errorText(caught) })
    }
  }

  async function removeProperty(property: Property) {
    if (!window.confirm(`Delete “${property.title}”? This cannot be undone.`)) return
    try {
      await deleteProperty(property.id, token)
      const refreshError = await reloadProperties()
      if (refreshError) {
        setNotice({ kind: 'error', text: `${property.title} was deleted, but the list could not be refreshed. ${refreshError}` })
        return
      }
      setNotice({ kind: 'success', text: 'Property deleted.' })
    } catch (caught) {
      setNotice({ kind: 'error', text: errorText(caught) })
    }
  }

  function startCreate() {
    setSection('properties')
    setEditing(null)
    setShowForm(true)
    setNotice(null)
  }

  function startEdit(property: Property) {
    setSection('properties')
    setEditing(property)
    setShowForm(true)
    setNotice(null)
  }

  async function handleSave(payload: PropertyPayload, files: File[] | null) {
    try {
      const response = await saveProperty(payload, token, editing?.id)
      const id = editing?.id || propertyIdFrom(response)
      if (files?.length) {
        if (!id) throw new Error('Property was saved, but the API response did not include its ID, so photos could not be uploaded.')
        await uploadPropertyImages(id, files, token)
      }
      setShowForm(false)
      setEditing(null)
      const refreshError = await reloadProperties()
      setNotice(refreshError
        ? { kind: 'error', text: `${editing ? 'Property updated' : 'Property created'}, but the list could not be refreshed. ${refreshError}` }
        : { kind: 'success', text: editing ? 'Property updated.' : 'Property created.' })
    } catch (caught) {
      setNotice({ kind: 'error', text: errorText(caught) })
      throw caught
    }
  }

  async function handleDeleteImage(propertyId: string, imageId: string): Promise<string | null> {
    await deletePropertyImage(propertyId, imageId, token)
    return reloadProperties()
  }

  async function removeGalleryImage(property: Property, image: PropertyImage) {
    if (!window.confirm(`Remove this photo from “${property.title}”?`)) return
    try {
      const refreshError = await handleDeleteImage(property.id, image.id)
      setNotice(refreshError
        ? { kind: 'error', text: `Photo removed, but the gallery could not be refreshed. ${refreshError}` }
        : { kind: 'success', text: 'Property photo removed.' })
    } catch (caught) {
      setNotice({ kind: 'error', text: `Could not remove image. ${errorText(caught)}` })
    }
  }

  const filteredProperties = properties.filter((property) => {
    const value = filter.trim().toLowerCase()
    return !value || property.title.toLowerCase().includes(value) || property.builder.toLowerCase().includes(value) || property.location.toLowerCase().includes(value)
  })

  return (
    <div className="admin-portal">
      <aside className="admin-sidebar">
        <a className="site-brand admin-brand" href="#"><img className="brand-mark brand-logo" src="/assets/branding/titleLogo.png" alt="" /><span>CLOVIDOM <i>ESTATES</i></span></a>
        <p className="sidebar-label">WORKSPACE</p>
        <button className={`sidebar-link ${section === 'dashboard' ? 'active' : ''}`} type="button" onClick={() => { setSection('dashboard'); setShowForm(false) }}><span>◫</span> Dashboard</button>
        <button className={`sidebar-link ${section === 'properties' && !showForm ? 'active' : ''}`} type="button" onClick={() => { setSection('properties'); setShowForm(false) }}><span>▦</span> Manage properties</button>
        <button className={`sidebar-link ${section === 'properties' && showForm ? 'active' : ''}`} type="button" onClick={() => { setSection('properties'); startCreate() }}><span>＋</span> Add property</button>
        <button className={`sidebar-link ${section === 'gallery' ? 'active' : ''}`} type="button" onClick={() => { setSection('gallery'); setShowForm(false) }}><span>▧</span> Image gallery</button>
        <button className={`sidebar-link ${section === 'enquiries' ? 'active' : ''}`} type="button" onClick={() => { setSection('enquiries'); setShowForm(false) }}><span>✉</span> Enquiries <small>{enquiries.length || ''}</small></button>
        <button className={`sidebar-link ${section === 'settings' ? 'active' : ''}`} type="button" onClick={() => { setSection('settings'); setShowForm(false) }}><span>⚙</span> Settings</button>
        <div className="sidebar-bottom"><span className="admin-avatar">{(user?.fullName || 'A').charAt(0).toUpperCase()}</span><div><strong>{user?.fullName || user?.email || 'Account holder'}</strong><small>{roleLabel}</small></div><button className="sidebar-logout" type="button" onClick={onLogout} aria-label="Sign out">↗</button></div>
      </aside>
      <main className="admin-main" id="properties">
        <header className="admin-topbar"><div><p className="eyebrow">CLOVIDOM · ADMINISTRATION</p><h1>{section === 'dashboard' ? 'Dashboard' : section === 'properties' ? (showForm ? (editing ? 'Edit property' : 'Add property') : 'Manage properties') : section === 'gallery' ? 'Image gallery' : section === 'settings' ? 'Settings' : 'Property enquiries'}</h1></div>{section === 'properties' && !showForm && <button className="primary-button" type="button" onClick={startCreate}><span>＋</span> Add property</button>}</header>
        {notice && <p className={`notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</p>}
        {section === 'dashboard' ? (
          <section className="admin-dashboard-view">
            <div className="admin-dashboard-intro"><ArchitectureSlideshow className="admin-welcome-slideshow" /><div className="admin-dashboard-welcome-copy"><p className="eyebrow">YOUR PROPERTY BUSINESS</p><h2>Good to see you, {user?.fullName?.split(' ')[0] || 'there'}.</h2><p>A clear view of your listings and the people interested in them.</p></div><button className="primary-button" type="button" onClick={() => { setSection('properties'); startCreate() }}><span>＋</span> Add property</button></div>
            <div className="admin-metrics">
              <article><span>Total properties</span><strong>{loading || error ? '—' : properties.length}</strong><small>Across your collection</small></article>
              <article><span>Published listings</span><strong>{loading || error ? '—' : properties.filter((property) => property.published).length}</strong><small>Visible to signed-in users</small></article>
              <article><span>Unpublished listings</span><strong>{loading || error ? '—' : properties.filter((property) => !property.published).length}</strong><small>Drafts and hidden listings</small></article>
              <article><span>Available properties</span><strong>{loading || error ? '—' : properties.filter((property) => property.availability !== 'SOLD_OUT').length}</strong><small>Not marked as sold out</small></article>
              <article><span>Total enquiries</span><strong>{enquiriesLoading || enquiryError ? '—' : enquiries.length}</strong><small>Received from your listings</small></article>
            </div>
            {error && <p className="notice error" role="alert">{error}</p>}
            {enquiryError && <p className="notice error" role="alert">{enquiryError}</p>}
            <section className="admin-list-section">
              <div className="admin-list-heading"><div><p className="eyebrow">LATEST LISTINGS</p><h2>Recently managed</h2></div><button className="text-button" type="button" onClick={() => setSection('properties')}>View all properties ↗</button></div>
              {loading ? <div className="empty-state"><span className="loader" /><p>Loading your collection…</p></div> : properties.length ? (
                <div className="admin-property-list">
                  {properties.slice(0, 5).map((property) => (
                    <article className="admin-property-row" key={property.id}>
                      <div className="admin-property-image">{property.images[0]?.url ? <img src={property.images[0].url} alt="" /> : <span>C</span>}</div>
                      <div className="admin-property-info"><div className="listing-overline"><span>{property.builder || 'No builder'}</span><span>{labelFor(property.category)}</span></div><h3>{property.title}</h3><p>{property.location}</p></div>
                      <strong className="admin-price">{formatPrice(property.startingPrice)}</strong>
                      <span className={property.published ? 'status-pill published' : 'status-pill draft'}>{property.published ? 'Published' : 'Draft'}</span>
                      <div className="admin-row-actions"><button type="button" onClick={() => startEdit(property)}>Edit</button><button type="button" onClick={() => void togglePublished(property)}>{property.published ? 'Unpublish' : 'Publish'}</button></div>
                    </article>
                  ))}
                </div>
              ) : <div className="empty-state"><span className="empty-monogram">C</span><h3>Your collection starts here.</h3><p>Add your first listing to see your dashboard metrics.</p></div>}
            </section>
          </section>
        ) : section === 'settings' ? (
          <section className="admin-list-section settings-section">
            <div className="admin-list-heading"><div><p className="eyebrow">ACCOUNT</p><h2>Administrator profile</h2></div></div>
            <div className="settings-card"><span className="admin-avatar">{(user?.fullName || 'A').charAt(0).toUpperCase()}</span><div><small>NAME</small><strong>{user?.fullName || 'Name not provided'}</strong></div><div><small>EMAIL</small><strong>{user?.email || 'Email not provided'}</strong></div><div><small>ROLE</small><strong>{roleLabel}</strong></div></div>
            <p className="settings-note">Profile and security changes are managed by your account service. No account settings are changed from this screen.</p>
            <button className="text-button" type="button" onClick={onLogout}>Sign out of this account ↗</button>
          </section>
        ) : section === 'gallery' ? (
          <section className="admin-list-section">
            <div className="admin-list-heading"><div><p className="eyebrow">PROPERTY PHOTOGRAPHY</p><h2>Listing image gallery</h2></div><span className="header-pill">{properties.reduce((total, property) => total + property.images.length, 0)} images</span></div>
            {error && <p className="notice error" role="alert">{error}</p>}
            <p className="gallery-api-note">Photos can be viewed and removed here. Persistent cover-image selection and reordering need backend endpoints that are not currently available.</p>
            {loading ? <div className="empty-state"><span className="loader" /><p>Loading property images…</p></div> : properties.some((property) => property.images.length > 0) ? (
              <div className="admin-gallery-grid">
                {properties.flatMap((property) => property.images.map((image) => (
                  <article className="admin-gallery-card" key={`${property.id}-${image.id}`}>
                    <img src={image.url} alt={image.altText || property.title} loading="lazy" />
                    <div><small>{property.title}{image.isPrimary ? ' · COVER' : ''}</small><strong>{property.location}</strong></div>
                    <button className="danger-action" type="button" onClick={() => void removeGalleryImage(property, image)}>Remove image</button>
                  </article>
                )))}
              </div>
            ) : <div className="empty-state"><span className="empty-monogram">▧</span><h3>No property photos yet.</h3><p>Add photos while creating or editing a property.</p><button className="primary-button" type="button" onClick={() => { setSection('properties'); startCreate() }}>Add property ↗</button></div>}
          </section>
        ) : section === 'enquiries' ? (
          <section className="admin-list-section">
            <div className="admin-list-heading"><div><p className="eyebrow">FOLLOW UP WITH CARE</p><h2>Recent enquiries</h2></div><span className="header-pill">{enquiries.length} received</span></div>
            {enquiryError && <p className="notice error" role="alert">{enquiryError}</p>}
            {enquiriesLoading ? <div className="empty-state"><span className="loader" /><p>Loading enquiries…</p></div> : enquiries.length ? (
              <div className="enquiry-list">
                {enquiries.map((enquiry, index) => (
                  <article className="enquiry-row" key={enquiry.id || `${enquiry.email}-${index}`}>
                    <div className="enquiry-person"><span className="admin-avatar">{enquiry.fullName.charAt(0).toUpperCase()}</span><div><strong>{enquiry.fullName}</strong><small>{enquiry.propertyTitle}</small></div></div>
                    <p className="enquiry-message">{enquiry.message}</p>
                    <div className="enquiry-contact"><a href={`mailto:${enquiry.email}`}>{enquiry.email}</a><a href={`tel:${enquiry.phone}`}>{enquiry.phone}</a></div>
                    <time>{enquiry.createdAt ? new Date(enquiry.createdAt).toLocaleDateString() : 'New'}</time>
                  </article>
                ))}
              </div>
            ) : <div className="empty-state"><span className="empty-monogram">✉</span><h3>No enquiries just yet.</h3><p>New property enquiries will appear here.</p></div>}
          </section>
        ) : showForm ? <PropertyEditor key={editing?.id || 'new'} property={editing} onCancel={() => { setShowForm(false); setEditing(null) }} onSave={handleSave} onDeleteImage={handleDeleteImage} /> : (
          <section className="admin-list-section">
            <div className="admin-list-heading"><div><p className="eyebrow">YOUR COLLECTION</p><h2>Manage properties</h2></div><label className="admin-search"><span aria-hidden="true">⌕</span><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search properties" aria-label="Search admin properties" /></label></div>
            {error && <p className="notice error" role="alert">{error}</p>}
            {loading ? <div className="empty-state"><span className="loader" /><p>Loading properties…</p></div> : filteredProperties.length ? (
              <div className="admin-property-list">
                {filteredProperties.map((property) => (
                  <article className="admin-property-row" key={property.id}>
                    <div className="admin-property-image">{property.images[0]?.url ? <img src={property.images[0].url} alt="" /> : <span>C</span>}</div>
                    <div className="admin-property-info"><div className="listing-overline"><span>{property.builder || 'No builder'}</span><span>{labelFor(property.category)}</span></div><h3>{property.title}</h3><p>{property.location}</p></div>
                    <strong className="admin-price">{formatPrice(property.startingPrice)}</strong>
                    <span className={property.published ? 'status-pill published' : 'status-pill draft'}>{property.published ? 'Published' : 'Draft'}</span>
                    <div className="admin-row-actions"><button type="button" onClick={() => startEdit(property)}>Edit</button><button type="button" onClick={() => void togglePublished(property)}>{property.published ? 'Unpublish' : 'Publish'}</button><button className="danger-action" type="button" onClick={() => void removeProperty(property)}>Delete</button></div>
                  </article>
                ))}
              </div>
            ) : <div className="empty-state"><span className="empty-monogram">C</span><h3>Your collection starts here.</h3><p>Add your first listing to make it visible to your users.</p><button className="primary-button" type="button" onClick={startCreate}>Add property ↗</button></div>}
          </section>
        )}
        <footer className="admin-footer"><span>CLOVIDOM ESTATES · {roleLabel.toUpperCase()}</span><span>Keep every detail considered.</span></footer>
      </main>
    </div>
  )
}

function PropertyEditor({ property, onCancel, onSave, onDeleteImage }: {
  property: Property | null
  onCancel: () => void
  onSave: (payload: PropertyPayload, files: File[] | null) => Promise<void>
  onDeleteImage: (propertyId: string, imageId: string) => Promise<string | null>
}) {
  const [category, setCategory] = useState<PropertyCategory>(property?.category ?? 'APARTMENT')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [savedImages, setSavedImages] = useState(property?.images ?? [])
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [draggingFiles, setDraggingFiles] = useState(false)
  const details = isRecord(property?.raw.details) ? property.raw.details : {}
  const location = isRecord(property?.raw.location) ? property.raw.location : {}
  const contact = isRecord(property?.raw.contact) ? property.raw.contact : {}

  useEffect(() => {
    const urls = selectedFiles.map((file) => URL.createObjectURL(file))
    setPreviewUrls(urls)
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [selectedFiles])

  function addImageFiles(files: FileList | File[]) {
    const incoming = Array.from(files)
    const images = incoming.filter((file) => file.type.startsWith('image/'))
    if (images.length) {
      setSelectedFiles((current) => [...current, ...images])
    }
    if (images.length !== incoming.length) setFormError('Only image files can be added; other files were skipped.')
    else if (images.length) setFormError('')
  }

  function moveSelectedImage(index: number, direction: -1 | 1) {
    setSelectedFiles((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const reordered = [...current]
      const currentFile = reordered[index]
      reordered[index] = reordered[target]
      reordered[target] = currentFile
      return reordered
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const get = (name: string) => String(values.get(name) ?? '').trim()
    const number = (name: string): number | null => {
      const value = get(name)
      if (!value) return null
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }
    const commonDetails: Record<string, unknown> = {}

    if (category === 'APARTMENT') {
      commonDetails.configurations = get('configurations').split(',').map((item) => item.trim()).filter(Boolean)
      commonDetails.numberOfTowers = number('numberOfTowers')
      commonDetails.totalFloors = number('totalFloors')
      commonDetails.possessionDate = get('possessionDate')
      commonDetails.superBuiltUpArea = number('superBuiltUpArea')
      commonDetails.carpetArea = number('carpetArea')
    } else if (category === 'VILLA') {
      commonDetails.villaType = get('villaType')
      commonDetails.plotArea = number('plotArea')
      commonDetails.builtUpArea = number('builtUpArea')
      commonDetails.bedrooms = number('bedrooms')
      commonDetails.bathrooms = number('bathrooms')
    } else if (category === 'INDEPENDENT_HOUSE') {
      commonDetails.floors = number('floors')
      commonDetails.bedrooms = number('bedrooms')
      commonDetails.bathrooms = number('bathrooms')
      commonDetails.plotArea = number('plotArea')
      commonDetails.builtUpArea = number('builtUpArea')
      commonDetails.ownership = get('ownership')
    } else {
      commonDetails.plotDimensions = get('plotDimensions')
      commonDetails.plotArea = number('plotArea')
      commonDetails.pricePerSqYard = number('pricePerSqYard')
      commonDetails.approvalDetails = get('approvalDetails')
    }

    const amenities = get('amenities').split(',').map((item) => item.trim()).filter(Boolean)
    const payload: PropertyPayload = {
      title: get('title'),
      projectName: get('projectName') || null,
      builder: get('builder') || null,
      category,
      location: {
        address: get('address') || null,
        city: get('city') || null,
        state: get('state') || null,
        mapUrl: get('mapUrl') || null,
      },
      startingPrice: number('startingPrice'),
      maxPrice: number('maxPrice'),
      priceUnit: category === 'PLOT' ? 'INR_PER_SQ_YARD' : 'INR',
      availability: get('availability') || null,
      description: get('description') || null,
      amenities: amenities.length > 0 ? amenities : null,
      details: Object.fromEntries(Object.entries(commonDetails).map(([key, value]) => [
        key,
        value === undefined || value === '' || (Array.isArray(value) && value.length === 0) ? null : value,
      ])),
      contact: {
        name: get('contactName') || null,
        phone: get('contactPhone') || null,
        email: get('contactEmail') || null,
      },
      published: values.get('published') === 'on',
    }

    if (!payload.title) {
      setFormError('Please enter a property title.')
      return
    }

    setSaving(true)
    setFormError('')
    try {
      await onSave(payload, selectedFiles.length ? selectedFiles : null)
    } catch (error) {
      setFormError(errorText(error))
    } finally {
      setSaving(false)
    }
  }

  async function removeImage(imageId: string) {
    if (!property?.id) return
    try {
      const refreshError = await onDeleteImage(property.id, imageId)
      setSavedImages((current) => current.filter((image) => image.id !== imageId))
      if (refreshError) setFormError(`Photo removed, but the property list could not be refreshed. ${refreshError}`)
    } catch (error) {
      setFormError(`Could not remove image. ${errorText(error)}`)
    }
  }

  const detailsInput = (name: string, label: string, type = 'text', value?: unknown) => (
    <label className="field"><span>{label}</span><input name={name} type={type} defaultValue={String(value ?? '')} min={type === 'number' ? 0 : undefined} /></label>
  )

  return (
    <section className="property-editor">
      <div className="editor-heading"><div><p className="eyebrow">{property ? 'UPDATE YOUR LISTING' : 'CREATE A LISTING'}</p><h2>{property ? 'Edit property' : 'Add a property'}</h2></div><button className="text-button" type="button" onClick={onCancel}>Close ×</button></div>
      <form className="editor-form" onSubmit={handleSubmit}>
        <div className="editor-section"><h3>Property overview</h3><div className="editor-grid">
          <label className="field"><span>Property title *</span><input name="title" type="text" defaultValue={property?.title ?? ''} required /></label>
          {detailsInput('projectName', 'Project name', 'text', property?.projectName)}
          {detailsInput('builder', 'Builder / company', 'text', property?.builder)}
          <label className="field"><span>Property category</span><select name="category" value={category} onChange={(event) => setCategory(event.target.value as PropertyCategory)}>{categories.filter((item) => item.value).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="field"><span>Availability</span><select name="availability" defaultValue={stringValue(property?.raw.availability, 'READY_TO_MOVE')}>{availabilityOptions.map((item) => <option key={item} value={item}>{labelFor(item)}</option>)}</select></label>
          {detailsInput('startingPrice', category === 'PLOT' ? 'Price per sq. yard' : 'Starting price (INR)', 'number', property?.raw.startingPrice)}
          {category !== 'PLOT' && detailsInput('maxPrice', 'Maximum price (INR)', 'number', property?.raw.maxPrice)}
        </div>
        <label className="field"><span>Description</span><textarea name="description" rows={4} defaultValue={property?.description ?? ''} maxLength={5000} /></label>
        <label className="field"><span>Amenities (comma separated)</span><input name="amenities" defaultValue={property?.amenities.join(', ') ?? ''} placeholder="Clubhouse, pool, gym" /></label>
        </div>

        <div className="editor-section"><h3>Location</h3><div className="editor-grid">
          {detailsInput('address', 'Street / area', 'text', location.address ?? property?.location)}
          {detailsInput('city', 'City', 'text', location.city)}
          {detailsInput('state', 'State', 'text', location.state)}
          {detailsInput('mapUrl', 'Map URL', 'url', location.mapUrl)}
        </div></div>

        <div className="editor-section"><h3>{labelFor(category)} details</h3><div className="editor-grid">
          {category === 'APARTMENT' && <>
            {detailsInput('configurations', 'Configurations (comma separated)', 'text', Array.isArray(details.configurations) ? details.configurations.join(', ') : details.configurations)}
            {detailsInput('numberOfTowers', 'Number of towers', 'number', details.numberOfTowers)}
            {detailsInput('totalFloors', 'Total floors', 'number', details.totalFloors)}
            {detailsInput('possessionDate', 'Possession date', 'month', details.possessionDate)}
            {detailsInput('superBuiltUpArea', 'Super built-up area (sq. ft.)', 'number', details.superBuiltUpArea)}
            {detailsInput('carpetArea', 'Carpet area (sq. ft.)', 'number', details.carpetArea)}
          </>}
          {category === 'VILLA' && <>
            {detailsInput('villaType', 'Villa type', 'text', details.villaType)}
            {detailsInput('plotArea', 'Plot area (sq. yd.)', 'number', details.plotArea)}
            {detailsInput('builtUpArea', 'Built-up area (sq. ft.)', 'number', details.builtUpArea)}
            {detailsInput('bedrooms', 'Bedrooms', 'number', details.bedrooms)}
            {detailsInput('bathrooms', 'Bathrooms', 'number', details.bathrooms)}
          </>}
          {category === 'INDEPENDENT_HOUSE' && <>
            {detailsInput('floors', 'Number of floors', 'number', details.floors)}
            {detailsInput('bedrooms', 'Bedrooms', 'number', details.bedrooms)}
            {detailsInput('bathrooms', 'Bathrooms', 'number', details.bathrooms)}
            {detailsInput('plotArea', 'Plot area (sq. yd.)', 'number', details.plotArea)}
            {detailsInput('builtUpArea', 'Built-up area (sq. ft.)', 'number', details.builtUpArea)}
            {detailsInput('ownership', 'Ownership details', 'text', details.ownership)}
          </>}
          {category === 'PLOT' && <>
            {detailsInput('plotDimensions', 'Plot dimensions', 'text', details.plotDimensions)}
            {detailsInput('plotArea', 'Plot area (sq. yd.)', 'number', details.plotArea)}
            {detailsInput('pricePerSqYard', 'Price per sq. yard (INR)', 'number', details.pricePerSqYard)}
            {detailsInput('approvalDetails', 'Approval details', 'text', details.approvalDetails)}
          </>}
        </div></div>

        <div className="editor-section"><h3>Contact and photographs</h3><div className="editor-grid">
          {detailsInput('contactName', 'Contact person', 'text', contact.name)}
          {detailsInput('contactPhone', 'Contact phone', 'tel', contact.phone)}
          {detailsInput('contactEmail', 'Contact email', 'email', contact.email)}
          <div className="field file-field">
            <span>Property photos</span>
            <div className={draggingFiles ? 'upload-dropzone dragging' : 'upload-dropzone'} onDragOver={(event) => { event.preventDefault(); setDraggingFiles(true) }} onDragLeave={() => setDraggingFiles(false)} onDrop={(event) => { event.preventDefault(); setDraggingFiles(false); addImageFiles(event.dataTransfer.files) }}>
              <input id="property-photos" name="files" type="file" accept="image/*" multiple onChange={(event) => { if (event.currentTarget.files) addImageFiles(event.currentTarget.files); event.currentTarget.value = '' }} />
              <label htmlFor="property-photos"><strong>Drop photos here or browse</strong><small>Choose multiple image files. They upload through the existing backend endpoint.</small></label>
            </div>
          </div>
        </div>
        {savedImages.length > 0 && <div className="saved-image-grid">{savedImages.map((image) => <div className="saved-image" key={image.id}><img src={image.url} alt={image.altText || 'Property photograph'} /><button type="button" onClick={() => void removeImage(image.id)} aria-label="Remove property photo">×</button></div>)}</div>}
        {selectedFiles.length > 0 && <div className="selected-image-grid" aria-label="Photos queued for upload">
          {selectedFiles.map((file, index) => (
            <article className="selected-image" key={`${file.name}-${file.lastModified}-${index}`}>
              {previewUrls[index] && <img src={previewUrls[index]} alt={`Preview of ${file.name}`} />}
              <div><strong title={file.name}>{file.name}</strong><div>
                <button type="button" disabled={index === 0} aria-label={`Move ${file.name} earlier`} onClick={() => moveSelectedImage(index, -1)}>←</button>
                <button type="button" disabled={index === selectedFiles.length - 1} aria-label={`Move ${file.name} later`} onClick={() => moveSelectedImage(index, 1)}>→</button>
                <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setSelectedFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))}>Remove</button>
              </div></div>
            </article>
          ))}
        </div>}
        {selectedFiles.length > 0 && <p className="gallery-api-note">The queued order is sent during upload. Setting a persistent cover photo or changing saved photo order requires backend support.</p>}
        <label className="publish-option"><input name="published" type="checkbox" defaultChecked={property?.published ?? false} /><span><strong>Publish this property</strong><small>Published properties are visible to signed-in users.</small></span></label>
        </div>
        {formError && <p className="notice error" role="alert">{formError}</p>}
        <div className="editor-actions"><button className="text-button" type="button" onClick={onCancel}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : property ? 'Save changes' : 'Create property'} <span aria-hidden="true">↗</span></button></div>
      </form>
    </section>
  )
}

export default App
