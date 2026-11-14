import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'

const scenes = [
  {
    url: '/assets/backgrounds/residential-01.jpg',
    position: 'center 48%',
  },
  {
    url: '/assets/backgrounds/residential-02.jpg',
    position: 'center 52%',
  },
  {
    url: '/assets/backgrounds/residential-03.jpg',
    position: 'center 46%',
  },
  {
    url: '/assets/backgrounds/residential-04.jpg',
    position: 'center 55%',
  },
  {
    url: '/assets/backgrounds/residential-05.jpg',
    position: 'center 50%',
  },
]

interface ArchitectureSlideshowProps {
  className?: string
  showControls?: boolean
}

export default function ArchitectureSlideshow({ className = '', showControls = true }: ArchitectureSlideshowProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion) return

    const intervalId = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % scenes.length)
    }, 6500)

    return () => window.clearInterval(intervalId)
  }, [reduceMotion])

  const scene = scenes[activeIndex]

  return (
    <div className={`architecture-slideshow ${className}`} aria-hidden={!showControls}>
      <div className="architecture-slide-layer" aria-hidden="true">
        <AnimatePresence initial={false} mode="sync">
          <motion.div
            key={scene.url}
            className="architecture-slide"
            style={{ backgroundImage: `url("${scene.url}")`, backgroundPosition: scene.position }}
            initial={{ opacity: 0, x: reduceMotion ? 0 : 44, scale: reduceMotion ? 1 : 1.035 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: reduceMotion ? 0 : -38, scale: reduceMotion ? 1 : 0.99 }}
            transition={{ duration: reduceMotion ? 0 : 1.15, ease: [0.22, 1, 0.36, 1] }}
          />
        </AnimatePresence>
        <div className="architecture-glass-reflection" />
      </div>
      {showControls && (
        <div className="architecture-slides-controls" role="group" aria-label="Background image slides">
          {scenes.map((item, index) => (
            <button
              key={item.url}
              type="button"
              aria-label={`Show background slide ${index + 1}`}
              aria-pressed={activeIndex === index}
              onClick={() => setActiveIndex(index)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
